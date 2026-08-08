// -----------------------------------------------------------------------------
// Device type: UV STATION.
//
// One device per configured location. Unlike the template's device blueprints,
// the device list is not known at build time: it is a projection of
// `config.locations`, so every function here works on the locations of the
// configuration it is handed.
//
// Features: the UV index now, its peak for today, what it would be without
// clouds, the WHO exposure level (0-5), its wording, the protection advice that
// goes with it, and the timestamp of the data. The index and the level are BOTH
// published because they answer different questions — "how strong is it" and
// "what do I do about it" — and a scene is far easier to write against a level
// than against a threshold the user has to look up.
//
// The timestamp lives HERE, on each station, and not on a device of its own: it
// is the hour of the forecast the reading was taken from, in the local time of
// the point (see src/uv/measuredAt.js), so two locations in two time zones do
// not share it and a global "last update" device would have to lie about one of
// them.
//
// The identity of a device is `<type>:<location id>`, and the location id is
// generated once when the user adds the location: renaming a location, or
// moving its point, keeps the device, its history and its place in the rooms and
// scenes.
// -----------------------------------------------------------------------------

import {
  createLogger,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { DEFAULT_LANGUAGE, inLanguage } from '../language.js';
import { findProvider, readUvIndex } from '../uv/index.js';
import { formatMeasuredAt } from '../uv/measuredAt.js';
import { UV_INDEX_MAX, UV_LEVEL_ADVICE, UV_LEVEL_LABELS, UV_LEVEL_MAX } from '../uv/scale.js';
import {
  describeLocation,
  LOCATION_LINE_SEPARATOR,
  locationLine,
  positionOf,
  usableLocations,
} from '../locations.js';

export const DEVICE_TYPE = 'uv-station';

const logger = createLogger({ name: DEVICE_TYPE });

// Floor on the refresh interval, whatever the configuration says. Open-Meteo is
// a free public service and the CAMS forecast is hourly: hammering it buys
// nothing.
export const MIN_REFRESH_SECONDS = 300;

/** Feature keys, kept in one place so discovery and polling always agree. */
export const FEATURE = {
  UV_INDEX: 'uv-index',
  UV_INDEX_MAX_TODAY: 'uv-index-max-today',
  UV_INDEX_CLEAR_SKY: 'uv-index-clear-sky',
  EXPOSURE_LEVEL: 'exposure-level',
  EXPOSURE_LEVEL_TEXT: 'exposure-level-text',
  PROTECTION_ADVICE: 'protection-advice',
  MEASURED_AT: 'measured-at',
};

/** Names of the features, in the two languages the device names can be in. */
const FEATURE_NAMES = {
  [FEATURE.UV_INDEX]: { en: 'UV index', fr: 'Indice UV' },
  [FEATURE.UV_INDEX_MAX_TODAY]: { en: 'UV index max today', fr: 'Indice UV max du jour' },
  [FEATURE.UV_INDEX_CLEAR_SKY]: { en: 'UV index (clear sky)', fr: 'Indice UV (ciel clair)' },
  [FEATURE.EXPOSURE_LEVEL]: { en: 'UV exposure level', fr: "Niveau d'exposition UV" },
  [FEATURE.EXPOSURE_LEVEL_TEXT]: {
    en: 'UV exposure level (text)',
    fr: "Niveau d'exposition UV (texte)",
  },
  [FEATURE.PROTECTION_ADVICE]: { en: 'Sun protection advice', fr: 'Conseil de protection solaire' },
  [FEATURE.MEASURED_AT]: { en: 'Data updated at', fr: 'Données mises à jour le' },
};

/** Shape shared by the three numeric UV index features. */
function uvIndexFeature(externalId, name) {
  return {
    name,
    external_id: externalId,
    category: DEVICE_FEATURE_CATEGORIES.UV_SENSOR,
    // The core offers `integer` only for this category — which is also how the
    // WHO scale is reported, so nothing is lost (see src/uv/scale.js).
    type: DEVICE_FEATURE_TYPES.UV_SENSOR.INTEGER,
    unit: DEVICE_FEATURE_UNITS.UV_INDEX,
    // `t_device_feature.min`/`max` are NOT NULL with no default in the core: a
    // feature without them is refused when the user adds the device.
    min: 0,
    max: UV_INDEX_MAX,
    read_only: true, // sensor: no action possible
    has_feedback: false,
    keep_history: true, // keep history to draw the day on a chart
  };
}

/** The 0-5 exposure level: the one to test in a scene. */
function levelFeature(externalId, name) {
  return {
    name,
    external_id: externalId,
    category: DEVICE_FEATURE_CATEGORIES.RISK,
    type: DEVICE_FEATURE_TYPES.RISK.INTEGER,
    min: 0,
    max: UV_LEVEL_MAX,
    read_only: true,
    has_feedback: false,
    keep_history: true,
  };
}

/** Shape shared by every text feature. */
function textFeature(externalId, name) {
  return {
    name,
    external_id: externalId,
    category: DEVICE_FEATURE_CATEGORIES.TEXT,
    type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
    // Meaningless for a label, but the core columns are NOT NULL (see above).
    min: 0,
    max: 0,
    read_only: true,
    has_feedback: false,
    keep_history: false, // a label, not a measure: nothing to chart
  };
}

/** External ids of the device of a location. */
export function deviceExternalIds(gladys, location) {
  return gladys.externalIds(DEVICE_TYPE, location.id);
}

/**
 * The locations a device can be published for: a usable point, covered by a UV
 * provider.
 *
 * CAMS is worldwide so nothing is filtered out today, but the check stays: a
 * stored location must not outlive the provider that serves it, and publishing
 * a device the forecast answers nulls for would leave a sensor stuck on "no
 * recent value" forever.
 * @param {{ locations: import('../locations.js').Location[] }} config
 */
export function watchedLocations(config) {
  return usableLocations(config.locations).filter((location) => Boolean(findProvider(location)));
}

/**
 * Build the discovery payload of one location.
 *
 * The names are written in the configured language and nowhere else: a device
 * name and a feature name are plain strings the core copies into its own tables
 * when the user creates the device, so this is the ONE place where the
 * integration has to pick a language instead of handing Gladys `{ en, fr }`.
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {import('../locations.js').Location} location
 * @param {string} [language] one of LANGUAGES (see src/language.js)
 */
export function buildDevice(gladys, location, language = DEFAULT_LANGUAGE) {
  const ids = deviceExternalIds(gladys, location);
  const featureName = (key) => inLanguage(FEATURE_NAMES[key], language);

  return {
    name: `${language === 'en' ? 'UV index' : 'Indice UV'} — ${location.name}`,
    external_id: ids.device,
    // NO poll_frequency on purpose: the core only accepts a fixed enum of
    // intervals in MILLISECONDS, capped at one minute, and anything else has
    // the WHOLE batch refused — which is what leaves the Discovery tab empty.
    // The UV index changes hourly at most, so the integration drives its own
    // refresh instead; see startPolling below.
    //
    // Keep the resolved place on the device: useful when debugging a wrong
    // commune, and it survives a restart independently of the configuration.
    params: [
      { name: 'LOCATION_ID', value: location.id },
      { name: 'LOCATION_NAME', value: location.name },
      { name: 'POSTAL_CODE', value: location.postal_code ?? '' },
      { name: 'ADDRESS_LABEL', value: location.address_label ?? '' },
      { name: 'LATITUDE', value: String(location.latitude) },
      { name: 'LONGITUDE', value: String(location.longitude) },
    ],
    features: [
      uvIndexFeature(ids.feature(FEATURE.UV_INDEX), featureName(FEATURE.UV_INDEX)),
      uvIndexFeature(
        ids.feature(FEATURE.UV_INDEX_MAX_TODAY),
        featureName(FEATURE.UV_INDEX_MAX_TODAY),
      ),
      uvIndexFeature(
        ids.feature(FEATURE.UV_INDEX_CLEAR_SKY),
        featureName(FEATURE.UV_INDEX_CLEAR_SKY),
      ),
      // NOTE: a `risk`/`integer` value is rendered through the core's OWN label
      // set in the "device in a room" dashboard box, which only names 0 to 3;
      // levels 4 and 5 show as "Inconnu" there. The text feature below carries
      // the exact wording, and the numeric one stays on the 0-5 scale the WHO
      // categories map onto.
      levelFeature(ids.feature(FEATURE.EXPOSURE_LEVEL), featureName(FEATURE.EXPOSURE_LEVEL)),
      textFeature(
        ids.feature(FEATURE.EXPOSURE_LEVEL_TEXT),
        featureName(FEATURE.EXPOSURE_LEVEL_TEXT),
      ),
      textFeature(ids.feature(FEATURE.PROTECTION_ADVICE), featureName(FEATURE.PROTECTION_ADVICE)),
      textFeature(ids.feature(FEATURE.MEASURED_AT), featureName(FEATURE.MEASURED_AT)),
    ],
  };
}

/**
 * Build the `publishStates` batch of one location from a provider reading.
 * Split out of `poll()` so the mapping "reading -> states" is testable without
 * a Gladys connection.
 *
 * A value the model has none for publishes NOTHING at all: an absent
 * measurement is not a UV index of 0, and writing 0 would pollute the history
 * and could fire a "the sun is down" scene in the middle of the afternoon.
 *
 * The two TEXT states are written in the same language as the features that
 * carry them: a stored state is a string like a feature name, translated by
 * nobody downstream.
 * @param {string} [language] one of LANGUAGES (see src/language.js)
 * @returns {Array<{ device_feature_external_id: string, state?: number, text?: string }>}
 */
export function buildStates(ids, reading, language = DEFAULT_LANGUAGE) {
  const states = [];

  const numeric = [
    [FEATURE.UV_INDEX, reading.uvIndex],
    [FEATURE.UV_INDEX_MAX_TODAY, reading.uvIndexMaxToday],
    [FEATURE.UV_INDEX_CLEAR_SKY, reading.uvIndexClearSky],
  ];
  for (const [feature, value] of numeric) {
    if (value !== null && value !== undefined) {
      states.push({ device_feature_external_id: ids.feature(feature), state: value });
    }
  }

  if (reading.level !== null && reading.level !== undefined) {
    states.push(
      {
        device_feature_external_id: ids.feature(FEATURE.EXPOSURE_LEVEL),
        state: reading.level,
      },
      {
        device_feature_external_id: ids.feature(FEATURE.EXPOSURE_LEVEL_TEXT),
        text: inLanguage(UV_LEVEL_LABELS[reading.level], language),
      },
      {
        device_feature_external_id: ids.feature(FEATURE.PROTECTION_ADVICE),
        text: inLanguage(UV_LEVEL_ADVICE[reading.level], language),
      },
    );
  }

  // The stamp of the CURRENT index, and of nothing else: it is the hour the
  // `uvIndex` above was taken from. Publishing it when that index is missing
  // would date a value that was not published — the dashboard would show a
  // fresh timestamp next to a stale number, which is worse than no timestamp.
  const measuredAt =
    reading.uvIndex === null || reading.uvIndex === undefined
      ? null
      : formatMeasuredAt(reading.measuredAt, language);
  if (measuredAt !== null) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE.MEASURED_AT),
      text: measuredAt,
    });
  }

  return states;
}

