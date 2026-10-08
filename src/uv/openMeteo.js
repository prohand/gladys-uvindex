// -----------------------------------------------------------------------------
// UV provider: Open-Meteo Air Quality API.
//
// Why this source:
//   - the UV index it serves is computed by CAMS (Copernicus Atmosphere
//     Monitoring Service, the EU reference), from the total column ozone, the
//     aerosol optical depth and the cloud cover — the official European
//     atmospheric composition model, not somebody's estimate;
//   - Open-Meteo republishes it as OPEN DATA (CC BY 4.0) with NO account and NO
//     API key, so the integration works the moment it is installed;
//   - Météo-France publishes a French UV forecast too, but its API portal
//     requires an account and an application token every user would have to
//     create and paste in before anything worked at all.
//
// Coverage is WORLDWIDE: the UV index comes from the ~45 km CAMS global
// atmospheric composition forecast (the ~11 km European product covers the
// pollutants, not this variable), so `supports()` accepts any point. The
// registry in `./index.js` exists all the same, so a national source can be
// registered in front of this one without touching the device code.
//
// Node 24 (the runtime of the image) provides `fetch` natively: no dependency
// needed. The retries live in `../http.js`; the cache, the requests in flight
// and the stale-value fallback below.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { fetchWithRetry, RETRY } from '../http.js';

const logger = createLogger({ name: 'open-meteo' });

// Overridable for local development; the default is the public API.
const BASE_URL = process.env.AIR_QUALITY_API_URL ?? 'https://air-quality-api.open-meteo.com/v1';

/** The timeout of ONE request (a retry gets its own). */
export const REQUEST_TIMEOUT_MS = 10_000;

const HOUR_MS = 60 * 60 * 1000;

// THE CACHE, and why an entry lives until the next full hour.
//
// The CAMS UV forecast has an hourly resolution: the `current` value Open-Meteo
// serves changes at the top of each hour and not in between. So an entry is
// fresh until the next full hour of the container's clock — an instant, the same
// in every time zone, which is why it is computed on the epoch and never on the
// local time of the point (Kolkata's "current" hour also turns at a UTC full
// hour, at :30 local). A refresh every 30 min and a widget re-pulled every
// 15 min then cost one request per point and per hour, whoever asks first.
//
// The ceiling is that hour itself: an entry is never fresh for more than 60 min,
// and one fetched at 10:59 lives one minute. A clock that jumps BACK cannot
// stretch it either — an entry read before the instant it was fetched at is
// treated as expired.

/**
 * How long an expired entry is still SERVED when the API fails, to the callers
 * that accept it (the widgets, the scene action). Its `measuredAt` keeps saying
 * which hour it is from, so a card three hours late says so; past this, an old
 * value would be passed off as today's and the read fails as it always did.
 */
export const STALE_LIMIT_MS = 3 * HOUR_MS;

/** point key -> { value, fetchedAt, expiresAt } */
const cache = new Map();

/**
 * point key -> { promise, retries }: the request in flight for a point, so the
 * refresh cycle, a widget pull and an `onDeviceCreated` arriving together share
 * ONE request. Removed when it settles — a rejected one is never served again.
 */
const inflight = new Map();

/** The cache key of a point. */
function keyOf({ latitude, longitude }) {
  return `${latitude},${longitude}`;
}

/** When an entry fetched at `fetchedAt` stops being fresh: the next full hour. */
function expiryOf(fetchedAt) {
  return (Math.floor(fetchedAt / HOUR_MS) + 1) * HOUR_MS;
}

/** The fresh value of a point, or undefined. Purges an entry too old to keep. */
function freshValue(key, now = Date.now()) {
  const entry = cache.get(key);
  if (!entry) {
    return undefined;
  }
  if (now >= entry.fetchedAt && now < entry.expiresAt) {
    return entry.value;
  }
  if (now - entry.fetchedAt > STALE_LIMIT_MS) {
    // Expired AND past the fallback window: nothing will ever read it again.
    cache.delete(key);
  }
  return undefined;
}

/** The last known value of a point when it is still young enough to serve. */
function staleEntry(key, now = Date.now()) {
  const entry = cache.get(key);
  return entry && now - entry.fetchedAt <= STALE_LIMIT_MS ? entry : undefined;
}

/** Store a value, and drop the entries no read will ever accept again. */
function remember(key, value) {
  const now = Date.now();
  for (const [other, entry] of cache) {
    if (now - entry.fetchedAt > STALE_LIMIT_MS) {
      cache.delete(other);
    }
  }
  cache.set(key, { value, fetchedAt: now, expiresAt: expiryOf(now) });
}

/** A value the API may legitimately have no data for. */
function toNullableNumber(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? null
    : Number(value);
}

/**
 * The highest hourly value of the day, or null when the series is empty.
 *
 * `forecast_days=1` plus `timezone=auto` asks for TODAY in the local time of the
 * point, so this is the peak the user will actually live through — the number a
 * "when can I go out?" question is really about, which the instantaneous index
 * cannot answer at 8 a.m.
 * @param {unknown} series the `hourly.uv_index` array
 */
