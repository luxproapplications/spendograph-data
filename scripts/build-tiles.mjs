// Buduje kafelki sklepów i stacji dla krajów. Użycie: node scripts/build-tiles.mjs --countries PL,DE --out tiles [--input plik.json]
// Pliki: <out>/<KRAJ>/<kolumna>_<wiersz>.json oraz <out>/index.json. Jeden kraj naraz, z przerwą między zapytaniami do Overpass.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { bounds, buildTiles, countryQuery, parseOverpass, TILE } from './lib/tiles.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const out = args.out ?? 'tiles';
const countries = (args.countries ?? 'PL').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const UA = 'spendograph-data/1.0 (https://github.com/luxproapplications/spendograph-data; monthly OSM tile build)';
const MIN_STORES = 500; // mniej to najpewniej przerwane zapytanie, a nie prawdziwy kraj

async function overpass(query) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const url of ENDPOINTS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query),
          signal: AbortSignal.timeout(700_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
        return await res.json();
      } catch (error) {
        last = error;
        console.error(`overpass: ${error.message}`);
      }
    }
    await new Promise((r) => setTimeout(r, 30_000 * (attempt + 1)));
  }
  throw last;
}

await mkdir(out, { recursive: true });
let index = { version: 1, tile: TILE, countries: {} };
try { index = JSON.parse(await readFile(`${out}/index.json`, 'utf8')); } catch { /* pierwsze uruchomienie */ }

for (const code of countries) {
  const json = args.input ? JSON.parse(await readFile(args.input, 'utf8')) : await overpass(countryQuery(code));
  const stores = parseOverpass(json);
  if (stores.length < MIN_STORES && !args.input) throw new Error(`${code}: only ${stores.length} places, refusing to replace tiles`);
  const tiles = buildTiles(stores, code);
  await rm(`${out}/${code}`, { recursive: true, force: true });
  await mkdir(`${out}/${code}`, { recursive: true });
  for (const [key, tile] of tiles) await writeFile(`${out}/${code}/${key}.json`, JSON.stringify(tile));
  index.countries[code] = { bounds: bounds(stores), places: stores.length, tiles: tiles.size, generated: new Date().toISOString().slice(0, 10) };
  console.log(`${code}: ${stores.length} places in ${tiles.size} tiles`);
  if (!args.input && countries.length > 1) await new Promise((r) => setTimeout(r, 60_000));
}
await writeFile(`${out}/index.json`, JSON.stringify(index, null, 1));
