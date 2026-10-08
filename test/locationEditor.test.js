// -----------------------------------------------------------------------------
// The four buttons that manage the locations.
//
// The editor takes its whole outside world by injection — `getConfig`,
// `setConfig`, `resolvePostalCode`, `findCreatedDevice`, `listHouses` — so every
// case below runs with no Gladys server and no network at all.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import { HOUSE_ACCESS_DENIED } from '../src/houses.js';
import { createLocationEditor } from '../src/locationEditor.js';
import { MAX_LOCATIONS } from '../src/locations.js';

const NANTES = {
  name: 'Nantes',
  code: '44109',
  postalCodes: ['44000', '44100', '44200', '44300'],
  latitude: 47.2172,
  longitude: -1.5534,
  department: 'Loire-Atlantique',
  region: 'Pays de la Loire',
};

const BOURG = {
  name: 'Bourg-en-Bresse',
  code: '01053',
  postalCodes: ['01000'],
  latitude: 46.2051,
  longitude: 5.2257,
  department: 'Ain',
  region: 'Auvergne-Rhône-Alpes',
};

const PERONNAS = {
  name: 'Péronnas',
  code: '01289',
  postalCodes: ['01000'],
  latitude: 46.1794,
  longitude: 5.2222,
  department: 'Ain',
  region: 'Auvergne-Rhône-Alpes',
};

/**
 * An editor wired to an in-memory configuration.
 * @param {object} options
 * @param {Array<object>} [options.communes] what the registry answers
 * @param {Array<object>} [options.locations] the configuration to start from
 * @param {object|null} [options.createdDevice] the device a location already has
 * @param {Array<object>} [options.houses] the houses configured in Gladys
 * @param {Error} [options.houseError] what GET /house fails with, if it does
 * @param {Error} [options.publishError] what re-publishing the devices fails with
 * @param {boolean} [options.slow] every outside call takes a few ticks, the way
 *   the network does — what lets two clicks overlap
 */
