import manifest from '../../../data/source-manifest.json'
import { useWorld } from '../../app/hooks'
import { useApp, type InfoTab } from '../../app/store'

const TABS: [InfoTab, string][] = [
  ['about', 'About'],
  ['sources', 'Sources & licences'],
  ['accuracy', 'Accuracy'],
  ['controls', 'Controls'],
  ['accessibility', 'Accessibility'],
]
const H = ({ children }: { children: React.ReactNode }) => <h3 className="mt-4 mb-1 text-sm font-bold tracking-wide uppercase">{children}</h3>
const K = ({ children }: { children: React.ReactNode }) => <kbd className="border border-slate-500 bg-white px-1.5 py-0.5 font-mono text-xs">{children}</kbd>

function About() {
  const world = useWorld()
  const s = world?.meta.stats
  return (
    <div className="space-y-2 text-sm">
      <p>
        <strong>CUHK Voxel Campus</strong> is an unofficial, block-scale digital recreation of The Chinese University of Hong Kong’s Sha Tin campus. One block is one metre. Terrain, roads, paths,
        water and building footprints come from public geographic data; the architecture is rebuilt as original voxel art.
      </p>
      <p>It is a standalone website. It is not a game world, mod or download, and it uses no game assets — every texture is generated in code for this project.</p>
      {s && (
        <>
          <H>This build</H>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
            <li>{s.buildings} building footprints</li>
            <li>
              {s.officialMatched}/{s.officialBuildings} official buildings matched
            </li>
            <li>{s.tierA} landmark models (Tier A)</li>
            <li>{s.tierB} detailed models (Tier B)</li>
            <li>{s.tierC} approximate (Tier C)</li>
            <li>{Number(s.trees).toLocaleString()} trees</li>
            <li>{s.roadWays} road / rail ways</li>
            <li>{s.pathWays} paths &amp; stairways</li>
            <li>{s.bridgeWays} bridge spans</li>
            <li>Highest ground: {s.maxTerrainM} m</li>
          </ul>
          <p className="text-xs text-slate-600">
            Map data snapshot: {world?.meta.sources.osmBase?.slice(0, 10) ?? 'n/a'} · model generated {world?.meta.generatedAt.slice(0, 10)}
          </p>
        </>
      )}
      <H>Not affiliated</H>
      <p>This project is not produced, endorsed or reviewed by The Chinese University of Hong Kong, the MTR Corporation or the HKSAR Government.</p>
    </div>
  )
}

