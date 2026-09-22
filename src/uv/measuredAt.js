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

/**
 * The hour alone, `HH:MM` — the same in both languages, which is why it takes
 * none: it is what "peak at 14:00" and "pic à 14:00" share.
 * @param {unknown} value a provider timestamp
 * @returns {string|null}
 */
export function formatHour(value) {
  const parts = parseMeasuredAt(value);
  return parts ? `${parts.hour}:${parts.minute}` : null;
}

/**
 * A provider timestamp as a full ISO 8601 instant, offset included — what a
 * dashboard chart needs to place a point on a real time axis.
 *
 * Still text in, text out: the offset Open-Meteo reports for the point
 * (`utc_offset_seconds`) is APPENDED to the wall-clock fields, nothing is
 * converted. Without an offset there is no instant — a bare local time would be
 * read in the zone of whoever parses it, the very bug the header describes — so
 * the answer is null rather than a guess.
 * @param {unknown} value a provider timestamp
 * @param {unknown} utcOffsetSeconds the offset of the point's local time
 * @returns {string|null} e.g. `2026-08-06T14:00:00+02:00`
 */
export function toIsoInstant(value, utcOffsetSeconds) {
  const parts = parseMeasuredAt(value);
  const offset = Number(utcOffsetSeconds);
  if (!parts || utcOffsetSeconds === null || !Number.isInteger(offset)) {
    return null;
  }
  const sign = offset < 0 ? '-' : '+';
  const minutes = Math.floor(Math.abs(offset) / 60);
  const pad = (number) => String(number).padStart(2, '0');
  const { year, month, day, hour, minute } = parts;
  return (
    `${year}-${month}-${day}T${hour}:${minute}:00` +
    `${sign}${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
  );
}
