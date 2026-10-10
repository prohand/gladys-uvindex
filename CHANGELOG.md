# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

### Fixed

- Every Open-Meteo request failed with `ETIMEDOUT` on a network without IPv6 far from the server (Australia): Node gave each connection attempt 250 ms, now 1 s (#18).

## [2.3.1] - 2026-10-08

- Maintenance release, no functional change.

## [2.3.0] - 2026-10-08

### Added

- Short retries of Open-Meteo and of the French commune registry on a network error, a 5xx or a 429 (exponential backoff with jitter, `Retry-After` honoured): a brief outage no longer costs a whole refresh cycle or an "Add a location" click. The widget and scene-action paths retry once, briefly, inside the widget deadline.
- The widgets and the "Read the UV index" scene action fall back on the last value read (up to 3 hours old, with its own timestamp) when Open-Meteo fails, instead of failing. The devices never receive an old value as a new state.

### Changed

- One Open-Meteo request per refresh cycle for every location (the API takes several points), instead of one per location.
- The UV cache lives until the next full hour — the resolution of the CAMS forecast — instead of 10 minutes, and a request already in flight for a point is shared by the refresh, the widgets and a device creation.
- The connection status is sent to Gladys only when it changes, and again after every (re)connection. A device batch Gladys refused stays on the status line until a publication is accepted.
- The configuration read at connection is the one the SDK has just fetched (`gladys.config`), not a second `GET /config`.
- Node `>=24` in `engines`, like the Docker image and the CI.
- Docker image: `npm ci --omit=dev --ignore-scripts` against the committed lock file (no more `npm install` fallback), npm cache cleaned, and no `/data` volume (nothing is written there).
- Dependabot also watches the Docker base image, monthly.

### Fixed

- Two location actions clicked close together no longer lose a location: the actions that change the list run one at a time and re-read it before writing.
- A location saved while the device publication failed now says so ("saved, but publishing the devices failed", with the reason) instead of reporting a raw error.
- Saving the configuration applies the new refresh interval and language to the timers even when Gladys refuses the device batch.
- "Test the UV provider" shows "no data" instead of the wording of level 0 ("None") when the source has no value.
- A failed first connection to Gladys no longer exits the process: the SDK keeps reconnecting.
- The scene trigger forgets the baseline of a removed location.

### Removed

- `MIN_REFRESH_SECONDS`, which had no effect: the refresh interval is already bounded to 10 minutes - 6 hours by the configuration.

## [2.2.0] - 2026-10-07

- Maintenance release, no functional change.

## [2.1.0] - 2026-10-06

### Added

- `SECURITY.md`: how to report a vulnerability.
- `CHANGELOG.md`, rebuilt from the release history.

### Changed

- Development dependencies updated to their latest versions (ESLint 10.12, Prettier 3.9.9, globals 17.13).
- Manifest re-formatted with Prettier, so the CI format check passes again.

### Fixed

- The Release workflow re-runs Prettier on the manifest after `jq`, so a release no longer leaves `main` with a failing CI format check.

## [2.0.0] - 2026-09-22

### Changed

- Gladys 5.1: dashboard widgets, a scene trigger and a scene action

## [1.0.5] - 2026-08-15

### Changed

- Target Gladys 4.86: SDK 0.12, catalog categories

## [1.0.4] - 2026-08-08

### Changed

- Publish the data timestamp as a feature of each UV station

## [1.0.3] - 2026-08-07

### Added

- Add the Gladys houses as locations in one click

## [1.0.2] - 2026-08-07

### Fixed

- Ship a cover the store actually accepts

## [1.0.1] - 2026-08-07

First public release.

### Added

- UV index integration with locations added by postal code
- Redraw the catalog cover around the UV index itself

[Unreleased]: https://github.com/prohand/gladys-uvindex/compare/v2.3.1...HEAD
[2.3.1]: https://github.com/prohand/gladys-uvindex/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/prohand/gladys-uvindex/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/prohand/gladys-uvindex/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/prohand/gladys-uvindex/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/prohand/gladys-uvindex/compare/v1.0.5...v2.0.0
[1.0.5]: https://github.com/prohand/gladys-uvindex/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/prohand/gladys-uvindex/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/prohand/gladys-uvindex/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/prohand/gladys-uvindex/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/prohand/gladys-uvindex/releases/tag/v1.0.1
