// -----------------------------------------------------------------------------
// Dashboard widgets (Gladys 5.1+).
//
// WHAT THEY ARE. The manifest `widgets` field declares a widget's identity —
// key, label, icon, settings — and this module produces its CONTENT on demand,
// in the declarative vocabulary the core renders (no HTML, no CSS: the core owns
// the look, dark mode and translations). Two of them:
//   - `uv_location`: one location in full — the index now, today's peak and the
//     clear-sky index as tiles, today's hourly forecast as a curve with the peak
//     marked and a "now" line, the exposure level and the advice that goes with
//     it. The location is picked by its DEVICE (`source: "devices"`), which is
//     the one identifier that survives a rename, a move and the deletion of
//     another location — a position in the list would silently shift.
//   - `uv_overview`: every location on one card, one row each, coloured by its
//     exposure level. No settings.
//
// WHY THE VALUES ARE INLINE, not bound to the device features. A tile bound to a
// feature follows the published states live, but the level and the advice of
// the same card come from this content: two sources, two freshnesses, and for a
// few minutes a "3" next to "low" — the very disagreement `src/uv/scale.js`
// rounds first to prevent. One reading per content keeps every number of a card
// consistent by construction, and `nudgeWidgets` re-pulls the cards after each
// refresh cycle so they never lag the devices by more than that.
//
// LANGUAGE. Unlike a device name, a widget is rendered per reader: every text
// goes out as `{ en, fr }` and the core picks the reader's language (English
// for the others). `config.language` plays no part here.
//
// Missing data stays missing: a tile without a value shows "—", never 0, and a
// card whose reading failed says so instead of vanishing.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { formatHour, formatMeasuredAt, toIsoInstant } from './uv/measuredAt.js';
import { UV_LEVEL_ADVICE, UV_LEVEL_LABELS } from './uv/scale.js';

const logger = createLogger({ name: 'widgets' });

/** Widget keys, as declared in the manifest. A published key is never renamed. */
export const WIDGET = {
  LOCATION: 'uv_location',
  OVERVIEW: 'uv_overview',
};

/**
 * How long the core may serve a content before pulling it again. The forecast is
 * hourly and every refresh cycle nudges the cards anyway (`nudgeWidgets`): this
 * is the safety net, short enough that the "now" line of the chart keeps up.
 */
export const WIDGET_TTL_SECONDS = 900;

/** The status list of a card holds ten rows at most: the core drops the rest. */
export const MAX_OVERVIEW_ROWS = 10;

/**
 * The semantic colour of each exposure level. The core maps these onto its own
 * theme, so the WHO's green-to-violet becomes the closest thing it has: nothing
 * is urgent below "high", and "very high" is where the advice becomes "stay in".
 */
export const UV_LEVEL_COLORS = {
  0: WIDGET_COLORS.NEUTRAL,
  1: WIDGET_COLORS.SUCCESS,
  2: WIDGET_COLORS.INFO,
  3: WIDGET_COLORS.WARNING,
  4: WIDGET_COLORS.DANGER,
  5: WIDGET_COLORS.DANGER,
};

/** What a tile shows when the provider has no value: a dash, never a zero. */
const MISSING = '—';

/** The colour of a level, neutral when there is none. */
function levelColor(level) {
  return UV_LEVEL_COLORS[level] ?? WIDGET_COLORS.NEUTRAL;
}

/** `{ en, fr }` of a level's wording, a dash when there is no level. */
function levelLabel(level) {
  return UV_LEVEL_LABELS[level] ?? { en: MISSING, fr: MISSING };
}

/** `{ en, fr }` of the data timestamp, or null when it is unreadable. */
function stampOf(reading) {
  const en = formatMeasuredAt(reading.measuredAt, 'en');
  const fr = formatMeasuredAt(reading.measuredAt, 'fr');
  return en === null || fr === null ? null : { en, fr };
}

