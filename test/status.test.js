// -----------------------------------------------------------------------------
// The status line: sent on change, forgotten at connection, and held while a
// refused device batch has not been fixed.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forgetStatus, holdStatus, releaseStatus, reportStatus } from '../src/status.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const DOWN = { en: 'down', fr: 'en panne' };

test('a status is sent once, until it changes', async () => {
  const gladys = createFakeGladys();
  assert.equal(await reportStatus(gladys, true), true);
  assert.equal(await reportStatus(gladys, true), false);
  assert.equal(await reportStatus(gladys, false, DOWN), true);
  assert.equal(await reportStatus(gladys, false, { ...DOWN }), false, 'same words, same status');
  assert.equal(await reportStatus(gladys, true), true);
  assert.equal(gladys.statuses.length, 3);
});

test('a status that failed to go out is sent again next time', async () => {
  const gladys = createFakeGladys();
  gladys.setConnectionStatus = async () => {
    throw new Error('not connected');
  };
  assert.equal(await reportStatus(gladys, true), false, 'never throws');

  const statuses = [];
  gladys.setConnectionStatus = async (connected, message) => {
    statuses.push({ connected, message });
  };
  await reportStatus(gladys, true);
  assert.deepEqual(statuses, [{ connected: true, message: undefined }]);
});

test('forgetting the status sends the next one whatever it says', async () => {
  const gladys = createFakeGladys();
  await reportStatus(gladys, true);
  forgetStatus(gladys);
  await reportStatus(gladys, true);
  assert.equal(gladys.statuses.length, 2);
});

test('each SDK instance has its own memory', async () => {
  const one = createFakeGladys();
  const two = createFakeGladys();
  await reportStatus(one, true);
  await reportStatus(two, true);
  assert.equal(two.statuses.length, 1);
});

test('a held problem replaces "connected" until it is released', async () => {
  const gladys = createFakeGladys();
  holdStatus(gladys, DOWN);
  await reportStatus(gladys, true);
  assert.deepEqual(gladys.statuses, [{ connected: false, message: DOWN }]);

  releaseStatus(gladys);
  await reportStatus(gladys, true);
  assert.deepEqual(gladys.statuses.at(-1), { connected: true, message: undefined });
});
