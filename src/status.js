// -----------------------------------------------------------------------------
// The status line of the Supervision screen.
//
// SENT ON CHANGE ONLY. The refresh cycle ends with a verdict every half hour —
// "connected", or the first failing location — and it is the same verdict
// almost every time. Each one is a host API request, so it is sent when it
// DIFFERS from the last one sent, and only then. The memory is per SDK
// instance and is forgotten on every (re)connection: Gladys may have restarted
// meanwhile and know nothing, so the first verdict after a connect always goes
// out.
//
// A HELD STATUS. A device batch Gladys refused is the one failure a good refresh
// does not cure: the stations already created keep updating, so the cycle says
// "connected", and the Discovery tab stays empty with nothing to say why. While
// such a problem is held, a "connected" verdict is replaced by it; it is
// released by the next publication Gladys accepts.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'status' });

/** SDK instance -> the key of the last status sent. */
const lastSent = new WeakMap();

/** SDK instance -> the `{ en, fr }` problem a "connected" verdict must not hide. */
const held = new WeakMap();

/**
 * Report the integration's status, unless it is the one already shown. Never
 * throws: it runs at the end of a refresh cycle.
 * @param {{ setConnectionStatus: (connected: boolean, message?: object) => Promise<unknown> }} gladys
 * @param {boolean} connected
 * @param {{ en: string, fr: string }} [message]
 * @returns {Promise<boolean>} whether it was sent
 */
export async function reportStatus(gladys, connected, message) {
  if (connected && held.has(gladys)) {
    return reportStatus(gladys, false, held.get(gladys));
  }
  const key = JSON.stringify([Boolean(connected), message ?? null]);
  if (lastSent.get(gladys) === key) {
    return false;
  }
  // Remembered BEFORE the request, so two verdicts racing do not both go out;
  // forgotten again if it fails, so the next one is sent whatever it says.
  lastSent.set(gladys, key);
  try {
    await gladys.setConnectionStatus(connected, message);
    return true;
  } catch (err) {
    if (lastSent.get(gladys) === key) {
      lastSent.delete(gladys);
    }
    logger.warn('Could not report the integration status', err);
    return false;
  }
}

/** Forget what was sent: the next status goes out whatever it says. */
export function forgetStatus(gladys) {
  lastSent.delete(gladys);
}

/** Hold a problem a "connected" verdict must not replace (see the header). */
export function holdStatus(gladys, message) {
  held.set(gladys, message);
}

/** Release the held problem, if any. */
export function releaseStatus(gladys) {
  held.delete(gladys);
}