function dailyMaximum(series) {
  const values = (Array.isArray(series) ? series : [])
    .map(toNullableNumber)
    .filter((value) => value !== null);
  return values.length === 0 ? null : Math.max(...values);
}

/**
 * Today's hourly curve, one `{ time, uvIndex }` per hour.
 *
 * `time` is kept exactly as Open-Meteo wrote it — the LOCAL wall-clock hour at
 * the point (`timezone=auto`), never parsed into a `Date` (see
 * `./measuredAt.js`). An hour the model has no value for stays in the list with
 * a null index: it is a hole in the forecast, not a zero.
 * @param {{ time?: unknown, uv_index?: unknown }} [hourly] the `hourly` block
 */
function hourlyCurve(hourly) {
  const times = Array.isArray(hourly?.time) ? hourly.time : [];
  const series = Array.isArray(hourly?.uv_index) ? hourly.uv_index : [];
  return times.map((time, index) => ({
    time: String(time),
    uvIndex: toNullableNumber(series[index]),
  }));
}

/** One point's block of an answer, read into raw (unrounded) values. */
function toValue(block) {
  const current = block?.current ?? {};
  return {
    uvIndex: toNullableNumber(current.uv_index),
    uvIndexClearSky: toNullableNumber(current.uv_index_clear_sky),
    uvIndexMaxToday: dailyMaximum(block?.hourly?.uv_index),
    measuredAt: current.time ?? null,
    // The curve and the offset of the local time it is written in: the two
    // things a dashboard chart needs to place today's hours on a real axis.
    hourly: hourlyCurve(block?.hourly),
    utcOffsetSeconds: toNullableNumber(block?.utc_offset_seconds),
  };
}

/**
 * Whether a failure is the API REFUSING the request — an answer, not an outage.
 * A refused batch is then retried point by point (see `requestBatch`).
 */
function isRefusal(err) {
  return err?.refused === true || (err?.status >= 400 && err?.status < 500 && err?.status !== 429);
}

/**
 * Ask Open-Meteo for several points in ONE request.
 *
 * The API takes comma-separated latitudes and longitudes and answers an ARRAY,
 * one block per point in the order asked (each but the first carrying its
 * `location_id`); for a single point it answers that block alone. `timezone=auto`
 * applies to each point separately, so every block keeps its own local day and
 * its own `utc_offset_seconds`.
 * @param {Array<{ latitude: number, longitude: number }>} points
 * @param {import('../http.js').RetryPolicy} retry
 * @returns {Promise<Array<{ value?: object, error?: Error }>>} one per point
 */
async function requestPoints(points, retry) {
  const params = new URLSearchParams({
    latitude: points.map((point) => String(point.latitude)).join(','),
    longitude: points.map((point) => String(point.longitude)).join(','),
    current: 'uv_index,uv_index_clear_sky',
    // Today's whole curve, to take its peak. `timezone=auto` is what makes
    // "today" the user's day and not a UTC one — a 24-hour window offset by
    // two hours would take its maximum across two different afternoons.
    hourly: 'uv_index',
    forecast_days: '1',
    timezone: 'auto',
  });
  const url = `${BASE_URL}/air-quality?${params.toString()}`;
  logger.debug('Open-Meteo request ->', url);

  // Throws on failure: the caller decides whether to keep the previous values,
  // to serve a stale one or to report the integration as disconnected.
  const response = await fetchWithRetry(url, {
    label: 'Open-Meteo',
    timeoutMs: REQUEST_TIMEOUT_MS,
    retry,
  });
  const body = await response.json();
  if (!Array.isArray(body) && body?.error) {
    const refused = new Error(`Open-Meteo error: ${body.reason ?? 'unknown reason'}`);
    refused.refused = true;
    throw refused;
  }

  // Matched by `location_id` (absent on the first point, which is 0) rather
  // than trusted to come back in order; by position when no block carries one.
  const blocks = Array.isArray(body) ? body : [body];
  const identified = blocks.some((block) => block?.location_id !== undefined);
  const byPosition = new Map(
    blocks.map((block, index) => [identified ? Number(block?.location_id ?? 0) : index, block]),
  );
  return points.map((point, index) => {
    const block = byPosition.get(index);
    return block
      ? { value: toValue(block) }
      : { error: new Error(`Open-Meteo answered nothing for ${keyOf(point)}`) };
  });
}

/**
 * `requestPoints`, which never rejects: a failure becomes the outcome of every
 * point. A batch the API REFUSES is asked again point by point, because one
 * point it rejects must not silence the others.
 */
async function requestBatch(points, retry) {
  try {
    return await requestPoints(points, retry);
  } catch (err) {
    if (points.length > 1 && isRefusal(err)) {
      logger.warn(`Open-Meteo refused a ${points.length}-point request, asking point by point`);
      return Promise.all(
        points.map((point) =>
          requestPoints([point], retry).then(
            ([outcome]) => outcome,
            (error) => ({ error }),
          ),
        ),
      );
    }
    return points.map(() => ({ error: err }));
  }
}