/** A one-line body text, for a card that has nothing else to say. */
function bodyText(en, fr) {
  return { type: 'text', variant: 'body', text: { en, fr } };
}

/**
 * Today's hourly forecast as a chart, the peak marked with a dot.
 *
 * Null when the curve cannot be placed on a time axis — no points, or no offset
 * to turn the provider's LOCAL hours into instants: a curve drawn in the wrong
 * zone would put the peak at the wrong hour, which is worse than no curve.
 */
function forecastChart(reading) {
  const points = (reading.forecast ?? [])
    .map((point) => ({ t: toIsoInstant(point.time, reading.utcOffsetSeconds), v: point.uvIndex }))
    .filter((point) => point.t !== null);
  if (points.length === 0) {
    return null;
  }

  const chart = {
    type: 'chart',
    chart_type: 'area',
    title: { en: "Today's forecast", fr: 'Prévision du jour' },
    series: [{ name: { en: 'UV index', fr: 'Indice UV' }, points }],
    now_marker: true,
  };
  const peakAt = toIsoInstant(reading.peakTime, reading.utcOffsetSeconds);
  if (peakAt !== null && reading.uvIndexMaxToday !== null) {
    chart.annotations = [
      {
        t: peakAt,
        value: reading.uvIndexMaxToday,
        label: { en: `Peak ${reading.uvIndexMaxToday}`, fr: `Pic ${reading.uvIndexMaxToday}` },
        color: levelColor(reading.levelMaxToday),
      },
    ];
  }
  return chart;
}

/**
 * The content of the `uv_location` widget for one reading.
 * @param {import('./locations.js').Location} location
 * @param {Awaited<ReturnType<typeof import('./uv/index.js').readUvIndex>>} reading
 */
export function buildLocationContent(location, reading) {
  const stamp = stampOf(reading);
  const components = [
    {
      type: 'text',
      variant: 'caption',
      text: stamp
        ? { en: `${location.name} · updated ${stamp.en}`, fr: `${location.name} · màj ${stamp.fr}` }
        : { en: location.name, fr: location.name },
    },
    {
      type: 'value',
      label: { en: 'UV index now', fr: 'Indice UV actuel' },
      value: reading.uvIndex ?? MISSING,
      icon: 'sun',
      color: levelColor(reading.level),
    },
    {
      type: 'value',
      label: { en: 'Max today', fr: 'Max du jour' },
      value: reading.uvIndexMaxToday ?? MISSING,
      icon: 'trending-up',
      color: levelColor(reading.levelMaxToday),
    },
    {
      type: 'value',
      label: { en: 'Clear sky', fr: 'Ciel clair' },
      value: reading.uvIndexClearSky ?? MISSING,
      icon: 'cloud-off',
    },
  ];

  const chart = forecastChart(reading);
  if (chart) {
    components.push(chart);
  }

  const peakHour = formatHour(reading.peakTime);
  const items = [
    {
      label: { en: 'Exposure', fr: 'Exposition' },
      value: levelLabel(reading.level),
      color: levelColor(reading.level),
    },
  ];
  if (peakHour !== null && reading.uvIndexMaxToday !== null) {
    items.push({
      label: { en: "Today's peak", fr: 'Pic du jour' },
      value: {
        en: `${reading.uvIndexMaxToday} at ${peakHour}`,
        fr: `${reading.uvIndexMaxToday} à ${peakHour}`,
      },
      color: levelColor(reading.levelMaxToday),
    });
  }
  components.push({ type: 'status', items });

  const advice = UV_LEVEL_ADVICE[reading.level];
  if (advice) {
    components.push(bodyText(advice.en, advice.fr));
  }

  return { ttl_seconds: WIDGET_TTL_SECONDS, components };
}

/**
 * The content of the `uv_overview` widget.
 * @param {Array<{ location: import('./locations.js').Location, reading: object|null }>} entries
 *   one per watched location, in list order; `reading` is null when it failed
 */
