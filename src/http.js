// -----------------------------------------------------------------------------
// Fetching a public API, with a short second chance.
//
// WHY RETRY AT ALL. Both sources this integration reads (Open-Meteo, the French
// commune registry) are free public services, and their failures are mostly
// brief: a dropped connection, a 502 from a load balancer, a 429 when somebody
// else hammered them. Without a retry, one such hiccup costs a whole refresh
// cycle — half an hour of a dashboard stuck on the previous value — or an "add a
// location" click the user has to repeat.
//
// WHAT IS RETRIED: a network error (including a timeout), a 5xx and a 429. A
// 4xx is an answer — the request is wrong and will stay wrong — and is never
// retried. `Retry-After` is honoured when the server sends it and it fits the
// policy; a server asking for more than that is not retried at all, rather than
// hammered sooner than it asked.
//
// HOW LONG. The delays grow exponentially with a random half (so several
// containers that failed together do not retry together), and a policy has a
// BUDGET: no new attempt starts once it would begin past it. That is what keeps
// the interactive paths short — a widget pull is raced against a 9 s deadline
// (src/widgetDeadline.js) and a scene action waits for its outputs — while the
// background refresh, which nobody is waiting for, can afford to insist.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'http' });

/**
 * @typedef {object} RetryPolicy
 * @property {number} retries how many attempts after the first one
 * @property {number} [baseDelayMs] the delay before the first retry, before jitter
 * @property {number} [maxDelayMs] the longest wait accepted, `Retry-After` included
 * @property {number} [budgetMs] no attempt starts later than this after the first
 */

/** The retry policies, by who is waiting for the answer. */
export const RETRY = {
  /** No second chance: the caller has its own fallback. */
  NONE: { retries: 0 },
  /**
   * Somebody is looking at the screen (a widget pull, a scene action, the test
   * button): one quick retry, and none after a slow failure — the stale-value
   * fallback answers faster than a second timeout would.
   */
  INTERACTIVE: { retries: 1, baseDelayMs: 500, maxDelayMs: 2000, budgetMs: 3000 },
  /** A configuration action (the commune lookup): the core waits 30 s for it. */
  ACTION: { retries: 2, baseDelayMs: 500, maxDelayMs: 3000, budgetMs: 10_000 },
  /** The refresh cycle: nobody waits, and a lost cycle is half an hour. */
  BACKGROUND: { retries: 2, baseDelayMs: 2000, maxDelayMs: 15_000, budgetMs: 45_000 },
};

const defaultSleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

let sleep = defaultSleep;

/**
 * Replace the wait between two attempts (used by the tests, which record the
 * delays instead of living through them).
 * @param {((ms: number) => Promise<void>) | null} fn null restores the real one
 */
export function setRetrySleep(fn) {
  sleep = fn ?? defaultSleep;
}

/** Whether an HTTP status is worth a second attempt. */
export function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * The delay a `Retry-After` header asks for, in milliseconds, or null when it
 * says nothing usable. Both forms of the header are read: a number of seconds,
 * and an HTTP date.
 * @param {string|null|undefined} value
 * @param {number} [now]
 */
export function parseRetryAfter(value, now = Date.now()) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  if (/^\d+$/.test(text)) {
    return Number(text) * 1000;
  }
  const at = Date.parse(text);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

/**
 * The backoff before retry number `attempt` (0 for the first retry): the
 * exponential delay, of which a random half is kept.
 * @param {RetryPolicy} policy
 * @param {number} attempt
 */
function backoffDelay(policy, attempt) {
  const full = Math.min(policy.baseDelayMs * 2 ** attempt, policy.maxDelayMs);
  return Math.round(full / 2 + Math.random() * (full / 2));
}

/** An HTTP answer that is not a success, with its status. */
export class HttpStatusError extends Error {
  constructor(label, status) {
    super(`${label} HTTP ${status}`);
    this.name = 'HttpStatusError';
    this.status = status;
  }
}

/**
 * GET a URL, retrying what is worth retrying, and resolve the successful
 * response. Throws the last failure: an `HttpStatusError` for an HTTP status,
 * the network error otherwise.
 * @param {string} url
 * @param {object} options
 * @param {string} options.label how the source is named in the error message
 * @param {number} options.timeoutMs the timeout of ONE attempt
 * @param {RetryPolicy} [options.retry]
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, { label, timeoutMs, retry = RETRY.NONE }) {
  const startedAt = Date.now();
  for (let attempt = 0; ; attempt += 1) {
    let failure;
    let retryAfterMs = null;
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) {
        return response;
      }
      failure = new HttpStatusError(label, response.status);
      if (!isRetryableStatus(response.status)) {
        throw failure;
      }
      retryAfterMs = parseRetryAfter(response.headers?.get?.('retry-after'));
      // The body of an answer we drop: release the connection now rather than
      // when the garbage collector gets to it.
      await response.body?.cancel?.().catch(() => {});
    } catch (err) {
      if (err instanceof HttpStatusError && !isRetryableStatus(err.status)) {
        throw err;
      }
      failure = err;
    }

    if (attempt >= retry.retries) {
      throw failure;
    }
    if (retryAfterMs !== null && retryAfterMs > retry.maxDelayMs) {
      // Asked to come back later than this caller can wait: going back sooner
      // would only be refused again.
      logger.warn(`${label}: Retry-After ${retryAfterMs} ms is too long, not retrying`);
      throw failure;
    }
    const delay = retryAfterMs ?? backoffDelay(retry, attempt);
    if (Date.now() - startedAt + delay > retry.budgetMs) {
      throw failure;
    }
    logger.warn(
      `${label}: ${failure?.message ?? failure}, retry ${attempt + 1}/${retry.retries} in ${delay} ms`,
    );
    await sleep(delay);
  }
}
