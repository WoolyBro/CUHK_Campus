import { useEffect, useRef } from 'react'
import { bus } from '../app/bus'
import { rig } from '../scene/rig'

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/** Orientation widget: the needle shows north, the read-out the direction the camera faces. */
export function Compass() {
  const needle = useRef<HTMLDivElement>(null)
  const text = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    let last = -1
    const tick = () => {
      const h = Math.round(rig.heading)
      if (h !== last) {
        last = h
        if (needle.current) needle.current.style.transform = `rotate(${-h}deg)`
        if (text.current) text.current.textContent = `${POINTS[Math.round(h / 45) % 8]} ${h}°`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <button
      type="button"
      className="panel pointer-events-auto flex h-[4.5rem] w-[4.5rem] flex-col items-center justify-center !p-0"
      title="Camera direction — click for north-up"
      aria-label="Compass. Click to rotate the view north-up."
      onClick={() => bus.emit({ type: 'north' })}
    >
      <div ref={needle} className="relative h-9 w-9" aria-hidden="true">
        <div className="absolute top-0 left-1/2 h-1/2 w-2 -translate-x-1/2 bg-red-600" />
        <div className="absolute bottom-0 left-1/2 h-1/2 w-2 -translate-x-1/2 bg-slate-400" />
        <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 text-[9px] font-black text-white">N</span>
      </div>
      <span ref={text} className="mt-0.5 font-mono text-[10px] font-bold">
        N 0°
      </span>
    </button>
  )
}
