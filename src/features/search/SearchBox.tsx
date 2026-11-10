import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { bus } from '../../app/bus'
import { useSearchIndex, useWorld } from '../../app/hooks'
import { useApp } from '../../app/store'
import { IconClose, IconSearch } from '../../components/icons'
import type { FeatureRecord } from '../../lib/voxel/world-format'

const KIND_LABEL: Record<string, string> = { building: 'Building', landmark: 'Landmark', facility: 'Facility', stop: 'Bus stop', road: 'Road', zone: 'Zone' }

/** Accessible combobox search over buildings, codes, colleges, landmarks, roads, stops and facilities. */
export function SearchBox() {
  const index = useSearchIndex()
  const world = useWorld()
  const select = useApp((s) => s.select)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()
  const hits = useMemo(() => (index && q.trim() ? index.search(q) : []), [index, q])
  const zoneName = (id: number) => world?.meta.zones.find((z) => z.id === id)?.nameEn

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '/' && t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA') {
        e.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const choose = (f: FeatureRecord) => {
    select(f.i)
    bus.emit({ type: 'flyTo', feature: f })
    setOpen(false)
    setQ(f.name)
    input.current?.blur()
  }

  return (
    <div className="relative w-full max-w-md" role="search">
      <div className="panel flex h-11 items-center gap-2 px-3">
        <span className="text-slate-500">
          <IconSearch />
        </span>
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-expanded={open && hits.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && hits[active] ? `${listId}-${active}` : undefined}
          aria-label="Search buildings, codes, colleges, landmarks and roads"
          placeholder="Search buildings, codes, colleges…  ( / )"
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500"
          value={q}
          disabled={!index}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setOpen(true)
              setActive((a) => Math.min(hits.length - 1, a + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(0, a - 1))
            } else if (e.key === 'Enter' && hits[active]) {
              e.preventDefault()
              choose(hits[active].feature)
            } else if (e.key === 'Escape') {
              setOpen(false)
              input.current?.blur()
            }
          }}
        />
        {q && (
          <button
            type="button"
            aria-label="Clear search"
            className="text-slate-500 hover:text-slate-900"
            onClick={() => {
              setQ('')
              input.current?.focus()
            }}
          >
            <IconClose />
          </button>
        )}
      </div>
      {open && q.trim() && (
        <ul id={listId} role="listbox" aria-label="Search results" className="panel scroll-thin absolute top-12 right-0 left-0 z-40 max-h-[55vh] overflow-y-auto py-1">
          {hits.length === 0 && <li className="px-3 py-2 text-sm text-slate-600">No matching place. Try a building code such as “LSK”.</li>}
          {hits.map((h, i) => (
            <li
              key={h.feature.i}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`flex cursor-pointer items-start justify-between gap-2 px-3 py-2 text-sm ${i === active ? 'bg-[#e4f2d8]' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(h.feature)
              }}
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{h.feature.name}</span>
                <span className="block truncate text-xs text-slate-600">{[h.feature.nameZh, KIND_LABEL[h.feature.kind], zoneName(h.feature.zone)].filter(Boolean).join(' · ')}</span>
              </span>
              {(h.feature.short || h.feature.code) && <span className="shrink-0 border border-[#7a5a00] bg-[var(--color-sun)] px-1.5 text-xs font-bold">{h.feature.short || h.feature.code}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
