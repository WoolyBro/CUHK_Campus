import { useMemo, useState } from 'react'
import { bus } from '../app/bus'
import { useWorld } from '../app/hooks'
import { useApp } from '../app/store'

/** Text alternative to the 3-D view: every named campus location, grouped by zone. */
export function Directory() {
  const world = useWorld()
  const select = useApp((s) => s.select)
  const set = useApp((s) => s.set)
  const [filter, setFilter] = useState('')
  const groups = useMemo(() => {
    if (!world) return []
    const q = filter.trim().toLowerCase()
    const items = world.features.filter(
      (f) => (f.kind === 'building' ? f.rank >= 60 : f.kind === 'landmark') && (!q || `${f.name} ${f.nameZh ?? ''} ${f.code ?? ''} ${f.short ?? ''}`.toLowerCase().includes(q)),
    )
    const zones = [...world.meta.zones, { id: 0, nameEn: 'Other / surrounding area', nameZh: '' }]
    return zones.map((z) => ({ zone: z, items: items.filter((f) => f.zone === z.id).sort((a, b) => a.name.localeCompare(b.name)) })).filter((g) => g.items.length)
  }, [world, filter])
  if (!world) return <p className="text-sm">Loading the campus catalogue…</p>
  return (
    <div>
      <p className="mb-2 text-sm text-slate-700">A plain-text list of the main campus locations in the model. Choosing one selects it and moves the 3-D camera there.</p>
      <label className="mb-3 block text-sm font-semibold">
        Filter
        <input
          type="search"
          className="mt-1 block h-10 w-full border-2 border-[var(--color-edge)] bg-white px-2 font-normal"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Name or code"
        />
      </label>
      {groups.map(({ zone, items }) => (
        <section key={zone.id} className="mb-4">
          <h3 className="mb-1 font-bold">
            {zone.nameEn}{' '}
            <span lang="zh-Hant" className="font-normal text-slate-600">
              {zone.nameZh}
            </span>{' '}
            <span className="text-xs font-normal text-slate-500">({items.length})</span>
          </h3>
          <ul className="divide-y divide-slate-300 border border-slate-300 bg-white">
            {items.map((f) => (
              <li key={f.i}>
                <button
                  type="button"
                  className="flex w-full items-baseline justify-between gap-3 px-2 py-1.5 text-left text-sm hover:bg-[#e4f2d8]"
                  onClick={() => {
                    select(f.i)
                    bus.emit({ type: 'flyTo', feature: f })
                    set({ panel: null, started: true })
                  }}
                >
                  <span>
                    {f.name}{' '}
                    {f.nameZh && (
                      <span lang="zh-Hant" className="text-slate-600">
                        {f.nameZh}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-slate-600">{[f.short, f.code, f.kind === 'landmark' ? 'landmark' : f.geom].filter(Boolean).join(' · ')}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {groups.length === 0 && <p className="text-sm text-slate-600">Nothing matches that filter.</p>}
    </div>
  )
}
