import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  roundUvIndex,
  UV_LEVEL_ADVICE,
  UV_LEVEL_LABELS,
  UV_LEVEL_MAX,
  UV_LEVELS,
  uvIndexToLevel,
} from '../src/uv/scale.js';

test('the index is reported as a whole number', () => {
  assert.equal(roundUvIndex(4.4), 4);
  assert.equal(roundUvIndex(4.5), 5);
  assert.equal(roundUvIndex(0), 0);
});

test('a small negative value is numerical noise, not a hole in the data', () => {
  // The models return one at night; it is a zero, not "no measurement".
  assert.equal(roundUvIndex(-0.02), 0);
  assert.equal(roundUvIndex(-3), 0);
});

test('no value at all stays null, and never becomes zero', () => {
  // A UV index of 0 means "the sun is down"; publishing it for a missing
  // measurement would fire a scene in the middle of the afternoon.
  assert.equal(roundUvIndex(null), null);
  assert.equal(roundUvIndex(undefined), null);
  assert.equal(roundUvIndex('nonsense'), null);
  assert.equal(uvIndexToLevel(null), null);
  assert.equal(uvIndexToLevel(undefined), null);
});

test('the WHO bands map onto levels 1 to 5', () => {
  const cases = [
    [1, UV_LEVELS.LOW],
    [2, UV_LEVELS.LOW],
    [3, UV_LEVELS.MODERATE],
    [5, UV_LEVELS.MODERATE],
    [6, UV_LEVELS.HIGH],
    [7, UV_LEVELS.HIGH],
    [8, UV_LEVELS.VERY_HIGH],
    [10, UV_LEVELS.VERY_HIGH],
    [11, UV_LEVELS.EXTREME],
    [15, UV_LEVELS.EXTREME],
  ];
  for (const [index, level] of cases) {
    assert.equal(uvIndexToLevel(index), level, `UV ${index}`);
  }
});

test('level 0 is "none", a band the WHO scale does not have', () => {
  // Its lowest band, "low", covers 0-2. A home automation user still needs
  // "there is no UV at all right now" to be its own value.
  assert.equal(uvIndexToLevel(0), UV_LEVELS.NONE);
  assert.equal(uvIndexToLevel(0.4), UV_LEVELS.NONE);
  assert.equal(UV_LEVEL_LABELS[UV_LEVELS.NONE].en, 'None');
  assert.notEqual(UV_LEVEL_LABELS[UV_LEVELS.NONE].en, UV_LEVEL_LABELS[UV_LEVELS.LOW].en);
});

test('the level is banded on the SAME number the index feature publishes', () => {
  // Both are features of one device: a "3" labelled "low" is a bug the user can
  // see. Rounding before banding is what makes that impossible.
  for (const raw of [0.5, 2.5, 2.6, 5.5, 7.5, 10.5]) {
    assert.equal(
      uvIndexToLevel(raw),
      uvIndexToLevel(roundUvIndex(raw)),
      `UV ${raw} must band like its rounded self`,
    );
  }
  assert.equal(roundUvIndex(2.6), 3);
  assert.equal(uvIndexToLevel(2.6), UV_LEVELS.MODERATE);
});

test('every level has a label and an advice, in both languages', () => {
  for (let level = 0; level <= UV_LEVEL_MAX; level += 1) {
    for (const language of ['en', 'fr']) {
      assert.ok(UV_LEVEL_LABELS[level]?.[language], `label ${level}.${language}`);
      assert.ok(UV_LEVEL_ADVICE[level]?.[language], `advice ${level}.${language}`);
    }
  }
});
