// -----------------------------------------------------------------------------
// The postal code registry. `globalThis.fetch` is stubbed per test and restored
// afterwards: these tests never touch the network.
// -----------------------------------------------------------------------------

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  communeContext,
  describeCommune,
  normalizePostalCode,
  normalizeText,
  pickCommune,
  resolvePostalCode,
  searchCommunes,
} from '../src/communes.js';

const realFetch = globalThis.fetch;
let requests = [];

function stubFetch(payload, { ok = true, status = 200 } = {}) {
  requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return { ok, status, json: async () => payload };
  };
}

/** The registry's own shape, as `geo.api.gouv.fr` answers it. */
function apiCommune(nom, code, [longitude, latitude], departement, region, codesPostaux = []) {
  return {
    nom,
    code,
    codesPostaux,
    centre: { type: 'Point', coordinates: [longitude, latitude] },
    departement: { nom: departement },
    region: { nom: region },
  };
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

test('a postal code is five digits, spaces tolerated', () => {
  assert.equal(normalizePostalCode('44300'), '44300');
  assert.equal(normalizePostalCode(' 44 300 '), '44300');
  assert.equal(normalizePostalCode('01000'), '01000', 'a leading zero is not dropped');
});

test('anything that is not five digits is not a postal code', () => {
  for (const value of ['4430', '443000', 'Nantes', '4430A', '', null, undefined, 44300.5]) {
    assert.equal(normalizePostalCode(value), '', `"${value}"`);
  }
});

test('a number keeps its leading zero only as text', () => {
  // 01000 typed as a number is 1000: four digits, and not a postal code. The
  // field is a `string` in the manifest precisely so this cannot happen.
  assert.equal(normalizePostalCode(1000), '');
});

test('names are compared without accents, case, hyphens or apostrophes', () => {
  // Nobody types a commune the way the registry spells it.
  assert.equal(normalizeText('Saint-Étienne'), normalizeText('saint etienne'));
  assert.equal(normalizeText("L'Haÿ-les-Roses"), normalizeText('l hay les roses'));
  assert.equal(normalizeText('  BOURG-EN-BRESSE '), 'bourg en bresse');
});

test('the lookup asks the official registry for the commune centroid', async () => {
  stubFetch([
    apiCommune('Nantes', '44109', [-1.5534, 47.2172], 'Loire-Atlantique', 'Pays de la Loire'),
  ]);

  const communes = await searchCommunes('44300');

  const [url] = requests;
  assert.match(url, /geo\.api\.gouv\.fr\/communes/);
  assert.match(url, /codePostal=44300/);
  assert.match(url, /geometry=centre/);
  assert.equal(communes.length, 1);
  assert.equal(communes[0].name, 'Nantes');
  assert.equal(communes[0].code, '44109');
  assert.equal(communes[0].department, 'Loire-Atlantique');
});

test('a GeoJSON centre is read as [longitude, latitude], not the other way round', async () => {
  // Getting this backwards puts Nantes in the Indian Ocean, silently.
  stubFetch([
    apiCommune('Nantes', '44109', [-1.5534, 47.2172], 'Loire-Atlantique', 'Pays de la Loire'),
  ]);
  const [commune] = await searchCommunes('44300');
  assert.equal(commune.latitude, 47.2172);
  assert.equal(commune.longitude, -1.5534);
});

test('a commune without a centre is not a place we can query', async () => {
  stubFetch([
    { nom: 'Sans centre', code: '99999', codesPostaux: ['44300'] },
    apiCommune('Nantes', '44109', [-1.5534, 47.2172], 'Loire-Atlantique', 'Pays de la Loire'),
  ]);
  const communes = await searchCommunes('44300');
  assert.deepEqual(
    communes.map((commune) => commune.name),
    ['Nantes'],
  );
});

test('an invalid postal code never reaches the network', async () => {
  stubFetch([]);
  assert.deepEqual(await searchCommunes('oops'), []);
  assert.equal(requests.length, 0);
});

test('an HTTP failure propagates, so the caller can report it', async () => {
  stubFetch([], { ok: false, status: 500 });
  await assert.rejects(() => searchCommunes('44300'), /HTTP 500/);
});

test('one commune for a code is the answer', () => {
  const communes = [{ name: 'Nantes' }];
  assert.equal(pickCommune(communes), communes[0]);
});

test('several communes for a code are not resolved by coin flip', () => {
  // Reporting the UV of the wrong town is a failure nobody would notice.
  const communes = [{ name: 'Bourg-en-Bresse' }, { name: 'Péronnas' }];
  assert.equal(pickCommune(communes), null);
});

test('the commune field is what resolves an ambiguous code', () => {
  const communes = [{ name: 'Bourg-en-Bresse' }, { name: 'Péronnas' }];
  assert.equal(pickCommune(communes, 'Péronnas').name, 'Péronnas');
  assert.equal(pickCommune(communes, 'peronnas').name, 'Péronnas');
  assert.equal(pickCommune(communes, 'bourg en bresse').name, 'Bourg-en-Bresse');
});

test('a commune name matching none of the candidates resolves nothing', () => {
  const communes = [{ name: 'Bourg-en-Bresse' }, { name: 'Péronnas' }];
  assert.equal(pickCommune(communes, 'Lyon'), null);
});

test('a commune is described by what tells two homonyms apart', () => {
  const commune = { name: 'Saint-Martin', department: 'Ardèche', region: 'Auvergne-Rhône-Alpes' };
  assert.equal(communeContext(commune), 'Ardèche, Auvergne-Rhône-Alpes');
  assert.equal(describeCommune(commune), 'Saint-Martin (Ardèche, Auvergne-Rhône-Alpes)');
  assert.equal(describeCommune({ name: 'Nulle part' }), 'Nulle part');
});

test('resolvePostalCode hands back both the match and the candidates', async () => {
  stubFetch([
    apiCommune('Bourg-en-Bresse', '01053', [5.2257, 46.2051], 'Ain', 'Auvergne-Rhône-Alpes'),
    apiCommune('Péronnas', '01289', [5.2222, 46.1794], 'Ain', 'Auvergne-Rhône-Alpes'),
  ]);

  const ambiguous = await resolvePostalCode('01000');
  assert.equal(ambiguous.match, null);
  assert.equal(ambiguous.candidates.length, 2, 'the candidates are what the message lists');

  const resolved = await resolvePostalCode('01000', 'Péronnas');
  assert.equal(resolved.match.name, 'Péronnas');
});