function Sources() {
  return (
    <div className="space-y-3 text-sm">
      <p>Every source was checked for licence terms before modelling began. Nothing was taken from Google Maps / Earth, Bing, Apple Maps, Mapbox imagery or OpenStreetMap raster tiles.</p>
      {manifest.sources.map((s) => (
        <article key={s.id} className="border border-slate-400 bg-white p-2.5">
          <h3 className="font-bold">
            <a className="underline" href={s.url} target="_blank" rel="noreferrer">
              {s.name}
            </a>
          </h3>
          <dl className="mt-1 space-y-0.5 text-xs">
            <div>
              <dt className="inline font-semibold">Licence: </dt>
              <dd className="inline">
                <a className="underline" href={s.licenceUrl} target="_blank" rel="noreferrer">
                  {s.licence}
                </a>
              </dd>
            </div>
            <div>
              <dt className="inline font-semibold">Used for: </dt>
              <dd className="inline">
                {s.role} {s.dataUsed}
              </dd>
            </div>
            <div>
              <dt className="inline font-semibold">In this site: </dt>
              <dd className="inline">{s.shippedInSite}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">Attribution: </dt>
              <dd className="inline">{s.attribution}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">Restrictions: </dt>
              <dd className="inline">{s.restrictions}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">Accessed: </dt>
              <dd className="inline">{s.accessDate}</dd>
            </div>
          </dl>
        </article>
      ))}
      <H>Not used</H>
      <ul className="list-disc space-y-1 pl-5 text-xs">
        {manifest.notUsed.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  )
}

function Accuracy() {
  return (
    <div className="space-y-2 text-sm">
      <p>
        <strong>The layout is data-informed, the architecture is stylised.</strong> Treat it as an illustration, not a survey.
      </p>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <strong>Positions</strong> of buildings, roads, paths, stairs, water and woodland follow OpenStreetMap as of the snapshot date. OSM is volunteer-made and varies in completeness.
        </li>
        <li>
          <strong>Terrain</strong> comes from the Lands Department 5 m terrain model (published accuracy ±5 m; it can include tree canopy and elevated roads). It is resampled to 1 m blocks, then
          graded along roads and levelled under buildings and pitches.
        </li>
        <li>
          <strong>Names, codes and zones</strong> come from the official CUHK campus map. A building is shown as “verified geometry” only when its OSM footprint lies within 45 m of the official map
          point.
        </li>
        <li>
          <strong>Heights</strong> use, in order: a verified source, OSM height or floor count, an estimate from official reference photos, a typical value for the building type, or a placeholder. The
          inspector states which one applies.
        </li>
        <li>
          <strong>Façades, windows, roofs, entrances, roof plant, lamps, benches and individual trees</strong> are procedural or hand-styled. Tier A landmarks were modelled against official
          photographs but remain interpretations. Tier C buildings are deliberately plain.
        </li>
        <li>
          <strong>Zone extents</strong> are derived from the nearest official building, not from surveyed college boundaries.
        </li>
        <li>Sources have different dates, so recent construction may be missing or shown as approximate.</li>
      </ul>
      <p className="border-l-4 border-red-600 bg-white px-2 py-1.5">
        <strong>Do not use this model for navigation, accessibility planning, safety, emergency or operational decisions.</strong> Use the official CUHK campus map and on-site signage.
      </p>
      <p className="text-xs text-slate-600">
        Found something wrong? Corrections are recorded in <code>data/manual-overrides.json</code> with evidence, confidence and date.
      </p>
    </div>
  )
}

function Controls() {
  return (
    <div className="space-y-1 text-sm">
      <H>Overview &amp; orbit</H>
      <ul className="space-y-1.5">
        <li>
          <K>Left drag</K> rotate · <K>Right drag</K> or <K>Shift</K>+drag pan · <K>Wheel</K> zoom toward the cursor
        </li>
        <li>
          <K>W A S D</K> / arrows pan · <K>Q</K> <K>E</K> rotate · <K>+</K> <K>−</K> zoom · <K>PgUp</K> <K>PgDn</K> tilt
        </li>
        <li>Click a building to inspect it · double-click to fly to a spot</li>
      </ul>
      <H>Explorer (walk / fly)</H>
      <ul className="space-y-1.5">
        <li>
          <K>W A S D</K> / arrows move · drag to look · <K>Shift</K> faster
        </li>
        <li>
          <K>F</K> toggle fly / walk · <K>Q</K> <K>E</K> down / up (fly) · <K>Space</K> ascend or jump
        </li>
        <li>Walking follows the terrain and is blocked by buildings; you can stand on bridges and roofs.</li>
      </ul>
      <H>Anywhere</H>
      <ul className="space-y-1.5">
        <li>
          <K>/</K> search · <K>R</K> reset to overview · <K>N</K> north-up · <K>Esc</K> deselect / close panel
        </li>
      </ul>
      <H>Touch</H>
      <ul className="space-y-1.5">
        <li>One finger rotate / look · two fingers pan · pinch zoom</li>
        <li>In Explorer, use the on-screen stick to move and the ▲ ▼ buttons to change height.</li>
      </ul>
      <p className="pt-2 text-xs text-slate-600">The address bar always holds a shareable link to the current view, selection and layers.</p>
    </div>
  )
}

function Accessibility() {
  return (
    <div className="space-y-2 text-sm">
      <p>The 3-D scene is inherently visual, so the interface around it is built to be usable without it.</p>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Every control is a real button, switch or input with a visible focus ring and an accessible name; the whole interface works from the keyboard.</li>
        <li>
          The <strong>Directory</strong> is a text alternative listing the main locations by zone, with official names, codes and confidence.
        </li>
        <li>Search is an ARIA combobox; results, loading progress and selection changes are announced.</li>
        <li>Confidence classes use a pattern and a text label as well as colour.</li>
        <li>With “reduce motion” enabled in your system, guided camera flights jump instead of animating.</li>
        <li>Without WebGL 2 the site shows an explanation and the text directory instead of a blank page.</li>
        <li>Performance mode lowers the load on older devices.</li>
      </ul>
      <p className="text-xs text-slate-600">
        Known limits: the model itself has no screen-reader description of spatial relationships, and floating labels are decorative duplicates of the directory and search.
      </p>
    </div>
  )
}

export function InfoPanel() {
  const tab = useApp((s) => s.infoTab)
  const set = useApp((s) => s.set)
  return (
    <div>
      <div role="tablist" aria-label="Information" className="mb-3 flex flex-wrap gap-1.5">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`info-${id}`}
            className="btn !min-h-9 !px-2.5 text-xs"
            aria-pressed={tab === id}
            onClick={() => set({ infoTab: id })}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`info-${tab}`}>
        {tab === 'about' && <About />}
        {tab === 'sources' && <Sources />}
        {tab === 'accuracy' && <Accuracy />}
        {tab === 'controls' && <Controls />}
        {tab === 'accessibility' && <Accessibility />}
      </div>
    </div>
  )
}
