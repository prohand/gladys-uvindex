// -----------------------------------------------------------------------------
// The provider and the registry. `globalThis.fetch` is stubbed per test and
// restored afterwards: these tests never touch the network.
//
// `src/uv/openMeteo.js` keeps a module-level TTL cache, so every test clears it
// first — otherwise a reading leaks into the next test's assertions.
// -----------------------------------------------------------------------------

import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { clearUvCache, openMeteoProvider } from '../src/uv/openMeteo.js';
import { findProvider, readUvIndex } from '../src/uv/index.js';
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

beforeEach(() => {
  clearUvCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
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
