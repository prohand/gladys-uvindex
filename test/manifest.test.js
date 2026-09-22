// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code registers, nor how many positions the delete dropdown
// must offer — these tests keep them in sync so a forgotten step fails CI, not
// the install.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG, POLL_FREQUENCY_LIMITS } from '../src/config.js';
import { DEVICE_BLUEPRINTS } from '../src/devices/index.js';
import { DEFAULT_LANGUAGE, LANGUAGES } from '../src/language.js';
import { createLocationEditor } from '../src/locationEditor.js';
import { MAX_LOCATIONS } from '../src/locations.js';
import {
  buildLevelChangedEvent,
  buildReadingOutputs,
  createSceneActions,
  DIRECTION,
  SCENE_TRIGGER,
} from '../src/scenes.js';
import { UV_LEVEL_LABELS, UV_LEVEL_MAX } from '../src/uv/scale.js';
import { createWidgets, WIDGET } from '../src/widgets.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

// Every action key the code actually registers: the device blueprints own the
// ones about UV, the location manager the ones about the list.
const HANDLED_ACTIONS = [
  ...DEVICE_BLUEPRINTS.flatMap((blueprint) => Object.keys(blueprint.actions ?? {})),
  ...Object.keys(
    createLocationEditor({
      getConfig: () => ({ locations: [] }),
      setConfig: async () => {},
      onLocationsChanged: async () => {},
    }).actions,
  ),
];

// The store schema only accepts these widget types — 'text' is NOT one of them,
// the free-text widget is called 'string'.
const ALLOWED_FIELD_TYPES = [
  'string',
  'number',
  'boolean',
  'select',
  'multi_select',
  'secret',
  'oauth2',
  'section',
];

// The browse categories of the store catalog (Gladys 4.86+), a controlled
// vocabulary: they are the shelves of the catalog, not the technical `type`.
const CATALOG_CATEGORIES = [
  'climate',
  'lighting',
  'energy',
  'security',
  'multimedia',
  'appliances',
  'environment',
  'protocols',
  'network',
  'notifications',
  'assistants',
  'services',
];

// Every widget and scene action key the code registers.
const NO_DEPS = {
  getConfig: () => ({ locations: [], language: DEFAULT_LANGUAGE }),
  watchedLocations: () => [],
  locationOfDevice: () => undefined,
  readUvIndex: async () => ({}),
};
const HANDLED_WIDGETS = Object.keys(createWidgets(NO_DEPS));
const HANDLED_SCENE_ACTIONS = Object.keys(createSceneActions(NO_DEPS));

/** A reading with every value present: what fills every output and variable. */
const FULL_READING = {
  provider: 'open-meteo-cams',
  uvIndex: 7,
  uvIndexClearSky: 8,
  uvIndexMaxToday: 8,
  level: 3,
  levelMaxToday: 4,
  measuredAt: '2026-08-06T14:00',
  peakTime: '2026-08-06T13:00',
  forecast: [],
  utcOffsetSeconds: 7200,
};
const FULL_LOCATION = { id: 'loc-1', name: 'Maison' };

/** Every field of the manifest: config, actions, widget settings, scene cards. */
function allFields() {
  return [
    ...manifest.config_schema,
    ...(manifest.actions ?? []).flatMap((action) => action.fields ?? []),
    ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
    ...(manifest.scene_triggers ?? []).flatMap((trigger) => trigger.fields ?? []),
    ...(manifest.scene_actions ?? []).flatMap((action) => action.fields ?? []),
  ];
}

/** The keys of a list of declarations. */
const keysOf = (list) => (list ?? []).map((entry) => entry.key);

function action(key) {
  return (manifest.actions ?? []).find((a) => a.key === key);
}

test('every manifest action has a registered handler, and vice versa', () => {
  for (const declared of manifest.actions ?? []) {
    assert.ok(
      HANDLED_ACTIONS.includes(declared.key),
      `manifest action "${declared.key}" has no handler in the code`,
    );
  }
  for (const handled of HANDLED_ACTIONS) {
    assert.ok(
      (manifest.actions ?? []).some((declared) => declared.key === handled),
      `handler "${handled}" is not declared in the manifest: no button runs it`,
    );
  }
});

test('every manifest widget has a content handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets).sort(), HANDLED_WIDGETS.sort());
  assert.deepEqual(HANDLED_WIDGETS.sort(), Object.values(WIDGET).sort());
});

