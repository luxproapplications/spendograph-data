# spendograph-data

Open data served as a static site (GitHub Pages) for the Spendograph app. No server, no keys.

## Layout

| Path | Content | Refresh |
| --- | --- | --- |
| `fuel/ES.json`, `fuel/IT.json` | Median fuel price per station brand (petrol 95, diesel, LPG), pack format version 1 | daily |
| `tiles/index.json` | Covered countries, bounds, tile size | monthly |
| `tiles/<CC>/<col>_<row>.json` | Shops and fuel stations in a 0.05° cell: `{"v":1,"c":"PL","s":[[brand,kind,lat,lon]]}`, kind 0 shop, 1 fuel | monthly |

Tile column = `floor((lon + 180) / 0.05)`, row = `floor((lat + 90) / 0.05)`. A missing tile inside a country's bounds is an empty cell.

## Build

```
npm test
node scripts/build-fuel.mjs --out site
node scripts/build-tiles.mjs --countries PL --out tiles
```

Workflows: `publish.yml` (daily, builds fuel packs and deploys Pages) and `tiles.yml` (monthly, commits tiles and triggers publish).

## Sources and licences

- Map data © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright). Tiles are a derived database and keep this licence.
- Spain: Ministerio para la Transición Ecológica y el Reto Demográfico, Geoportal Gasolineras.
- Italy: MIMIT, Osservaprezzi Carburanti (open data, IODL 2.0).

Only aggregated data is published. This is not a commercial service.
