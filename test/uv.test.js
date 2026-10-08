// -----------------------------------------------------------------------------
// The provider and the registry. `globalThis.fetch` is stubbed per test and
// restored afterwards: these tests never touch the network.
//
// `src/uv/openMeteo.js` keeps a module-level TTL cache, so every test clears it
// first — otherwise a reading leaks into the next test's assertions.
// -----------------------------------------------------------------------------

import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { RETRY, setRetrySleep } from '../src/http.js';
import { clearUvCache, openMeteoProvider, STALE_LIMIT_MS } from '../src/uv/openMeteo.js';
import { findProvider, PROVIDERS, readUvIndex, readUvIndexes } from '../src/uv/index.js';
import { UV_LEVELS } from '../src/uv/scale.js';

const PARIS = { latitude: 48.8566, longitude: 2.3522 };

const realFetch = globalThis.fetch;
let requests = [];

/** Answer every request with one payload, recording the URLs asked for. */
function stubFetch(payload, { ok = true, status = 200 } = {}) {
  requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return { ok, status, json: async () => payload };
  };
}

/** Answer each request with `answer(url, index)`: a payload, or an Error to throw. */
function stubWith(answer) {
  requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    const result = await answer(String(url), requests.length - 1);
    if (result instanceof Error) {
      throw result;
    }
    if (typeof result?.status === 'number' && result.status >= 400) {
      return { ok: false, status: result.status, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => result };
  };
}

const SYDNEY = { latitude: -33.87, longitude: 151.21 };

/** One point's block of a multi-point answer. */
function block(uvIndex, locationId) {
  return {
    ...(locationId === undefined ? {} : { location_id: locationId }),
    current: { time: '2026-08-06T14:00', uv_index: uvIndex },
    hourly: { uv_index: [uvIndex] },
  };
}

beforeEach(() => {
  clearUvCache();
  setRetrySleep(async () => {});
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setRetrySleep(null);
  mock.timers.reset();
});

test('the provider reads the current index and today’s peak', async () => {
  stubFetch({
    current: { time: '2026-08-06T14:00', uv_index: 7.2, uv_index_clear_sky: 8.1 },
    hourly: { uv_index: [0, 0, 1.4, 5.9, 7.8, 6.1, 0] },
  });

  const reading = await openMeteoProvider.fetchUvIndex(PARIS);

  assert.equal(reading.uvIndex, 7.2);
  assert.equal(reading.uvIndexClearSky, 8.1);
  assert.equal(reading.uvIndexMaxToday, 7.8);
  assert.equal(reading.measuredAt, '2026-08-06T14:00');
});

test('the request asks for TODAY in the local time of the point', async () => {
  // A 24-hour window offset by two hours would take its maximum across two
  // different afternoons.
  stubFetch({ current: {}, hourly: { uv_index: [] } });
  await openMeteoProvider.fetchUvIndex(PARIS);

  const [url] = requests;
  assert.match(url, /forecast_days=1/);
  assert.match(url, /timezone=auto/);
  assert.match(url, /current=uv_index%2Cuv_index_clear_sky/);
  assert.match(url, /hourly=uv_index/);
});

test('a value the model has none for is null, never zero', async () => {
  stubFetch({ current: { uv_index: null, uv_index_clear_sky: undefined }, hourly: {} });
  const reading = await openMeteoProvider.fetchUvIndex(PARIS);
  assert.equal(reading.uvIndex, null);
  assert.equal(reading.uvIndexClearSky, null);
  assert.equal(reading.uvIndexMaxToday, null);
});

test('the daily peak ignores the holes in the series', async () => {
  stubFetch({ current: { uv_index: 1 }, hourly: { uv_index: [null, 3.2, null, 4.8, null] } });
  const reading = await openMeteoProvider.fetchUvIndex(PARIS);
  assert.equal(reading.uvIndexMaxToday, 4.8);
});

test('an HTTP failure propagates, so the caller can report it', async () => {
  stubFetch({}, { ok: false, status: 503 });
  await assert.rejects(() => openMeteoProvider.fetchUvIndex(PARIS), /HTTP 503/);
});

test('an error payload with HTTP 200 is still an error', async () => {
  stubFetch({ error: true, reason: 'Latitude must be in range of -90 to 90' });
  await assert.rejects(() => openMeteoProvider.fetchUvIndex(PARIS), /Latitude must be in range/);
});

