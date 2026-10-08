// -----------------------------------------------------------------------------
// The retry of the public APIs. `globalThis.fetch` is stubbed and the wait
// between two attempts is recorded instead of lived through.
// -----------------------------------------------------------------------------

import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithRetry, parseRetryAfter, RETRY, setRetrySleep } from '../src/http.js';

const realFetch = globalThis.fetch;
let waits = [];
let calls = 0;

/** Answer each request with the next of `answers`: a status, or an Error to throw. */
function stubAnswers(...answers) {
  calls = 0;
  globalThis.fetch = async () => {
    const answer = answers[Math.min(calls, answers.length - 1)];
    calls += 1;
    if (answer instanceof Error) {
      throw answer;
    }
    const { status, retryAfter } = typeof answer === 'number' ? { status: answer } : answer;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name) => (name === 'retry-after' ? (retryAfter ?? null) : null) },
      json: async () => ({ status }),
    };
  };
}

const POLICY = { retries: 2, baseDelayMs: 1000, maxDelayMs: 10_000, budgetMs: 60_000 };
const fetchIt = (retry = POLICY) =>
  fetchWithRetry('https://example.test/', { label: 'Test API', timeoutMs: 1000, retry });

beforeEach(() => {
  waits = [];
  setRetrySleep(async (ms) => {
    waits.push(ms);
  });
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setRetrySleep(null);
});

test('a 5xx is retried, and the success that follows is the answer', async () => {
  stubAnswers(503, 502, 200);
  const response = await fetchIt();
  assert.equal(response.status, 200);
  assert.equal(calls, 3);
  assert.equal(waits.length, 2);
});

test('the backoff grows, with a random half kept', async () => {
  stubAnswers(500, 500, 200);
  await fetchIt();
  const [first, second] = waits;
  assert.ok(first >= 500 && first <= 1000, `first wait ${first}`);
  assert.ok(second >= 1000 && second <= 2000, `second wait ${second}`);
});

test('a network error is retried too', async () => {
  stubAnswers(new TypeError('fetch failed'), 200);
  const response = await fetchIt();
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test('a 429 is retried after the delay Retry-After asks for', async () => {
  stubAnswers({ status: 429, retryAfter: '3' }, 200);
  await fetchIt();
  assert.deepEqual(waits, [3000]);
});

test('a Retry-After longer than the policy accepts is not retried at all', async () => {
  // Going back sooner than the server asked would only be refused again.
  stubAnswers({ status: 429, retryAfter: '120' }, 200);
  await assert.rejects(fetchIt(), /Test API HTTP 429/);
  assert.equal(calls, 1);
  assert.deepEqual(waits, []);
});

test('a 4xx is an answer, never retried', async () => {
  stubAnswers(404, 200);
  await assert.rejects(fetchIt(), (err) => err.status === 404 && /HTTP 404/.test(err.message));
  assert.equal(calls, 1);
});

test('the last failure is thrown once the retries are spent', async () => {
  stubAnswers(503);
  await assert.rejects(fetchIt(), /Test API HTTP 503/);
  assert.equal(calls, 1 + POLICY.retries);
});

test('no attempt starts past the budget of the policy', async () => {
  stubAnswers(503, 200);
  await assert.rejects(fetchIt({ ...POLICY, budgetMs: 100 }), /HTTP 503/);
  assert.equal(calls, 1, 'the first retry would have started after the budget');
});

test('RETRY.NONE is a single attempt', async () => {
  stubAnswers(new TypeError('fetch failed'), 200);
  await assert.rejects(fetchIt(RETRY.NONE), /fetch failed/);
  assert.equal(calls, 1);
});

test('the interactive policy stays far inside the widget deadline', async () => {
  // A widget pull is raced against 9 s (src/widgetDeadline.js): its retries
  // must never be what makes it late.
  assert.ok(RETRY.INTERACTIVE.retries <= 1);
  assert.ok(RETRY.INTERACTIVE.budgetMs + RETRY.INTERACTIVE.maxDelayMs < 9000);
});

test('Retry-After is read in seconds and as an HTTP date', () => {
  assert.equal(parseRetryAfter('5'), 5000);
  assert.equal(
    parseRetryAfter('Thu, 08 Oct 2026 12:00:10 GMT', Date.parse('2026-10-08T12:00:00Z')),
    10_000,
  );
  assert.equal(parseRetryAfter('soon'), null);
  assert.equal(parseRetryAfter(null), null);
});
