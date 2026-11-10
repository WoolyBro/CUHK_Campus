import { useWorld } from '../../app/hooks'
import { LAYER_KEYS, LAYER_LABELS, useApp, type TimeOfDay } from '../../app/store'
import { CONFIDENCE_STYLE } from '../../scene/CampusScene'

const PATTERN_CSS: Record<string, string> = {
  solid: '',
  'diagonal stripes': 'repeating-linear-gradient(45deg, transparent 0 4px, rgb(255 255 255 / 0.65) 4px 8px)',
  checker: 'repeating-conic-gradient(rgb(255 255 255 / 0.65) 0% 25%, transparent 0% 50%) 0 0 / 8px 8px',
}

/** Layer toggles, time of day, performance mode and overlay legends. */
export function LayersPanel() {
  const layers = useApp((s) => s.layers)
  const toggle = useApp((s) => s.toggleLayer)
  const time = useApp((s) => s.time)
  const perf = useApp((s) => s.perf)
  const set = useApp((s) => s.set)
  const world = useWorld()
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-1 text-xs font-bold tracking-wide text-slate-600 uppercase">Map layers</legend>
        <ul className="grid grid-cols-1 gap-0.5">
          {LAYER_KEYS.map((k) => (
            <li key={k}>
              <label className="flex min-h-9 cursor-pointer items-center gap-2.5 px-1 text-sm hover:bg-white/70">
                <input type="checkbox" role="switch" className="h-4 w-4 accent-[var(--color-grass)]" checked={layers[k]} onChange={() => toggle(k)} />
                {LAYER_LABELS[k]}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      {layers.confidence && (
        <div aria-label="Source-confidence legend">
          <p className="mb-1 text-xs font-bold tracking-wide text-slate-600 uppercase">Confidence legend</p>
          <ul className="space-y-1 text-sm">
            {Object.values(CONFIDENCE_STYLE).map((c) => (
              <li key={c.label} className="flex items-center gap-2">
                <span className="inline-block h-4 w-6 border border-slate-700" style={{ backgroundColor: c.colour, backgroundImage: PATTERN_CSS[c.pattern] }} aria-hidden="true" />
                {c.label} <span className="text-xs text-slate-500">({c.pattern})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {layers.zones && !layers.confidence && world && (
        <div aria-label="Campus zone legend">
          <p className="mb-1 text-xs font-bold tracking-wide text-slate-600 uppercase">Zones</p>
          <ul className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
            {world.meta.zones
              .filter((z) => z.enabled)
              .map((z) => (
                <li key={z.id} className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 shrink-0 border border-slate-700" style={{ background: z.colour }} aria-hidden="true" />
                  {z.nameEn}
                </li>
              ))}
          </ul>
        </div>
      )}
      <fieldset>
        <legend className="mb-1 text-xs font-bold tracking-wide text-slate-600 uppercase">Time of day</legend>
        <div className="flex gap-2">
          {(['day', 'sunset', 'night'] as TimeOfDay[]).map((t) => (
            <button key={t} type="button" className="btn flex-1 capitalize" aria-pressed={time === t} onClick={() => set({ time: t })}>
              {t}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
        <input type="checkbox" role="switch" className="mt-0.5 h-4 w-4 accent-[var(--color-grass)]" checked={perf} onChange={() => set({ perf: !perf })} />
        <span>
          <span className="font-semibold">Performance mode</span>
          <br />
          <span className="text-xs text-slate-600">Fewer trees, no shadows or small props, shorter draw distance, lower resolution.</span>
        </span>
      </label>
    </div>
  )
}