export function buildOverviewContent(entries) {
  if (entries.length === 0) {
    return {
      ttl_seconds: WIDGET_TTL_SECONDS,
      components: [
        bodyText(
          'No location yet. Add one in the configuration of the UV index integration.',
          "Aucun lieu pour l'instant. Ajoutez-en un dans la configuration de l'intégration Indice UV.",
        ),
      ],
    };
  }

  const shown = entries.slice(0, MAX_OVERVIEW_ROWS);
  const caption =
    shown.length < entries.length
      ? {
          en: `Current UV index · first ${shown.length} of ${entries.length} locations`,
          fr: `Indice UV actuel · ${shown.length} premiers lieux sur ${entries.length}`,
        }
      : { en: 'Current UV index', fr: 'Indice UV actuel' };

  const items = shown.map(({ location, reading }) => {
    const value = reading?.uvIndex ?? null;
    if (value === null) {
      return { label: location.name, value: MISSING, color: WIDGET_COLORS.NEUTRAL };
    }
    const label = levelLabel(reading.level);
    return {
      label: location.name,
      value: { en: `${value} · ${label.en}`, fr: `${value} · ${label.fr}` },
      color: levelColor(reading.level),
    };
  });

  return {
    ttl_seconds: WIDGET_TTL_SECONDS,
    components: [
      { type: 'text', variant: 'caption', text: caption },
      { type: 'status', items },
    ],
  };
}

/**
 * The widget handlers, keyed by widget key — the shape `onWidgetGet` is
 * registered with. The outside world comes in by injection, so the tests run
 * them with no Gladys and no network.
 * @param {object} deps
 * @param {() => { locations: object[] }} deps.getConfig the current configuration
 * @param {(config: object) => object[]} deps.watchedLocations the locations a device is published for
 * @param {(config: object, deviceExternalId: string) => object|undefined} deps.locationOfDevice
 * @param {(location: object) => Promise<object>} deps.readUvIndex
 */
export function createWidgets({ getConfig, watchedLocations, locationOfDevice, readUvIndex }) {
  return {
    async [WIDGET.LOCATION]({ settings } = {}) {
      const location = locationOfDevice(getConfig(), settings?.location);
      if (!location) {
        // The device still exists in Gladys, its location no longer does here.
        return {
          ttl_seconds: WIDGET_TTL_SECONDS,
          components: [
            bodyText(
              'This device is no longer watched: its location was removed. Pick another device in the widget settings.',
              "Cet appareil n'est plus suivi : son lieu a été supprimé. Choisissez un autre appareil dans les réglages du widget.",
            ),
          ],
        };
      }
      // A failure is thrown: the core shows its own "data unavailable" state,
      // with a retry button and this message under it.
      return buildLocationContent(location, await readUvIndex(location));
    },

    async [WIDGET.OVERVIEW]() {
      const locations = watchedLocations(getConfig());
      const entries = await Promise.all(
        locations.map(async (location) => {
          try {
            return { location, reading: await readUvIndex(location) };
          } catch (err) {
            // One location the provider refuses must not blank the others.
            logger.warn(`Overview widget: no UV data for ${location.name}`, err);
            return { location, reading: null };
          }
        }),
      );
      return buildOverviewContent(entries);
    },
  };
}

/**
 * Ask the core to re-pull every widget — after a refresh cycle, so the cards
 * follow the devices. Fire-and-forget: dropped while disconnected, rate-limited
 * core-side, and it never throws (it runs inside a timer callback).
 * @param {{ requestWidgetRefresh?: (key: string) => void }} gladys
 */
export function nudgeWidgets(gladys) {
  for (const key of Object.values(WIDGET)) {
    try {
      gladys.requestWidgetRefresh?.(key);
    } catch (err) {
      logger.warn(`Widget refresh request failed for ${key}`, err);
    }
  }
}
