import { useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Compass } from '../components/Compass'
import { Directory } from '../components/Directory'
import { Fallback } from '../components/Fallback'
import { IconClose, IconInfo, IconLayers, IconList, IconPin } from '../components/icons'
import { Joystick } from '../components/Joystick'
import { Landing } from '../components/Landing'
import { ModeBar } from '../components/ModeBar'
import { PlacesPanel } from '../components/PlacesPanel'
import { Inspector } from '../features/inspector/Inspector'
import { LayersPanel } from '../features/layers/LayersPanel'
import { SearchBox } from '../features/search/SearchBox'
import { InfoPanel } from '../features/source-panel/InfoPanel'
import { CampusScene } from '../scene/CampusScene'
import { runtime, startLoading } from './runtime'
import { useApp, type Panel } from './store'
import { readUrlState } from './urlState'

function hasWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

const PANELS: [Exclude<Panel, null>, string, () => React.ReactNode][] = [
  ['layers', 'Layers', () => <IconLayers />],
  ['places', 'Places', () => <IconPin />],
  ['directory', 'Directory', () => <IconList />],
  ['info', 'About & sources', () => <IconInfo />],
]
const PANEL_TITLE: Record<Exclude<Panel, null>, string> = { layers: 'Layers & display', places: 'Guided fly-to', directory: 'Campus directory', info: 'About this model' }

function SidePanel() {
  const panel = useApp((s) => s.panel)
  const set = useApp((s) => s.set)
  if (!panel) return null
  return (
    <section
      aria-label={PANEL_TITLE[panel]}
      className="panel pointer-events-auto absolute top-[4.4rem] bottom-[7.2rem] left-2 z-30 flex w-[calc(100%-1rem)] flex-col sm:bottom-auto sm:left-3 sm:max-h-[calc(100vh-11rem)] sm:w-[24rem]"
    >
      <header className="flex items-center justify-between border-b-2 border-[var(--color-edge)] px-3 py-2">
        <h2 className="font-[family-name:var(--font-pixel)] text-xl font-semibold">{PANEL_TITLE[panel]}</h2>
        <button type="button" className="btn !min-h-9 !min-w-9 !px-0" aria-label="Close panel" onClick={() => set({ panel: null })}>
          <IconClose />
        </button>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
        {panel === 'layers' && <LayersPanel />}
        {panel === 'places' && <PlacesPanel />}
        {panel === 'directory' && <Directory />}
        {panel === 'info' && <InfoPanel />}
      </div>
    </section>
  )
}

export function App() {
  const [webgl] = useState(hasWebGL2)
  const started = useApp((s) => s.started)
  const perf = useApp((s) => s.perf)
  const panel = useApp((s) => s.panel)
  const catalogReady = useApp((s) => s.catalogReady)
  const selected = useApp((s) => s.selected)
  const set = useApp((s) => s.set)

  useEffect(() => {
    const url = readUrlState()
    if (url)
      useApp.setState({
        ...(url.mode ? { mode: url.mode } : {}),
        ...(url.layers ? { layers: url.layers } : {}),
        ...(url.time ? { time: url.time } : {}),
        ...(url.perf !== undefined ? { perf: url.perf } : {}),
      })
    void startLoading()
  }, [])
  // restore a shared selection once the catalogue is available
  useEffect(() => {
    const key = readUrlState()?.selectedKey
    const f = key && catalogReady ? runtime.world?.byKey.get(key) : undefined
    if (f) useApp.setState({ selected: f.i })
  }, [catalogReady])

  if (!webgl) return <Fallback />
  const f = runtime.world?.feature(selected)
  return (
    <div className="relative h-full w-full select-none">
      <Canvas
        flat
        shadows
        dpr={perf ? 1 : [1, 1.75]}
        gl={{ antialias: !perf, powerPreference: 'high-performance' }}
        aria-label="3-D model of the CUHK campus. Use the search, directory and camera buttons for a non-visual route to the same places."
        role="img"
        tabIndex={0}
      >
        <CampusScene />
      </Canvas>
      <Landing />
      <div aria-live="polite" className="sr-only">
        {f ? `Selected ${f.name}` : ''}
      </div>
      {started && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-2 sm:p-3">
          <header className="flex items-start gap-2">
            <div className="panel pointer-events-auto hidden h-11 shrink-0 items-center px-3 lg:flex">
              <span className="font-[family-name:var(--font-pixel)] text-xl font-semibold">CUHK Voxel Campus</span>
            </div>
            <div className="pointer-events-auto min-w-0 flex-1 sm:max-w-md">
              <SearchBox />
            </div>
            <div className="pointer-events-auto ml-auto flex gap-1.5">
              {PANELS.map(([id, label, icon]) => (
                <button key={id} type="button" className="btn !min-h-11 !px-2.5" aria-pressed={panel === id} aria-label={label} title={label} onClick={() => set({ panel: panel === id ? null : id })}>
                  {icon()}
                  <span className="hidden xl:inline">{label}</span>
                </button>
              ))}
            </div>
          </header>
          <footer className="flex flex-col gap-2">
            <div className="flex items-end justify-between gap-2">
              <ModeBar />
              <div className="hidden sm:block">
                <Compass />
              </div>
            </div>
            <p className="pointer-events-auto self-start bg-[rgb(24_31_42/0.78)] px-2 py-0.5 text-[10.5px] leading-4 text-white">
              ©{' '}
              <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                OpenStreetMap
              </a>{' '}
              contributors · Terrain: Lands Department, HKSAR<span className="hidden sm:inline"> (DATA.GOV.HK)</span> · Names: <span className="hidden sm:inline">official </span>CUHK map · Unofficial
              <span className="hidden sm:inline">, not for navigation</span> ·{' '}
              <button type="button" className="underline" onClick={() => useApp.getState().openInfo('sources')}>
                Sources
              </button>
            </p>
          </footer>
        </div>
      )}
      {started && <SidePanel />}
      {started && <Inspector />}
      {started && <Joystick />}
      {!started && panel === 'info' && <SidePanel />}
    </div>
  )
}
