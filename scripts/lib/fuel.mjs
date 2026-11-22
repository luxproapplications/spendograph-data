// Ceny paliw z oficjalnych rejestrów (Hiszpania: Geoportal Gasolineras, Włochy: MIMIT Osservaprezzi) zamienione na małe paczki:
// mediana ceny benzyny 95, diesla i LPG w każdej marce stacji. Te same reguły co w aplikacji (domain/fuel/FuelFeeds.kt).

export const MIN_STATIONS = 3;
const PLAUSIBLE = [0.5, 4.0];

export const SOURCES = { ES: 'fuel_es', IT: 'fuel_it' };

/** "1,399" -> 1.399; puste i zero to brak ceny. */
export function decimal(text) {
  const value = Number.parseFloat(String(text ?? '').trim().replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** "REPSOL" -> "Repsol", "BP" -> "BP"; numery stacji ("Nº 10.935") i puste wpisy odpadają. */
export function prettyBrand(raw) {
  const name = String(raw ?? '').trim();
  if (name.length < 2 || name.startsWith('Nº') || name.startsWith('N°') || !/\p{L}/u.test(name)) return null;
  // nazwa z już poprawną wielkością liter ("Agip Eni") zostaje; poprawiamy tylko pisaną samymi wielkimi lub małymi literami
  if (name !== name.toUpperCase() && name !== name.toLowerCase()) return name;
  return name
    .split(' ')
    .filter(Boolean)
    .map((word) => (word.length <= 3 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(' ');
}

const inRange = (price) => price >= PLAUSIBLE[0] && price <= PLAUSIBLE[1];

/** Data migawki z pola `Fecha` ("21/11/2026 22:50:24") albo dzisiejsza. */
export function spainDate(json, fallback) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(json.Fecha ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : fallback;
}

/** Hiszpania: JSON z `ListaEESSPrecio`, ceny jako tekst z przecinkiem, marka w polu `Rótulo`. */
export function parseSpain(json, today) {
  const prices = [];
  for (const s of json.ListaEESSPrecio ?? []) {
    const brand = prettyBrand(s['Rótulo']);
    if (!brand) continue;
    // E5 i E10 to to samo paliwo 95 z różną domieszką etanolu: bierzemy tańszą dostępną wersję
    const petrol = [s['Precio Gasolina 95 E5'], s['Precio Gasolina 95 E10']].map(decimal).filter((p) => p !== null);
    const diesel = decimal(s['Precio Gasoleo A']);
    const lpg = decimal(s['Precio Gases licuados del petróleo']);
    if (petrol.length) prices.push({ brand, fuel: 'PETROL_95', perLiter: Math.min(...petrol) });
    if (diesel !== null) prices.push({ brand, fuel: 'DIESEL', perLiter: diesel });
    if (lpg !== null) prices.push({ brand, fuel: 'LPG', perLiter: lpg });
  }
  return { country: 'ES', date: spainDate(json, today), prices: prices.filter((p) => inRange(p.perLiter)) };
}

const itRows = (csv) => csv.split(/\r?\n/).slice(2).filter((line) => line.trim()).map((line) => line.split('|'));

/** Data z pierwszego wiersza "Estrazione del 2026-11-20". */
export function italyDate(csv, fallback) {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(csv.split(/\r?\n/, 1)[0] ?? '');
  return m ? m[1] : fallback;
}

/** Włochy: dwa pliki CSV z separatorem "|" i wierszem "Estrazione del ..." na początku; tylko self-service. */
export function parseItaly(pricesCsv, stationsCsv, today) {
  const brandById = new Map();
  for (const row of itRows(stationsCsv)) {
    const brand = prettyBrand(row[2]);
    if (row[0] && brand) brandById.set(row[0], brand);
  }
  const fuels = { benzina: 'PETROL_95', gasolio: 'DIESEL', gpl: 'LPG' };
  const prices = [];
  for (const row of itRows(pricesCsv)) {
    if (row.length < 4 || row[3] !== '1') continue;
    const brand = brandById.get(row[0]);
    const fuel = fuels[String(row[1]).trim().toLowerCase()];
    const perLiter = decimal(row[2]);
    if (brand && fuel && perLiter !== null && inRange(perLiter)) prices.push({ brand, fuel, perLiter });
  }
  return { country: 'IT', date: italyDate(pricesCsv, today), prices };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Mediana ceny każdego paliwa w każdej marce (co najmniej MIN_STATIONS stacji), w centach za litr. */
export function aggregate(snapshot) {
  const groups = new Map();
  for (const p of snapshot.prices) {
    const key = `${p.brand}\u0000${p.fuel}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p.perLiter);
  }
  const source = SOURCES[snapshot.country];
  const out = [];
  for (const [key, list] of groups) {
    if (list.length < MIN_STATIONS) continue;
    const [store, fuel] = key.split('\u0000');
    out.push({ source, store, fuel, cents: Math.round(median(list) * 100) });
  }
  const order = { PETROL_95: 0, DIESEL: 1, LPG: 2 };
  return out.sort((a, b) => order[a.fuel] - order[b.fuel] || a.cents - b.cents || a.store.localeCompare(b.store));
}

/** Paczka dla aplikacji (wersja 1): kilka KB JSON. */
export function toPack(snapshot) {
  return JSON.stringify({
    version: 1,
    country: snapshot.country,
    generated: snapshot.date,
    prices: aggregate(snapshot),
  });
}