test('every scene action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), HANDLED_SCENE_ACTIONS.sort());
});

test('the scene trigger the code fires is the one the manifest declares', () => {
  // publishSceneEvent answers 404 on an undeclared key: a typo here is a trigger
  // that never fires, with nothing anywhere to say so.
  assert.deepEqual(keysOf(manifest.scene_triggers), Object.values(SCENE_TRIGGER));
});

test('a location is always picked by its device, never by its position', () => {
  // Positions shift when a location is removed; a device's external_id is
  // stable for the life of the location. Every card that designates a
  // location stores the latter.
  const pickers = allFields().filter((field) => field.key === 'location' && field.source);
  assert.equal(pickers.length, 3, 'the widget setting, the trigger filter, the action field');
  for (const field of pickers) {
    assert.equal(field.type, 'select');
    assert.equal(field.source, 'devices');
    assert.equal(field.default, undefined, 'a dynamic select takes no default');
  }
});

test('the level filter offers exactly the 0-5 scale, worded like the features', () => {
  const trigger = manifest.scene_triggers.find((t) => t.key === SCENE_TRIGGER.LEVEL_CHANGED);
  const level = trigger.fields.find((field) => field.key === 'level');
  assert.equal(level.type, 'multi_select');
  assert.deepEqual(
    level.options.map((option) => option.value),
    Array.from({ length: UV_LEVEL_MAX + 1 }, (unused, index) => String(index)),
  );
  for (const option of level.options) {
    const wording = UV_LEVEL_LABELS[Number(option.value)];
    assert.ok(option.label.en.endsWith(wording.en), `option ${option.value} (en)`);
    assert.ok(option.label.fr.endsWith(wording.fr), `option ${option.value} (fr)`);
  }
});

test('the direction filter offers exactly the values the event carries', () => {
  const trigger = manifest.scene_triggers.find((t) => t.key === SCENE_TRIGGER.LEVEL_CHANGED);
  const direction = trigger.fields.find((field) => field.key === 'direction');
  assert.deepEqual(
    direction.options.map((option) => option.value).sort(),
    Object.values(DIRECTION).sort(),
  );
});

test('a trigger filter is never a boolean', () => {
  // A toggle has no empty state, so it could never mean "any": the core
  // refuses the manifest.
  for (const trigger of manifest.scene_triggers) {
    for (const field of trigger.fields ?? []) {
      assert.notEqual(field.type, 'boolean', `${trigger.key}.${field.key}`);
    }
  }
});

test('the event carries every declared filter and variable, and nothing else', () => {
  // The core keeps the declared keys and drops the rest silently: a variable the
  // event never sends is an always-empty entry in the scene editor, a key sent
  // but never declared is data thrown away.
  const trigger = manifest.scene_triggers.find((t) => t.key === SCENE_TRIGGER.LEVEL_CHANGED);
  const data = buildLevelChangedEvent({
    deviceId: 'ext:uv:uv-station:loc-1',
    location: FULL_LOCATION,
    reading: FULL_READING,
    transition: { previous: 2, level: 3 },
    language: 'fr',
  });
  const declared = new Set([...keysOf(trigger.fields), ...keysOf(trigger.variables)]);
  assert.deepEqual(Object.keys(data).sort(), [...declared].sort());
  for (const variable of trigger.variables) {
    assert.equal(typeof data[variable.key], variable.type, `variable ${variable.key}`);
  }
});

test('the action returns exactly the declared outputs, with their declared types', () => {
  const action = manifest.scene_actions.find((a) => a.key === 'read_uv_index');
  const outputs = buildReadingOutputs(FULL_LOCATION, FULL_READING, 'fr');
  assert.deepEqual(Object.keys(outputs).sort(), keysOf(action.outputs).sort());
  for (const output of action.outputs) {
    assert.equal(typeof outputs[output.key], output.type, `output ${output.key}`);
  }
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(
        DEFAULT_CONFIG[field.key],
        field.default,
        `DEFAULT_CONFIG.${field.key} must match the manifest default`,
      );
    }
  }
});

test('the refresh interval is clamped to the bounds the manifest declares', () => {
  const field = manifest.config_schema.find((f) => f.key === 'poll_frequency');
  assert.equal(field.min, POLL_FREQUENCY_LIMITS.min);
  assert.equal(field.max, POLL_FREQUENCY_LIMITS.max);
});

