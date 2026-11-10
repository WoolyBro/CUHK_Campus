import { Directory } from './Directory'

/** Shown when WebGL 2 is unavailable. */
export function Fallback() {
  return (
    <main className="mx-auto h-full max-w-2xl overflow-y-auto p-6">
      <h1 className="font-[family-name:var(--font-pixel)] text-4xl font-semibold">CUHK Voxel Campus</h1>
      <p className="mt-2 text-lg">A data-informed block-scale digital recreation of The Chinese University of Hong Kong.</p>
      <div className="panel mt-5 p-4" role="alert">
        <h2 className="text-lg font-bold">This browser cannot show the 3-D campus</h2>
        <p className="mt-1 text-sm">
          The model needs WebGL 2. Please try a current version of Chrome, Edge, Firefox or Safari, make sure hardware acceleration is switched on, and reload. The text directory below lists the main
          locations in the model.
        </p>
      </div>
      <div className="mt-6">
        <Directory />
      </div>
      <p className="mt-6 text-xs text-slate-700">
        Map data © OpenStreetMap contributors (ODbL). Terrain: Lands Department, HKSAR Government (DATA.GOV.HK). Names and codes: official CUHK campus map. Unofficial — not for navigation.
      </p>
    </main>
  )
}