/**
 * Read one location and publish its states.
 * Throws on an unreadable answer — `refresh` is what never throws.
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {import('../locations.js').Location} location
 * @param {string} [language] language of the published TEXT states
 */
export async function poll(gladys, location, language = DEFAULT_LANGUAGE) {
  const ids = deviceExternalIds(gladys, location);
  logger.info(`Polling UV index for ${location.name}...`);

  // ------------------------------------------------------------------ //
  // DO THE WORK: read the UV index and grade it.
  // ------------------------------------------------------------------ //
  const reading = await readUvIndex(location);

  const states = buildStates(ids, reading, language);
  if (states.length === 0) {
    logger.warn(`No UV data for ${location.name}, nothing published`);
    return reading;
  }

  // The logs stay English whatever the devices are named: they are read in the
  // container output, next to the SDK's own.
  const level = UV_LEVEL_LABELS[reading.level]?.en ?? 'unknown';
  logger.info(
    `${location.name}: UV index ${reading.uvIndex} (${level}), max today ${reading.uvIndexMaxToday}`,
  );

  // One request for every feature of the device (batch, up to 100).
  await gladys.publishStates(states);
  return reading;
}

/** Why a location could not be read, WITHOUT naming it (the line already does). */
function failureDetail(err) {
  const reason = String(err?.message ?? err).slice(0, 120);
  return {
    en: `UV refresh failed: ${reason}`,
    fr: `le rafraîchissement de l'indice UV a échoué : ${reason}`,
  };
}