test('the language dropdown offers exactly the languages the code writes', () => {
  // The names of the devices are the one thing Gladys cannot translate for us,
  // so the user picks their language here — French by default, because the host
  // API never says which language the user reads (see src/language.js).
  const field = manifest.config_schema.find((f) => f.key === 'language');
  assert.equal(field.type, 'select');
  assert.equal(field.default, DEFAULT_LANGUAGE);
  assert.deepEqual(
    field.options.map((option) => option.value),
    LANGUAGES,
    'a language offered in the form must be one the code can write',
  );
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((field) => field.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    // A section stores NO value: declaring `required`, `default` or
    // `placeholder` on it rejects the manifest, and its key must never leak
    // into the config the code manipulates.
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.equal(section.placeholder, undefined, `section "${section.key}" needs no placeholder`);
    assert.ok(section.label?.en, `section "${section.key}" needs an English label`);
    assert.ok(!(section.key in DEFAULT_CONFIG), `section "${section.key}" stores no value`);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('locations is NOT a config_schema field', () => {
  // It is written by the integration through setConfig, not typed by the user:
  // no static form can hold a list built at runtime.
  const keys = manifest.config_schema.map((field) => field.key);
  assert.ok(!keys.includes('locations'));
});

test('a postal code is typed in a `string` field, never in a `number` one', () => {
  // 01000 typed as a number is 1000: four digits, and not a postal code.
  for (const field of allFields()) {
    if (/postal/i.test(field.key)) {
      assert.equal(field.type, 'string', `"${field.key}" must not be a number field`);
    }
  }
});

test('a coordinate is typed in a `string` field, never in a `number` one', () => {
  // An <input type="number"> is sanitized by the browser against ITS OWN locale:
  // a French one refuses "48.8566" and the front then drops the key from the
  // payload, so the value silently keeps whatever it held.
  for (const field of allFields()) {
    if (/latitude|longitude/.test(field.key)) {
      assert.equal(field.type, 'string', `"${field.key}" must not be a number field`);
    }
  }
});

test('the add form asks for a postal code and offers coordinates as a way out', () => {
  const keys = (action('add_location').fields ?? []).map((field) => field.key);
  assert.deepEqual(keys, ['name', 'postal_code', 'city', 'latitude', 'longitude']);
  // Nothing is `required`: the postal code and the point are two ways in, and a
  // required field would make one of them mandatory for both.
  for (const field of action('add_location').fields) {
    assert.notEqual(field.required, true, `"${field.key}" must stay optional`);
  }
});

test('the delete action names a location by its number in the listing', () => {
  const picker = (action('remove_location').fields ?? []).find((f) => f.key === 'location');
  assert.ok(picker, 'the only dropdown left, and it deletes');
  assert.equal(picker.type, 'select');
  assert.equal(picker.required, true);
  assert.equal(picker.default, '1');
  // Static options, because that is all a manifest can hold: they are the
  // positions the listing prints, which is what maps a number to a name.
  assert.deepEqual(
    picker.options.map((option) => option.value),
    Array.from({ length: MAX_LOCATIONS }, (unused, index) => String(index + 1)),
    'the dropdown and MAX_LOCATIONS must not drift apart',
  );
});

test('the delete action is guarded by a confirmation', () => {
  const confirmation = (action('remove_location').fields ?? []).find(
    (f) => f.key === 'confirmation',
  );
  assert.ok(confirmation, 'one click away from losing a location is one too few');
  assert.equal(confirmation.type, 'boolean');
  assert.equal(confirmation.default, false);
});

test('the delete action is the LAST button of the screen', () => {
  // The buttons are rendered in manifest order, and this one is the only
  // destructive button of the page: it sits under the read-only reports rather
  // than between them, where a mis-click lands while looking for the test.
  const keys = manifest.actions.map((a) => a.key);
  assert.equal(keys[keys.length - 1], 'remove_location');
});

test('the two reporting actions announce the SAME entry format', () => {
  // They answer about the same list of locations, under the same numbers:
  // "• number. name — detail" (see locationLine in src/locations.js).
  for (const key of ['list_locations', 'test_provider']) {
    const reporting = action(key);
    assert.equal((reporting.fields ?? []).length, 0, `${key} reports on every location`);
    assert.match(reporting.description.fr, /•/, `${key} documents the entry marker`);
    assert.match(reporting.description.fr, /numéro/i, `${key} documents the entry number`);
    assert.match(reporting.description.en, /•/);
  }
});

test('every field declares a widget type the store accepts', () => {
  for (const field of allFields()) {
    assert.ok(
      ALLOWED_FIELD_TYPES.includes(field.type),
      `field "${field.key}" has the unsupported type "${field.type}"`,
    );
  }
});

// The rules below are the ones Gladys enforces itself in `validateManifest`
// before installing: getting them wrong shows the user "The integration
// manifest is invalid." with no detail, so they are worth pinning here.

test('the store description fits the catalog card', () => {
  // 10-100 characters PER LANGUAGE — the card is one line, and a long
  // description rejects the whole manifest at install time.
  assert.ok(manifest.description.en, 'an English description is mandatory');
  for (const [language, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${language} must be 10-100 characters, got ${text.length}`,
    );
  }
});

test('every human text is a multi-language object', () => {
  // `label`, `description` and `placeholder` are ALWAYS { en, … } objects,
  // never bare strings — including a placeholder that looks like a constant.
  const check = (value, path) => {
    if (value === undefined) {
      return;
    }
    assert.equal(typeof value, 'object', `${path} must be a { en, … } object, not a bare value`);
    assert.equal(typeof value.en, 'string', `${path}.en is mandatory`);
  };

  const checkField = (field, path) => {
    check(field.label, `${path}.label`);
    check(field.description, `${path}.description`);
    check(field.placeholder, `${path}.placeholder`);
    for (const [index, option] of (field.options ?? []).entries()) {
      check(option.label, `${path}.options[${index}].label`);
    }
    for (const [index, link] of (field.links ?? []).entries()) {
      check(link.label, `${path}.links[${index}].label`);
    }
  };

  for (const [index, field] of manifest.config_schema.entries()) {
    checkField(field, `config_schema[${index}]`);
  }
  for (const declared of manifest.actions ?? []) {
    check(declared.label, `action "${declared.key}".label`);
    check(declared.description, `action "${declared.key}".description`);
    for (const [index, field] of (declared.fields ?? []).entries()) {
      checkField(field, `action "${declared.key}".fields[${index}]`);
    }
  }
  const cards = [
    ...(manifest.widgets ?? []).map((card) => ['widget', card, card.settings]),
    ...(manifest.scene_triggers ?? []).map((card) => ['scene trigger', card, card.fields]),
    ...(manifest.scene_actions ?? []).map((card) => ['scene action', card, card.fields]),
  ];
  for (const [kind, card, fields] of cards) {
    check(card.label, `${kind} "${card.key}".label`);
    check(card.description, `${kind} "${card.key}".description`);
    for (const [index, field] of (fields ?? []).entries()) {
      checkField(field, `${kind} "${card.key}".fields[${index}]`);
    }
    for (const entry of [...(card.variables ?? []), ...(card.outputs ?? [])]) {
      check(entry.label, `${kind} "${card.key}".${entry.key}.label`);
    }
  }
});

test('a widget label and description fit the dashboard picker', () => {
  // 3-30 characters per language for the tile name, 100 for its subtitle: past
  // either bound the core refuses the whole manifest.
  for (const widget of manifest.widgets) {
    for (const [language, text] of Object.entries(widget.label)) {
      assert.ok(text.length >= 3 && text.length <= 30, `${widget.key}.label.${language}`);
    }
    for (const [language, text] of Object.entries(widget.description ?? {})) {
      assert.ok(text.length <= 100, `${widget.key}.description.${language}`);
    }
  }
});

test('a description stays under the 1000-character limit', () => {
  for (const field of allFields()) {
    for (const [language, text] of Object.entries(field.description ?? {})) {
      assert.ok(
        text.length <= 1000,
        `${field.key}.description.${language} is ${text.length} characters`,
      );
    }
  }
});

test('placeholders stay on the field types that render an input', () => {
  const allowed = new Set(['string', 'number', 'secret']);
  for (const field of allFields()) {
    if (field.placeholder !== undefined) {
      assert.ok(allowed.has(field.type), `"${field.key}": a ${field.type} takes no placeholder`);
    }
  }
});

test('an action timeout stays inside the range the core accepts', () => {
  for (const declared of [...(manifest.actions ?? []), ...(manifest.scene_actions ?? [])]) {
    if (declared.timeout_seconds !== undefined) {
      assert.ok(
        declared.timeout_seconds >= 5 && declared.timeout_seconds <= 120,
        `action "${declared.key}": timeout_seconds must be 5-120`,
      );
    }
  }
});

test('the manifest asks for the house coordinates the import button reads', () => {
  // `GET /house` is an authorization contract, not just an endpoint: without
  // this line the core answers 403 and "Add my Gladys houses" can only apologize.
  assert.equal(manifest.location, true, 'import_houses reads GET /house');
  assert.ok(
    (manifest.actions ?? []).some((declared) => declared.key === 'import_houses'),
    'declaring the permission without the button asks the user for nothing in return',
  );
});

/** The `[major, minor]` a `>=x.y.z` range starts at. */
function minimumVersion() {
  const minimum = manifest.gladys_version.match(/^>=\s*(\d+)\.(\d+)\./);
  assert.ok(minimum, 'gladys_version must declare a minimum version');
  return [Number(minimum[1]), Number(minimum[2])];
}

/** Whether the range starts at `major.minor` or later. */
function startsAtLeast(major, minor) {
  const [actualMajor, actualMinor] = minimumVersion();
  return actualMajor > major || (actualMajor === major && actualMinor >= minor);
}

test('the compatibility range covers the version that opened GET /house', () => {
  // House coordinates landed in Gladys 4.85.0. An instance older than that
  // rejects the manifest field, and the whole integration with it: the range is
  // what keeps this version away from the instances it cannot run on.
  assert.ok(startsAtLeast(4, 85), `got "${manifest.gladys_version}"`);
});

test('the catalog categories stay inside the controlled vocabulary', () => {
  // The shelves the integration sits on in the catalog. The store validates
  // this in two stages: the SHAPE rejects (1-3 unique non-empty strings), the
  // VOCABULARY only filters — an unknown key is dropped with a warning nobody
  // reads and the integration lands under "All" alone, which is the same kind
  // of silent failure as the cover image.
  assert.ok(Array.isArray(manifest.categories), 'an uncategorized integration sits on no shelf');
  assert.ok(
    manifest.categories.length >= 1 && manifest.categories.length <= 3,
    `categories must hold 1 to 3 keys, got ${manifest.categories.length}`,
  );
  assert.equal(new Set(manifest.categories).size, manifest.categories.length, 'keys are unique');
  for (const category of manifest.categories) {
    assert.ok(
      CATALOG_CATEGORIES.includes(category),
      `"${category}" is not a category of the store vocabulary`,
    );
  }
});

test('declaring categories requires a compatibility range starting at 4.86.0', () => {
  // Older cores validate a manifest against a strict allowlist of top-level
  // fields and reject the whole thing on an unknown one: `categories` is only
  // readable from 4.86.0 on. The store enforces the coupling as an error, and
  // an instance that slipped through would refuse the install with nothing but
  // "The integration manifest is invalid."
  assert.ok(
    startsAtLeast(4, 86),
    `categories requires gladys_version >=4.86.0, got "${manifest.gladys_version}"`,
  );
});

test('declaring widgets and scene cards requires a range starting at 5.1.0', () => {
  // Same allowlist, same silent refusal: `widgets`, `scene_triggers` and
  // `scene_actions` are only readable from Gladys 5.1.0 on, and the store
  // rejects a manifest that declares them with a lower minimum.
  for (const field of ['widgets', 'scene_triggers', 'scene_actions']) {
    assert.ok(manifest[field], `the manifest declares ${field}`);
  }
  assert.ok(
    startsAtLeast(5, 1),
    `widgets and scene cards require gladys_version >=5.1.0, got "${manifest.gladys_version}"`,
  );
});

test('the manifest declares the cloud transport only', () => {
  // Both sources are HTTP APIs on the Internet: there is no local channel to
  // prefer, so Gladys must not show the "prefer local" toggle.
  assert.deepEqual(manifest.transports, ['cloud']);
});

test('the manifest version and the docker image tag agree', () => {
  // The release workflow rewrites both; a hand-edit that touches one of them
  // makes the indexer serve a version the image does not carry.
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    `docker_image "${manifest.docker_image}" does not carry version ${manifest.version}`,
  );
});
