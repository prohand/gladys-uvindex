// -----------------------------------------------------------------------------
// UV index -> exposure level, wording and protection advice.
//
// The providers return the UV index as a decimal (4.7, 11.3...). The scale it
// belongs to is the GLOBAL SOLAR UV INDEX defined by the WHO, WMO, UNEP and
// ICNIRP in "Global Solar UV Index: A Practical Guide": an open-ended scale
// starting at 0, reported as a WHOLE NUMBER, and grouped into five exposure
// categories that carry the actual advice.
//
//   UVI 1-2    low          | UVI 6-7   high
//   UVI 3-5    moderate     | UVI 8-10  very high
//                           | UVI 11+   extreme
//
// TWO THINGS THIS MODULE DECIDES, and why.
//
// 1. THE INDEX IS ROUNDED BEFORE IT IS BANDED. Both the number and its category
//    are published as features of the same device, so they must never disagree:
//    a raw 2.6 shown as "3" while its level says "low" is a bug the user can
//    see. Rounding first, then banding the integer, makes the displayed number
//    the one the category is derived from, by construction.
//
// 2. LEVEL 0 IS "NONE", WHICH THE WHO SCALE DOES NOT HAVE. Its lowest band,
//    "low", covers 0 to 2 — but a home automation user asks "is there any UV
//    right now?" every night, and a scene that fires when the sun goes down
//    needs a value that says so. So a rounded index of 0 gets its own level,
//    and the WHO bands take 1 to 5. The wording of level 0 is "none", never
//    "low", so nothing claims the WHO named it.
// -----------------------------------------------------------------------------

/** The 0-5 exposure scale exposed by the risk feature. */
export const UV_LEVELS = {
  NONE: 0,
  LOW: 1,
  MODERATE: 2,
  HIGH: 3,
  VERY_HIGH: 4,
  EXTREME: 5,
};

/** Maximum value of the scale, mirrored in the feature `max`. */
export const UV_LEVEL_MAX = UV_LEVELS.EXTREME;

/**
 * Upper bound of the numeric UV index features.
 *
 * The WHO scale is open-ended, but `t_device_feature.max` is not: it needs a
 * number, and a value above it is refused. 16 is comfortably past the highest
 * index ever measured on Earth (43.3 was recorded at 5 900 m in the Andes, but
 * ~14 is the ceiling at sea level in the tropics), so no real reading is ever
 * clipped while the dashboard gauge keeps a usable range.
 */
export const UV_INDEX_MAX = 16;

/** Wording of each level, for the features, the logs and the action messages. */
export const UV_LEVEL_LABELS = {
  0: { en: 'None', fr: 'Nul' },
  1: { en: 'Low', fr: 'Faible' },
  2: { en: 'Moderate', fr: 'Modéré' },
  3: { en: 'High', fr: 'Élevé' },
  4: { en: 'Very high', fr: 'Très élevé' },
  5: { en: 'Extreme', fr: 'Extrême' },
};

/**
 * What to actually DO at each level — the WHO protection recommendations, which
 * are the reason the categories exist at all. Kept short enough to fit the one
 * line a TEXT feature gets on a dashboard.
 */
export const UV_LEVEL_ADVICE = {
  0: {
    en: 'No protection needed: no ultraviolet radiation.',
    fr: 'Aucune protection nécessaire : pas de rayonnement ultraviolet.',
  },
  1: {
    en: 'No protection needed. You can safely stay outside.',
    fr: 'Aucune protection nécessaire. Vous pouvez rester dehors sans risque.',
  },
  2: {
    en: 'Protection needed: seek shade around midday, wear a hat, sunglasses and sunscreen.',
    fr: 'Protection nécessaire : cherchez l’ombre à la mi-journée, portez chapeau, lunettes et crème solaire.',
  },
  3: {
    en: 'Protection needed: avoid the sun between 12:00 and 16:00, shade, hat, sunglasses and sunscreen.',
    fr: 'Protection nécessaire : évitez le soleil entre 12h et 16h, ombre, chapeau, lunettes et crème solaire.',
  },
  4: {
    en: 'Extra protection needed: avoid being outside between 12:00 and 16:00, shade, hat, sunglasses, sunscreen and a shirt.',
    fr: 'Protection renforcée : évitez de sortir entre 12h et 16h, ombre, chapeau, lunettes, crème solaire et vêtements couvrants.',
  },
  5: {
    en: 'Take all precautions: unprotected skin burns within minutes, stay inside between 12:00 and 16:00.',
    fr: 'Toutes les précautions : la peau non protégée brûle en quelques minutes, restez à l’intérieur entre 12h et 16h.',
  },
};

// Lower bound (inclusive) of each WHO band, on the ROUNDED index. Level 0 is
// the implicit "below the first bound" case; see the header for why it exists.
const LEVEL_LOWER_BOUNDS = [
  [UV_LEVELS.EXTREME, 11],
  [UV_LEVELS.VERY_HIGH, 8],
  [UV_LEVELS.HIGH, 6],
  [UV_LEVELS.MODERATE, 3],
  [UV_LEVELS.LOW, 1],
];

/**
 * The UV index as it is REPORTED: a whole number, never negative.
 *
 * The models occasionally return a very small negative value at night from
 * their own numerical noise; it is a zero, not a hole in the data, so it is
 * clamped rather than dropped.
 * @param {number|null|undefined} uvIndex the raw value from a provider
 * @returns {number|null} null when the provider has no value at all
 */
export function roundUvIndex(uvIndex) {
  if (uvIndex === null || uvIndex === undefined || !Number.isFinite(Number(uvIndex))) {
    return null;
  }
  return Math.max(0, Math.round(Number(uvIndex)));
}

/**
 * The exposure level of a UV index.
 *
 * Takes the RAW index and rounds it itself, so a caller cannot band a number
 * different from the one it displays.
 * @param {number|null|undefined} uvIndex
 * @returns {number|null} 0-5, or null when there is no value
 */
export function uvIndexToLevel(uvIndex) {
  const rounded = roundUvIndex(uvIndex);
  if (rounded === null) {
    return null;
  }
  const band = LEVEL_LOWER_BOUNDS.find(([, lowerBound]) => rounded >= lowerBound);
  return band ? band[0] : UV_LEVELS.NONE;
}
