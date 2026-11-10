import { bus } from '../app/bus'
import { useApp, type CameraMode } from '../app/store'
import { IconBolt, IconFly, IconHome, IconMinus, IconMoon, IconNorth, IconPlus, IconSun, IconWalk } from './icons'

const MODES: [CameraMode, string, string][] = [
  ['iso', 'Isometric', 'Isometric overview (orthographic)'],
  ['orbit', 'Orbit', 'Free orbit (perspective)'],
  ['explore', 'Explore', 'Campus explorer: walk, run or fly'],
]

/** Camera modes and the always-available view tools. */
export function ModeBar() {
  const mode = useApp((s) => s.mode)
  const flying = useApp((s) => s.flying)
  const time = useApp((s) => s.time)
  const perf = useApp((s) => s.perf)
  const set = useApp((s) => s.set)
  return (
    <nav aria-label="Camera" className="pointer-events-auto scroll-thin flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
      <div role="group" aria-label="Camera mode" className="flex">
        {MODES.map(([m, label, title]) => (
          <button key={m} type="button" className="btn -ml-[2px] shrink-0 first:ml-0" aria-pressed={mode === m} title={title} onClick={() => set({ mode: m })}>
            {label}
          </button>
        ))}
      </div>
      {mode === 'explore' && (
        <button type="button" className="btn" aria-pressed={flying} title="Toggle fly / walk (F)" onClick={() => set({ flying: !flying })}>
          {flying ? <IconFly /> : <IconWalk />} {flying ? 'Flying' : 'Walking'}
        </button>
      )}
      <button type="button" className="btn" title="Street-level view at the current spot" onClick={() => bus.emit({ type: 'street' })}>
        <IconWalk />
        <span className="hidden sm:inline">Street level</span>
        <span className="sr-only sm:hidden">Street level</span>
      </button>
      <button type="button" className="btn" title="Reset to campus overview (R)" aria-label="Reset to campus overview" onClick={() => bus.emit({ type: 'reset' })}>
        <IconHome />
        <span className="hidden md:inline">Overview</span>
      </button>
      <button type="button" className="btn" title="North up (N)" aria-label="Rotate view so north is up" onClick={() => bus.emit({ type: 'north' })}>
        <IconNorth />
      </button>
      {mode !== 'explore' && (
        <div role="group" aria-label="Zoom" className="flex">
          <button type="button" className="btn" aria-label="Zoom in" onClick={() => bus.emit({ type: 'zoom', factor: 0.6 })}>
            <IconPlus />
          </button>
          <button type="button" className="btn -ml-[2px]" aria-label="Zoom out" onClick={() => bus.emit({ type: 'zoom', factor: 1.6 })}>
            <IconMinus />
          </button>
        </div>
      )}
      <button
        type="button"
        className="btn"
        title="Day / sunset / night"
        aria-label={`Time of day: ${time}. Switch.`}
        onClick={() => set({ time: time === 'day' ? 'sunset' : time === 'sunset' ? 'night' : 'day' })}
      >
        {time === 'night' ? <IconMoon /> : <IconSun />}
        <span className="hidden capitalize md:inline">{time}</span>
      </button>
      <button type="button" className="btn" aria-pressed={perf} title="Performance mode" aria-label="Performance mode" onClick={() => set({ perf: !perf })}>
        <IconBolt />
      </button>
    </nav>
  )
}
