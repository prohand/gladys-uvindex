// -----------------------------------------------------------------------------
// UV provider registry.
//
// A provider knows how to read the UV index of a position. Today a single one is
// registered (Open-Meteo / CAMS), but the lookup goes through `findProvider()`
// so adding a national source is a one-line change here plus a new file next to
// `openMeteo.js` — the device code never names a provider.
//
// To add one:
//   1. create `src/uv/<yourProvider>.js` exposing { key, name, supports(point),
//      fetchUvIndex(point, options) } — and, if its API reads several points in
//      one request, the OPTIONAL fetchUvIndexes(points, options), which resolves
//      one `{ value } | { error }` per point and never rejects;
//   2. append it to PROVIDERS below, BEFORE the more generic ones (the first
//      provider that supports the point wins, so a national source can override
//      the worldwide fallback for its own country).
//
// `options` is `{ retry, allowStale }`: how hard to insist on a failure (a
// policy of `../http.js`, none by default) and whether the last known value of
// the point may be served when the source fails. The refresh cycle insists and
// never takes a stale value — it would re-publish old numbers as new states; a
// widget or a scene action asks once more, briefly, and takes it.
// -----------------------------------------------------------------------------

import { openMeteoProvider } from './openMeteo.js';
import { roundUvIndex, uvIndexToLevel } from './scale.js';

export const PROVIDERS = [openMeteoProvider];

/**
 * Pick the provider that covers a point.
 * @param {{ latitude: number, longitude: number }} point
 * @returns {object|undefined} the provider, or undefined when none covers it
 */
export function findProvider(point) {
  return PROVIDERS.find((provider) => provider.supports(point));
}

/**
 * The hour of today's peak: the FIRST hour the curve reaches its maximum, so a
 * plateau is announced when it starts rather than when it ends.
 * @param {Array<{ time: string, uvIndex: number|null }>} curve
 * @returns {string|null} the provider's local time, or null without a curve
 */
function peakTimeOf(curve) {
  let peak = null;
  for (const point of curve) {
    if (point.uvIndex !== null && (peak === null || point.uvIndex > peak.uvIndex)) {
      peak = point;
    }
  }
  return peak?.time ?? null;
}

/**
 * Grade a provider's raw reading.
 *
 * Every index is returned ROUNDED, because that is the form the WHO scale is
 * reported in and the form the features publish — see `src/uv/scale.js`. The
 * level is derived from the same rounded number, so the two can never disagree.
 * @param {{ key: string }} provider
 * @param {object} reading what the provider resolved
 * @returns {{
 *   provider: string,
 *   uvIndex: number|null,
 *   uvIndexClearSky: number|null,
 *   uvIndexMaxToday: number|null,
 *   level: number|null,
 *   levelMaxToday: number|null,
 *   measuredAt: string|null,
 *   peakTime: string|null,
 *   forecast: Array<{ time: string, uvIndex: number }>,
 *   utcOffsetSeconds: number|null,
 * }} `forecast` is today's hourly curve, rounded like everything else, the
 *   hours without a value left out; empty for a provider that has no curve.
 */
function grade(provider, reading) {
  const curve = Array.isArray(reading.hourly) ? reading.hourly : [];
  return {
    provider: provider.key,
    uvIndex: roundUvIndex(reading.uvIndex),
    uvIndexClearSky: roundUvIndex(reading.uvIndexClearSky),
    uvIndexMaxToday: roundUvIndex(reading.uvIndexMaxToday),
    level: uvIndexToLevel(reading.uvIndex),
    levelMaxToday: uvIndexToLevel(reading.uvIndexMaxToday),
    measuredAt: reading.measuredAt,
    peakTime: peakTimeOf(curve),
    forecast: curve
      .map((point) => ({ time: point.time, uvIndex: roundUvIndex(point.uvIndex) }))
      .filter((point) => point.uvIndex !== null),
    utcOffsetSeconds: reading.utcOffsetSeconds ?? null,
  };
}

/** The error of a point no provider covers. */
function uncovered(location) {
  return new Error(`No UV provider covers ${location.latitude},${location.longitude}`);
}

/**
 * Read a location and grade its UV index.
 * @param {{ latitude: number, longitude: number }} location
 * @param {{ retry?: object, allowStale?: boolean }} [options] see the header
 * @returns {Promise<ReturnType<typeof grade>>}
 */
export async function readUvIndex(location, options = {}) {
  const provider = findProvider(location);
  if (!provider) {
    throw uncovered(location);
  }
  return grade(provider, await provider.fetchUvIndex(location, options));
}

/**
 * Read several locations at once: one call per provider, which a provider that
 * has `fetchUvIndexes` turns into ONE request for all of its points. This is
 * what the refresh cycle uses — twenty locations, one request.
 * @param {Array<{ latitude: number, longitude: number }>} locations
 * @param {{ retry?: object, allowStale?: boolean }} [options] see the header
 * @returns {Promise<Array<{ reading?: ReturnType<typeof grade>, error?: Error }>>}
 *   one per location, in order; never rejects — one location failing must not
 *   hide the others
 */
export async function readUvIndexes(locations, options = {}) {
  const outcomes = new Array(locations.length);
  const groups = new Map();
  locations.forEach((location, index) => {
    const provider = findProvider(location);
    if (!provider) {
      outcomes[index] = { error: uncovered(location) };
      return;
    }
    if (!groups.has(provider)) {
      groups.set(provider, []);
    }
    groups.get(provider).push(index);
  });

  await Promise.all(
    [...groups].map(async ([provider, indexes]) => {
      const points = indexes.map((index) => locations[index]);
      let raw;
      try {
        raw =
          typeof provider.fetchUvIndexes === 'function'
            ? await provider.fetchUvIndexes(points, options)
            : await Promise.all(
                points.map((point) =>
                  provider.fetchUvIndex(point, options).then(
                    (value) => ({ value }),
                    (error) => ({ error }),
                  ),
                ),
              );
      } catch (error) {
        raw = points.map(() => ({ error }));
      }
      indexes.forEach((locationIndex, position) => {
        const outcome = raw?.[position] ?? { error: new Error(`${provider.key} answered nothing`) };
        outcomes[locationIndex] = outcome.error
          ? { error: outcome.error }
          : { reading: grade(provider, outcome.value) };
      });
    }),
  );
  return outcomes;
}
