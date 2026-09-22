import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatHour,
  formatMeasuredAt,
  parseMeasuredAt,
  toIsoInstant,
} from '../src/uv/measuredAt.js';

test('the local timestamp Open-Meteo returns is read field by field', () => {
  assert.deepEqual(parseMeasuredAt('2026-08-06T14:00'), {
    year: '2026',
    month: '08',
    day: '06',
    hour: '14',
    minute: '00',
  });
});

test('a fuller ISO string keeps its wall-clock head', () => {
  // A national provider registered in front of Open-Meteo may well send
  // seconds and an offset; the local time we display is at the head anyway.
  assert.equal(formatMeasuredAt('2026-08-06T14:00:00+02:00', 'fr'), '06/08/2026 à 14:00');
  assert.equal(formatMeasuredAt('2026-08-06 14:00', 'fr'), '06/08/2026 à 14:00');
});

test('the timestamp is NOT re-read through the container time zone', () => {
  // `new Date('2026-08-06T14:00')` is parsed in the time zone of the process
  // (UTC in the container), so a Paris afternoon would come back out as noon.
  // The fields are text in and text out: 14:00 local stays 14:00.
  const timeZone = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  try {
    assert.match(formatMeasuredAt('2026-08-06T14:00', 'fr'), /14:00$/);
    assert.match(formatMeasuredAt('2026-08-06T14:00', 'en'), /14:00$/);
  } finally {
    if (timeZone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = timeZone;
    }
  }
});

test('English gets the ISO order, French the day first', () => {
  // 06/08/2026 is August in French and June to an English reader: the one
  // ordering nobody can misread is the ISO one.
  assert.equal(formatMeasuredAt('2026-08-06T14:00', 'en'), '2026-08-06 14:00');
  assert.equal(formatMeasuredAt('2026-08-06T14:00', 'fr'), '06/08/2026 à 14:00');
});

test('French is the default, like everywhere else here', () => {
  assert.equal(formatMeasuredAt('2026-08-06T14:00'), '06/08/2026 à 14:00');
});

test('an unreadable or missing timestamp is null, never a broken string', () => {
  // null is what publishes NO state at all; "Invalid Date" on a dashboard is
  // something the user would have to interpret.
  for (const value of [null, undefined, '', 'now', '2026-08-06', 42, {}]) {
    assert.equal(parseMeasuredAt(value), null, String(value));
    assert.equal(formatMeasuredAt(value, 'fr'), null, String(value));
  }
});

test('the hour alone is the same in both languages', () => {
  assert.equal(formatHour('2026-08-06T14:00'), '14:00');
  assert.equal(formatHour('not a date'), null);
});

test('an instant is the wall clock with the offset APPENDED, never converted', () => {
  // The chart of a widget needs real instants; the hours stay the ones the
  // provider wrote.
  assert.equal(toIsoInstant('2026-08-06T14:00', 7200), '2026-08-06T14:00:00+02:00');
  assert.equal(toIsoInstant('2026-08-06T14:00', 0), '2026-08-06T14:00:00+00:00');
  assert.equal(toIsoInstant('2026-01-06T09:00', -12600), '2026-01-06T09:00:00-03:30');
  // Parsed back, it lands on the right instant whatever the reader's zone.
  assert.equal(
    new Date(toIsoInstant('2026-08-06T14:00', 7200)).toISOString(),
    '2026-08-06T12:00:00.000Z',
  );
});

test('without an offset there is no instant, rather than a guess', () => {
  assert.equal(toIsoInstant('2026-08-06T14:00', null), null);
  assert.equal(toIsoInstant('2026-08-06T14:00', undefined), null);
  assert.equal(toIsoInstant('garbage', 7200), null);
});