function setup({
  communes = [NANTES],
  locations = [],
  createdDevice = null,
  houses = [],
  houseError = null,
  publishError = null,
  slow = false,
} = {}) {
  const state = { config: normalizeConfig({ locations }), republished: 0, writes: [] };
  const later = async () => {
    for (let tick = 0; slow && tick < 3; tick += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  };

  const editor = createLocationEditor({
    getConfig: () => state.config,
    async setConfig(patch) {
      await later();
      state.writes.push(patch);
      state.config = normalizeConfig({ ...state.config, ...patch });
    },
    async onLocationsChanged() {
      await later();
      state.republished += 1;
      if (publishError) {
        throw publishError;
      }
    },
    async findCreatedDevice() {
      return createdDevice;
    },
    async resolvePostalCode(postalCode, city = '') {
      await later();
      const candidates = communes.filter((commune) => commune.postalCodes.includes(postalCode));
      const wanted = String(city).trim().toLowerCase();
      const named = candidates.filter((commune) => commune.name.toLowerCase() === wanted);
      const match =
        wanted === ''
          ? candidates.length === 1
            ? candidates[0]
            : null
          : named.length === 1
            ? named[0]
            : null;
      return { match, candidates };
    },
    async listHouses() {
      await later();
      if (houseError) {
        throw houseError;
      }
      return houses;
    },
  });

  return { editor, state };
}

/** A house as `src/houses.js` normalizes one. */
function house(name, latitude = null, longitude = null) {
  return { id: `h-${name}`, name, selector: name.toLowerCase(), latitude, longitude };
}

test('a postal code becomes a location, named after its commune', async () => {
  const { editor, state } = setup();

  const message = await editor.actions.add_location({ postal_code: '44300' });

  assert.match(message.fr, /Lieu 1 « Nantes » ajouté/);
  assert.match(message.fr, /Découverte/, 'the answer says where the device shows up');
  assert.equal(state.config.locations.length, 1);
  const [location] = state.config.locations;
  assert.equal(location.name, 'Nantes');
  assert.equal(location.postal_code, '44300');
  assert.equal(location.latitude, 47.2172);
  assert.equal(location.address_label, 'Nantes, Loire-Atlantique, Pays de la Loire');
  assert.equal(state.republished, 1, 'the Discovery tab is refreshed on the spot');
});

test('the name the user typed wins over the commune name', async () => {
  const { editor, state } = setup();
  await editor.actions.add_location({ name: 'Maison', postal_code: '44300' });
  assert.equal(state.config.locations[0].name, 'Maison');
});

test('a code covering several communes asks which one, and adds nothing', async () => {
  const { editor, state } = setup({ communes: [BOURG, PERONNAS] });

  const message = await editor.actions.add_location({ postal_code: '01000' });

  assert.match(message.fr, /couvre 2 communes/);
  assert.match(message.fr, /Bourg-en-Bresse/);
  assert.match(message.fr, /Péronnas/);
  assert.equal(state.config.locations.length, 0, 'nothing is picked by coin flip');
});

test('the commune field resolves the ambiguity', async () => {
  const { editor, state } = setup({ communes: [BOURG, PERONNAS] });
  await editor.actions.add_location({ postal_code: '01000', city: 'Péronnas' });
  assert.equal(state.config.locations[0].name, 'Péronnas');
});

test('a commune name matching none of the candidates says so precisely', async () => {
  // A different failure from "which one did you mean": here they must correct
  // what they typed, not add to it.
  const { editor } = setup({ communes: [BOURG, PERONNAS] });
  const message = await editor.actions.add_location({ postal_code: '01000', city: 'Lyon' });
  assert.match(message.fr, /Aucune commune nommée « Lyon »/);
  assert.match(message.fr, /Bourg-en-Bresse/);
});

test('a postal code that is in no commune says so, and points at coordinates', async () => {
  const { editor, state } = setup();
  const message = await editor.actions.add_location({ postal_code: '99999' });
  assert.match(message.fr, /Aucune commune française/);
  assert.match(message.fr, /latitude/, 'the way out for a place abroad');
  assert.equal(state.config.locations.length, 0);
});

test('something that is not a postal code never reaches the registry', async () => {
  const { editor, state } = setup();
  const message = await editor.actions.add_location({ postal_code: 'Nantes' });
  assert.match(message.fr, /cinq chiffres/);
  assert.equal(state.config.locations.length, 0);
});

test('an empty form says what to fill in', async () => {
  const { editor } = setup();
  const message = await editor.actions.add_location({});
  assert.match(message.fr, /code postal/);
  assert.match(message.fr, /latitude/);
});

test('coordinates typed by hand add a point anywhere in the world', async () => {
  const { editor, state } = setup();

  const message = await editor.actions.add_location({
    name: 'Sydney',
    latitude: '-33.8688',
    longitude: '151.2093',
  });

  assert.match(message.fr, /Lieu 1 « Sydney » ajouté/);
  const [location] = state.config.locations;
  assert.equal(location.latitude, -33.8688);
  assert.equal(location.longitude, 151.2093);
  assert.equal(location.postal_code, '', 'a foreign place has no French postal code');
});

test('a coordinate typed with a comma is a coordinate', async () => {
  // A French keyboard types "48,8566", and the field is a `string` for it.
  const { editor, state } = setup();
  await editor.actions.add_location({ name: 'X', latitude: '48,8566', longitude: '2,3522' });
  assert.equal(state.config.locations[0].latitude, 48.8566);
});

test('coordinates win over the postal code, which becomes a label', async () => {
  const { editor, state } = setup();
  await editor.actions.add_location({
    postal_code: '44300',
    latitude: '47.5',
    longitude: '-1.5',
  });
  const [location] = state.config.locations;
  assert.equal(location.latitude, 47.5, 'the point the user gave, not the centroid');
  assert.equal(location.postal_code, '44300', 'kept as a label');
});

test('half a point is refused rather than taken as a point', async () => {
  // A lone latitude with a longitude of 0 would silently watch the Gulf of
  // Guinea.
  const { editor, state } = setup();
  const message = await editor.actions.add_location({ name: 'X', latitude: '48.8566' });
  assert.match(message.fr, /vont ensemble/);
  assert.equal(state.config.locations.length, 0);
});

test('an impossible coordinate is refused', async () => {
  const { editor } = setup();
  const message = await editor.actions.add_location({ latitude: '300', longitude: '2' });
  assert.match(message.fr, /-90 à 90/);
});

test('the same point is not added twice', async () => {
  const { editor, state } = setup();
  await editor.actions.add_location({ postal_code: '44300' });
  const message = await editor.actions.add_location({ name: 'Encore', postal_code: '44300' });
  assert.match(message.fr, /déjà surveillé par le lieu 1 « Nantes »/);
  assert.equal(state.config.locations.length, 1);
});

test('the list is capped, and the cap is explained', async () => {
  const locations = Array.from({ length: MAX_LOCATIONS }, (unused, index) => ({
    id: `loc-${index}`,
    name: `Lieu ${index}`,
    latitude: String(40 + index),
    longitude: '2',
  }));
  const { editor, state } = setup({ locations });

  const message = await editor.actions.add_location({ postal_code: '44300' });

  assert.match(message.fr, new RegExp(`Maximum ${MAX_LOCATIONS}`));
  assert.equal(state.config.locations.length, MAX_LOCATIONS);
});

test('one click turns the Gladys houses into locations', async () => {
  const { editor, state } = setup({
    houses: [house('Maison', 47.2172, -1.5534), house('Chalet', 46.5, 6.6)],
  });

  const message = await editor.actions.import_houses();

  assert.match(message.fr, /2 maison\(s\) Gladys ajoutée\(s\)/);
  assert.match(message.fr, /Découverte/, 'the answer says where the devices show up');
  assert.equal(state.config.locations.length, 2);
  const [maison, chalet] = state.config.locations;
  assert.equal(maison.name, 'Maison');
  assert.equal(maison.latitude, 47.2172);
  assert.equal(maison.postal_code, '', 'a house is a point, not an address');
  assert.equal(chalet.name, 'Chalet');
  assert.equal(state.republished, 1, 'the whole import is ONE write and ONE refresh');
  assert.equal(state.writes.length, 1);
});

test('a house already watched is named rather than added twice', async () => {
  const { editor, state } = setup({
    locations: [{ id: 'loc-1', name: 'Domicile', latitude: '47.2172', longitude: '-1.5534' }],
    houses: [house('Maison', 47.2172, -1.5534), house('Chalet', 46.5, 6.6)],
  });

  const message = await editor.actions.import_houses();

  assert.match(message.fr, /1 maison\(s\) Gladys ajoutée\(s\)/);
  assert.match(message.fr, /déjà le lieu 1 « Domicile »/);
  assert.equal(state.config.locations.length, 2);
});

test('a house with no position on the map is not watched at (0, 0)', async () => {
  const { editor, state } = setup({ houses: [house('Bureau'), house('Maison', 47.2172, -1.5534)] });

  const message = await editor.actions.import_houses();

  assert.match(message.fr, /Sans position sur la carte/);
  assert.match(message.fr, /« Bureau »/);
  assert.match(message.fr, /Réglages > Maisons/);
  assert.equal(state.config.locations.length, 1);
  assert.equal(state.config.locations[0].name, 'Maison');
});

test('nothing to import writes nothing at all', async () => {
  const { editor, state } = setup({
    locations: [{ id: 'loc-1', name: 'Domicile', latitude: '47.2172', longitude: '-1.5534' }],
    houses: [house('Maison', 47.2172, -1.5534)],
  });

  const message = await editor.actions.import_houses();

  assert.match(message.fr, /Aucune maison à ajouter/);
  assert.equal(state.writes.length, 0, 'no write means no needless Discovery refresh');
  assert.equal(state.republished, 0);
});

test('an instance with no house says where to create one', async () => {
  const { editor } = setup({ houses: [] });
  const message = await editor.actions.import_houses();
  assert.match(message.fr, /aucune maison/i);
  assert.match(message.fr, /Réglages > Maisons/);
});

test('a refused permission tells the user to re-install, not to retry', async () => {
  // A 403 is the install screen's answer, not an outage: nothing the user does
  // in this screen grants it.
  const denied = Object.assign(new Error('HTTP 403'), { code: HOUSE_ACCESS_DENIED });
  const { editor, state } = setup({ houseError: denied });

  const message = await editor.actions.import_houses();

  assert.match(message.fr, /réinstallez/i);
  assert.match(message.en, /re-install/i);
  assert.equal(state.config.locations.length, 0);
});

test('the houses being unreadable falls back on the postal code, and never throws', async () => {
  const { editor } = setup({ houseError: new Error('Gladys host API HTTP 500') });
  const message = await editor.actions.import_houses();
  assert.match(message.fr, /HTTP 500/);
  assert.match(message.fr, /code postal/);
});

test('the import respects the cap and names what it left out', async () => {
  const locations = Array.from({ length: MAX_LOCATIONS - 1 }, (unused, index) => ({
    id: `loc-${index}`,
    name: `Lieu ${index}`,
    latitude: String(40 + index),
    longitude: '2',
  }));
  const { editor, state } = setup({
    locations,
    houses: [house('Maison', 47.2172, -1.5534), house('Chalet', 46.5, 6.6)],
  });

  const message = await editor.actions.import_houses();

  assert.equal(state.config.locations.length, MAX_LOCATIONS);
  assert.match(message.fr, new RegExp(`Maximum de ${MAX_LOCATIONS} lieux`));
  assert.match(message.fr, /« Chalet »/);
});

test('an imported house is an ordinary location, deleted like any other', async () => {
  const { editor, state } = setup({ houses: [house('Maison', 47.2172, -1.5534)] });
  await editor.actions.import_houses();

  const message = await editor.actions.remove_location({ location: '1', confirmation: true });

  assert.match(message.fr, /supprimé/);
  assert.equal(state.config.locations.length, 0);
});

test('the listing numbers the locations the delete dropdown offers', async () => {
  const { editor } = setup();
  await editor.actions.add_location({ postal_code: '44300' });
  await editor.actions.add_location({ name: 'Chalet', latitude: '46.5', longitude: '6.6' });

  const message = await editor.actions.list_locations();

  assert.match(message.fr, /2\/20 lieu/);
  assert.match(message.fr, /1\. Nantes|𝟏\. 𝐍𝐚𝐧𝐭𝐞𝐬/u);
  assert.match(message.fr, /44300/);
  assert.match(message.fr, /Chalet|𝐂𝐡𝐚𝐥𝐞𝐭/u);
});

test('an empty listing tells the user what to do', async () => {
  const { editor } = setup();
  const message = await editor.actions.list_locations();
  assert.match(message.fr, /Aucun lieu/);
});

test('a deletion is confirmed before it happens', async () => {
  const { editor, state } = setup();
  await editor.actions.add_location({ postal_code: '44300' });

  const preview = await editor.actions.remove_location({ location: '1' });

  assert.match(preview.fr, /Cochez « Je confirme »/);
  assert.match(preview.fr, /Nantes/, 'the preview names what would be lost');
  assert.equal(state.config.locations.length, 1, 'nothing removed without the tick');
});

test('a confirmed deletion removes the location and refreshes Discovery', async () => {
  const { editor, state } = setup();
  await editor.actions.add_location({ postal_code: '44300' });
  const republishedBefore = state.republished;

  const message = await editor.actions.remove_location({ location: '1', confirmation: true });

  assert.match(message.fr, /supprimé/);
  assert.match(message.fr, /Découverte/);
  assert.equal(state.config.locations.length, 0);
  assert.equal(state.republished, republishedBefore + 1);
});

test('deleting a location whose device exists says the device stays behind', async () => {
  // An integration can stop OFFERING a device; it cannot delete one the user
  // created. Saying nothing would leave a sensor that never updates again.
  const { editor } = setup({ createdDevice: { name: 'Indice UV — Nantes' } });
  await editor.actions.add_location({ postal_code: '44300' });

  const message = await editor.actions.remove_location({ location: '1', confirmation: true });

  assert.match(message.fr, /Indice UV — Nantes/);
  assert.match(message.fr, /supprimez-le vous-même/i);
});

test('deleting from the middle warns that the numbers moved', async () => {
  // Those numbers are what this very dropdown offers.
  const { editor } = setup();
  await editor.actions.add_location({ name: 'A', latitude: '40', longitude: '1' });
  await editor.actions.add_location({ name: 'B', latitude: '41', longitude: '1' });
  await editor.actions.add_location({ name: 'C', latitude: '42', longitude: '1' });

  const message = await editor.actions.remove_location({ location: '2', confirmation: true });

  assert.match(message.fr, /remontent d'un rang/);
});

test('deleting the last one warns about nothing', async () => {
  const { editor } = setup();
  await editor.actions.add_location({ name: 'A', latitude: '40', longitude: '1' });
  await editor.actions.add_location({ name: 'B', latitude: '41', longitude: '1' });

  const message = await editor.actions.remove_location({ location: '2', confirmation: true });

  assert.ok(!/remontent/.test(message.fr));
});

test('deleting a number nobody has lists the ones that exist', async () => {
  const { editor } = setup();
  await editor.actions.add_location({ postal_code: '44300' });
  const message = await editor.actions.remove_location({ location: '7', confirmation: true });
  assert.match(message.fr, /pas de lieu 7/);
  assert.match(message.fr, /Nantes|𝐍𝐚𝐧𝐭𝐞𝐬/u);
});

test('deleting from an empty list says there is nothing to delete', async () => {
  const { editor } = setup();
  const message = await editor.actions.remove_location({ location: '1', confirmation: true });
  assert.match(message.fr, /Aucun lieu/);
});

test('every answer is a multi-language object, never a thrown string', async () => {
  // The SDK acks a thrown error as a plain English string, which a French
  // screen then shows as-is.
  const { editor } = setup({ communes: [BOURG, PERONNAS] });
  const answers = [
    await editor.actions.add_location({}),
    await editor.actions.add_location({ postal_code: 'x' }),
    await editor.actions.add_location({ postal_code: '01000' }),
    await editor.actions.add_location({ postal_code: '99999' }),
    await editor.actions.add_location({ latitude: '1' }),
    await editor.actions.import_houses(),
    await editor.actions.list_locations(),
    await editor.actions.remove_location({ location: '1' }),
  ];
  for (const answer of answers) {
    assert.equal(typeof answer.en, 'string', JSON.stringify(answer));
    assert.equal(typeof answer.fr, 'string', JSON.stringify(answer));
  }
});

test('what is written to the configuration is what can be read back', async () => {
  const { editor, state } = setup();
  await editor.actions.add_location({ postal_code: '44300' });

  const [patch] = state.writes;
  assert.deepEqual(Object.keys(patch), ['locations']);
  const [stored] = patch.locations;
  assert.equal(stored.latitude, '47.2172', 'coordinates are stored as text');
  assert.equal(stored.postal_code, '44300');
});

// --- One change at a time -----------------------------------------------------

test('two clicks close together both add their location', async () => {
  // Both read the list, wait for the network, then write it: without the queue
  // the second write would erase the first location.
  const { editor, state } = setup({ communes: [NANTES, BOURG], slow: true });

  const [first, second] = await Promise.all([
    editor.actions.add_location({ postal_code: '44300' }),
    editor.actions.add_location({ postal_code: '01000' }),
  ]);

  assert.match(first.fr, /Lieu 1 « Nantes » ajouté/);
  assert.match(second.fr, /Lieu 2 « Bourg-en-Bresse » ajouté/);
  assert.deepEqual(
    state.config.locations.map((location) => location.name),
    ['Nantes', 'Bourg-en-Bresse'],
  );
});

test('a removal clicked during an addition removes only its own location', async () => {
  const { editor, state } = setup({
    communes: [NANTES, BOURG],
    slow: true,
    locations: [{ id: 'loc-1', name: 'Vieux', latitude: '45', longitude: '4' }],
  });

  await Promise.all([
    editor.actions.add_location({ postal_code: '44300' }),
    editor.actions.remove_location({ location: '1', confirmation: true }),
  ]);

  assert.deepEqual(
    state.config.locations.map((location) => location.name),
    ['Nantes'],
  );
});

test('a click that fails does not block the next one', async () => {
  let config = normalizeConfig();
  let lookups = 0;
  const editor = createLocationEditor({
    getConfig: () => config,
    async setConfig(patch) {
      config = normalizeConfig({ ...config, ...patch });
    },
    onLocationsChanged: async () => {},
    async resolvePostalCode() {
      lookups += 1;
      if (lookups === 1) {
        throw new Error('registry down');
      }
      return { match: NANTES, candidates: [NANTES] };
    },
  });

  const [first, second] = await Promise.allSettled([
    editor.actions.add_location({ postal_code: '44300' }),
    editor.actions.add_location({ postal_code: '44300' }),
  ]);

  assert.equal(first.status, 'rejected');
  assert.match(first.reason.message, /registry down/);
  assert.equal(second.status, 'fulfilled');
  assert.match(second.value.fr, /ajouté/);
  assert.equal(config.locations.length, 1);
});

test('a full list is checked again after the lookup', async () => {
  // Another click may have filled the list while this one waited for the
  // network: the list written is the one read last.
  const full = Array.from({ length: MAX_LOCATIONS - 1 }, (_, index) => ({
    id: `loc-${index}`,
    name: `Lieu ${index}`,
    latitude: String(10 + index),
    longitude: '1',
  }));
  const { editor, state } = setup({ communes: [NANTES, BOURG], slow: true, locations: full });

  const [first, second] = await Promise.all([
    editor.actions.add_location({ postal_code: '44300' }),
    editor.actions.add_location({ postal_code: '01000' }),
  ]);

  assert.match(first.fr, /ajouté/);
  assert.match(second.fr, /Maximum/);
  assert.equal(state.config.locations.length, MAX_LOCATIONS);
});

// --- Saved, but not published ------------------------------------------------

test('a location saved but not published says both, with the reason', async () => {
  const { editor, state } = setup({ publishError: new Error('BAD_REQUEST: unknown category') });

  const message = await editor.actions.add_location({ postal_code: '44300' });

  assert.equal(state.config.locations.length, 1, 'the write is not undone');
  assert.match(message.fr, /Lieu 1 « Nantes » ajouté/);
  assert.match(message.fr, /enregistré, mais la publication des appareils dans Gladys a échoué/);
  assert.match(message.en, /saved, but publishing the devices to Gladys failed/);
  assert.match(message.en, /unknown category/);
  assert.doesNotMatch(message.en, /Add its device from the Discovery tab/);
});

test('a removal saved but not published does not promise the Discovery tab', async () => {
  const { editor, state } = setup({
    locations: [{ id: 'loc-1', name: 'Maison', latitude: '45', longitude: '4' }],
    publishError: new Error('timeout'),
  });

  const message = await editor.actions.remove_location({ location: '1', confirmation: true });

  assert.equal(state.config.locations.length, 0);
  assert.match(message.en, /Location "Maison" removed\./);
  assert.match(message.en, /publishing the devices to Gladys failed: timeout/);
  assert.doesNotMatch(message.en, /no longer offered/);
});

test('an import saved but not published says so', async () => {
  const { editor, state } = setup({
    houses: [house('Maison', 47.2, -1.55)],
    publishError: new Error('timeout'),
  });

  const message = await editor.actions.import_houses();

  assert.equal(state.config.locations.length, 1);
  assert.match(message.fr, /1 maison\(s\) Gladys ajoutée\(s\) :/);
  assert.match(message.fr, /la publication des appareils dans Gladys a échoué : timeout/);
});
