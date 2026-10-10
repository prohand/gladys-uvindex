// -----------------------------------------------------------------------------
// The per-address connection delay (issue #18).
// -----------------------------------------------------------------------------

import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import { CONNECT_ATTEMPT_TIMEOUT_MS, widenConnectAttempts } from '../src/network.js';

let original;
beforeEach(() => {
  original = net.getDefaultAutoSelectFamilyAttemptTimeout();
});
afterEach(() => {
  net.setDefaultAutoSelectFamilyAttemptTimeout(original);
});

test("Node's 250 ms is raised: a distant server gets time to answer", () => {
  net.setDefaultAutoSelectFamilyAttemptTimeout(250);
  widenConnectAttempts();
  assert.equal(net.getDefaultAutoSelectFamilyAttemptTimeout(), CONNECT_ATTEMPT_TIMEOUT_MS);
});

test('a larger value given on the command line is kept', () => {
  net.setDefaultAutoSelectFamilyAttemptTimeout(5000);
  widenConnectAttempts();
  assert.equal(net.getDefaultAutoSelectFamilyAttemptTimeout(), 5000);
});

test('the entry point widens the delay before it creates the SDK', async () => {
  const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
  const call = source.indexOf('widenConnectAttempts();');
  assert.ok(call !== -1, 'index.js must call widenConnectAttempts()');
  assert.ok(call < source.indexOf('const gladys = new GladysIntegration('));
});
