# Accuracy and limitations

**CUHK Voxel Campus is an unofficial, stylised illustration. It must not be used for navigation,
accessibility or route planning, safety, emergency or operational decisions.** Use the official
CUHK campus map and on-site signage for those.

## What is data-driven

| Aspect | Source | Notes |
| --- | --- | --- |
| Where buildings, roads, paths, stairs, bridges, railway, water, woodland, pitches and car parks are | OpenStreetMap (snapshot 2026-11-10) | Volunteer-mapped; completeness varies. Rasterised to a 1 m block grid, so edges move by up to ~0.7 m |
| Terrain shape | Lands Department 5 m DTM | Published accuracy ±5 m. Can include tree canopy and elevated roads. Resampled bicubically to 1 m, lightly smoothed, then rounded to 1 m block steps |
| Building names, codes, zones | Official CUHK campus map | 156 of 159 official buildings matched to an OSM footprint (123 by name, 33 by location) |
| Landmark and shuttle-stop positions | Official CUHK campus map points | Points, not shapes. The official map says it may not be drawn to scale |

## What is interpreted or invented

- **Terrain grading.** Roads and paths are levelled along their real centre-lines, pitches and
  ponds are flattened, building plots are terraced, and ground under bridges is interpolated.
  These edits make the block world coherent; they are not surveyed levels.
- **Architecture.** Façades, window rhythm, floor bands, parapets, roof plant, entrances and
  canopies are procedural (Tier B) or hand-styled (Tier A). Wall colours follow a per-zone palette,
  not a building-by-building survey.
- **Heights.** See the hierarchy below. Of the 165 Tier A/B buildings, 3 have an OSM `height`,
  59 an OSM floor count, 5 a reference estimate and **98 only a typical value for their building
  type** — so many campus buildings are shown lower or taller than they really are. Lands
  Department 3D building data would be the natural next source to fix this.
- **Vegetation.** Woodland extent follows OSM `natural=wood` polygons; elsewhere tree density is a
  rule (steeper, unbuilt land gets more trees). Individual trees, species and flowering are
  decorative. No tree is placed on a building, road, court, plaza or water (tested).
- **Street furniture.** Lamps are spaced by rule along campus roads. Bus shelters stand at official
  stop points with a generic model. Station platform canopies are inferred from platform polygons.
- **Zone extents** are the area nearest each zone's official buildings, not college boundaries.
- **Bridges** span between the ground levels at their ends; real deck profiles are not known.

## Building tiers — never mixed up

| Tier | Count | Meaning | Shown as |
| --- | --- | --- | --- |
| A — landmark model | 10 | Real footprint + bespoke block model checked against official photographs | "Tier A · landmark model" |
| B — detailed footprint model | 155 | Real footprint, height from tags or estimates, procedural façade | "Tier B · detailed footprint model" |
| C — approximate / context | 564 | Off-campus, unnamed, tiny or under-construction footprints as plain massing | "Tier C · approximate", hatched neutral texture |

A Tier C building is always labelled *approximate* and is never reported as verified (enforced by
a unit test). Tier A landmarks: University Library, Sir Run Run Shaw Hall, Institute of Chinese
Studies, Chung Chi College Chapel, New Asia water tower, United College water tower, Yasumoto
International Academic Park, Wu Ho Man Yuen Building, Cheng Yu Tung Building, Lion Pavilion.
Three further landmarks are symbolic structures at mapped points (University Main Entrance
pillars, Chung Chi Gate, Gate of Wisdom) and are recorded in `data/manual-overrides.json` or
flagged as stylised.

## Geometry confidence

| Class | Count | Rule |
| --- | --- | --- |
| Verified geometry | 146 | OSM footprint matched to an official CUHK building **and** the official map point lies within 45 m of the footprint |
| Inferred geometry | 19 | OSM footprint without that cross-check |
| Stylised / approximate | 564 | Tier C |

The overlay uses a pattern (solid / diagonal stripes / checker) and a text legend as well as colour.

## Height hierarchy

1. **Verified** height or floor count from a reliable public source (none yet).
2. **OSM `height`**, else **OSM `building:levels`** × floor height (3.5 m; 3.1 m residential).
3. **Reference estimate** — floor count or height estimated from official photographs, recorded
   in `data/manual-overrides.json` with confidence (University Library, both water towers,
   Sir Run Run Shaw Hall, Institute of Chinese Studies). These are estimates, not measurements.
4. **Category heuristic** — a typical floor count for the building type.
5. **Placeholder** — 7 m.

The inspector shows the source and confidence for every building.

## Validation performed

- **Landmark coordinates** (`tests/landmarks.test.ts`): ten buildings — University Library,
  Sir Run Run Shaw Hall, University Science Centre, Lee Shau Kee Building, Chung Chi College
  Chapel, Cheng Ming Building, Tsang Shiu Tim Building, Wen Lan Tang, Cheng Yu Tung Building,
  Yasumoto International Academic Park — are checked against the latitude / longitude published on
  the official CUHK map. Each official point falls on or within 30 m of the modelled footprint.
- **All matched buildings**: distance from the official map point to the OSM footprint —
  median 0 m, 90th percentile 3 m, maximum 30 m (`data/processed/build-report.json`).
- **Relative layout and relief**: Chung Chi south of Central Campus, the station east, Shaw College
  north-west; hilltop colleges above 110 m, the station area below 40 m.
- **Grounding**: every major building reaches the terrain and rises above it (no floating or
  buried buildings).
- **Trees** never stand on buildings, roads, courts, plazas, rail or water.

## Not done

- No comparison against aerial imagery was carried out in this release; road, terrain and
  building placement were cross-checked only between OSM, the official map points and the DTM.
- No field survey, no building-by-building façade or height verification.
- Three official buildings have no OSM footprint and are missing: University Residence No. 4,
  Water Sports Centre, Sports Field Annex 1.
- Recent construction may be absent, or present only as Tier C massing.
- Underground and indoor spaces, tunnels and building passages are not modelled.
