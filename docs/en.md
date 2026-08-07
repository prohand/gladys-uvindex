# UV index

This integration follows the **UV index** of the locations you choose. You add
your **Gladys houses in one click**, or a location by its **French postal code**,
and a device shows up in the **Discovery** tab, ready to be added to Gladys.

No account to create, no API key to paste: both sources are public open data.

## Adding your Gladys houses, in one click

You have already told Gladys where you live: that is the map in **Settings >
Houses**. The **"Add my Gladys houses"** button reads those houses and creates a
location for each one that is not watched yet — no postal code to type.

Three things to know:

- **The access is a permission.** Where you live is personal data: Gladys only
  shares it if you accepted the request on the integration's install screen. If
  the button answers that the access is refused, remove and re-install the
  integration, accepting the request it shows.
- **A house you never placed on the map has no coordinates.** It is named in the
  answer; locate it in Settings > Houses and run the action again.
- **This is not a sync.** The houses are read at the moment you click. What comes
  out is an ordinary location, renamed and removed like the others, and a house
  moved in Gladys afterwards does not move its location.

Clicking again is safe: a house that is already watched is reported, not added a
second time.

## Adding a location

In the integration's Configuration screen, click **"Add a location"** and fill
the form in:

- **Location name** — optional. Left empty, the name of the commune found is
  used ("Nantes").
- **Postal code** — five digits, e.g. `44300`. This is the normal way in.
- **Commune** — optional, and only needed when a postal code covers several
  communes. `01000` is Bourg-en-Bresse, Péronnas _and_ Saint-Denis-lès-Bourg:
  run the action without this field first, the answer displayed under the button
  lists the candidates, then run it again with the one you mean.
- **Latitude / Longitude** — optional. Filled in together, they are used as they
  are and the postal code above becomes a mere label.

The message under the button confirms what was added, with the commune it
resolved to and its point. **The device is not created automatically**: go and
pick it up in the integration's **Discovery** tab.

### A location outside France

The postal code is French by construction — it is the French state's registry
that resolves it. The UV data itself is worldwide: for a place abroad, leave the
postal code empty and fill in the **latitude** and **longitude** in WGS-84
decimal degrees. A decimal comma is accepted (`48,8566`).

## Listing and removing your locations

- **"Show my locations"** lists everything configured, numbered. Each entry opens
  with a "•" followed by its number.
- **"Remove a location"** asks for that number — the one the listing prints —
  and then for a confirmation. Run the action once **without ticking** the box to
  check which location would go.

Two things to know about removal:

1. **The Gladys device is not deleted.** An integration is not allowed to delete
   a device; it can only stop offering it. The location leaves the Discovery tab
   and the device stops updating — delete it yourself from the integration's
   **Devices** tab if you no longer want it. The removal message names it for
   you.
2. **The following numbers move up one rank.** Removing location 2 of 4 makes the
   old location 3 into location 2. Run "Show my locations" again before removing
   another one.

## What each device measures

| Feature                  | What it is                                                                      |
| ------------------------ | ------------------------------------------------------------------------------- |
| UV index                 | The index right now, as a whole number                                          |
| UV index max today       | Today's peak — the number to plan an afternoon around                           |
| UV index (clear sky)     | What it would be with no clouds; the gap with the real index is the cloud cover |
| UV exposure level        | 0–5, the WHO categories: the feature to test in a scene                         |
| UV exposure level (text) | Its wording: "Low", "High"…                                                     |
| Sun protection advice    | The WHO recommendation for that level                                           |

### The scale

The **Global Solar UV Index** is defined by the WHO, WMO, UNEP and ICNIRP. It is
open-ended, reported as a whole number, and read by category:

| UV index | Level published | Wording   | Protection                                            |
| -------- | --------------- | --------- | ----------------------------------------------------- |
| 0        | 0               | None      | None: no radiation                                    |
| 1–2      | 1               | Low       | No protection needed                                  |
| 3–5      | 2               | Moderate  | Shade around midday, hat, sunglasses, sunscreen       |
| 6–7      | 3               | High      | Avoid the sun between 12:00 and 16:00                 |
| 8–10     | 4               | Very high | Avoid being outside between 12:00 and 16:00, cover up |
| 11+      | 5               | Extreme   | Unprotected skin burns within minutes                 |

Level **0** is this integration's addition: the WHO's lowest band, "low", covers
0 to 2, but "there is no UV at all right now" deserves its own value in a home —
it is what a scene fires on at dusk.

### A missing value is never a zero

When the model has no value for a location, **nothing is published** for that
feature and the device keeps its last known value. Publishing a 0 would look like
sunset in the middle of the afternoon, and would fire the scenes that watch for
it.

## General settings

- **Language of the device names** — everything else this integration says
  already follows your Gladys language, but a device name and its feature names
  are stored as they are the moment you create the device. A device already added
  **keeps** the names it was created with: change the language, then delete the
  device and add it again from the Discovery tab to rename it.
- **Refresh interval** — 30 minutes by default, between 10 minutes and 6 hours.
  The CAMS forecast is hourly, so there is nothing to gain from going much below
  half an hour.

## Checking that it works

The **"Test the UV provider"** button queries the source live for every location
and shows the index it got, in the same numbered format as the location listing.
If one location fails, its line says why and the others still answer.

The Supervision screen also shows the integration's status: while no location is
configured, it says one has to be added.

## Where the data comes from

- **The UV index**: the European [Copernicus
  CAMS](https://atmosphere.copernicus.eu/) service, which computes the
  biologically effective UV dose from the total column ozone, the aerosols and
  the cloud cover. Its forecast is republished as open data by
  [Open-Meteo](https://open-meteo.com/en/docs/air-quality-api) (CC BY 4.0), with
  no account and no key. Worldwide coverage, hourly resolution, ~45 km grid.
- **The postal codes**: the French state's [API Découpage
  administratif](https://geo.api.gouv.fr/decoupage-administratif/communes),
  published on data.gouv.fr from the INSEE administrative database. It gives the
  communes a postal code covers and their centroid.

Météo-France publishes a French UV forecast too, but its portal requires an
account and an application token every user would have to create before the
integration showed anything at all. Copernicus is just as official and asks for
nothing.
