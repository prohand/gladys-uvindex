// -----------------------------------------------------------------------------
// The running state of the integration: its configuration, what it publishes
// and its refresh timers.
//
// `index.js` wires the SDK events to this object and holds nothing else; the
// lifecycle lives here so it can be tested with the fake SDK. Three rules it
// owns:
//
//   - A NEW CONFIGURATION ALWAYS REACHES THE TIMERS. Publishing the devices and
//     restarting the refresh are two steps, and the first one failing (Gladys
//     refusing the batch) must not leave the old timers running with the old
//     interval and the old language: the stations already created keep
//     updating, and the refusal is reported (and held, see src/status.js).
//   - THE CONFIGURATION READ AT CONNECTION IS THE SDK'S. The SDK fetches it
//     (GET /config) right before it emits 'connected', on every connection, and
//     keeps it as `gladys.config`: asking for it again would be a second request
//     for the same answer.
//   - THE STATUS MEMORY IS FORGOTTEN AT CONNECTION, so the first status after a
//     (re)connection always reaches Gladys, which may have restarted.
// -----------------------------------------------------------------------------

import { logger } from '@gladysassistant/integration-sdk';
import { isConfigured, normalizeConfig } from './config.js';
import { buildDiscoveredDevices, DEVICE_BLUEPRINTS } from './devices/index.js';
import { errorReason } from './errors.js';
import { retainLevelMemory } from './scenes.js';
import { forgetStatus, holdStatus, releaseStatus, reportStatus } from './status.js';

// Shown in the Supervision screen while no location has been added yet.
export const NOT_CONFIGURED_MESSAGE = {
  en: 'Add a location to start following the UV index.',
  fr: "Ajoutez un lieu pour suivre l'indice UV.",
};

/**
 * Build the runtime of one SDK instance.
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {{ blueprints?: Array<object> }} [options] the device blueprints
 *   (injected in tests)
 */
