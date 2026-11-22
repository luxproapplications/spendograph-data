// Pobiera rejestry cen paliw i zapisuje paczki do <out>/fuel/<KRAJ>.json.
// Gdy pobranie się nie uda (blokada adresu, awaria, zmiana formatu), bierze wczorajszą paczkę z opublikowanej strony,
// żeby aplikacja nie została bez danych. Użycie: node scripts/build-fuel.mjs --out site [--fallback-url https://...]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseItaly, parseSpain, toPack, aggregate } from './lib/fuel.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const out = args.out ?? 'site';
const today = new Date().toISOString().slice(0, 10);
// lokalne pliki do testów bez internetu
const local = { es: args['es-file'], itPrices: args['it-prices-file'], itStations: args['it-stations-file'] };

const UA = 'spendograph-data/1.0 (https://github.com/luxproapplications/spendograph-data; open price data pipeline)';
const MIN_PRICES = 50; // mniej niż tyle marek-paliw to najpewniej zepsuty rejestr, a nie prawdziwy wynik

async function get(url, accept) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept ?? '*/*' }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res;
}

const countries = {
  ES: async () => {
    const text = local.es ? await readFile(local.es, 'utf8') : await (await get('https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/', 'application/json')).text();
    return parseSpain(JSON.parse(text.replace(/^﻿/, '')), today);
  },
  IT: async () => {
    const read = async (file, url) => (file ? readFile(file, 'utf8') : (await get(url)).text());
    const [prices, stations] = await Promise.all([
      read(local.itPrices, 'https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv'),
      read(local.itStations, 'https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv'),
    ]);
    return parseItaly(prices, stations, today);
  },
};

await mkdir(`${out}/fuel`, { recursive: true });
let failures = 0;
for (const [code, load] of Object.entries(countries)) {
  const target = `${out}/fuel/${code}.json`;
  try {
    const snapshot = await load();
    const count = aggregate(snapshot).length;
    if (count < MIN_PRICES) throw new Error(`only ${count} brand-fuel prices, refusing to publish`);
    await writeFile(target, toPack(snapshot));
    console.log(`${code}: ${snapshot.prices.length} station prices -> ${count} brand-fuel prices (${snapshot.date})`);
  } catch (error) {
    failures++;
    console.error(`${code}: ${error.message}`);
    if (args['fallback-url']) {
      try {
        const previous = await (await get(`${args['fallback-url']}/fuel/${code}.json`)).text();
        JSON.parse(previous);
        await writeFile(target, previous);
        console.error(`${code}: kept the previously published pack`);
      } catch (fallbackError) {
        console.error(`${code}: no previous pack either (${fallbackError.message})`);
      }
    }
  }
}
// kod wyjścia 0, jeśli choć jedna paczka powstała: jedna awaria nie może zablokować publikacji reszty
const published = (await Promise.all(Object.keys(countries).map((c) => readFile(`${out}/fuel/${c}.json`).then(() => 1, () => 0)))).reduce((a, b) => a + b, 0);
if (published === 0) process.exit(1);
if (failures) console.error(`${failures} source(s) failed; published ${published}`);
