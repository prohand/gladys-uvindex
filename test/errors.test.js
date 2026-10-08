// -----------------------------------------------------------------------------
// The reason of an error, as a one-line message shows it.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorReason, MAX_REASON_LENGTH } from '../src/errors.js';

test('the reason is the message of the error', () => {
  assert.equal(errorReason(new Error('Open-Meteo HTTP 503')), 'Open-Meteo HTTP 503');
  assert.equal(errorReason('plain text'), 'plain text');
  assert.equal(errorReason(undefined), 'unknown error');
});

test('the code Node hides in the cause of "fetch failed" is brought back', () => {
  const err = new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
  assert.equal(errorReason(err), 'fetch failed (ECONNREFUSED)');
});

test('a code already in the message is not repeated', () => {
  const err = Object.assign(new Error('connect ECONNREFUSED 1.2.3.4:443'), {
    code: 'ECONNREFUSED',
  });
  assert.equal(errorReason(err), 'connect ECONNREFUSED 1.2.3.4:443');
});

test('the reason is one line, cut to fit', () => {
  const reason = errorReason(new Error(`first line\nsecond ${'x'.repeat(400)}`));
  assert.ok(!reason.includes('\n'));
  assert.equal(reason.length, MAX_REASON_LENGTH);
  assert.equal(errorReason(new Error('x'.repeat(400)), 120).length, 120);
});