/** The same reason, named, for the one-line connection status. */
function failureMessage(err, locationName) {
  const detail = failureDetail(err);
  return {
    en: `${locationName}: ${detail.en}`,
    fr: `${locationName} : ${detail.fr}`,
  };
}

const NO_LOCATION_MESSAGE = {
  en: 'No location with usable coordinates yet. Add one with "Add a location".',
  fr: 'Aucun lieu avec des coordonnées utilisables. Ajoutez-en un avec « Ajouter un lieu ».',
};

/**
 * A header plus one line per location, in both languages — EXACTLY the format of
 * the location listing (`• n. name — detail`, built by the same `locationLine`),
 * because both actions answer about the same list under the same numbers.
 */
function report(header, lines) {
  const join = (language) =>
    lines
      .map((line) => locationLine(line.position, line.name, line[language]))
      .join(LOCATION_LINE_SEPARATOR);
  return {
    en: `${header.en}${LOCATION_LINE_SEPARATOR}${join('en')}`,
    fr: `${header.fr}${LOCATION_LINE_SEPARATOR}${join('fr')}`,
  };
}

/**
 * Run `read` on every location, turning a failure into a LINE rather than into a
 * rejection: one location the provider refuses must not hide the answer of the
 * others, and a bare error naming no location helps nobody.
 */
