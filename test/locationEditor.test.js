// -----------------------------------------------------------------------------
// The three buttons that manage the locations.
//
// The editor takes its whole outside world by injection — `getConfig`,
// `setConfig`, `resolvePostalCode`, `findCreatedDevice` — so every case below
// runs with no Gladys server and no network at all.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
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
 */
function setup({ communes = [NANTES], locations = [], createdDevice = null } = {}) {
  const state = { config: normalizeConfig({ locations }), republished: 0, writes: [] };

  const editor = createLocationEditor({
    getConfig: () => state.config,
    async setConfig(patch) {
      state.writes.push(patch);
      state.config = normalizeConfig({ ...state.config, ...patch });
    },
    async onLocationsChanged() {
      state.republished += 1;
    },
    async findCreatedDevice() {
      return createdDevice;
    },
    async resolvePostalCode(postalCode, city = '') {
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
  });

  return { editor, state };
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
