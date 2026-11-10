import { bus } from '../../app/bus'
import { useWorld } from '../../app/hooks'
import { useApp } from '../../app/store'
import { IconClose, IconFly, IconHome, IconWalk } from '../../components/icons'
import type { FeatureRecord } from '../../lib/voxel/world-format'

const TIER: Record<string, [string, string]> = {
  A: ['Tier A · landmark model', 'Bespoke block model on the real footprint.'],
  B: ['Tier B · detailed footprint model', 'Real footprint with procedural façade and roof.'],
  C: ['Tier C · approximate', 'Plain massing only — no architectural detail is implied.'],
}
const GEOM: Record<string, [string, string, string]> = {
  verified: ['✔', 'Verified geometry', 'OSM footprint cross-checked against the official campus-map point.'],
  inferred: ['◐', 'Inferred geometry', 'From public map data; not independently cross-checked.'],
  approximate: ['◇', 'Stylised / approximate', 'Low-confidence or context geometry.'],
}
const HEIGHT_SRC: Record<string, string> = {
  verified: 'verified public source',
  'osm-height': 'OSM height tag',
  'osm-levels': 'OSM floor count',
  'reference-estimate': 'estimate from official reference photo',
  'category-heuristic': 'typical value for this building type',
  placeholder: 'placeholder',
}
const NAME_SRC: Record<string, string> = {
  'official-name': 'Official CUHK campus map (matched by name)',
  'official-location': 'Official CUHK campus map (matched by location)',
  'official-point': 'Official CUHK campus map',
  osm: 'OpenStreetMap',
  derived: 'Derived for this project',
  none: 'No name in public data',
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.2rem_1fr] gap-2 border-t border-slate-300/70 py-1.5 text-sm">
      <dt className="text-slate-600">{k}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

/** Building / POI inspector. Shows only source-verified names and codes, with confidence. */
export function Inspector() {
  const world = useWorld()
  const selected = useApp((s) => s.selected)
  const select = useApp((s) => s.select)
  const f: FeatureRecord | undefined = world?.feature(selected)
  if (!f || !world) return null
  const zone = world.meta.zones.find((z) => z.id === f.zone)
  const geom = GEOM[f.geom]
  const osmUrl = f.osm && /^(way|node|relation)\//.test(f.osm) ? `https://www.openstreetmap.org/${f.osm}` : null
  return (
    <aside
      aria-label="Selected place"
      className="panel scroll-thin pointer-events-auto absolute right-2 bottom-[6.6rem] left-2 z-20 max-h-[44vh] overflow-y-auto p-4 sm:top-[4.4rem] sm:right-3 sm:bottom-auto sm:left-auto sm:max-h-[calc(100vh-11rem)] sm:w-[22rem]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-[var(--color-grass)] uppercase">{f.kind === 'building' ? cap(f.category === 'unknown' ? 'building' : f.category) : f.category}</p>
          <h2 className="text-lg leading-tight font-bold">{f.name}</h2>
          {f.nameZh && (
            <p lang="zh-Hant" className="text-base text-slate-700">
              {f.nameZh}
            </p>
          )}
        </div>
        <button type="button" className="btn shrink-0 !min-h-9 !min-w-9 !px-0" aria-label="Close details" onClick={() => select(null)}>
          <IconClose />
        </button>
      </div>
      {(f.code || f.short) && (
        <p className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
          {f.short && <span className="border border-[#7a5a00] bg-[var(--color-sun)] px-1.5 py-0.5">Code {f.short}</span>}
          {f.code && <span className="border border-slate-500 bg-white px-1.5 py-0.5">Map ref {f.code}</span>}
        </p>
      )}
      <dl className="mt-3">
        {zone && (
          <Row k="Campus zone">
            {zone.nameEn}{' '}
            <span lang="zh-Hant" className="text-slate-600">
              {zone.nameZh}
            </span>
          </Row>
        )}
        {f.tier && (
          <Row k="Model">
            <span className="font-semibold">{TIER[f.tier][0]}</span>
            <br />
            <span className="text-xs text-slate-600">{TIER[f.tier][1]}</span>
          </Row>
        )}
        <Row k="Geometry">
          <span className="font-semibold">
            <span aria-hidden="true">{geom[0]} </span>
            {geom[1]}
          </span>
          <br />
          <span className="text-xs text-slate-600">{geom[2]}</span>
        </Row>
        {f.heightM != null && (
          <Row k="Height">
            ≈ {Math.round(f.heightM)} m{f.levels ? ` · ${f.levels} floor${f.levels > 1 ? 's' : ''}` : ''}
            <br />
            <span className="text-xs text-slate-600">
              Source: {HEIGHT_SRC[f.heightSource ?? 'placeholder']} · confidence {f.heightConfidence ?? 'low'}
            </span>
          </Row>
        )}
        <Row k="Name source">{NAME_SRC[f.nameSource] ?? f.nameSource}</Row>
        <Row k="Position">
          {f.lat.toFixed(5)}° N, {f.lon.toFixed(5)}° E
        </Row>
        <Row k="Links">
          <a className="font-semibold underline" href="https://www.cuhk.edu.hk/english/campus/cuhk-campus-map.html" target="_blank" rel="noreferrer">
            Official CUHK map
          </a>
          {osmUrl && (
            <>
              {' '}
              ·{' '}
              <a className="font-semibold underline" href={osmUrl} target="_blank" rel="noreferrer">
                OpenStreetMap
              </a>
            </>
          )}
        </Row>
      </dl>
      {f.notes && <p className="mt-2 border-l-4 border-[var(--color-sun)] bg-white/70 px-2 py-1 text-xs text-slate-700">{f.notes}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={() => bus.emit({ type: 'flyTo', feature: f })}>
          <IconFly /> Fly to
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            bus.emit({ type: 'flyToPoint', x: f.x, z: f.z, dist: 60 })
            window.setTimeout(() => bus.emit({ type: 'street' }), 50)
          }}
        >
          <IconWalk /> Street level
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            select(null)
            bus.emit({ type: 'reset' })
          }}
        >
          <IconHome /> Overview
        </button>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Stylised model — not for navigation, access planning or safety decisions.</p>
    </aside>
  )
}
