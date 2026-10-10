// -----------------------------------------------------------------------------
// How long one connection attempt may take, per address.
//
// WHY. A host with both an IPv4 and an IPv6 address is reached with "Happy
// Eyeballs": Node tries one address, and moves to the next when the attempt
// has not connected after a delay — 250 ms by default. On a network with no
// IPv6 route, the IPv6 attempt fails and only the IPv4 one is left; from far
// away (Australia: ~315 ms to Open-Meteo), it is cut before it can connect, and
// EVERY request ends in `fetch failed (ETIMEDOUT)` (issue #18).
//
// The default is process-wide: `fetch()` (Open-Meteo, the commune registry) and
// the SDK connections all go through it. It is only ever RAISED here, so a
// larger value given on the command line
// (`--network-family-autoselection-attempt-timeout`) is kept.
// -----------------------------------------------------------------------------

import net from 'node:net';

/** Long enough for a distant server, short enough for a dead IPv6 route. */
export const CONNECT_ATTEMPT_TIMEOUT_MS = 1000;

/** Raises Node's per-address connection delay to {@link CONNECT_ATTEMPT_TIMEOUT_MS}. */
export function widenConnectAttempts() {
  if (net.getDefaultAutoSelectFamilyAttemptTimeout() < CONNECT_ATTEMPT_TIMEOUT_MS) {
    net.setDefaultAutoSelectFamilyAttemptTimeout(CONNECT_ATTEMPT_TIMEOUT_MS);
  }
}
