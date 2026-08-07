# Indice UV — Gladys Assistant integration

External integration for [Gladys Assistant](https://gladysassistant.com) exposing
the **UV index** of the locations you choose, added by **French postal code**.

Built on the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js)
and the [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

## What it does

Add a location from the Configuration screen — type its postal code — and a UV
device appears in the **Discovery** tab, ready to be added to Gladys. Add as
many as you like, remove the ones you no longer want, and each one gets its own
device.

Every device carries six features:

| Feature                  | Category    | What it is                                                                 |
| ------------------------ | ----------- | -------------------------------------------------------------------------- |
| UV index                 | `uv-sensor` | The index right now, as a whole number                                     |
| UV index max today       | `uv-sensor` | Today's peak — the number to plan an afternoon around                      |
| UV index (clear sky)     | `uv-sensor` | What it would be with no clouds: the difference is the cloud cover's doing |
| UV exposure level        | `risk`      | 0–5, the WHO exposure categories (see below) — the one to test in a scene  |
| UV exposure level (text) | `text`      | Its wording: "Faible", "Élevé"…                                            |
| Sun protection advice    | `text`      | The WHO recommendation for that level                                      |

## Where the data comes from

Both sources are **open data**, and neither needs an account or an API key —
that was the requirement the choice was made under.

**The UV index: CAMS, via Open-Meteo.** The
[Copernicus Atmosphere Monitoring Service](https://atmosphere.copernicus.eu/) is
the EU reference model; it computes the biologically effective UV dose from the
total column ozone, the aerosol optical depth and the cloud cover.
[Open-Meteo](https://open-meteo.com/en/docs/air-quality-api) republishes its
forecast as open data under CC BY 4.0, key-free. Coverage is worldwide (the
~45 km CAMS global product), with an hourly resolution.

> Météo-France publishes a French UV forecast too, but its API portal requires an
> account and an application token every user would have to create and paste in
> before anything worked at all. Copernicus is just as official and asks for
> nothing.

**The postal codes: the French state's own registry.**
[`geo.api.gouv.fr`](https://geo.api.gouv.fr/decoupage-administratif/communes) —
the "API Découpage administratif" published on data.gouv.fr from the INSEE
administrative database — resolves a postal code to the commune(s) it covers and
gives their centroid. Open data, no key.

A postal code is French by definition, so **outside France** you add a location
by its latitude and longitude instead; the UV data itself is worldwide. The add
form has both fields for exactly that.

## The UV index scale

The **Global Solar UV Index** is defined by the WHO, WMO, UNEP and ICNIRP. It is
open-ended, reported as a whole number, and grouped into five categories that
carry the actual protection advice:

| UV index | Level published | Wording    |
| -------- | --------------- | ---------- |
| 0        | 0               | Nul        |
| 1–2      | 1               | Faible     |
| 3–5      | 2               | Modéré     |
| 6–7      | 3               | Élevé      |
| 8–10     | 4               | Très élevé |
| 11+      | 5               | Extrême    |

Level 0 is this integration's addition: the WHO's lowest band, "low", covers 0
to 2, but "there is no UV at all right now" is its own answer in a home — it is
what a scene fires on at dusk. Its wording is "Nul", never "Faible", so nothing
claims the WHO named it. See [`src/uv/scale.js`](./src/uv/scale.js).

## Project structure

```
.
├─ index.js                          # SDK bootstrap + event wiring (no UV logic)
├─ src/
│  ├─ config.js                      # config defaults + normalization
│  ├─ communes.js                    # postal code -> commune (geo.api.gouv.fr)
│  ├─ coordinates.js                 # reading/writing a WGS-84 coordinate
│  ├─ locations.js                   # the user's location list (the source of truth)
│  ├─ locationEditor.js              # the three buttons that add/list/remove them
│  ├─ language.js                    # the language the DEVICE NAMES are written in
│  ├─ richText.js                    # the only emphasis the config screen renders
│  ├─ uv/
│  │  ├─ index.js                    #   provider registry + readUvIndex
│  │  ├─ openMeteo.js                #   the CAMS provider
│  │  └─ scale.js                    #   UV index -> level, wording, advice
│  └─ devices/
│     ├─ index.js                    #   device registry
│     └─ uvStation.js                #   one device per location
├─ docs/{en,fr}.md                   # user documentation, re-hosted by Gladys
├─ gladys-assistant-integration.json # manifest (name, config schema, actions, image)
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready
├─ tools/cover.mjs                   # the cover's source: HTML, screenshotted
└─ cover.png                         # catalog cover, 1200×801 px
```

## Run it locally

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="uv-index" \
LOG_LEVEL=debug \
npm start
```

The three `GLADYS_*` variables are injected by the Gladys supervisor when the
integration runs inside its sandboxed container. The SDK reads them
automatically.

## Quality checks

The same three gates run on every push and pull request
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm test               # unit tests, via the built-in `node --test` runner
```

The tests never touch the network: `globalThis.fetch` is stubbed per file.

Before tagging a release you can also run the store's own validator locally:

```bash
npx github:GladysAssistant/integration-store .
```

## Releasing

Open **Actions → Release → Run workflow** and pick `patch`, `minor` or `major`.
The workflow bumps the version everywhere (`package.json` + the manifest's
`version` and `docker_image`), pushes the `vX.Y.Z` tag and builds the
`linux/amd64` + `linux/arm64` image to `ghcr.io`. Do not hand-edit `version` or
`docker_image` in the manifest.

## License

Apache-2.0. UV data © Copernicus Atmosphere Monitoring Service, via Open-Meteo
(CC BY 4.0). Commune data © Etalab / INSEE, via geo.api.gouv.fr.
