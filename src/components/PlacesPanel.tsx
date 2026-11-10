import { bus } from '../app/bus'
import { resolveRef } from '../app/hooks'
import { useApp } from '../app/store'
import { PRESETS } from '../data/presets'

/** Guided fly-to: cinematic camera moves to key places (cancel with any input). */
export function PlacesPanel() {
  const select = useApp((s) => s.select)
  const set = useApp((s) => s.set)
  const groups = [...new Set(PRESETS.map((p) => p.group))]
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600">Smooth guided flights. Drag, scroll or press any key to take over at once.</p>
      {groups.map((g) => (
        <div key={g}>
          <p className="mb-1 text-xs font-bold tracking-wide text-slate-600 uppercase">{g}</p>
          <ul className="grid grid-cols-1 gap-1">
            {PRESETS.filter((p) => p.group === g).map((p) => (
              <li key={p.label}>
                <button
                  type="button"
                  className="w-full border border-slate-400 bg-white px-2 py-1.5 text-left text-sm hover:bg-[#e4f2d8]"
                  onClick={() => {
                    const f = resolveRef(p.ref)
                    if (!f) return
                    select(f.kind === 'zone' ? null : f.i)
                    bus.emit({ type: 'flyToPoint', x: f.x, z: f.z, dist: p.dist })
                    if (window.innerWidth < 640) set({ panel: null })
                  }}
                >
                  {p.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