test('two reads of the same point hit the API once', async () => {
  // Open-Meteo is a free public service and the forecast is hourly: a second
  // request within the TTL would return the same numbers.
  stubFetch({ current: { uv_index: 5 }, hourly: { uv_index: [5] } });
  await openMeteoProvider.fetchUvIndex(PARIS);
  await openMeteoProvider.fetchUvIndex(PARIS);
  assert.equal(requests.length, 1);

  await openMeteoProvider.fetchUvIndex({ latitude: 43.6, longitude: 1.44 });
  assert.equal(requests.length, 2, 'another point is another cache entry');
});

test('CAMS covers the whole planet, so every point has a provider', () => {
  for (const point of [
    PARIS,
    { latitude: -33.87, longitude: 151.21 },
    { latitude: 78, longitude: 15 },
  ]) {
    assert.ok(findProvider(point), `${point.latitude},${point.longitude}`);
  }
});

test('readUvIndex rounds every index and grades the current one', async () => {
  stubFetch({
    current: { time: '2026-08-06T14:00', uv_index: 7.2, uv_index_clear_sky: 8.6 },
    hourly: { uv_index: [7.8, 3.1] },
  });

  const reading = await readUvIndex(PARIS);

  assert.equal(reading.provider, 'open-meteo-cams');
  assert.equal(reading.uvIndex, 7);
  assert.equal(reading.uvIndexClearSky, 9);
  assert.equal(reading.uvIndexMaxToday, 8);
  assert.equal(reading.level, UV_LEVELS.HIGH);
  assert.equal(reading.levelMaxToday, UV_LEVELS.VERY_HIGH);
  assert.equal(reading.measuredAt, '2026-08-06T14:00');
});

test('readUvIndex keeps a missing value missing', async () => {
  stubFetch({ current: { uv_index: null }, hourly: {} });
  const reading = await readUvIndex(PARIS);
  assert.equal(reading.uvIndex, null);
  assert.equal(reading.level, null);
});

test('the provider keeps today’s curve and the offset of its local hours', async () => {
  stubFetch({
    utc_offset_seconds: 7200,
    current: { time: '2026-08-06T14:00', uv_index: 7.2 },
    hourly: {
      time: ['2026-08-06T12:00', '2026-08-06T13:00', '2026-08-06T14:00'],
      uv_index: [6.4, null, 7.2],
    },
  });

  const reading = await openMeteoProvider.fetchUvIndex(PARIS);

  assert.equal(reading.utcOffsetSeconds, 7200);
  assert.deepEqual(reading.hourly, [
    { time: '2026-08-06T12:00', uvIndex: 6.4 },
    { time: '2026-08-06T13:00', uvIndex: null },
    { time: '2026-08-06T14:00', uvIndex: 7.2 },
  ]);
});

test('readUvIndex rounds the curve, drops its holes and dates the peak', async () => {
  stubFetch({
    utc_offset_seconds: 7200,
    current: { time: '2026-08-06T14:00', uv_index: 7.2 },
    hourly: {
      time: ['2026-08-06T12:00', '2026-08-06T13:00', '2026-08-06T14:00', '2026-08-06T15:00'],
      uv_index: [6.4, null, 7.8, 7.8],
    },
  });

  const reading = await readUvIndex(PARIS);

  assert.deepEqual(reading.forecast, [
    { time: '2026-08-06T12:00', uvIndex: 6 },
    { time: '2026-08-06T14:00', uvIndex: 8 },
    { time: '2026-08-06T15:00', uvIndex: 8 },
  ]);
  // A plateau is announced when it starts.
  assert.equal(reading.peakTime, '2026-08-06T14:00');
  assert.equal(reading.utcOffsetSeconds, 7200);
});

test('a reading without a curve has no forecast and no peak time', async () => {
  stubFetch({ current: { uv_index: 3 } });
  const reading = await readUvIndex(PARIS);
  assert.deepEqual(reading.forecast, []);
  assert.equal(reading.peakTime, null);
  assert.equal(reading.utcOffsetSeconds, null);
});

// --- The cache: until the next full hour --------------------------------------

test('an entry stays fresh until the next full hour of the clock', async () => {
  // CAMS is hourly: the 30-min refresh and the 15-min widget pull must cost one
  // request per hour, not one each.
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-08-06T10:05:00Z') });
  stubFetch({ current: { uv_index: 5 }, hourly: { uv_index: [5] } });

  await openMeteoProvider.fetchUvIndex(PARIS);
  mock.timers.setTime(Date.parse('2026-08-06T10:59:59Z'));
  await openMeteoProvider.fetchUvIndex(PARIS);
  assert.equal(requests.length, 1, 'still the same hour: served from the cache');

  mock.timers.setTime(Date.parse('2026-08-06T11:00:00Z'));
  await openMeteoProvider.fetchUvIndex(PARIS);
  assert.equal(requests.length, 2, 'a new hour is a new value');
});

