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
// Node 20+ provides `fetch` natively: no dependency needed.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'open-meteo' });

// Overridable for local development; the default is the public API.
const BASE_URL = process.env.AIR_QUALITY_API_URL ?? 'https://air-quality-api.open-meteo.com/v1';

const REQUEST_TIMEOUT_MS = 10_000;

// The CAMS UV forecast has an hourly resolution: polling the same coordinates
// more often than this returns the same numbers. The cache keeps the free
// public API quiet when several devices share a position and when the user
// hammers the "Test" button.
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

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
   * @returns {Promise<{
   *   uvIndex: number|null,
   *   uvIndexClearSky: number|null,
   *   uvIndexMaxToday: number|null,
   *   measuredAt: string|null,
   * }>} raw (unrounded) indices; a value the model has none for is null, which
   *   the caller turns into "no state published".
   */
  async fetchUvIndex({ latitude, longitude }) {
    const cacheKey = `${latitude},${longitude}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      logger.debug(`Cache hit for ${cacheKey}`);
      return cached.value;
    }

    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
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

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      // Propagate: the caller decides whether to keep the previous values or to
      // report the integration as disconnected.
      throw new Error(`Open-Meteo HTTP ${response.status}`);
    }

    const body = await response.json();
    if (body.error) {
      throw new Error(`Open-Meteo error: ${body.reason ?? 'unknown reason'}`);
    }

    const current = body.current ?? {};
    const value = {
      uvIndex: toNullableNumber(current.uv_index),
      uvIndexClearSky: toNullableNumber(current.uv_index_clear_sky),
      uvIndexMaxToday: dailyMaximum(body.hourly?.uv_index),
      measuredAt: current.time ?? null,
    };

    cache.set(cacheKey, { at: Date.now(), value });
    return value;
  },
};

/** Drop the cached responses (used by the tests). */
export function clearUvCache() {
  cache.clear();
}
