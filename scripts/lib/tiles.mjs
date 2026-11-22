// Statyczne kafelki sklepów i stacji z OpenStreetMap (dane © współtwórcy OpenStreetMap, licencja ODbL).
// Kafelek ma 0,05° (około 5,5 km), nazwa pliku to numer kolumny i wiersza. Aplikacja pobiera kafelek swojej komórki i sąsiednie.

export const TILE = 0.05;
export const SHOP_REGEX = '^(supermarket|convenience|variety_store|wholesale|greengrocer)$';

export const column = (lon) => Math.floor((lon + 180) / TILE + 1e-9);
export const row = (lat) => Math.floor((lat + 90) / TILE + 1e-9);

export function countryQuery(code) {
  return (
    `[out:json][timeout:600][maxsize:1073741824];area["ISO3166-1"="${code}"][admin_level=2]->.a;(` +
    `nwr["shop"~"${SHOP_REGEX}"](area.a);nwr["amenity"="fuel"](area.a););out center tags;`
  );
}

/** Marka to tag `brand`, a gdy go nie ma, nazwa. Ta sama reguła co NearbyParser w aplikacji. */
export function parseOverpass(json) {
  const stores = [];
  for (const e of json.elements ?? []) {
    const tags = e.tags;
    if (!tags) continue;
    const brand = String(tags.brand || tags.name || '').trim();
    if (!brand) continue;
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    stores.push({ brand, kind: tags.amenity === 'fuel' ? 'FUEL' : 'SHOP', lat, lon });
  }
  return stores;
}

const round = (value) => Math.round(value * 1e5) / 1e5;

/** Grupuje placówki w kafelki: { "col_row": { v, c, s: [[marka, 0|1, lat, lon], ...] } }. */
export function buildTiles(stores, country) {
  const tiles = new Map();
  for (const s of stores) {
    const key = `${column(s.lon)}_${row(s.lat)}`;
    if (!tiles.has(key)) tiles.set(key, { v: 1, c: country, s: [] });
    tiles.get(key).s.push([s.brand, s.kind === 'FUEL' ? 1 : 0, round(s.lat), round(s.lon)]);
  }
  for (const tile of tiles.values()) tile.s.sort((a, b) => a[2] - b[2] || a[3] - b[3] || a[0].localeCompare(b[0]));
  return tiles;
}

/** Obwiednia kafelków kraju: aplikacja wie, że brak pliku w tym obszarze oznacza pusty kafelek, a nie brak danych. */
export function bounds(stores) {
  let minLat = 90, minLon = 180, maxLat = -90, maxLon = -180;
  for (const s of stores) {
    minLat = Math.min(minLat, s.lat);
    maxLat = Math.max(maxLat, s.lat);
    minLon = Math.min(minLon, s.lon);
    maxLon = Math.max(maxLon, s.lon);
  }
  return [round(minLat), round(minLon), round(maxLat), round(maxLon)];
}
