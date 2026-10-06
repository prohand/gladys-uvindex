# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

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

[Unreleased]: https://github.com/prohand/gladys-uvindex/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/prohand/gladys-uvindex/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/prohand/gladys-uvindex/compare/v1.0.5...v2.0.0
[1.0.5]: https://github.com/prohand/gladys-uvindex/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/prohand/gladys-uvindex/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/prohand/gladys-uvindex/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/prohand/gladys-uvindex/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/prohand/gladys-uvindex/releases/tag/v1.0.1