test('an entry fetched just before the hour expires at the hour', async () => {
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-08-06T10:59:30Z') });
  stubFetch({ current: { uv_index: 5 }, hourly: { uv_index: [5] } });

  await openMeteoProvider.fetchUvIndex(PARIS);
  mock.timers.setTime(Date.parse('2026-08-06T11:00:01Z'));
  await openMeteoProvider.fetchUvIndex(PARIS);

  assert.equal(requests.length, 2);
});

test('a clock that jumps back does not keep an entry fresh', async () => {
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-08-06T10:05:00Z') });
  stubFetch({ current: { uv_index: 5 }, hourly: { uv_index: [5] } });

  await openMeteoProvider.fetchUvIndex(PARIS);
  mock.timers.setTime(Date.parse('2026-08-06T09:30:00Z'));
  await openMeteoProvider.fetchUvIndex(PARIS);

  assert.equal(requests.length, 2);
});

// --- The stale fallback -----------------------------------------------------

test('a failed read serves the last value to a caller that accepts it', async () => {
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-08-06T10:05:00Z') });
  stubFetch({ current: { time: '2026-08-06T12:00', uv_index: 6.2 }, hourly: { uv_index: [6] } });
  await openMeteoProvider.fetchUvIndex(PARIS);

  mock.timers.setTime(Date.parse('2026-08-06T11:30:00Z'));
  stubWith(() => new TypeError('fetch failed'));

  const reading = await openMeteoProvider.fetchUvIndex(PARIS, { allowStale: true });
  assert.equal(reading.uvIndex, 6.2);
  assert.equal(reading.measuredAt, '2026-08-06T12:00', 'its hour stays the hour it is from');

  await assert.rejects(
    () => openMeteoProvider.fetchUvIndex(PARIS),
    /fetch failed/,
    'a caller that does not accept it still sees the failure',
  );
});

test('past the stale limit, a failed read fails as before', async () => {
  const fetchedAt = Date.parse('2026-08-06T10:05:00Z');
  mock.timers.enable({ apis: ['Date'], now: fetchedAt });
  stubFetch({ current: { uv_index: 6.2 }, hourly: { uv_index: [6] } });
  await openMeteoProvider.fetchUvIndex(PARIS);

  mock.timers.setTime(fetchedAt + STALE_LIMIT_MS + 60_000);
  stubWith(() => new TypeError('fetch failed'));

  await assert.rejects(
    () => openMeteoProvider.fetchUvIndex(PARIS, { allowStale: true }),
    /fetch failed/,
  );
});

test('readUvIndex grades a stale value like a fresh one', async () => {
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-08-06T10:05:00Z') });
  stubFetch({ current: { uv_index: 6.2 }, hourly: { uv_index: [6.4] } });
  await readUvIndex(PARIS);

  mock.timers.setTime(Date.parse('2026-08-06T12:00:00Z'));
  stubWith(() => ({ status: 503 }));

  const reading = await readUvIndex(PARIS, { retry: RETRY.INTERACTIVE, allowStale: true });
  assert.equal(reading.uvIndex, 6);
  assert.equal(reading.level, 3);
});

// --- Requests in flight ------------------------------------------------------

test('two reads of the same point at the same time share one request', async () => {
  let answer;
  stubWith(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );

  const first = openMeteoProvider.fetchUvIndex(PARIS);
  const second = openMeteoProvider.fetchUvIndex(PARIS);
  await new Promise((resolve) => setImmediate(resolve));
  answer({ current: { uv_index: 4 }, hourly: { uv_index: [4] } });

  const [a, b] = await Promise.all([first, second]);
  assert.equal(requests.length, 1);
  assert.equal(a.uvIndex, 4);
  assert.equal(b.uvIndex, 4);
});

test('a request that failed is never served again', async () => {
  stubWith(() => new TypeError('fetch failed'));
  const results = await Promise.allSettled([
    openMeteoProvider.fetchUvIndex(PARIS),
    openMeteoProvider.fetchUvIndex(PARIS),
  ]);
  assert.deepEqual(
    results.map((result) => result.status),
    ['rejected', 'rejected'],
  );
  assert.equal(requests.length, 1, 'shared while in flight');

  stubFetch({ current: { uv_index: 3 }, hourly: { uv_index: [3] } });
  const reading = await openMeteoProvider.fetchUvIndex(PARIS);
  assert.equal(reading.uvIndex, 3, 'the next read asks again');
  assert.equal(requests.length, 1);
});