/**
 * Start ONE request for these points, registered as in flight for each of them
 * and cached point by point as it answers.
 * @returns {Promise<object>[]} one promise per point, rejecting with its error
 */
function startRequest(points, retry) {
  const batch = requestBatch(points, retry);
  return points.map((point, index) => {
    const key = keyOf(point);
    const promise = batch.then((outcomes) => {
      const { value, error } = outcomes[index];
      if (error) {
        throw error;
      }
      remember(key, value);
      return value;
    });
    const entry = { promise, retries: retry.retries };
    inflight.set(key, entry);
    promise
      .catch(() => {})
      .finally(() => {
        if (inflight.get(key) === entry) {
          inflight.delete(key);
        }
      });
    return promise;
  });
}

/**
 * Settle one point: its request, a second chance when the request it joined was
 * less patient than this caller, then the stale value when the caller takes it.
 */
async function settle(point, source, { retry, allowStale }) {
  const key = keyOf(point);
  let error;
  try {
    return { value: await source.promise };
  } catch (err) {
    error = err;
  }
  if (source.joinedRetries !== null && retry.retries > source.joinedRetries) {
    try {
      return { value: await startRequest([point], retry)[0] };
    } catch (err) {
      error = err;
    }
  }
  const stale = allowStale ? staleEntry(key) : undefined;
  if (stale) {
    const minutes = Math.round((Date.now() - stale.fetchedAt) / 60_000);
    logger.warn(
      `Open-Meteo failed for ${key} (${error?.message ?? error}), serving the reading fetched ${minutes} min ago`,
    );
    return { value: stale.value };
  }
  return { error };
}

/**
 * Read several points, with as few requests as the cache allows: the fresh ones
 * are served from it, the ones already in flight join that request, and all the
 * others go out in ONE request.
 * @param {Array<{ latitude: number, longitude: number }>} points
 * @param {{ retry?: import('../http.js').RetryPolicy, allowStale?: boolean }} [options]
 * @returns {Promise<Array<{ value?: object, error?: Error }>>} one per point, in
 *   order; never rejects
 */
async function fetchUvIndexes(points, { retry = RETRY.NONE, allowStale = false } = {}) {
  const hits = new Map();
  const sources = new Map();
  const missing = [];
  for (const point of points) {
    const key = keyOf(point);
    if (hits.has(key) || sources.has(key) || missing.some((other) => keyOf(other) === key)) {
      continue;
    }
    const fresh = freshValue(key);
    if (fresh !== undefined) {
      logger.debug(`Cache hit for ${key}`);
      hits.set(key, fresh);
      continue;
    }
    const running = inflight.get(key);
    if (running) {
      sources.set(key, { promise: running.promise, joinedRetries: running.retries });
    } else {
      missing.push(point);
    }
  }
  if (missing.length > 0) {
    startRequest(missing, retry).forEach((promise, index) =>
      sources.set(keyOf(missing[index]), { promise, joinedRetries: null }),
    );
  }

  const settled = new Map();
  for (const [key, source] of sources) {
    const point = points.find((candidate) => keyOf(candidate) === key);
    settled.set(key, settle(point, source, { retry, allowStale }));
  }
  return Promise.all(
    points.map(async (point) => {
      const key = keyOf(point);
      return hits.has(key) ? { value: hits.get(key) } : settled.get(key);
    }),
  );
}

export const openMeteoProvider = {
  key: 'open-meteo-cams',

  name: {
    en: 'Open-Meteo (CAMS, Copernicus)',
    fr: 'Open-Meteo (CAMS, Copernicus)',
  },

  /**
   * Whether this provider has data for a location. CAMS global covers the whole
   * planet, so the answer is always yes — the method stays because the registry
   * calls it on every provider, including the narrower ones to come.
   */
  supports() {
    return true;
  },

  /**
   * Read the UV index of a position.
   * @param {{ latitude: number, longitude: number }} location
   * @param {{ retry?: import('../http.js').RetryPolicy, allowStale?: boolean }} [options]
   *   `retry`: how hard to insist on a failure (none by default); `allowStale`:
   *   serve the last value of the point, up to STALE_LIMIT_MS old, rather than
   *   fail
   * @returns {Promise<{
   *   uvIndex: number|null,
   *   uvIndexClearSky: number|null,
   *   uvIndexMaxToday: number|null,
   *   measuredAt: string|null,
   *   hourly: Array<{ time: string, uvIndex: number|null }>,
   *   utcOffsetSeconds: number|null,
   * }>} raw (unrounded) indices; a value the model has none for is null, which
   *   the caller turns into "no state published".
   */
  async fetchUvIndex(location, options) {
    const [outcome] = await fetchUvIndexes([location], options);
    if (outcome.error) {
      throw outcome.error;
    }
    return outcome.value;
  },

  /**
   * Read several positions at once — one request for all the ones the cache
   * does not answer. Same options and values as `fetchUvIndex`, one outcome per
   * position, and it never rejects.
   */
  fetchUvIndexes,
};

/** Drop the cached responses and the requests in flight (used by the tests). */
export function clearUvCache() {
  cache.clear();
  inflight.clear();
}
