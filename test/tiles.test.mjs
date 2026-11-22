import test from 'node:test';
import assert from 'node:assert/strict';
import { bounds, buildTiles, column, parseOverpass, row } from '../scripts/lib/tiles.mjs';

const sample = {
  elements: [
    { type: 'node', lat: 52.2297, lon: 21.0122, tags: { shop: 'supermarket', brand: 'Biedronka', name: 'Biedronka 12', 'addr:street': 'Długa', 'addr:housenumber': '12', 'addr:city': 'Warszawa' } },
    { type: 'way', center: { lat: 52.231, lon: 21.02 }, tags: { shop: 'convenience', name: 'Żabka' } },
    { type: 'node', lat: 52.5, lon: 21.5, tags: { amenity: 'fuel', brand: 'Orlen' } },
    { type: 'node', lat: 52.2, lon: 21.0, tags: { shop: 'supermarket' } },
    { type: 'node', lat: 52.2, lon: 21.0 },
  ],
};

test('parseOverpass: brand over name, center for ways, drops nameless', () => {
  const stores = parseOverpass(sample);
  assert.deepEqual(stores.map((s) => s.brand), ['Biedronka', 'Żabka', 'Orlen']);
  assert.equal(stores[1].lat, 52.231);
  assert.equal(stores[2].kind, 'FUEL');
});

test('tile indices are stable around the grid', () => {
  assert.equal(column(21.0122), Math.floor((21.0122 + 180) / 0.05));
  assert.equal(row(52.2297), Math.floor((52.2297 + 90) / 0.05));
  assert.equal(column(21.0), 4020);
});

test('buildTiles groups nearby places and records country', () => {
  const tiles = buildTiles(parseOverpass(sample), 'PL');
  assert.equal(tiles.size, 2);
  const warsaw = tiles.get(`${column(21.0122)}_${row(52.2297)}`);
  assert.equal(warsaw.c, 'PL');
  assert.equal(warsaw.s.length, 2);
  assert.deepEqual(warsaw.s[0], ['Biedronka', 0, 52.2297, 21.0122, 'Długa 12, Warszawa']);
  assert.equal(warsaw.s[1].length, 4, 'no address, no fifth element');
});

test('bounds cover all places', () => {
  assert.deepEqual(bounds(parseOverpass(sample)), [52.2297, 21.0122, 52.5, 21.5]);
});
