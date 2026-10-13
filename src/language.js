// -----------------------------------------------------------------------------
// The language the DEVICES speak.
//
// Everything this integration says under a button — an action result, a
// connection status — travels as an `{ en, fr, de, es }` object and is rendered by
// Gladys in the language of the user reading it: the core picks the key, we
// never choose. Device and feature NAMES are the exception. They are plain
// strings, copied into `t_device_feature.name` the day the user creates the
// device, and the host API tells an integration nothing about who is reading:
// the only language it ever exposes is the one of a messaging contact linked to
// a communication integration (`getContacts()`), which this integration has
// none of.
//
// So the language of the names is a configuration field, and its default is
// FRENCH: the locations are chosen by FRENCH postal code (see
// `src/communes.js`), which makes the user base French-speaking by
// construction.
//
// Note that Gladys renames nothing on re-publish: it upserts the params of the
// devices already created, never their name. Changing the language therefore
// renames the features of the devices still to be created, and leaves the
// existing ones as they were — deleting the device and adding it again from the
// Discovery tab is what renames it.
// -----------------------------------------------------------------------------

/** The languages the device names are written in, in manifest order. */
export const LANGUAGES = ['fr', 'en', 'de', 'es'];

/**
 * The keys of every multi-language object this integration hands Gladys —
 * the languages of the Gladys interface. `en` comes first: it is the one the
 * core falls back on, and the one `inLanguage` falls back on too.
 */
export const MESSAGE_LANGUAGES = ['en', 'fr', 'de', 'es'];

/** The one used when the configuration says nothing, or says nonsense. */
export const DEFAULT_LANGUAGE = 'fr';

/**
 * Coerce whatever the form (or an older config) holds into a supported
 * language. A regional code — `fr-FR`, `en-US` — keeps its first subtag.
 * @param {unknown} value
 * @returns {string} one of LANGUAGES
 */
export function normalizeLanguage(value) {
  const code = String(value ?? '')
    .trim()
    .slice(0, 2)
    .toLowerCase();
  return LANGUAGES.includes(code) ? code : DEFAULT_LANGUAGE;
}

/**
 * The entry of a multi-language object for a language, falling back to
 * English — the key the SDK guarantees — then to the default one.
 * @param {Record<string, unknown>} entries e.g. `{ en: 'Low', fr: 'Faible' }`
 * @param {string} language
 */
export function inLanguage(entries, language) {
  return entries[language] ?? entries.en ?? entries[DEFAULT_LANGUAGE];
}

/**
 * A multi-language object built one language at a time — for a message whose
 * parts are themselves multi-language (a header and lines, a sentence and a
 * warning), so no caller has to spell the four keys out again.
 * @param {(language: string) => string} build
 * @returns {Record<string, string>} one entry per MESSAGE_LANGUAGES
 */
export function inEveryLanguage(build) {
  return Object.fromEntries(MESSAGE_LANGUAGES.map((language) => [language, build(language)]));
}
