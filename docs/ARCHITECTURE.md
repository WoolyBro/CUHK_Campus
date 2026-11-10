# Architecture

```
 OpenStreetMap ──fetch-osm──▶ data/raw/osm-cuhk.json ──process-osm──▶ data/processed/*.geojson ─┐
 Lands Dept DTM ─fetch-terrain▶ data/raw/dem/*.asc ───build-terrain──▶ data/terrain/elevation.i16 ├─build-voxel-world─▶ public/world/*
 Official CUHK map ─fetch-official──────────────────────────────────▶ data/processed/official-cuhk.json ┘
 data/campus-zones.json · data/manual-overrides.json (curated) ────────────────────────────────────────┘
                                                                                  browser: worker ─▶ GPU
```

Everything geographic happens at build time. The browser only decompresses, meshes and draws.

## Coordinate system

- Raw coordinates are WGS84 longitude / latitude (OSM, official map) or Hong Kong 1980 Grid (DTM).
- **Anchor**: 22.4200° N, 114.2069° E — the centre of the OSM campus-boundary bounding box.
- **Local frame**: a transverse Mercator projection centred on the anchor (`proj4`), giving metres
  east / north. Over the 2 km study area its distortion is far below a millimetre.
- **Scale**: `BLOCKS_PER_METRE = 1`. World axes: +X east, +Z south, +Y up (metres above HKPD).
- **Extent**: 1792 × 2048 blocks (x −896…896, z −1024…1024), i.e. the campus plus a margin.
- All constants live in [`src/lib/geo/constants.ts`](../src/lib/geo/constants.ts); conversions in
  [`src/lib/geo/projection.ts`](../src/lib/geo/projection.ts). No feature is positioned by hand:
  each comes from a geographic coordinate or a documented manual override.

## Data pipeline

| Script | Role |
| --- | --- |
| `scripts/fetch-osm.ts` | Stores the campus boundary as a polygon; one Overpass query for the study-area polygon with endpoint fallback and back-off; caches response + query + timestamp |
| `scripts/fetch-official.ts` | Caches the official map database; extracts names, codes, zones, points |
| `scripts/fetch-terrain.ts` | Downloads and unpacks the 5 m DTM |
| `scripts/process-osm.ts` | Resolves multipolygons, assigns stable ids (`way/123`), keeps all tags, groups into buildings / roads / paths / stairs / bridges / waterways / vegetation / facilities / transport / terrain-features, flags unreliable geometry |
| `scripts/build-terrain.ts` | Streams the ASCII grid, crops, resamples bicubically (range-clamped) to 1 m, two light box blurs |
| `scripts/build-voxel-world.ts` | Combines everything into the block world (below) |

### World building (`scripts/world/*`)

1. **Footprints and naming** — polygons are scan-line rasterised; official buildings are matched by
   normalised name, else by location (≤ 30 m). Overlapping footprints are resolved by priority.
2. **Sea** — flood fill bounded by the OSM coastline.
3. **Terrain shaping** — ground under bridges is inpainted; pitches, ponds, pools, car parks and
   plazas are levelled or smoothed; each road / path gets a height profile sampled along its
   centre-line, smoothed with a class-dependent window, stamped at its real width, then relaxed
   across the carriageway; shoulders are blended; buildings get a terrace at the 35th percentile of
   surrounding ground, with uphill ground cut back.
4. **Block heights** — elevation rounds to 1 m steps. Surfaces come from land cover, slope and
   seeded noise (grass, forest floor, rock on steep faces, exposed earth, sand at the shore).
5. **Structures** — each building is generated in a dense voxel volume from its footprint cells
   (bay rhythm follows the nearest real wall edge), then greedy-meshed. Bridges, covered
   walkways, hedges, walls, gates and platform canopies are "loose voxels" tiled per chunk.
6. **Vegetation and props** — jittered-grid tree placement driven by land cover and slope with
   clearance distance maps; lamps, shelters, fences, shrubs.
7. **Zones and catalogue** — zone grid from the nearest official building; feature list with
   names, codes, confidence, heights, coordinates.

### Shipped files (`public/world/`)

