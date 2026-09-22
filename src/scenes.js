// -----------------------------------------------------------------------------
// Scene triggers and scene actions (Gladys 5.1+).
//
// The manifest `scene_triggers` / `scene_actions` fields add cards to the scene
// editor; the core matches the events against the filters the user set and
// relays the actions. The integration never learns which scenes exist.
//
// TRIGGER — `exposure_level_changed`: the exposure level (0-5) of a location
// moved to another band between two readings. An EVENT, one per transition,
// never a state: the level itself is already a device feature, and a scene that
// needs "level >= 3" belongs on that feature's `device.new-state` trigger. What
// this one adds is the transition with its words attached — the location name,
// the new level's label and its advice, ready for a message — and filters a
// feature trigger cannot express ("rising only", "into 3 or 4").
//
// The first reading of a location after a start establishes the baseline and
// fires nothing: a restart is not a change in the sky. A reading without a level
// is a hole in the data, not a transition, and leaves the baseline alone.
//
// ACTION — `read_uv_index`: read a location now and hand its values to the next
// actions of the scene (`{{<column>.<row>.<key>}}`) — "every morning at 8, send
// me today's peak" is a time trigger, this action and a message. It reads, it
// never publishes: an action must not fire an event (a scene bound to that event
// would loop through the integration), so it bypasses the level memory.
//
// LANGUAGE. The texts an event or an action carries are stored and re-used by
// the scene as they are, like a device name: they follow `config.language`.
//
// KEYS ARE FOREVER. A published trigger, action, variable or output key is
// stored in the user's scenes: renaming one is removing it.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { inLanguage } from './language.js';
import { formatHour, formatMeasuredAt } from './uv/measuredAt.js';
import { UV_LEVEL_ADVICE, UV_LEVEL_LABELS } from './uv/scale.js';

const logger = createLogger({ name: 'scenes' });

/** Scene trigger keys, as declared in the manifest `scene_triggers`. */
export const SCENE_TRIGGER = {
  LEVEL_CHANGED: 'exposure_level_changed',
};

/** Scene action keys, as declared in the manifest `scene_actions`. */
export const SCENE_ACTION = {
  READ_UV_INDEX: 'read_uv_index',
};

/** Values of the `direction` filter of the trigger. */
export const DIRECTION = {
  RISING: 'rising',
  FALLING: 'falling',
};

// The last level seen per location id. Module-level on purpose, like the
// provider cache: it outlives a configuration change (a new interval must not
// reset the baseline), and ids are never reused, so a removed location's entry
// is dead weight, never a wrong answer.
const lastLevels = new Map();

/** Forget every baseline (used by the tests). */
export function clearLevelMemory() {
  lastLevels.clear();
}

/**
 * Record a location's level and say whether it crossed into another band.
 * @param {string} locationId
 * @param {number|null} level the new reading's level
 * @returns {{ previous: number, level: number }|null} the transition, if any
 */
export function observeLevel(locationId, level) {
  if (level === null || level === undefined) {
    return null;
  }
  const previous = lastLevels.get(locationId);
  lastLevels.set(locationId, level);
  if (previous === undefined || previous === level) {
    return null;
  }
  return { previous, level };
}

/** Drop the keys whose value is missing: a missing value is absent, never 0. */
function withoutMissing(values) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== null && value !== undefined),
  );
}

/**
 * The data of an `exposure_level_changed` event. Flat, primitives only: the
 * core builds the filters from the `fields` keys and the scene variables from
 * the `variables` keys, and drops the rest.
 * @param {object} args
 * @param {string} args.deviceId the device external_id — what the `location` filter holds
 * @param {import('./locations.js').Location} args.location
 * @param {object} args.reading
 * @param {{ previous: number, level: number }} args.transition
 * @param {string} args.language
 */
export function buildLevelChangedEvent({ deviceId, location, reading, transition, language }) {
  return withoutMissing({
    location: deviceId,
    location_name: location.name,
    direction: transition.level > transition.previous ? DIRECTION.RISING : DIRECTION.FALLING,
    level: transition.level,
    previous_level: transition.previous,
    level_label: inLanguage(UV_LEVEL_LABELS[transition.level], language),
    previous_level_label: inLanguage(UV_LEVEL_LABELS[transition.previous], language),
    advice: inLanguage(UV_LEVEL_ADVICE[transition.level], language),
    uv_index: reading.uvIndex,
    measured_at: formatMeasuredAt(reading.measuredAt, language),
  });
}

/**
 * Fire `exposure_level_changed` when a fresh reading crossed a band. Never
 * throws: it runs inside a refresh cycle, and an event Gladys refuses (an older
 * core, the rate limit) must not cost the location its states.
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 */
export async function announceLevelChange(gladys, { deviceId, location, reading, language }) {
  const transition = observeLevel(location.id, reading.level);
  if (!transition) {
    return null;
  }
  const data = buildLevelChangedEvent({ deviceId, location, reading, transition, language });
  try {
    await gladys.publishSceneEvent(SCENE_TRIGGER.LEVEL_CHANGED, data);
    logger.info(
      `${location.name}: exposure level ${transition.previous} -> ${transition.level}, scene event sent`,
    );
  } catch (err) {
    logger.warn(`Scene event refused for ${location.name}`, err);
  }
  return data;
}

/**
 * The outputs of `read_uv_index` for one reading — exactly the keys the
 * manifest declares in `outputs`, minus the ones the provider has no value for.
 * @param {import('./locations.js').Location} location
 * @param {object} reading
 * @param {string} language
 */
export function buildReadingOutputs(location, reading, language) {
  const label = (level) => (level === null ? null : inLanguage(UV_LEVEL_LABELS[level], language));
  return withoutMissing({
    location_name: location.name,
    uv_index: reading.uvIndex,
    uv_index_max_today: reading.uvIndexMaxToday,
    uv_index_clear_sky: reading.uvIndexClearSky,
    level: reading.level,
    level_label: label(reading.level),
    level_max_today: reading.levelMaxToday,
    level_max_today_label: label(reading.levelMaxToday),
    advice: reading.level === null ? null : inLanguage(UV_LEVEL_ADVICE[reading.level], language),
    peak_time: formatHour(reading.peakTime),
    measured_at: formatMeasuredAt(reading.measuredAt, language),
  });
}

/**
 * The scene action handlers, keyed by action key — the shape `onSceneAction` is
 * registered with. Injected like the widgets, for the same offline tests.
 * @param {object} deps
 * @param {() => { language: string }} deps.getConfig
 * @param {(config: object, deviceExternalId: string) => object|undefined} deps.locationOfDevice
 * @param {(location: object) => Promise<object>} deps.readUvIndex
 */
export function createSceneActions({ getConfig, locationOfDevice, readUvIndex }) {
  return {
    async [SCENE_ACTION.READ_UV_INDEX](fields = {}) {
      const config = getConfig();
      const location = locationOfDevice(config, fields.location);
      if (!location) {
        // Thrown, because it is the only error path a scene action has: the core
        // logs it and the scene carries on without the outputs.
        throw new Error(
          `No location watches the device ${fields.location} any more: pick another one in the scene`,
        );
      }
      logger.info(`Scene action read_uv_index -> ${location.name}`);
      return buildReadingOutputs(location, await readUvIndex(location), config.language);
    },
  };
}
