# Data sources and licences

All sources were identified and their terms checked on **2026-11-10**, before any modelling
(Milestone 0). The machine-readable version of this page is
[`data/source-manifest.json`](../data/source-manifest.json), which the site's
*About → Sources & licences* panel reads directly.

## 1. OpenStreetMap (via the Overpass API)

| | |
| --- | --- |
| URL | <https://www.openstreetmap.org/> |
| Licence | Open Database License (ODbL) 1.0 — <https://www.openstreetmap.org/copyright> |
| Accessed | 2026-11-10 (OSM base timestamp 2026-11-10T04:52Z) |
| Used for | The campus boundary polygon (relation 7802779, `amenity=university`); building footprints and tags; roads, footpaths, steps, bridges, railway; water, coastline, woodland, grass, gardens; pitches, car parks, squares; entrances, bus stops, named points |
| How | One reproducible query by `scripts/fetch-osm.ts`, limited to the study-area polygon and to the feature keys the model needs. Raw response, query text and timestamp are cached in `data/raw/` |
| Attribution | "© OpenStreetMap contributors" — shown permanently in the site footer |
| Published? | Yes, as derived block data (rasterised, meshed). Derived databases remain under ODbL |

The website never contacts Overpass. No OSM raster tiles are downloaded.

## 2. Lands Department, HKSAR Government — Digital Terrain Model (5 m)

| | |
| --- | --- |
| URL | <https://data.gov.hk/en-data/dataset/hk-landsd-openmap-5m-grid-dtm> (file `Whole_HK_DTM_5m.zip`) |
| Licence | DATA.GOV.HK Terms and Conditions of Use — <https://data.gov.hk/en/terms-and-conditions> |
| Accessed | 2026-11-10 |
| Used for | Terrain elevation: a 377 × 427 cell crop, resampled to the 1 m project grid |
| Attribution | "Terrain: Digital Terrain Model © The Government of the Hong Kong SAR (Lands Department), from DATA.GOV.HK" — shown in the footer and Sources panel |
| Published? | Yes, as derived block heights. The terms allow free commercial and non-commercial reproduction and distribution provided the source is identified and the Government's ownership acknowledged |

Notes from the publisher: accuracy ±5 m; the surface includes non-ground information such as
elevated roads and bridges, and vegetation height where land is covered by vegetation.

## 3. The Chinese University of Hong Kong — official Campus Map

| | |
| --- | --- |
| URL | <https://www.cuhk.edu.hk/english/campus/cuhk-campus-map.html> (location database behind the map) |
| Rights | Copyright © The Chinese University of Hong Kong. All Rights Reserved. **No open licence.** |
| Accessed | 2026-11-10 |
| Used for | Authoritative naming and semantics: 159 building names (English / Chinese), map codes, short codes, campus-zone membership, 26 landmark names, 51 shuttle-stop names, facility names, and their published map points. Also the cross-check for building placement |
| Attribution | "Building names, codes and zones: official CUHK Campus Map (© The Chinese University of Hong Kong)" |
| Published? | Only factual fields (names, codes, zone ids, point coordinates), with attribution. The raw database, map artwork and photographs are **not** redistributed (`data/raw/` is git-ignored) |

**Restriction stated before use:** this is not open data. The project uses it as a factual
reference for an unofficial, non-commercial educational model. Obtain CUHK's permission before any
commercial use, and remove the derived names/points if CUHK objects. The official map itself
notes that it "may not be drawn to scale" and is "not updated on a real-time basis".

## 4. Official CUHK photographs (private reference only)

Photographs attached to official campus-map entries were viewed to understand façade colours, roof
forms and massing of the ten Tier A landmarks. **Nothing from them is shipped** — no image, crop,
trace or texture.

## 5. Lands Department — Hong Kong Imagery Map API (not used in this release)

<https://portal.csdi.gov.hk/csdi-webpage/apidoc/ImageryMapAPI> — identified as a lawful source for
future visual validation of footprints, paths and vegetation. It was **not** used to build, trace
or texture anything in this release, and imagery is never draped over the model.

## 6. Typeface

Pixelify Sans (SIL Open Font License 1.1), self-hosted through `@fontsource/pixelify-sans`.

## Deliberately not used

- Google Maps / Google Earth, Bing Maps, Apple Maps, Mapbox imagery — not used in any form.
- Minecraft / Mojang textures, sounds, logos, fonts, UI or game files — none. All block textures
  are original and procedural.

## Software

Vite, React, TypeScript, three.js, React Three Fiber, Zustand, Tailwind CSS, fflate (runtime);
Turf.js, proj4, osmtogeojson, tsx, Vitest, Playwright, ESLint, Prettier (build and test). All are
permissively licensed open-source packages. Drei was evaluated and left out: the dual
orthographic / perspective camera rig, the pooled DOM labels and the instanced-quad renderer are
custom, so none of its helpers ended up in the bundle.
