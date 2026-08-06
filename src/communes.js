// -----------------------------------------------------------------------------
// Turning a POSTAL CODE into a point.
//
// THE SOURCE. `geo.api.gouv.fr`, the "API Découpage administratif" published by
// the French state (Etalab / data.gouv.fr) on top of the INSEE administrative
// database and the Base Adresse Nationale. It is open data, it is the official
// registry of what a French postal code covers, and it needs NO account and NO
// API key — which is the whole point: an integration that asks its user for a
// token before showing anything is an integration most users never finish
// installing.
//
//   https://geo.api.gouv.fr/decoupage-administratif/communes
//
// WHY A POSTAL CODE AND NOT A TOWN NAME. A town name is not unique — France has
// several dozen Saint-Martin — so a name-based search has to ask the user which
// one they meant, every time. A postal code is a number they know by heart and
// it identifies the place almost always on its own. Almost: a code can cover
// several communes (01000 is Bourg-en-Bresse, Péronnas and
// Saint-Denis-lès-Bourg), which is what `pickCommune` below resolves, with the
// optional commune name the form offers as a second field. Nothing is ever
// picked by coin flip — the wrong pick silently reports another town's UV.
//
// WHAT COMES BACK is the commune's `centre`, the centroid of its outline. The
// CAMS UV forecast is read on a ~45 km grid, so the metre the centroid is off by
// is far below the resolution of the data: any point inside the commune reads
// the same cell.
//
// A postal code is French by definition here. Users outside France add a
// location by its coordinates instead — the UV data itself is worldwide, only
// this registry is national.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'communes' });

// Overridable for local development; the default is the public API.
const API_BASE_URL = process.env.GEO_API_URL ?? 'https://geo.api.gouv.fr';

const REQUEST_TIMEOUT_MS = 15_000;

/** How many communes a "be more precise" message lists. */
export const MAX_LISTED_COMMUNES = 8;

/** A French postal code: five digits, and nothing else. */
const POSTAL_CODE_PATTERN = /^[0-9]{5}$/;

/**
 * Clean up what the user typed into a postal code, or return '' when it is not
 * one. Spaces are tolerated — "44 300" is what a copy-paste from a letterhead
 * looks like — and nothing else is.
 * @param {unknown} value
 * @returns {string} the five digits, or '' when the input is not a postal code
 */
export function normalizePostalCode(value) {
  const cleaned = String(value ?? '').replace(/\s/g, '');
  return POSTAL_CODE_PATTERN.test(cleaned) ? cleaned : '';
}

/**
 * Comparable form of a commune name, for matching what the user typed against
 * what the registry answered.
 *
 * Accents, case, hyphens and apostrophes are all folded away: nobody types
 * "Saint-Étienne" or "L'Haÿ-les-Roses" the way the registry spells them, and a
 * location refused over a hyphen is a location the user gives up on.
 * @param {unknown} value
 */
export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // the combining accents NFD just split off
    .toLowerCase()
    .replace(/[-'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A coordinate of the answer. `Number(undefined)` is NaN, which the filter below
 * drops — but `Number(null)` is 0, a valid longitude, so a missing coordinate
 * must become NaN explicitly rather than a point off the coast of Ghana.
 */
function toNumber(value) {
  return value === null || value === undefined || value === '' ? Number.NaN : Number(value);
}

/**
 * The usable communes of an answer: one without a centre is not a place we can
 * query.
 *
 * `centre` is a GeoJSON Point, so its coordinates are [LONGITUDE, LATITUDE] —
 * the order every other line of this integration writes the other way round.
 * @param {unknown} results the API payload
 */
function toCommunes(results) {
  return (Array.isArray(results) ? results : [])
    .map((result) => ({
      name: String(result?.nom ?? ''),
      // INSEE code: the commune's real identity, unique where a postal code is
      // not. Kept so a listing can tell two communes of the same name apart.
      code: String(result?.code ?? ''),
      postalCodes: Array.isArray(result?.codesPostaux) ? result.codesPostaux.map(String) : [],
      longitude: toNumber(result?.centre?.coordinates?.[0]),
      latitude: toNumber(result?.centre?.coordinates?.[1]),
      department: String(result?.departement?.nom ?? ''),
      region: String(result?.region?.nom ?? ''),
    }))
    .filter((commune) => Number.isFinite(commune.latitude) && Number.isFinite(commune.longitude));
}

/**
 * The communes a postal code covers, as the French registry lists them.
 * @param {string} postalCode five digits, already normalized
 * @returns {Promise<Array<object>>} empty when the code exists in no commune
 */
export async function searchCommunes(postalCode) {
  const code = normalizePostalCode(postalCode);
  if (code === '') {
    return [];
  }

  const params = new URLSearchParams({
    codePostal: code,
    fields: 'nom,code,codesPostaux,centre,departement,region',
    format: 'json',
    // The centroid of the outline rather than the outline itself: we need a
    // point, and the contour of a commune is tens of kilobytes of polygon.
    geometry: 'centre',
  });
  const url = `${API_BASE_URL}/communes?${params.toString()}`;
  logger.debug('Commune lookup ->', url);

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`API Découpage administratif HTTP ${response.status}`);
  }

  return toCommunes(await response.json());
}

/**
 * The one commune to use, or null when the answer is too ambiguous to pick
 * alone.
 *
 * A single answer is the answer. Several answers are only resolved when the user
 * named the commune AND exactly one of them carries that name — everything else
 * is handed back to them, because reporting the UV of the wrong town is a
 * failure nobody would notice.
 * @param {Array<object>} communes
 * @param {string} [city] the commune name the user typed, if any
 * @returns {object|null}
 */
export function pickCommune(communes = [], city = '') {
  if (communes.length === 0) {
    return null;
  }
  const wanted = normalizeText(city);
  if (wanted === '') {
    return communes.length === 1 ? communes[0] : null;
  }
  const named = communes.filter((commune) => normalizeText(commune.name) === wanted);
  return named.length === 1 ? named[0] : null;
}

/**
 * Where a commune is, without its name: what tells two homonyms apart, and what
 * makes a listing of three candidates readable.
 * @param {object} commune
 */
export function communeContext(commune) {
  return [commune.department, commune.region].filter(Boolean).join(', ');
}

/**
 * One-line description of a commune, for the message shown under the button.
 * @param {object} commune
 */
export function describeCommune(commune) {
  const context = communeContext(commune);
  return context ? `${commune.name} (${context})` : commune.name;
}

/**
 * Resolve a postal code, then either settle on one commune or hand the
 * candidates back for the user to choose from.
 * @param {string} postalCode
 * @param {string} [city] optional commune name, to disambiguate
 * @returns {Promise<{ match: object|null, candidates: Array<object> }>}
 */
export async function resolvePostalCode(postalCode, city = '') {
  const candidates = await searchCommunes(postalCode);
  return { match: pickCommune(candidates, city), candidates };
}
