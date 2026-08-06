import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeLocation,
  describeLocations,
  findLocationAtPoint,
  hasCoordinates,
  LOCATION_LINE_MARKER,
  locationAtPosition,
  locationDetail,
  newLocationId,
  normalizeLocations,
  positionOf,
  removeLocation,
  serializeLocations,
  upsertLocation,
  usableLocations,
} from '../src/locations.js';
import { boldLabel } from '../src/richText.js';

const NANTES = {
  id: 'loc-abc12345',
  name: 'Maison',
  postal_code: '44300',
  address_label: 'Nantes, Loire-Atlantique, Pays de la Loire',
  latitude: '47.2172',
  longitude: '-1.5534',
};

test('a stored location is parsed into numbers', () => {
  const [location] = normalizeLocations([NANTES]);
  assert.equal(location.id, 'loc-abc12345');
  assert.equal(location.postal_code, '44300');
  assert.equal(location.latitude, 47.2172);
  assert.equal(location.longitude, -1.5534);
});

test('the list survives arriving as a JSON string', () => {
  // Depending on the round trip through the host API it can be either.
  const locations = normalizeLocations(JSON.stringify([NANTES]));
  assert.equal(locations.length, 1);
  assert.equal(locations[0].name, 'Maison');
});

test('anything that is not a list degrades to an empty one', () => {
  for (const value of ['oops', null, undefined, 42, { id: 'x' }]) {
    assert.deepEqual(normalizeLocations(value), []);
  }
});

test('a location with a malformed coordinate is kept, not dropped', () => {
  // Losing a location because a stored value was mangled would be worse than
  // showing it as unconfigured — which is what `hasCoordinates` reports.
  const [location] = normalizeLocations([{ ...NANTES, latitude: 'nonsense' }]);
  assert.equal(location.name, 'Maison');
  assert.equal(location.latitude, null);
  assert.equal(hasCoordinates(location), false);
  assert.deepEqual(usableLocations([location]), []);
});

test('a lone coordinate is not a point', () => {
  assert.equal(hasCoordinates({ latitude: 47.2, longitude: null }), false);
  assert.equal(hasCoordinates({ latitude: 47.2, longitude: 0 }), true);
});

test('a duplicated id is refused: two devices under one external_id', () => {
  const locations = normalizeLocations([NANTES, { ...NANTES, name: 'Bureau' }]);
  assert.equal(locations.length, 1);
  assert.equal(locations[0].name, 'Maison');
});

test('a location with no id at all is given one', () => {
  const [location] = normalizeLocations([{ name: 'X', latitude: '1', longitude: '2' }]);
  assert.match(location.id, /^loc-[a-z0-9]{8}$/);
});

test('an id is never reused', () => {
  // It becomes the device external_id: a reused one would hand a deleted
  // location's history to the next one created.
  const existing = Array.from({ length: 50 }, () => ({ id: newLocationId() }));
  assert.ok(!existing.some((location) => location.id === newLocationId(existing)));
});

test('a round trip through storage changes nothing', () => {
  const locations = normalizeLocations([NANTES]);
  assert.deepEqual(normalizeLocations(serializeLocations(locations)), locations);
});

test('an unusable coordinate is stored as an empty string, never as 0', () => {
  const locations = normalizeLocations([{ ...NANTES, longitude: '' }]);
  assert.equal(serializeLocations(locations)[0].longitude, '');
});

test('adding a location appends it, updating one keeps its place', () => {
  const locations = normalizeLocations([NANTES]);
  const two = upsertLocation(locations, {
    name: 'Bureau',
    postal_code: '75001',
    latitude: '48.86',
    longitude: '2.35',
  });
  assert.equal(two.length, 2);
  assert.equal(positionOf(two, two[1].id), 2);

  const renamed = upsertLocation(two, { id: NANTES.id, name: 'Jardin' });
  assert.equal(renamed.length, 2);
  assert.equal(renamed[0].name, 'Jardin');
  assert.equal(renamed[0].postal_code, '44300', 'renaming must not blank the commune');
  assert.equal(renamed[0].latitude, 47.2172);
});

test('nothing mutates: upsert and remove return new lists', () => {
  const locations = normalizeLocations([NANTES]);
  upsertLocation(locations, { name: 'Bureau', latitude: '1', longitude: '2' });
  removeLocation(locations, NANTES.id);
  assert.equal(locations.length, 1);
  assert.equal(locations[0].name, 'Maison');
});

test('the same point is not watched twice', () => {
  // Two devices on one grid cell report the same numbers under two names.
  const locations = normalizeLocations([NANTES]);
  assert.ok(findLocationAtPoint(locations, { latitude: 47.2172, longitude: -1.5534 }));
  assert.ok(findLocationAtPoint(locations, { latitude: 47.21720001, longitude: -1.5534 }));
  assert.equal(findLocationAtPoint(locations, { latitude: 48.86, longitude: 2.35 }), undefined);
});

test('a position designates a location, and an out-of-range one designates none', () => {
  const locations = normalizeLocations([NANTES, { ...NANTES, id: 'loc-2' }]);
  assert.equal(locationAtPosition(locations, '2').id, 'loc-2');
  assert.equal(locationAtPosition(locations, '3'), null);
  assert.equal(locationAtPosition(locations, '0'), null);
  assert.equal(locationAtPosition(locations, 'x'), null);
});

test('the listing shows the postal code, the commune and the point', () => {
  const [location] = normalizeLocations([NANTES]);
  assert.equal(
    locationDetail(location),
    '44300 Nantes, Loire-Atlantique, Pays de la Loire (47.21720, -1.55340)',
  );
  assert.match(describeLocation(location), /^Maison — 44300 Nantes/);
});

test('a location with no usable point shows a dash, not nothing', () => {
  // It is neither published nor queried, and this line is the only thing saying
  // so.
  const [location] = normalizeLocations([{ ...NANTES, latitude: '' }]);
  assert.equal(locationDetail(location), '44300 Nantes, Loire-Atlantique, Pays de la Loire (—)');
});

test('a point added by hand, with no commune, shows just its coordinates', () => {
  const [location] = normalizeLocations([
    { id: 'loc-1', name: 'Chalet', latitude: '46.5', longitude: '6.6' },
  ]);
  assert.equal(locationDetail(location), '46.50000, 6.60000');
});

test('every entry of a listing opens with the marker and its number', () => {
  // The newline does not survive the Configuration screen; the bullet does.
  const locations = normalizeLocations([NANTES, { ...NANTES, id: 'loc-2', name: 'Bureau' }]);
  const lines = describeLocations(locations).split('\n');
  assert.equal(lines.length, 2);
  for (const line of lines) {
    assert.ok(line.startsWith(LOCATION_LINE_MARKER), line);
  }
  // The label that opens an entry is the ONE thing shown in bold, and the only
  // bold the screen renders is bold CHARACTERS (see src/richText.js) — so the
  // number and the name are literally other code points here.
  assert.ok(lines[1].includes(boldLabel('2. Bureau')), lines[1]);
  assert.ok(lines[1].includes('44300'), 'the detail stays plain, and searchable');
});

test('an empty list says so rather than printing nothing', () => {
  assert.match(describeLocations([]), /aucun lieu/i);
});
