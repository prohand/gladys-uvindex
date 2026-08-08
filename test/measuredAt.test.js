import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMeasuredAt, parseMeasuredAt } from '../src/uv/measuredAt.js';

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
