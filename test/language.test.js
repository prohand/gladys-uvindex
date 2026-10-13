// -----------------------------------------------------------------------------
// The languages: the device names follow the configuration, every message
// speaks the four languages of the Gladys interface, and a language the code
// does not write falls back on English.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LANGUAGE,
  inEveryLanguage,
  inLanguage,
  LANGUAGES,
  MESSAGE_LANGUAGES,
  normalizeLanguage,
} from '../src/language.js';
import { UV_LEVEL_ADVICE, UV_LEVEL_LABELS } from '../src/uv/scale.js';

test('the device names can be written in the four languages of Gladys', () => {
  assert.deepEqual([...LANGUAGES].sort(), ['de', 'en', 'es', 'fr']);
  assert.deepEqual([...MESSAGE_LANGUAGES].sort(), ['de', 'en', 'es', 'fr']);
  assert.equal(MESSAGE_LANGUAGES[0], 'en', 'English first: the fallback of the core');
  assert.equal(DEFAULT_LANGUAGE, 'fr');
});

test('a configured language is kept, anything else is the default', () => {
  assert.equal(normalizeLanguage('de'), 'de');
  assert.equal(normalizeLanguage('ES'), 'es');
  assert.equal(normalizeLanguage('de-CH'), 'de');
  assert.equal(normalizeLanguage('it'), DEFAULT_LANGUAGE);
  assert.equal(normalizeLanguage(undefined), DEFAULT_LANGUAGE);
});

test('a language missing from a text falls back on English', () => {
  const text = { en: 'Low', fr: 'Faible', de: 'Niedrig', es: 'Bajo' };
  assert.equal(inLanguage(text, 'de'), 'Niedrig');
  assert.equal(inLanguage(text, 'es'), 'Bajo');
  assert.equal(inLanguage(text, 'it'), 'Low');
  assert.equal(inLanguage({ fr: 'Faible' }, 'it'), 'Faible', 'then the default one');
});

test('a message built per language carries every language', () => {
  assert.deepEqual(
    inEveryLanguage((language) => `<${language}>`),
    { en: '<en>', fr: '<fr>', de: '<de>', es: '<es>' },
  );
});

test('every level is worded and advised in every language', () => {
  for (const table of [UV_LEVEL_LABELS, UV_LEVEL_ADVICE]) {
    for (const [level, text] of Object.entries(table)) {
      assert.deepEqual(Object.keys(text).sort(), ['de', 'en', 'es', 'fr'], `level ${level}`);
    }
  }
});
