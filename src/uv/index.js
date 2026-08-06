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
//      fetchUvIndex(point) };
//   2. append it to PROVIDERS below, BEFORE the more generic ones (the first
//      provider that supports the point wins, so a national source can override
//      the worldwide fallback for its own country).
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
 * Read a location and grade its UV index.
 *
 * Every index is returned ROUNDED, because that is the form the WHO scale is
 * reported in and the form the features publish — see `src/uv/scale.js`. The
 * level is derived from the same rounded number, so the two can never disagree.
 * @param {{ latitude: number, longitude: number }} location
 * @returns {Promise<{
 *   provider: string,
 *   uvIndex: number|null,
 *   uvIndexClearSky: number|null,
 *   uvIndexMaxToday: number|null,
 *   level: number|null,
 *   levelMaxToday: number|null,
 *   measuredAt: string|null,
 * }>}
 */
export async function readUvIndex(location) {
  const provider = findProvider(location);
  if (!provider) {
    throw new Error(`No UV provider covers ${location.latitude},${location.longitude}`);
  }

  const reading = await provider.fetchUvIndex(location);

  return {
    provider: provider.key,
    uvIndex: roundUvIndex(reading.uvIndex),
    uvIndexClearSky: roundUvIndex(reading.uvIndexClearSky),
    uvIndexMaxToday: roundUvIndex(reading.uvIndexMaxToday),
    level: uvIndexToLevel(reading.uvIndex),
    levelMaxToday: uvIndexToLevel(reading.uvIndexMaxToday),
    measuredAt: reading.measuredAt,
  };
}