test('a patient caller that joined an impatient request retries on its own', async () => {
  // The refresh cycle joining a widget's single attempt must not lose its own
  // retries when that attempt fails.
  stubWith((url, index) => (index === 0 ? { status: 503 } : { current: { uv_index: 2 } }));

  const [impatient, patient] = await Promise.allSettled([
    openMeteoProvider.fetchUvIndex(PARIS, { retry: RETRY.NONE }),
    openMeteoProvider.fetchUvIndex(PARIS, { retry: RETRY.BACKGROUND }),
  ]);

  assert.equal(impatient.status, 'rejected');
  assert.equal(patient.status, 'fulfilled');
  assert.equal(patient.value.uvIndex, 2);
});

test('a retry policy reaches the request', async () => {
  stubWith((url, index) => (index === 0 ? { status: 502 } : { current: { uv_index: 2 } }));
  const reading = await openMeteoProvider.fetchUvIndex(PARIS, { retry: RETRY.BACKGROUND });
  assert.equal(reading.uvIndex, 2);
  assert.equal(requests.length, 2);
});

// --- Several points, one request --------------------------------------------

test('several locations are read in ONE request, and cached point by point', async () => {
  stubWith(() => [block(5.2), block(9.6, 1)]);

  const outcomes = await readUvIndexes([PARIS, SYDNEY]);

  assert.equal(requests.length, 1);
  const url = new URL(requests[0]);
  assert.equal(url.searchParams.get('latitude'), '48.8566,-33.87');
  assert.equal(url.searchParams.get('longitude'), '2.3522,151.21');
  assert.equal(url.searchParams.get('timezone'), 'auto');
  assert.deepEqual(
    outcomes.map((outcome) => outcome.reading.uvIndex),
    [5, 10],
  );

  await readUvIndex(SYDNEY);
  assert.equal(requests.length, 1, 'each point now has its own cache entry');
});

test('the blocks of an answer are matched by their location_id', async () => {
  stubWith(() => [block(9.6, 1), block(5.2)]);
  const outcomes = await readUvIndexes([PARIS, SYDNEY]);
  assert.deepEqual(
    outcomes.map((outcome) => outcome.reading.uvIndex),
    [5, 10],
  );
});

test('only the points the cache does not answer are requested', async () => {
  stubFetch(block(5.2));
  await readUvIndex(PARIS);

  stubWith(() => block(9.6));
  const outcomes = await readUvIndexes([PARIS, SYDNEY]);

  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0]).searchParams.get('latitude'), '-33.87');
  assert.deepEqual(
    outcomes.map((outcome) => outcome.reading.uvIndex),
    [5, 10],
  );
});

test('a batch the API refuses is asked again point by point', async () => {
  // One point it rejects must not silence the others.
  stubWith((url) => {
    const latitude = new URL(url).searchParams.get('latitude');
    if (latitude.includes(',')) {
      return { status: 400 };
    }
    return latitude === '48.8566' ? { error: true, reason: 'bad point' } : block(9.6);
  });

  const [paris, sydney] = await readUvIndexes([PARIS, SYDNEY]);

  assert.equal(requests.length, 3);
  assert.match(paris.error.message, /bad point/);
  assert.equal(sydney.reading.uvIndex, 10);
});

test('an outage fails every point of the batch, without throwing', async () => {
  stubWith(() => new TypeError('fetch failed'));
  const outcomes = await readUvIndexes([PARIS, SYDNEY]);
  assert.equal(requests.length, 1, 'an outage is not asked again point by point');
  assert.ok(outcomes.every((outcome) => /fetch failed/.test(outcome.error.message)));
});

test('a provider without a batch read is read point by point, and an uncovered point is an outcome', async () => {
  const northern = {
    key: 'northern-only',
    supports: (point) => point.latitude > 0,
    fetchUvIndex: async () => ({ uvIndex: 3.4, hourly: [] }),
  };
  const saved = [...PROVIDERS];
  PROVIDERS.splice(0, PROVIDERS.length, northern);
  try {
    const [paris, sydney] = await readUvIndexes([PARIS, SYDNEY]);
    assert.equal(paris.reading.provider, 'northern-only');
    assert.equal(paris.reading.uvIndex, 3);
    assert.match(sydney.error.message, /No UV provider covers/);
  } finally {
    PROVIDERS.splice(0, PROVIDERS.length, ...saved);
  }
});
