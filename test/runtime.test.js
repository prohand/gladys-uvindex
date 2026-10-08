// -----------------------------------------------------------------------------
// The lifecycle `index.js` routes the SDK events to: configuration, publication,
// refresh timers, connection status. Driven with the fake SDK and a recording
// blueprint — no Gladys, no network, no real timer.
// -----------------------------------------------------------------------------

import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime, NOT_CONFIGURED_MESSAGE } from '../src/runtime.js';
import { clearLevelMemory, observeLevel } from '../src/scenes.js';
import { reportStatus } from '../src/status.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const NANTES = { id: 'loc-1', name: 'Maison', latitude: '47.2172', longitude: '-1.5534' };
const BUREAU = { id: 'loc-2', name: 'Bureau', latitude: '48.86', longitude: '2.35' };

/** A blueprint that records what the runtime asks of it. */
function recordingBlueprint() {
  const blueprint = {
    key: 'recorder',
    started: [],
    stopped: 0,
    refreshed: [],
    deviceExternalIds: () => [],
    buildDevices: (gladys, config) =>
      config.locations.map((location) => ({ external_id: location.id })),
    startPolling(gladys, config) {
      blueprint.started.push(config);
      return () => {
        blueprint.stopped += 1;
      };
    },
    async refresh(gladys, config) {
      blueprint.refreshed.push(config);
      await reportStatus(gladys, true);
    },
  };
  return blueprint;
}

/** A fake SDK whose device batch Gladys refuses. */
function refusingGladys() {
  const gladys = createFakeGladys();
  gladys.publishDiscoveredDevices = async () => {
    throw new Error('BAD_REQUEST: unknown category');
  };
  return gladys;
}

beforeEach(() => {
  clearLevelMemory();
});

test('a new configuration reaches the timers', async () => {
  const blueprint = recordingBlueprint();
  const runtime = createRuntime(createFakeGladys(), { blueprints: [blueprint] });

  await runtime.applyConfig({ poll_frequency: 3600, language: 'en', locations: [NANTES] });

  const [config] = blueprint.started;
  assert.equal(config.poll_frequency, 3600);
  assert.equal(config.language, 'en');
});

test('a new configuration reaches the timers even when the publication fails', async () => {
  // Otherwise the old timers keep running with the old interval and language.
  const blueprint = recordingBlueprint();
  const gladys = refusingGladys();
  const runtime = createRuntime(gladys, { blueprints: [blueprint] });

  await runtime.applyConfig({ poll_frequency: 600, locations: [NANTES] });
  await runtime.applyConfig({ poll_frequency: 7200, language: 'en', locations: [NANTES] });

  assert.equal(blueprint.started.length, 2);
  assert.equal(blueprint.started[1].poll_frequency, 7200);
  assert.equal(blueprint.started[1].language, 'en');
  assert.equal(blueprint.stopped, 1, 'the previous timer was stopped');
  assert.match(gladys.statuses.at(-1).message.en, /Gladys refused the device: BAD_REQUEST/);
});

test('a refused batch stays on the status line through a good refresh', async () => {
  const blueprint = recordingBlueprint();
  const gladys = refusingGladys();
  const runtime = createRuntime(gladys, { blueprints: [blueprint] });
  await runtime.applyConfig({ locations: [NANTES] });

  await runtime.refreshNow();

  const last = gladys.statuses.at(-1);
  assert.equal(last.connected, false);
  assert.match(last.message.fr, /Gladys a refusé l'appareil/);
});

test('a publication Gladys accepts releases the held status', async () => {
  const blueprint = recordingBlueprint();
  const gladys = refusingGladys();
  const runtime = createRuntime(gladys, { blueprints: [blueprint] });
  await runtime.applyConfig({ locations: [NANTES] });

  gladys.publishDiscoveredDevices = async (list) => ({ count: list.length });
  await runtime.republish();
  await runtime.refreshNow();

  assert.deepEqual(gladys.statuses.at(-1), { connected: true, message: undefined });
});

test('a configuration with no location stops the timers', async () => {
  const blueprint = recordingBlueprint();
  const gladys = createFakeGladys();
  const runtime = createRuntime(gladys, { blueprints: [blueprint] });
  await runtime.applyConfig({ locations: [NANTES] });

  await runtime.applyConfig({ locations: [] });

  assert.equal(blueprint.started.length, 1);
  assert.equal(blueprint.stopped, 1);
  assert.deepEqual(gladys.statuses.at(-1), { connected: false, message: NOT_CONFIGURED_MESSAGE });
  assert.deepEqual(gladys.discovered.at(-1), [], 'the Discovery tab is emptied');
});

test('the connection uses the configuration the SDK has just read', async () => {
  const blueprint = recordingBlueprint();
  const gladys = createFakeGladys();
  let reads = 0;
  gladys.getConfig = async () => {
    reads += 1;
    return {};
  };
  gladys.config = { language: 'en', locations: [NANTES] };
  const runtime = createRuntime(gladys, { blueprints: [blueprint] });

  await runtime.onConnected();

  assert.equal(reads, 0, 'no second GET /config');
  assert.equal(runtime.getConfig().language, 'en');
  assert.deepEqual(gladys.discovered.at(-1), [{ external_id: 'loc-1' }]);
  assert.equal(blueprint.started.length, 1);
  assert.deepEqual(gladys.statuses, [{ connected: true, message: undefined }]);
});

test('every (re)connection reports the status again, even an unchanged one', async () => {
  // Gladys may have restarted meanwhile and know nothing.
  const gladys = createFakeGladys();
  gladys.config = { locations: [NANTES] };
  const runtime = createRuntime(gladys, { blueprints: [recordingBlueprint()] });

  await runtime.onConnected();
  await runtime.refreshNow();
  assert.equal(gladys.statuses.length, 1, 'the refresh had nothing new to say');

  await runtime.onConnected();
  assert.equal(gladys.statuses.length, 2);
});

test('a connection whose publication fails still starts the refresh and says why', async () => {
  // The stations already created keep updating.
  const blueprint = recordingBlueprint();
  const gladys = refusingGladys();
  gladys.config = { locations: [NANTES] };
  const runtime = createRuntime(gladys, { blueprints: [blueprint] });

  await runtime.onConnected();

  assert.equal(blueprint.started.length, 1);
  assert.equal(gladys.statuses.at(-1).connected, false);
  assert.match(gladys.statuses.at(-1).message.en, /BAD_REQUEST/);
});

test('a location removed from the list loses its scene baseline', async () => {
  const runtime = createRuntime(createFakeGladys(), { blueprints: [recordingBlueprint()] });
  await runtime.applyConfig({ locations: [NANTES, BUREAU] });
  observeLevel('loc-1', 2);
  observeLevel('loc-2', 2);

  await runtime.applyConfig({ locations: [BUREAU] });

  assert.equal(observeLevel('loc-1', 4), null, 'a fresh baseline: nothing fires');
  assert.deepEqual(observeLevel('loc-2', 4), { previous: 2, level: 4 }, 'the kept one still fires');
});

test('setConfig keeps the in-memory configuration in step', async () => {
  const gladys = createFakeGladys();
  const runtime = createRuntime(gladys, { blueprints: [recordingBlueprint()] });

  await runtime.setConfig({ locations: [NANTES] });

  assert.deepEqual(gladys.configs, [{ locations: [NANTES] }]);
  assert.equal(runtime.getConfig().locations[0].id, 'loc-1');
});
