# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Gladys Assistant **external integration**: a Node container that connects to a
Gladys host over WebSocket + HTTP through `@gladysassistant/integration-sdk`. It
is not a library and there is no local Gladys to run against — correctness is
established by the unit tests and by the manifest/code consistency checks.

It exposes the UV index of user-chosen locations, added by **French postal
code**. Data comes from two open, key-free APIs: Open-Meteo's air-quality
endpoint (the Copernicus CAMS UV forecast) and `geo.api.gouv.fr` (the French
state's "Découpage administratif" registry). See `README.md` for why
Météo-France was set aside.

## Commands

```bash
npm test                                     # node --test, network-free
node --test test/scale.test.js               # one file
node --test --test-name-pattern="WHO bands"  # one test by name
npm run lint                                 # eslint
npm run format:check                         # prettier, CI gate
npm run format                               # prettier --write
```

CI runs `format:check`, then `lint`, then `test`, on Node 24 (the Dockerfile's
runtime). Run all three before pushing — a formatting diff fails the build.

## Architecture

### Devices are a projection of the configuration

The upstream template (`integration-template-js`) uses a **static** array of
device blueprints. This integration inverts that: there is one device _type_
(`src/devices/uvStation.js`) and a variable number of devices, one per entry in
`config.locations`. Copying template device patterns will therefore mislead you —
the blueprint's `buildDevices`/`deviceExternalIds` map over
`watchedLocations(config)`.

A device's identity is `<type>:<location id>`, and the location id is generated
once, when the user adds the location. Renaming a location or moving its point
keeps the device, its history and its place in rooms and scenes.

### The location list is the single source of truth

`src/locations.js` owns the data, `src/locationEditor.js` the four actions that
change or report it. Consequences worth internalising:

- **`locations` is deliberately absent from `config_schema`.** No static form can
  hold a list built at runtime. It is written through `gladys.setConfig()` — the
  documented way to store integration-owned state outside the schema. A test
  asserts it stays out of the schema.
- **`setConfig` does not come back through `onConfigUpdated`.** A self-initiated
  write must update the in-memory `config` by hand. The `setConfig` dependency
  injected into the editor in `index.js` is the only place allowed to do this.
- **Coordinates AND postal codes travel as TEXT** (`src/coordinates.js`), in the
  form and in the stored list. `Number('')` is 0 — a valid latitude — a `number`
  field is an `<input type="number">` the browser sanitizes in its own locale (a
  French one silently drops `48.8566`), and `01000` typed as a number is `1000`,
  which is not a postal code at all.
- **Positions, not names, are what a user can pick.** A manifest `select` has
  static options, so the delete dropdown offers `1..MAX_LOCATIONS` and the
  listing action is what maps a number to a location. `MAX_LOCATIONS` and the
  option list are kept in sync by `test/manifest.test.js`.

`publishDiscoveredDevices()` **replaces** the previously published list. That is
the deletion mechanism: removing a location and re-publishing is what makes it
leave the Discovery tab. Creating/deleting the actual Gladys device stays the
user's action — an integration cannot delete one, which is why the delete action
names the device it leaves behind.

### Action messages are returned, never thrown

The SDK acks a thrown handler error as a plain `error: e.message` string, which
loses the multi-language message. Every expected, user-facing outcome — an
unreadable postal code, an ambiguous one, a duplicate point — is **returned** as
an `{ en, fr }` object; only unexpected failures throw. That message is also the
only thing the Configuration screen displays of what this integration has to say,
hence the listing being an action too.

### Names are the only text this integration has to translate itself

Everything displayed — action results, connection status — is returned as
`{ en, fr }` and rendered by the core in the reader's language. Device and
feature **names** cannot work that way: they are plain strings stored in
`t_device_feature.name` when the user creates the device, and the host API
exposes no user language at all.

Hence `src/language.js`: `config.language`, a manifest `select`, **`fr` by
default** (the postal code lookup is French, so the user base is). It is threaded
through `buildDevice`/`buildStates`/`poll` as an argument rather than read from a
module-level variable, so the mapping stays testable in both languages. The two
TEXT states follow it too — a stored state is a string like a name, translated by
nobody downstream.

Re-publishing does NOT rename an existing device: the core upserts the params of
the devices already created, never their name. A language switch therefore
applies to the devices still to be created, which the manifest description and
`docs/` both say.

### The Gladys houses are a second way in, and a permission

`src/houses.js` reads `GET /house` on the host API — `{ id, name, selector,
latitude, longitude }` per house, sorted by name — and `import_houses` turns
every house not already watched into a location.

- **The SDK does not wrap that endpoint** (0.11.0), so the call is made by hand
  with `GLADYS_HOST_API_URL` / `GLADYS_INTEGRATION_TOKEN`. Re-check on an SDK
  bump; a wrapper is the better caller once it exists.
- **`"location": true` in the manifest is an authorization contract**, shown on
  the install screen and enforced server-side. Without it the core answers
  **403**, which is why `HOUSE_ACCESS_DENIED` exists: it is not an outage, and
  the only fix is re-installing the integration. It is also why `gladys_version`
  is `>=4.85.0` — the version that opened the endpoint and accepts the field.
- **`latitude`/`longitude` are `null` for a house never placed on the map.**
  `Number(null)` is 0, so they go through `toCoordinate`, and such a house is
  named in the answer rather than watched off the coast of Ghana.
- **The import is ONE `commit`, or none at all.** A `setConfig` per house would
  re-publish the Discovery tab as many times; nothing is written when nothing is
  added.
- **It is not a sync.** Houses are read at click time; what comes out is an
  ordinary location. Re-importing is idempotent only through the usual
  `findLocationAtPoint` duplicate check — a house moved in Gladys therefore
  becomes a second location, which is the same rule as everywhere else here.

### The postal code is French; the data is not

`src/communes.js` is the only national thing in the codebase. Everything
downstream of it — the provider, the devices, the features — works on a latitude
and a longitude. That is why the add form also takes raw coordinates: it is the
documented way in for a location outside France, not an escape hatch for
debugging. Do not "generalise" the postal code lookup by guessing a country from
the digits; add a registry next to the French one if another country is ever
wanted.

### One extension registry

**`src/uv/`** — providers expose `{ key, name, supports(point),
fetchUvIndex(point) }`, first match wins, so callers never name an
implementation. Order matters: a national source registered before
`openMeteoProvider` overrides it for its own area. `openMeteoProvider.supports()`
returns `true` for every point (CAMS global is worldwide); the check stays
because a narrower provider will need it.

### The manifest is a contract checked by tests

`test/manifest.test.js` ties `gladys-assistant-integration.json` to the code:
every action has a handler _and_ every handler has a button, `DEFAULT_CONFIG`
matches the manifest defaults, the delete dropdown offers exactly
`MAX_LOCATIONS` positions, postal codes and coordinates stay in `string` fields,
`section` fields stay valueless, `docker_image` carries `version`. When you
change one side, the test tells you about the other.

Config/action field types: `string` (not `text`), `number`, `boolean`, `select`,
`multi_select`, `secret`, `oauth2`, `section`.

Do not hand-edit `version` or `docker_image` in the manifest — the release
workflow rewrites both.

### The cover is validated by the store, and failing is silent

`cover_image` is not shown as it is found. The indexer of
`GladysAssistant/integration-store` downloads it and checks one contract (its
C.1): **JPEG or PNG magic bytes, exactly 800×534, 150 KB maximum**. Missing any
of the three does **not** reject the integration and does not surface anywhere
the author will look — the entry is indexed with the store's own plain blue
`placeholder.png`, and `cover_url` (which the front prefers over
`manifest.cover_image`) points at it. The blue rectangle in the catalog IS the
error message. 1.0.0 and 1.0.1 shipped a 1200×801, 620 KB cover and never showed
it.

`test/cover.test.js` is the only warning there is, and it checks the committed
file, not the URL: magic bytes, size, and the manifest URL naming that same file
on `main` — the indexer reads `main`, not the release tag.

`tools/cover.mjs` builds the cover end to end (`node tools/cover.mjs`): it writes
the source page and drives headless Chromium over the DevTools protocol, because
`--screenshot` only writes PNG and this picture — full-bleed gradient, blurred
sun, no flat areas — is ~270 KB as a PNG at 800×534. As JPEG it is ~55 KB.

## Gladys core constraints that are not obvious

Each of these caused a real bug in the sibling `gladys-pollen` integration; the
first two left the Discovery tab silently empty. The core sources are worth
cloning when in doubt (`GladysAssistant/Gladys`, public).

- **`poll_frequency` is an ENUM in MILLISECONDS capped at one minute.** Anything
  else is rejected and the **whole batch** is refused. Hence the self-driven
  timer: the devices declare no `poll_frequency`, `startPolling` refreshes
  immediately then every `poll_frequency` seconds, floored at
  `MIN_REFRESH_SECONDS`.
- **Every feature needs an explicit numeric `min` and `max`** —
  `t_device_feature.min/max` are `NOT NULL` with no default, text features
  included. Publishing passes, then the user's "add device" click fails.
- **A refused batch is invisible unless you say so**: the error only reaches the
  SDK acknowledgement. `publishDevices()` logs the payload at debug level and
  reports the reason through `setConnectionStatus`.
- **The core silently drops states for a feature that does not exist yet.**
  States published before the user adds the device go nowhere, which is why
  `index.js` listens to `onDeviceCreated` and refreshes immediately.
- **A `risk`/`integer` value is rendered through the core's OWN label set** in
  the "device in a room" box, which stops at 3; levels 4 and 5 read "Inconnu"
  there. The 0-5 scale is kept — it is what the WHO categories map onto — and the
  exposure-level TEXT feature carries the exact wording for dashboards.
- **A newline does not survive the Configuration screen** (`white-space: normal`
  on a plain `<div class="alert">`), and markup is escaped. Hence
  `LOCATION_LINE_MARKER` opening every entry of a list, and the Unicode bold of
  `src/richText.js` for the label that opens it.

## Invariants

- **Missing data is `null`, never `0`.** A UV index of 0 means "the sun is down";
  publishing it for a missing measurement would fire a scene in the middle of the
  afternoon. This runs from `roundUvIndex()` through `buildStates()`.
  A _small negative_ value is different — it is the model's numerical noise, and
  `roundUvIndex` clamps it to 0 rather than dropping it.
- **The index is rounded BEFORE it is banded** (`src/uv/scale.js`). The number
  and its level are both features of one device: banding the raw value while
  displaying the rounded one would show a "3" labelled "low". `uvIndexToLevel`
  therefore rounds internally and callers must never pre-round for it.
- **Level 0 is "None", not "Low".** The WHO's lowest band covers 0-2; level 0 is
  this integration's own addition, and its wording must never claim otherwise.
- **A location id is never reused and never derived from what the user can
  edit** — it becomes the device `external_id`, so a reused id would hand a
  deleted location's device history to the next one created.
- **Ambiguity is resolved by the user, never by picking the first answer.** A
  postal code covering several communes returns them all and asks; reporting the
  UV of the wrong town is a failure nobody would notice.
- **The data timestamp is TEXT, and it is never parsed into a `Date`**
  (`src/uv/measuredAt.js`). A provider's `measuredAt` is the LOCAL wall-clock
  time at the point (`timezone=auto`); `new Date('2026-08-06T14:00')` reads it in
  the container's zone — UTC in production — so a Paris afternoon would be
  re-rendered as noon. The fields are read as text and re-written as text.
  It is also published per STATION, not on a global device: two locations in two
  time zones do not share an hour. And it stamps the CURRENT index only, so it is
  published only when that index is.
- **A refresh cycle never throws.** A rejection inside a timer callback would
  take the container down; one location failing must not silence the others.

## Testing

Tests never touch the network: `globalThis.fetch` is stubbed per-file and
restored in `afterEach`. `src/uv/openMeteo.js` keeps a module-level TTL cache, so
tests that count requests must call `clearUvCache()` in `beforeEach` — otherwise
state leaks between tests.

`test/helpers/fakeGladys.js` is the in-memory SDK stand-in; extend it when you
use a new SDK method rather than mocking the SDK itself. The location editor
takes its outside world by injection (`getConfig`, `setConfig`,
`resolvePostalCode`, `findCreatedDevice`), so `test/locationEditor.test.js`
exercises the buttons with no Gladys and no network at all.

Note that `locationLine()` renders the number and name in **Unicode bold
characters**, so a test asserting on a listing must compare against
`boldLabel('2. Bureau')` rather than the plain string.
