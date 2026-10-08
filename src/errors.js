// -----------------------------------------------------------------------------
// An error, as the user reads it.
//
// Every message this integration shows about a failure — the Supervision status
// line, an action result, a line of the provider test — ends with the reason,
// and every one of them is a single line of a narrow screen. So the reason is
// cut, and it is cut HERE, once, rather than with a `.slice()` repeated next to
// every message.
//
// Node's `fetch` says "fetch failed" for every network error and hides the one
// word that matters (ECONNREFUSED, ENOTFOUND, ETIMEDOUT…) in `err.cause`: it is
// brought back into the reason, the way the SDK's own logs do it.
// -----------------------------------------------------------------------------

/** How long a reason may be in a one-line message. */
export const MAX_REASON_LENGTH = 150;

/**
 * The reason of an error, on one line, at most `maxLength` characters.
 * @param {unknown} err anything a `catch` can receive
 * @param {number} [maxLength]
 * @returns {string}
 */
export function errorReason(err, maxLength = MAX_REASON_LENGTH) {
  if (err === null || err === undefined) {
    return 'unknown error';
  }
  const message = String(err?.message ?? err);
  const code = err?.cause?.code ?? err?.code;
  const reason =
    typeof code === 'string' && code !== '' && !message.includes(code)
      ? `${message} (${code})`
      : message;
  return reason.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}
