import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { normalizeConfig } from '../src/config.js';
import { buildDiscoveredDevices, findBlueprintByDevice } from '../src/devices/index.js';
import {
  buildDevice,
  buildStates,
  deviceExternalIds,
  FEATURE,
  poll,
  uvStation,
  watchedLocations,
} from '../src/devices/uvStation.js';
import { clearUvCache } from '../src/uv/openMeteo.js';
import { UV_INDEX_MAX, UV_LEVEL_MAX, UV_LEVELS } from '../src/uv/scale.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const NANTES = {
  id: 'loc-abc12345',
  name: 'Maison',
  postal_code: '44300',
  address_label: 'Nantes, Loire-Atlantique, Pays de la Loire',
  latitude: '47.2172',
  longitude: '-1.5534',
};

const realFetch = globalThis.fetch;

function stubFetch(payload) {
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => payload });
}

beforeEach(() => {
  clearUvCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

test('one device is published per configured location', () => {
  const gladys = createFakeGladys();
  const config = normalizeConfig({
    locations: [
      NANTES,
      { ...NANTES, id: 'loc-2', name: 'Bureau', latitude: '48.86', longitude: '2.35' },
    ],
  });

  const devices = buildDiscoveredDevices(gladys, config);

  assert.equal(devices.length, 2);
  assert.deepEqual(
    devices.map((device) => device.name),
    ['Indice UV — Maison', 'Indice UV — Bureau'],
  );
});

test('a location with no usable point publishes no device', () => {
  // A device pinned to nowhere would sit forever on "no recent value".
  const config = normalizeConfig({ locations: [{ ...NANTES, longitude: '' }] });
  assert.deepEqual(watchedLocations(config), []);
  assert.deepEqual(buildDiscoveredDevices(createFakeGladys(), config), []);
});

test('a device is identified by its location id, not by its name', () => {
  // Renaming a location, or moving its point, must keep the device, its history
  // and its place in the rooms and scenes.
  const gladys = createFakeGladys();
  const before = buildDevice(gladys, normalizeConfig({ locations: [NANTES] }).locations[0]);
  const after = buildDevice(
    gladys,
    normalizeConfig({ locations: [{ ...NANTES, name: 'Jardin', latitude: '47.3' }] }).locations[0],
  );
  assert.equal(before.external_id, after.external_id);
  assert.equal(before.external_id, 'uv-station:loc-abc12345');
});

test('the device carries no poll_frequency', () => {
  // The core only accepts a fixed enum of intervals in MILLISECONDS capped at
  // one minute; anything else has the WHOLE batch refused. The integration runs
  // its own timer instead.
  const [device] = buildDiscoveredDevices(
    createFakeGladys(),
    normalizeConfig({ locations: [NANTES] }),
  );
  assert.equal(device.poll_frequency, undefined);
});

test('the device keeps where it looks, for when a commune turns out wrong', () => {
  const [device] = buildDiscoveredDevices(
    createFakeGladys(),
    normalizeConfig({ locations: [NANTES] }),
  );
  const params = Object.fromEntries(device.params.map((param) => [param.name, param.value]));
  assert.equal(params.LOCATION_ID, 'loc-abc12345');
  assert.equal(params.POSTAL_CODE, '44300');
  assert.equal(params.LATITUDE, '47.2172');
});

test('every feature declares an explicit min and max', () => {
  // `t_device_feature.min`/`max` are NOT NULL with no default: publishing
  // passes, then the user's "add device" click fails.
  const [device] = buildDiscoveredDevices(
    createFakeGladys(),
    normalizeConfig({ locations: [NANTES] }),
  );
  assert.equal(device.features.length, 6);
  for (const feature of device.features) {
    assert.equal(typeof feature.min, 'number', feature.external_id);
    assert.equal(typeof feature.max, 'number', feature.external_id);
    assert.equal(feature.read_only, true, 'a UV station commands nothing');
  }
});

test('the numeric indices are UV sensors carrying the UV index unit', () => {
  const [device] = buildDiscoveredDevices(
    createFakeGladys(),
    normalizeConfig({ locations: [NANTES] }),
  );
  const byKey = Object.fromEntries(
    device.features.map((feature) => [feature.external_id.split(':').pop(), feature]),
  );

  for (const key of [FEATURE.UV_INDEX, FEATURE.UV_INDEX_MAX_TODAY, FEATURE.UV_INDEX_CLEAR_SKY]) {
    assert.equal(byKey[key].category, DEVICE_FEATURE_CATEGORIES.UV_SENSOR, key);
    assert.equal(byKey[key].type, DEVICE_FEATURE_TYPES.UV_SENSOR.INTEGER, key);
    assert.equal(byKey[key].unit, DEVICE_FEATURE_UNITS.UV_INDEX, key);
    assert.equal(byKey[key].max, UV_INDEX_MAX, key);
    assert.equal(byKey[key].keep_history, true, key);
  }

  assert.equal(byKey[FEATURE.EXPOSURE_LEVEL].category, DEVICE_FEATURE_CATEGORIES.RISK);
  assert.equal(byKey[FEATURE.EXPOSURE_LEVEL].max, UV_LEVEL_MAX);
  assert.equal(byKey[FEATURE.PROTECTION_ADVICE].category, DEVICE_FEATURE_CATEGORIES.TEXT);
  assert.equal(byKey[FEATURE.PROTECTION_ADVICE].keep_history, false, 'a label is not a measure');
});

test('the names follow the configured language', () => {
  const gladys = createFakeGladys();
  const [location] = normalizeConfig({ locations: [NANTES] }).locations;

  const french = buildDevice(gladys, location, 'fr');
  const english = buildDevice(gladys, location, 'en');

  assert.equal(french.name, 'Indice UV — Maison');
  assert.equal(english.name, 'UV index — Maison');
  assert.match(french.features[0].name, /^Indice UV$/);
  assert.match(english.features[0].name, /^UV index$/);
  assert.equal(french.external_id, english.external_id, 'the identity is language-free');
});

test('a reading becomes one state per feature', () => {
  const ids = createFakeGladys().externalIds('uv-station', 'loc-abc12345');
  const states = buildStates(
    ids,
    {
      uvIndex: 7,
      uvIndexMaxToday: 8,
      uvIndexClearSky: 9,
      level: UV_LEVELS.HIGH,
    },
    'fr',
  );

  assert.equal(states.length, 6);
  const byKey = Object.fromEntries(
    states.map((state) => [state.device_feature_external_id.split(':').pop(), state]),
  );
  assert.equal(byKey[FEATURE.UV_INDEX].state, 7);
  assert.equal(byKey[FEATURE.UV_INDEX_MAX_TODAY].state, 8);
  assert.equal(byKey[FEATURE.UV_INDEX_CLEAR_SKY].state, 9);
  assert.equal(byKey[FEATURE.EXPOSURE_LEVEL].state, UV_LEVELS.HIGH);
  assert.equal(byKey[FEATURE.EXPOSURE_LEVEL_TEXT].text, 'Élevé');
  assert.match(byKey[FEATURE.PROTECTION_ADVICE].text, /évitez le soleil/);
});

test('the text states are written in the language of the features carrying them', () => {
  const ids = createFakeGladys().externalIds('uv-station', 'loc-abc12345');
  const states = buildStates(ids, { uvIndex: 7, level: UV_LEVELS.HIGH }, 'en');
  const text = states.find((state) =>
    state.device_feature_external_id.endsWith(FEATURE.EXPOSURE_LEVEL_TEXT),
  );
  assert.equal(text.text, 'High');
});

test('a missing value publishes nothing at all for that feature', () => {
  // An absent measurement is not a UV index of 0.
  const ids = createFakeGladys().externalIds('uv-station', 'loc-abc12345');
  const states = buildStates(ids, {
    uvIndex: null,
    uvIndexMaxToday: 4,
    uvIndexClearSky: null,
    level: null,
  });

  assert.deepEqual(
    states.map((state) => state.device_feature_external_id.split(':').pop()),
    [FEATURE.UV_INDEX_MAX_TODAY],
  );
});

test('a UV index of 0 IS published: the sun being down is data', () => {
  const ids = createFakeGladys().externalIds('uv-station', 'loc-abc12345');
  const states = buildStates(ids, {
    uvIndex: 0,
    uvIndexMaxToday: 6,
    uvIndexClearSky: 0,
    level: UV_LEVELS.NONE,
  });
  assert.equal(states.length, 6);
  assert.equal(states[0].state, 0);
});

test('polling a location publishes its states to Gladys', async () => {
  stubFetch({
    current: { time: '2026-08-06T14:00', uv_index: 7.2, uv_index_clear_sky: 8.6 },
    hourly: { uv_index: [1, 7.8, 3] },
  });
  const gladys = createFakeGladys();
  const [location] = normalizeConfig({ locations: [NANTES] }).locations;

  await poll(gladys, location, 'fr');

  assert.equal(gladys.published.length, 6);
  const uvIndex = gladys.published.find((state) =>
    state.featureExternalId.endsWith(FEATURE.UV_INDEX),
  );
  assert.equal(uvIndex.state, 7);
});

test('a device is routed back to the blueprint that owns it', () => {
  const gladys = createFakeGladys();
  const config = normalizeConfig({ locations: [NANTES] });
  const externalId = deviceExternalIds(gladys, config.locations[0]).device;

  assert.equal(findBlueprintByDevice(gladys, config, { external_id: externalId }), uvStation);
  assert.equal(
    findBlueprintByDevice(gladys, config, { external_id: 'uv-station:gone' }),
    undefined,
  );
});

test('polling a device no location watches is an error, not a silent no-op', async () => {
  const config = normalizeConfig({ locations: [NANTES] });
  await assert.rejects(
    () => uvStation.onPoll(createFakeGladys(), config, 'uv-station:gone'),
    /No location watches/,
  );
});

test('a refresh cycle NEVER throws, and reports the outage instead', async () => {
  // A rejection inside a timer callback would take the container down.
  globalThis.fetch = async () => {
    throw new Error('network down');
  };
  const gladys = createFakeGladys();
  const config = normalizeConfig({ locations: [NANTES] });

  await uvStation.refresh(gladys, config);

  const [status] = gladys.statuses;
  assert.equal(status.connected, false);
  assert.match(status.message.fr, /Maison/);
  assert.match(status.message.fr, /network down/);
});

test('one location failing does not silence the others', async () => {
  let call = 0;
  globalThis.fetch = async () => {
    call += 1;
    if (call === 1) {
      throw new Error('boom');
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ current: { uv_index: 5 }, hourly: { uv_index: [5] } }),
    };
  };
  const gladys = createFakeGladys();
  const config = normalizeConfig({
    locations: [
      NANTES,
      { ...NANTES, id: 'loc-2', name: 'Bureau', latitude: '48.86', longitude: '2.35' },
    ],
  });

  await uvStation.refresh(gladys, config);

  assert.ok(gladys.published.length > 0, 'the location that worked still published');
  assert.equal(gladys.statuses[0].connected, false);
});

