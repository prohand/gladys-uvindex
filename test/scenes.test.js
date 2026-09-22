// -----------------------------------------------------------------------------
// The scene trigger and the scene action. No Gladys and no network: the action
// takes its outside world by injection, the trigger is driven through the level
// memory and a fake SDK.
// -----------------------------------------------------------------------------

import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  announceLevelChange,
  buildReadingOutputs,
  clearLevelMemory,
  createSceneActions,
  DIRECTION,
  observeLevel,
  SCENE_ACTION,
  SCENE_TRIGGER,
} from '../src/scenes.js';
import { UV_LEVEL_ADVICE } from '../src/uv/scale.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const MAISON = { id: 'loc-1', name: 'Maison' };

const READING = {
  uvIndex: 7,
  uvIndexClearSky: 8,
  uvIndexMaxToday: 8,
  level: 3,
  levelMaxToday: 4,
  measuredAt: '2026-08-06T14:00',
  peakTime: '2026-08-06T13:00',
};

beforeEach(() => {
  clearLevelMemory();
});

test('the first level seen is a baseline, not a transition', () => {
  assert.equal(observeLevel('loc-1', 2), null);
  assert.equal(observeLevel('loc-1', 2), null, 'the same level is no change either');
  assert.deepEqual(observeLevel('loc-1', 3), { previous: 2, level: 3 });
});

test('a reading without a level leaves the baseline alone', () => {
  observeLevel('loc-1', 2);
  assert.equal(observeLevel('loc-1', null), null);
  assert.deepEqual(observeLevel('loc-1', 1), { previous: 2, level: 1 });
});

test('each location has its own baseline', () => {
  observeLevel('loc-1', 2);
  assert.equal(observeLevel('loc-2', 5), null);
});

test('the event names the location, the direction and the words of the new level', async () => {
  const gladys = createFakeGladys();
  const args = { deviceId: 'device:loc-1', location: MAISON, language: 'fr' };

  await announceLevelChange(gladys, { ...args, reading: { ...READING, level: 4 } });
  await announceLevelChange(gladys, { ...args, reading: { ...READING, level: 2 } });

  assert.equal(gladys.sceneEvents.length, 1);
  const [{ key, data }] = gladys.sceneEvents;
  assert.equal(key, SCENE_TRIGGER.LEVEL_CHANGED);
  assert.equal(data.location, 'device:loc-1');
  assert.equal(data.location_name, 'Maison');
  assert.equal(data.direction, DIRECTION.FALLING);
  assert.equal(data.level, 2);
  assert.equal(data.previous_level, 4);
  assert.equal(data.level_label, 'Modéré');
  assert.equal(data.previous_level_label, 'Très élevé');
  assert.equal(data.advice, UV_LEVEL_ADVICE[2].fr);
  assert.equal(data.measured_at, '06/08/2026 à 14:00');
});

test('the event texts follow the language of the devices', async () => {
  const gladys = createFakeGladys();
  const args = { deviceId: 'device:loc-1', location: MAISON, language: 'en' };
  await announceLevelChange(gladys, { ...args, reading: { ...READING, level: 1 } });
  await announceLevelChange(gladys, { ...args, reading: { ...READING, level: 3 } });

  assert.equal(gladys.sceneEvents[0].data.level_label, 'High');
  assert.equal(gladys.sceneEvents[0].data.direction, DIRECTION.RISING);
});

test('a missing value is left out of the event, never sent as 0', async () => {
  const gladys = createFakeGladys();
  const args = { deviceId: 'device:loc-1', location: MAISON, language: 'fr' };
  await announceLevelChange(gladys, { ...args, reading: { ...READING, level: 1 } });
  await announceLevelChange(gladys, {
    ...args,
    reading: { ...READING, level: 3, uvIndex: null, measuredAt: null },
  });

  const { data } = gladys.sceneEvents[0];
  assert.equal('uv_index' in data, false);
  assert.equal('measured_at' in data, false);
});

test('an event Gladys refuses is logged, never thrown', async () => {
  const gladys = createFakeGladys();
  gladys.publishSceneEvent = async () => {
    throw new Error('429 TOO_MANY_REQUESTS');
  };
  const args = { deviceId: 'device:loc-1', location: MAISON, language: 'fr' };
  await announceLevelChange(gladys, { ...args, reading: { ...READING, level: 1 } });
  await announceLevelChange(gladys, { ...args, reading: { ...READING, level: 3 } });
});

/** The scene actions wired to one location and a canned reader. */
function actionsFor(readUvIndex = async () => READING, language = 'fr') {
  return createSceneActions({
    getConfig: () => ({ language, locations: [MAISON] }),
    locationOfDevice: (config, externalId) =>
      config.locations.find((location) => `device:${location.id}` === externalId),
    readUvIndex,
  });
}

test('the action reads the location of the device it is given', async () => {
  const read = [];
  const outputs = await actionsFor(async (location) => {
    read.push(location.name);
    return READING;
  })[SCENE_ACTION.READ_UV_INDEX]({ location: 'device:loc-1' });

  assert.deepEqual(read, ['Maison']);
  assert.deepEqual(outputs, {
    location_name: 'Maison',
    uv_index: 7,
    uv_index_max_today: 8,
    uv_index_clear_sky: 8,
    level: 3,
    level_label: 'Élevé',
    level_max_today: 4,
    level_max_today_label: 'Très élevé',
    advice: UV_LEVEL_ADVICE[3].fr,
    peak_time: '13:00',
    measured_at: '06/08/2026 à 14:00',
  });
});

test('the action never fires the trigger: no loop through the integration', async () => {
  // A scene bound to the trigger that runs this action would run again. The
  // action reads a level-3 reading; had it gone through the level memory, the
  // baseline would now be 3 and coming back to 1 would be a transition.
  observeLevel('loc-1', 1);
  await actionsFor()[SCENE_ACTION.READ_UV_INDEX]({ location: 'device:loc-1' });
  assert.equal(observeLevel('loc-1', 1), null, 'the baseline was not touched');
});

test('a missing value is left out of the outputs, never returned as 0', () => {
  const outputs = buildReadingOutputs(
    MAISON,
    { ...READING, uvIndex: null, level: null, peakTime: null },
    'fr',
  );
  for (const key of ['uv_index', 'level', 'level_label', 'advice', 'peak_time']) {
    assert.equal(key in outputs, false, key);
  }
  assert.equal(outputs.uv_index_max_today, 8);
});

test('an index of 0 IS an output: the sun being down is data', () => {
  const outputs = buildReadingOutputs(MAISON, { ...READING, uvIndex: 0, level: 0 }, 'fr');
  assert.equal(outputs.uv_index, 0);
  assert.equal(outputs.level_label, 'Nul');
});

test('the action on a device whose location was removed fails with a reason', async () => {
  await assert.rejects(
    actionsFor()[SCENE_ACTION.READ_UV_INDEX]({ location: 'device:gone' }),
    /No location watches the device device:gone/,
  );
});
