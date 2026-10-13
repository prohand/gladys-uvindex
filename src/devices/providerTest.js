// -----------------------------------------------------------------------------
// The "Test the UV provider" button.
//
// A live check of the data source, on EVERY location: "is it working?" is a
// question about the install, not about one entry of a list, and nothing in
// that screen designates a single location anyway. The answer is the location
// listing's format (`• n. name — detail`, built by the same `locationLine`),
// because both actions answer about the same list under the same numbers.
//
// It reports what the source says NOW: it insists briefly like any interactive
// read, but never falls back on a stale value — a provider that is down must
// read as down here, whatever the cache still holds.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { errorReason } from '../errors.js';
import { RETRY } from '../http.js';
import { inEveryLanguage } from '../language.js';
import { LOCATION_LINE_SEPARATOR, locationLine, positionOf } from '../locations.js';
import { readUvIndexes } from '../uv/index.js';
import { formatMeasuredAt } from '../uv/measuredAt.js';
import { UV_LEVEL_LABELS } from '../uv/scale.js';

const logger = createLogger({ name: 'provider-test' });

const NO_LOCATION_MESSAGE = {
  en: 'No location with usable coordinates yet. Add one with "Add a location".',
  fr: 'Aucun lieu avec des coordonnées utilisables. Ajoutez-en un avec « Ajouter un lieu ».',
  de: 'Noch kein Ort mit verwendbaren Koordinaten. Füge einen mit „Ort hinzufügen“ hinzu.',
  es: 'Todavía no hay ninguna ubicación con coordenadas utilizables. Añada una con «Añadir una ubicación».',
};

/** What a line says instead of a level when the source has no value. */
const NO_DATA = { en: 'no data', fr: 'pas de donnée', de: 'keine Daten', es: 'sin datos' };

/** The words of a reading line, per language. */
const LINE_WORDS = {
  en: { maxToday: 'max today', updated: 'updated' },
  fr: { maxToday: 'max du jour', updated: 'màj' },
  de: { maxToday: 'Tagesmaximum', updated: 'aktualisiert' },
  es: { maxToday: 'máx. del día', updated: 'actualizado' },
};

/**
 * Why a location could not be read, WITHOUT naming it (the line already does).
 * Shared with the refresh cycle, whose status line names the location itself.
 */
export function failureDetail(err) {
  const reason = errorReason(err, 120);
  return {
    en: `UV refresh failed: ${reason}`,
    fr: `le rafraîchissement de l'indice UV a échoué : ${reason}`,
    de: `UV-Aktualisierung fehlgeschlagen: ${reason}`,
    es: `error al actualizar el índice UV: ${reason}`,
  };
}

/**
 * One location's line, in every language.
 *
 * A missing level reads "no data": showing the wording of level 0 ("None")
 * would claim the sun is down when the source simply said nothing — the same
 * "null, never 0" rule as the states.
 */
export function readingLine(reading) {
  // The data timestamp answers the other half of "is it working?": a provider
  // that responds with yesterday's hour is up and still wrong.
  return inEveryLanguage((language) => {
    const words = LINE_WORDS[language];
    const stamp = formatMeasuredAt(reading.measuredAt, language);
    const stamped = stamp === null ? '' : `, ${words.updated} ${stamp}`;
    const level = (UV_LEVEL_LABELS[reading.level] ?? NO_DATA)[language];
    return (
      `UV ${reading.uvIndex ?? '—'} (${level}), ` +
      `${words.maxToday} ${reading.uvIndexMaxToday ?? '—'} — ${reading.provider}${stamped}`
    );
  });
}

/** A header plus one line per location, in every language. */
function report(header, lines) {
  return inEveryLanguage((language) =>
    [
      header[language],
      ...lines.map((line) => locationLine(line.position, line.name, line[language])),
    ].join(LOCATION_LINE_SEPARATOR),
  );
}

/**
 * Run the test on the watched locations. A failure becomes a LINE rather than a
 * rejection: one location the provider refuses must not hide the answer of the
 * others, and a bare error naming no location helps nobody.
 * @param {{ locations: object[] }} config the whole configuration (for the numbering)
 * @param {object[]} locations the watched locations
 * @returns {Promise<Record<string, string>>} `{ en, fr, de, es }`
 */
export async function testProvider(config, locations) {
  if (locations.length === 0) {
    return NO_LOCATION_MESSAGE;
  }
  logger.info(`Action test_provider -> live request for ${locations.length} location(s)`);

  const outcomes = await readUvIndexes(locations, { retry: RETRY.INTERACTIVE });
  const lines = locations.map((location, index) => {
    const entry = { position: positionOf(config.locations, location.id), name: location.name };
    const { reading, error } = outcomes[index];
    if (error) {
      logger.error(`UV query failed for ${location.name}`, error);
      return { ...entry, failed: true, ...failureDetail(error) };
    }
    return { ...entry, failed: false, ...readingLine(reading) };
  });
  const failed = lines.filter((line) => line.failed).length;

  // "Provider OK" only when it actually is: the header counts the locations
  // that failed, and each of their lines says why.
  const header =
    failed === 0
      ? {
          en: `UV provider OK — ${locations.length} location(s):`,
          fr: `Fournisseur UV OK — ${locations.length} lieu(x) :`,
          de: `UV-Anbieter OK — ${locations.length} Ort(e):`,
          es: `Proveedor UV OK — ${locations.length} ubicación(es):`,
        }
      : {
          en: `UV provider — ${failed} of ${locations.length} location(s) failing:`,
          fr: `Fournisseur UV — ${failed} lieu(x) en échec sur ${locations.length} :`,
          de: `UV-Anbieter — ${failed} von ${locations.length} Ort(en) fehlgeschlagen:`,
          es: `Proveedor UV — ${failed} de ${locations.length} ubicación(es) con error:`,
        };
  return report(header, lines);
}
