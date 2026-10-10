// -----------------------------------------------------------------------------
// Entry point of the UV index integration.
//
// Role of this file: wire the SDK to the device registry (src/devices/) and to
// the location manager (src/locationEditor.js). It holds NO UV logic — the
// Open-Meteo calls live in src/uv/, the device definition in
// src/devices/uvStation.js, the configured locations in src/locations.js. This
// file only:
//   1. instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. registers the event handlers BEFORE connect();
//   3. routes the lifecycle events to the runtime (src/runtime.js), which owns
//      the configuration, publishes one discovered device per configured
//      location and drives the refresh timers;
//   4. gives the location manager the two things it cannot do itself: write the
//      configuration, and re-publish the devices when the list changes;
//   5. serves the dashboard widgets (src/widgets.js) and the scene actions
//      (src/scenes.js) declared in the manifest — Gladys 5.1+. The scene
//      TRIGGER is fired from the refresh cycle itself (src/devices/uvStation.js).
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import {
  DEVICE_BLUEPRINTS,
  findBlueprintByDevice,
  locationDeviceIds,
} from './src/devices/index.js';
import { locationOfDevice, watchedLocations } from './src/devices/uvStation.js';
import { fetchHouses } from './src/houses.js';
import { RETRY } from './src/http.js';
import { createLocationEditor } from './src/locationEditor.js';
import { widenConnectAttempts } from './src/network.js';
import { createRuntime } from './src/runtime.js';
import { createSceneActions } from './src/scenes.js';
import { readUvIndex } from './src/uv/index.js';
import { createWidgets } from './src/widgets.js';
import { withPullDeadline } from './src/widgetDeadline.js';

// Before any connection: Node's 250 ms per address is too short for a distant
// server on a network without IPv6 (src/network.js, issue #18).
widenConnectAttempts();

const gladys = new GladysIntegration();

// The configuration, the published devices and the refresh timers
// (src/runtime.js): everything below only routes the SDK events to it.
const runtime = createRuntime(gladys);

// The location manager owns everything the user does with the configured
// locations: the actions that add, import, list and delete them. It is given the
// capabilities it cannot have on its own — writing the configuration,
// re-publishing the devices — and nothing else, which is what makes it testable
// offline.
const locationEditor = createLocationEditor({
  getConfig: runtime.getConfig,
  // The only place a self-initiated write updates the in-memory configuration.
  setConfig: runtime.setConfig,
  onLocationsChanged: runtime.republish,
  listHouses: () => fetchHouses(gladys),
  // "Has the user already created this location's device?" — the one case the
  // delete action cannot clean up on its own, and must therefore name.
  async findCreatedDevice(location) {
    const ours = new Set(locationDeviceIds(gladys, location));
    const devices = await gladys.getDevices();
    return (devices ?? []).find((device) => ours.has(device?.external_id)) ?? null;
  },
});

// --- Discovery: Gladys asks for the list of devices --------------------------
gladys.onScanRequest(async () => {
  logger.info(`onScanRequest -> publishing ${runtime.getConfig().locations.length} location(s)`);
  await runtime.publishDevices();
});

// --- The user just added a device from the Discovery screen ------------------
// Until that moment the core SILENTLY DROPS every state we publish: the feature
// does not exist yet. Without this handler the brand new device would sit on
// "no recent value" until the next tick — which is exactly what it looks like
// when it is broken.
gladys.onDeviceCreated(async (device) => {
  logger.info(`onDeviceCreated -> ${device.external_id}, refreshing right away`);
  await runtime.refreshNow();
});

// --- Polling: Gladys asks to refresh one device ------------------------------
gladys.onPoll(async (device) => {
  const config = runtime.getConfig();
  const blueprint = findBlueprintByDevice(gladys, config, device);
  if (!blueprint || typeof blueprint.onPoll !== 'function') {
    // The device exists in Gladys but no location watches it: the user removed
    // the location without deleting the device. It can safely be deleted there.
    logger.warn(
      `onPoll ignored: ${device.external_id} is not a device this integration publishes. ` +
        'Its location no longer exists, you can delete it in Gladys.',
    );
    return;
  }
  await blueprint.onPoll(gladys, config, device.external_id);
});

// --- Manifest actions: buttons in the Configuration screen -------------------
// Each action declared in the `actions` field of the manifest is registered per
// key; the message resolved by the handler is displayed under the button.
for (const blueprint of DEVICE_BLUEPRINTS) {
  for (const [actionKey, handler] of Object.entries(blueprint.actions ?? {})) {
    gladys.onAction(actionKey, (fields) =>
      handler(gladys, { fields, config: runtime.getConfig() }),
    );
  }
}
for (const [actionKey, handler] of Object.entries(locationEditor.actions)) {
  gladys.onAction(actionKey, (fields) => handler(fields));
}

// The read the dashboard and the scenes make: somebody is waiting, so one quick
// retry at most, and the last known value (up to 3 h old, its hour shown) rather
// than an error when the source is down — see src/uv/index.js.
const readForDisplay = (location) =>
  readUvIndex(location, { retry: RETRY.INTERACTIVE, allowStale: true });

// --- Dashboard widgets (manifest `widgets`) -----------------------------------
// The core pulls a widget's content when a dashboard shows it, and again on its
// TTL or when the refresh cycle nudges it. A setting of `source: "devices"`
// arrives as the device's external_id, which `locationOfDevice` maps back to its
// location.
const widgets = createWidgets({
  getConfig: runtime.getConfig,
  watchedLocations,
  locationOfDevice: (current, externalId) => locationOfDevice(gladys, current, externalId),
  readUvIndex: readForDisplay,
});
for (const [widgetKey, handler] of Object.entries(widgets)) {
  // Raced against a deadline: a cold Open-Meteo read must give a loading card,
  // never miss the core's 15 s and leave the card dead (src/widgetDeadline.js).
  gladys.onWidgetGet(widgetKey, (request) => withPullDeadline(() => handler(request)));
}

// --- Scene actions (manifest `scene_actions`) --------------------------------
// A scene reached one of our cards: `fields` arrive resolved and validated by
// the core, and the resolved object becomes the action's outputs.
const sceneActions = createSceneActions({
  getConfig: runtime.getConfig,
  locationOfDevice: (current, externalId) => locationOfDevice(gladys, current, externalId),
  readUvIndex: readForDisplay,
});
for (const [actionKey, handler] of Object.entries(sceneActions)) {
  gladys.onSceneAction(actionKey, (fields) => handler(fields));
}

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  // The new interval and language reach the timers even when the publication
  // fails (src/runtime.js).
  await runtime.applyConfig(newConfig);
});

// --- Connection lifecycle ----------------------------------------------------
// The SDK logs the WebSocket lifecycle itself (under the `gladys-sdk` name), and
// emits 'connected' after every (re)connection, once it has re-read the devices
// and the configuration.
gladys.on('connected', () => runtime.onConnected());

// --- Graceful shutdown -------------------------------------------------------
gladys.on('disconnected', () => {
  // No point hammering Open-Meteo while we cannot publish anything.
  runtime.stopPolling();
});

gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  runtime.stopPolling();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the UV index integration...');
gladys.connect().catch((err) => {
  // connect() rejects when Gladys refuses the token on the FIRST attempt (close
  // code 4000), but the SDK keeps its reconnection loop armed for life after
  // it: the refusal can be transient (Gladys still booting), and the next
  // attempt can succeed. Exiting here would throw that loop away, so the
  // failure is logged and the process stays up.
  logger.error('Initial connection to Gladys failed, the SDK keeps retrying', err);
});
