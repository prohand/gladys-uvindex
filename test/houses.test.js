// -----------------------------------------------------------------------------
// Reading the Gladys houses through the SDK (`gladys.getHouses()`).
//
// The SDK is stood in for by a one-method object: these tests never touch the
// network.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GladysApiError } from '@gladysassistant/integration-sdk';
import { fetchHouses, HOUSE_ACCESS_DENIED, normalizeHouse } from '../src/houses.js';

/** An SDK whose `getHouses` answers `body`, or throws `error`. */
function sdkAnswering({ body = [], error = null } = {}) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async getHouses() {
      calls += 1;
      if (error) {
        throw error;
      }
      return body;
    },
  };
}

test('the houses are read through the SDK, in the order the core sorted them', async () => {
  const gladys = sdkAnswering({
    body: [
      { id: 'h1', name: 'Bureau', selector: 'bureau', latitude: 47.2, longitude: -1.55 },
      { id: 'h2', name: 'Maison', selector: 'maison', latitude: 48.85, longitude: 2.35 },
    ],
  });
  const houses = await fetchHouses(gladys);

  assert.equal(gladys.calls, 1);
  assert.deepEqual(
    houses.map((house) => house.name),
    ['Bureau', 'Maison'],
  );
  assert.equal(houses[0].latitude, 47.2);
});

test('a house that was never placed on the map has no coordinates, not a zero', async () => {
  const gladys = sdkAnswering({
    body: [{ id: 'h1', name: 'Chalet', selector: 'chalet', latitude: null, longitude: null }],
  });
  const [house] = await fetchHouses(gladys);
  assert.equal(house.latitude, null);
  assert.equal(house.longitude, null);
});

test('a refused access is told apart from every other failure', async () => {
  const gladys = sdkAnswering({ error: new GladysApiError(403, 'FORBIDDEN', 'Forbidden') });
  await assert.rejects(fetchHouses(gladys), (err) => {
    assert.equal(err.code, HOUSE_ACCESS_DENIED);
    return true;
  });
});

test('any other error goes through as it is', async () => {
  const gladys = sdkAnswering({ error: new GladysApiError(500, 'SERVER_ERROR', 'Boom') });
  await assert.rejects(fetchHouses(gladys), (err) => {
    assert.equal(err.status, 500);
    assert.notEqual(err.code, HOUSE_ACCESS_DENIED);
    return true;
  });
});

test('an answer that is not a list is no houses, not a crash', async () => {
  assert.deepEqual(await fetchHouses(sdkAnswering({ body: { houses: [] } })), []);
});

test('a house with no name is still listed under one', () => {
  // The name is what tells "Maison" from "Bureau" in the answer of the button.
  assert.equal(normalizeHouse({ id: 'h1', name: '   ' }).name, 'Maison');
});

test('an unusable coordinate is dropped rather than watched', () => {
  const house = normalizeHouse({ id: 'h1', name: 'X', latitude: 300, longitude: 2 });
  assert.equal(house.latitude, null);
});