test('a successful cycle reports the integration as connected', async () => {
  stubFetch({ current: { uv_index: 5 }, hourly: { uv_index: [5] } });
  const gladys = createFakeGladys();

  await uvStation.refresh(gladys, normalizeConfig({ locations: [NANTES] }));

  assert.deepEqual(gladys.statuses, [{ connected: true, message: undefined }]);
});

test('the provider test reports every location, numbered like the listing', async () => {
  stubFetch({ current: { uv_index: 7.2 }, hourly: { uv_index: [7.8] } });
  const gladys = createFakeGladys();
  const config = normalizeConfig({
    locations: [
      NANTES,
      { ...NANTES, id: 'loc-2', name: 'Bureau', latitude: '48.86', longitude: '2.35' },
    ],
  });

  const message = await uvStation.actions.test_provider(gladys, { config });

  assert.match(message.fr, /Fournisseur UV OK — 2 lieu/);
  assert.match(message.fr, /UV 7 \(Élevé\)/);
  assert.match(message.fr, /max du jour 8/);
  assert.equal(message.fr.split('•').length - 1, 2, 'one bulleted entry per location');
});

test('the provider test says how many locations failed, and why', async () => {
  globalThis.fetch = async () => {
    throw new Error('boom');
  };
  const gladys = createFakeGladys();
  const config = normalizeConfig({ locations: [NANTES] });

  const message = await uvStation.actions.test_provider(gladys, { config });

  assert.match(message.fr, /1 lieu\(x\) en échec sur 1/);
  assert.match(message.fr, /boom/);
});

test('the provider test with no location says what to do', async () => {
  const message = await uvStation.actions.test_provider(createFakeGladys(), {
    config: normalizeConfig(),
  });
  assert.match(message.fr, /Aucun lieu/);
});