export function createRuntime(gladys, { blueprints = DEVICE_BLUEPRINTS } = {}) {
  // Current configuration (hot-reloaded via onConfigUpdated, and updated in
  // place by the location actions since a self-initiated setConfig does not come
  // back through the event).
  let config = normalizeConfig();

  // Cleanup functions of the refresh timers. The devices declare no
  // `poll_frequency` — the core caps its own polling at one minute, far too fast
  // for an hourly forecast — so the integration drives its own refresh.
  let pollingCleanups = [];

  /**
   * Publish the discovered devices — unless we do not know WHERE to look yet.
   * @returns {Promise<boolean>} whether there was anything to publish
   */
  async function publishDevices() {
    const configured = isConfigured(config);
    if (!configured) {
      logger.warn('No location configured yet: nothing to discover');
      await reportStatus(gladys, false, NOT_CONFIGURED_MESSAGE);
    }
    // An EMPTY list is still published, and that matters: publishDiscoveredDevices
    // REPLACES the previous one, so this is the only way the device of a deleted
    // location leaves the Discovery screen.
    const devices = configured ? buildDiscoveredDevices(gladys, config, blueprints) : [];
    // Logged in full at debug level: when Gladys refuses the batch, the rejected
    // payload is the only thing that tells you WHICH feature it choked on.
    logger.debug('publishDiscoveredDevices ->', JSON.stringify(devices));

    try {
      const response = await gladys.publishDiscoveredDevices(devices);
      logger.info(
        `Published ${response?.count ?? devices.length} device(s) to the Discovery screen`,
      );
      releaseStatus(gladys);
      return configured;
    } catch (err) {
      // Gladys refused the batch — an unsupported feature category, an invalid
      // poll frequency, a feature without min/max... Without this, the Discovery
      // tab just stays empty with nothing anywhere to say why: the error would
      // only reach the SDK acknowledgement, which the user never sees.
      logger.error('Gladys refused the discovered devices', err);
      const reason = errorReason(err);
      const message = {
        en: `Gladys refused the device: ${reason}`,
        fr: `Gladys a refusé l'appareil : ${reason}`,
      };
      holdStatus(gladys, message);
      await reportStatus(gladys, false, message);
      throw err;
    }
  }

  function stopPolling() {
    for (const cleanup of pollingCleanups) {
      try {
        cleanup?.();
      } catch (err) {
        logger.error('Refresh timer cleanup failed', err);
      }
    }
    pollingCleanups = [];
  }

  /** (Re)start the refresh timers of every blueprint that has one. */
  function startPolling() {
    stopPolling();
    pollingCleanups = blueprints
      .filter((blueprint) => typeof blueprint.startPolling === 'function')
      .map((blueprint) => blueprint.startPolling(gladys, config));
  }

  /**
   * Point the timers at the current configuration: started on its list, its
   * interval and its language when there is something to watch, stopped
   * otherwise. The scene baselines of the locations that left the list go too.
   */
  function syncPolling() {
    retainLevelMemory(config.locations.map((location) => location.id));
    if (isConfigured(config)) {
      startPolling();
    } else {
      stopPolling();
    }
  }

  /**
   * Re-publish the devices and restart the refresh on the current
   * configuration. The timers follow it EVEN WHEN the publication fails; the
   * failure is rethrown afterwards for the caller to report.
   * @returns {Promise<boolean>} whether there was anything to publish
   */
  async function republish() {
    try {
      return await publishDevices();
    } finally {
      syncPolling();
    }
  }

  return {
    getConfig: () => config,

    /**
     * Persist a partial configuration, and keep the in-memory copy in step:
     * the core does NOT echo an integration's own write back as a
     * config-updated (it would loop), so nothing else will.
     */
    async setConfig(patch) {
      await gladys.setConfig(patch);
      config = normalizeConfig({ ...config, ...patch });
    },

    publishDevices,
    republish,
    startPolling,
    stopPolling,

    /** Run one refresh cycle right now. Never throws (see blueprint.refresh). */
    async refreshNow() {
      await Promise.all(
        blueprints
          .filter((blueprint) => typeof blueprint.refresh === 'function')
          .map((blueprint) => blueprint.refresh(gladys, config)),
      );
    },

    /**
     * The user saved the Configuration screen. Nothing in it touches a
     * location — it holds the refresh interval and the language — and both
     * reach the timers whatever the publication says. Never throws: the SDK
     * would only log the failure at debug level.
     * @param {Record<string, unknown>} raw the configuration Gladys sent
     */
    async applyConfig(raw) {
      config = normalizeConfig(raw);
      try {
        await republish();
      } catch (err) {
        // Already reported by publishDevices; the timers follow the new
        // configuration all the same.
        logger.error('The new configuration is applied, but publishing the devices failed', err);
      }
    },

    /**
     * Post-connection initialization, on the first connection and every
     * reconnection. Never throws.
     */
    async onConnected() {
      forgetStatus(gladys);
      try {
        // 1) The configuration the SDK has just read (see the header).
        config = normalizeConfig(gladys.config);

        // 2) (Re)publish the devices, and start our own refresh loop (the
        // devices declare no poll_frequency).
        if (!(await republish())) {
          return;
        }

        // 3) Report the application-level status, shown in the Supervision
        // screen. Distinct from the container state machine: an integration can
        // be RUNNING and still unable to reach its third-party service.
        await reportStatus(gladys, true);
      } catch (err) {
        logger.error('Post-connection initialization failed', err);
        // Carry the real reason into the Supervision screen. A rejected device
        // batch is otherwise invisible: the user just sees an empty Discovery
        // tab with no clue that Gladys refused the payload.
        const reason = errorReason(err);
        await reportStatus(gladys, false, {
          en: `Initialization failed: ${reason}`,
          fr: `L'initialisation a échoué : ${reason}`,
        });
      }
    },
  };
}
