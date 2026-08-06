import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  isConfigured,
  normalizeConfig,
  POLL_FREQUENCY_LIMITS,
} from '../src/config.js';

test('an empty config falls back on the defaults', () => {
  const config = normalizeConfig();
  assert.equal(config.poll_frequency, DEFAULT_CONFIG.poll_frequency);
  assert.equal(config.language, 'fr');
  assert.deepEqual(config.locations, []);
});

test('the language of the names falls back on French', () => {
  // Nothing in the host API tells an integration which language its user reads
  // (see src/language.js): an unknown value is French, not a broken name.
  assert.equal(normalizeConfig({ language: 'en' }).language, 'en');
  assert.equal(normalizeConfig({ language: 'FR' }).language, 'fr');
  assert.equal(normalizeConfig({ language: 'en-US' }).language, 'en');
  assert.equal(normalizeConfig({ language: 'de' }).language, 'fr');
  assert.equal(normalizeConfig({ language: null }).language, 'fr');
});

test('numbers arriving as strings from the form are coerced', () => {
  assert.equal(normalizeConfig({ poll_frequency: '3600' }).poll_frequency, 3600);
});

test('the poll frequency is clamped to the manifest bounds', () => {
  // A value below the bound would hammer a free public API for nothing.
  assert.equal(normalizeConfig({ poll_frequency: 5 }).poll_frequency, POLL_FREQUENCY_LIMITS.min);
  assert.equal(
    normalizeConfig({ poll_frequency: 999999 }).poll_frequency,
    POLL_FREQUENCY_LIMITS.max,
  );
  assert.equal(
    normalizeConfig({ poll_frequency: 'nonsense' }).poll_frequency,
    DEFAULT_CONFIG.poll_frequency,
  );
});

test('locations are parsed into a usable array', () => {
  const config = normalizeConfig({
    locations: [
      {
        id: 'loc-abc12345',
        name: 'Maison',
        postal_code: '44300',
        latitude: '47.2172',
        longitude: '-1.5534',
      },
    ],
  });
  assert.equal(config.locations.length, 1);
  assert.equal(config.locations[0].latitude, 47.2172);
  assert.equal(config.locations[0].postal_code, '44300');
});

test('a corrupted locations value degrades to an empty list', () => {
  assert.deepEqual(normalizeConfig({ locations: 'oops' }).locations, []);
});

test('a config with no usable point is not configured', () => {
  // Publishing then would offer a device pinned to nowhere.
  assert.equal(isConfigured(normalizeConfig()), false);
  assert.equal(
    isConfigured(normalizeConfig({ locations: [{ id: 'loc-1', name: 'X', latitude: '48.8' }] })),
    false,
  );
  assert.equal(
    isConfigured(
      normalizeConfig({
        locations: [{ id: 'loc-1', name: 'X', latitude: '48.8', longitude: '2' }],
      }),
    ),
    true,
  );
});

test('a key this version does not declare is carried along, not read', () => {
  // getConfig hands back every stored variable, schema or not: an integration
  // cannot delete a config key a former version wrote.
  const config = normalizeConfig({ default_country: 'FR' });
  assert.equal(config.default_country, 'FR');
  assert.deepEqual(config.locations, []);
});