async function readEachLocation(config, locations, read) {
  const lines = await Promise.all(
    locations.map(async (location) => {
      const entry = { position: positionOf(config.locations, location.id), name: location.name };
      try {
        return { ...entry, failed: false, ...(await read(location)) };
      } catch (err) {
        logger.error(`UV query failed for ${location.name}`, err);
        return { ...entry, failed: true, ...failureDetail(err) };
      }
    }),
  );
  return { lines, failed: lines.filter((line) => line.failed).length };
}

export const uvStation = {
  key: DEVICE_TYPE,

  /** The external_id of ONE location's device, watched or not. */
  locationDeviceId(gladys, location) {
    return deviceExternalIds(gladys, location).device;
  },

  /** Every external_id this type publishes, one per watched location. */
  deviceExternalIds(gladys, config) {
    return watchedLocations(config).map((location) => deviceExternalIds(gladys, location).device);
  },

  buildDevices(gladys, config) {
    return watchedLocations(config).map((location) =>
      buildDevice(gladys, location, config.language),
    );
  },

  // Manifest actions owned by this device type (see the `actions` field of
  // `gladys-assistant-integration.json`).
  actions: {
    /**
     * Live check of the data source, on EVERY location: "is it working?" is a
     * question about the install, not about one entry of a list, and nothing in
     * this screen designates a single location anyway.
     */
    async test_provider(gladys, { config }) {
      const locations = watchedLocations(config);
      if (locations.length === 0) {
        return NO_LOCATION_MESSAGE;
      }
      logger.info(`Action test_provider -> live request for ${locations.length} location(s)`);

      const { lines, failed } = await readEachLocation(config, locations, async (location) => {
        const reading = await readUvIndex(location);
        const level = reading.level ?? 0;
        // The data timestamp answers the other half of "is it working?": a
        // provider that responds with yesterday's hour is up and still wrong.
        const stampedIn = (language) => {
          const stamp = formatMeasuredAt(reading.measuredAt, language);
          return stamp === null ? '' : `, ${language === 'en' ? 'updated' : 'màj'} ${stamp}`;
        };
        return {
          en:
            `UV ${reading.uvIndex ?? '—'} (${UV_LEVEL_LABELS[level].en}), ` +
            `max today ${reading.uvIndexMaxToday ?? '—'} — ${reading.provider}${stampedIn('en')}`,
          fr:
            `UV ${reading.uvIndex ?? '—'} (${UV_LEVEL_LABELS[level].fr}), ` +
            `max du jour ${reading.uvIndexMaxToday ?? '—'} — ${reading.provider}${stampedIn('fr')}`,
        };
      });

      // "Provider OK" only when it actually is: the header counts the locations
      // that failed, and each of their lines says why.
      const header =
        failed === 0
          ? {
              en: `UV provider OK — ${locations.length} location(s):`,
              fr: `Fournisseur UV OK — ${locations.length} lieu(x) :`,
            }
          : {
              en: `UV provider — ${failed} of ${locations.length} location(s) failing:`,
              fr: `Fournisseur UV — ${failed} lieu(x) en échec sur ${locations.length} :`,
            };
      return report(header, lines);
    },
  },

  /**
   * Refresh ONE device, on a poll request Gladys sends for it. The devices
   * declare no poll_frequency, so this normally never fires; it stays because a
   * device created by an older version may still carry one.
   * @param {string} externalId external_id of the device to refresh
   */
  async onPoll(gladys, config, externalId) {
    const location = watchedLocations(config).find(
      (candidate) => deviceExternalIds(gladys, candidate).device === externalId,
    );
    if (!location) {
      throw new Error(`No location watches the device ${externalId}`);
    }
    await poll(gladys, location, config.language);
  },

  /**
   * Drive the refresh ourselves.
   *
   * Gladys' own polling is not usable here: `poll_frequency` is a fixed enum of
   * intervals in milliseconds whose slowest value is one minute, while the CAMS
   * forecast is hourly. So the devices declare no poll_frequency and we run our
   * own timer at the configured interval.
   * @returns {() => void} cleanup, to stop the timer on disconnection
   */
  startPolling(gladys, config) {
    const intervalMs = Math.max(MIN_REFRESH_SECONDS, config.poll_frequency) * 1000;
    const count = watchedLocations(config).length;
    logger.info(`Refreshing ${count} location(s) every ${Math.round(intervalMs / 1000)} s`);

    // Refresh straight away: waiting half an hour for the first value would
    // leave a freshly added device empty on the dashboard.
    uvStation.refresh(gladys, config);
    const timer = setInterval(() => uvStation.refresh(gladys, config), intervalMs);
    return () => clearInterval(timer);
  },

  /**
   * One refresh cycle over every location, which NEVER throws: a rejection
   * inside a timer callback would become an unhandled rejection and take the
   * container down. Outages are reported through `setConnectionStatus` instead,
   * and the next cycle simply tries again.
   */
  async refresh(gladys, config) {
    const locations = watchedLocations(config);
    const outcomes = await Promise.all(
      locations.map(async (location) => {
        try {
          await poll(gladys, location, config.language);
          return null;
        } catch (err) {
          logger.error(`UV refresh failed for ${describeLocation(location)}`, err);
          return failureMessage(err, location.name);
        }
      }),
    );

    const failures = outcomes.filter(Boolean);
    if (failures.length === 0) {
      await gladys.setConnectionStatus(true).catch(() => {});
      return;
    }
    // Only the first reason is spelled out: the status line is one line, and two
    // stack traces in it help nobody.
    const [first] = failures;
    const others =
      failures.length > 1
        ? {
            en: ` (+${failures.length - 1} other location(s) failing)`,
            fr: ` (+${failures.length - 1} autre(s) lieu(x) en échec)`,
          }
        : { en: '', fr: '' };
    await gladys
      .setConnectionStatus(false, { en: `${first.en}${others.en}`, fr: `${first.fr}${others.fr}` })
      .catch(() => {});
  },
};
