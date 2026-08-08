// -----------------------------------------------------------------------------
// The timestamp of the data, and how it is written down.
//
// Every provider returns, next to its indices, the moment the value it serves
// APPLIES TO — `measuredAt`. For Open-Meteo that is `current.time`, the hour of
// the CAMS forecast the `current` block was taken from. It is not the moment we
// asked: an hourly forecast read three times in an hour answers the same
// timestamp three times, which is exactly what makes it worth publishing —
// "the sun data on my dashboard, how old is it?" is a question the poll time
// cannot answer and this one can.
//
// PROVIDER CONTRACT: `measuredAt` is the LOCAL wall-clock time at the point,
// `YYYY-MM-DDTHH:MM` (what Open-Meteo returns under `timezone=auto`). It is
// deliberately NOT parsed into a `Date`: `new Date('2026-08-06T14:00')` is read
// in the time zone of the CONTAINER (UTC in production), so a Paris afternoon
// would be re-rendered as noon. The fields are read as text and re-written as
// text — nothing is converted, because nothing needs to be.
//
// A trailing seconds or offset part is tolerated and dropped: a national
// provider registered in front of Open-Meteo may well send a full ISO string,
// and the wall-clock fields at its head are still the local time we want.
// -----------------------------------------------------------------------------

import { DEFAULT_LANGUAGE } from '../language.js';

/** `YYYY-MM-DDTHH:MM`, with anything after the minutes ignored. */
const LOCAL_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/;

/**
 * The wall-clock fields of a provider timestamp.
 * @param {unknown} value
 * @returns {{ year: string, month: string, day: string, hour: string, minute: string }|null}
 *   null when there is nothing readable — which publishes no state at all,
 *   rather than a "Invalid Date" the user would have to interpret.
 */
export function parseMeasuredAt(value) {
  const match = LOCAL_TIMESTAMP.exec(String(value ?? '').trim());
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute] = match;
  return { year, month, day, hour, minute };
}

/**
 * The timestamp as the TEXT state of a feature, in the language of the device.
 *
 * Written like a date is written in that language, and never ambiguously:
 * `06/08/2026` means August in French and nothing else in English, so English
 * gets the ISO order instead of an `08/06/2026` no reader could resolve.
 * @param {unknown} value the provider's `measuredAt`
 * @param {string} [language] one of LANGUAGES (see src/language.js)
 * @returns {string|null} null when the timestamp is missing or unreadable
 */
export function formatMeasuredAt(value, language = DEFAULT_LANGUAGE) {
  const parts = parseMeasuredAt(value);
  if (!parts) {
    return null;
  }
  const { year, month, day, hour, minute } = parts;
  return language === 'en'
    ? `${year}-${month}-${day} ${hour}:${minute}`
    : `${day}/${month}/${year} à ${hour}:${minute}`;
}