| File | Content |
| --- | --- |
| `columns.bin` | gzip: per-column terrain height (row-delta u16), surface block (u8), structure bottom / top (u16), pick id (u16); zone grid (u8, 4 m) |
| `structures.bin` | gzip: block quads — origin u16×3, size / direction / material u8×4, feature id u16 — grouped by chunk |
| `trees.bin`, `props.bin` | gzip: 10-byte instance records |
| `features.json` | Searchable / inspectable features |
| `world.json` | Metadata, structure groups, zones, statistics |

## Rendering

- **Block quads.** A "quad" is one greedy-merged rectangle of block faces. Each is a GPU
  instance of a unit quad; the vertex shader expands it from origin, size and direction. The
  shipped arrays are used directly as instance buffers (10–12 bytes per quad).
- **Materials.** three.js Lambert materials patched in `onBeforeCompile`
  ([`materials.ts`](../src/lib/voxel/materials.ts)) so lights, shadows and fog still work. One
  WebGL2 texture array holds 80 original procedural 16×16 tiles; UVs are world-aligned so tiles
  repeat per block. Shared uniforms drive night emissive windows, road / path layer toggles
  (texture-layer remap), selection pulse, hover, zone tint and the confidence overlay.
- **Terrain chunks.** 128 × 128 block chunks (14 × 16). The loader worker first emits every
  chunk at half resolution (2 m columns), then full-resolution chunks nearest the camera focus.
  The scene draws the fine or coarse mesh per chunk by distance and zoom, with hysteresis.
- **Trees.** Instanced per 256 m region with three levels: detailed voxel tree per species
  (greedy-merged), trunk + two boxes, single box. Performance mode draws a deterministic subset.
- **Props** are instanced and only drawn when zoomed in.
- **Shadows.** One directional shadow map whose frustum follows the focus and scales with zoom;
  `autoUpdate` is off and it re-renders only when chunks arrive, layers or LOD change, the sun
  moves, or the focus leaves the covered area.
- **Culling.** three.js frustum culling per chunk / region with precomputed bounds.
- **Labels** are pooled DOM nodes: candidates are filtered by layer and zoom, ranked, occlusion-
  tested against the column grid, then decluttered by screen-space overlap.

## Picking and collision

`World` ([`src/lib/terrain/world.ts`](../src/lib/terrain/world.ts)) keeps the column arrays on the
main thread. A 2-D DDA ray march over columns gives hover, click selection, zoom-to-cursor and
label occlusion without any triangle data. The same arrays provide terrain following
(bilinear ground height), standing on bridges and roofs, wall collision with axis-separated
sliding, and the minimum camera altitude.

## Camera

`CameraController` owns one rig shared by all modes ([`rig.ts`](../src/scene/rig.ts)):

- *Isometric* (orthographic) and *Orbit* (perspective) share target / azimuth / polar / distance;
  the orthographic zoom is derived from the same distance, so switching keeps the framing.
- *Explore* has position / yaw / pitch, walk-run-fly speeds, jump, joystick input.
- Motion is delta-time based with exponential damping. Guided fly-to is a cancellable tween.
- The pivot stays inside the modelled area; the perspective camera is lifted above terrain and roofs.
- URL hash state: mode, pose, selection, layers, time, performance mode.

## Performance decisions

- Instanced quads instead of expanded triangles: ~8× less GPU memory and no CPU expansion.
- Greedy meshing everywhere (terrain tops, side bands along edges, structure volumes, tree models).
- Worker-side decompression and meshing; transferables only.
- Coarse-first loading so the overview appears before the full-resolution terrain is meshed.
- Static shadow map, pixel-ratio cap (1.75; 1 in performance mode), distance-culled details.

## Manual overrides

`data/manual-overrides.json` is the only place for hand corrections. Every entry must carry
`target`, `field`, `original`, `corrected`, `correctionType`, `evidence`, `confidence`, `reason`
and `date`; the world builder throws if any is missing. Current entries: reference-based heights
for five landmarks and two landmark placements at official map points.

## Tests

- `tests/` (Vitest): projection, ten landmark coordinates vs the official map, height hierarchy,
  mesher, world-data invariants (grounding, tiers, trees, overrides), picking / collision, search.
- `e2e/` (Playwright): initial load, search → fly-to → inspector, layer toggles, camera modes and
  reset, building selection by click, directory and info panels, mobile layout.
