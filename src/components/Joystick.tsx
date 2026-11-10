import { useRef } from 'react'
import { useApp } from '../app/store'
import { rig } from '../scene/rig'

/** On-screen movement stick and height buttons for touch devices in Explorer mode. */
export function Joystick() {
  const mode = useApp((s) => s.mode)
  const coarse = useApp((s) => s.coarse)
  const flying = useApp((s) => s.flying)
  const knob = useRef<HTMLDivElement>(null)
  const base = useRef<HTMLDivElement>(null)
  if (mode !== 'explore' || !coarse) return null
  const move = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect()
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2),
      y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2)
    const m = Math.hypot(x, y)
    if (m > 1) {
      x /= m
      y /= m
    }
    rig.joy.x = x
    rig.joy.y = y
    rig.etween = null
    if (knob.current) knob.current.style.transform = `translate(${x * 30}px, ${y * 30}px)`
  }
  const end = () => {
    rig.joy.x = rig.joy.y = 0
    if (knob.current) knob.current.style.transform = ''
  }
  const hold = (v: number) => ({
    onPointerDown: () => {
      rig.vert = v
    },
    onPointerUp: () => {
      rig.vert = 0
    },
    onPointerLeave: () => {
      rig.vert = 0
    },
    onPointerCancel: () => {
      rig.vert = 0
    },
  })
  return (
    <div className="pointer-events-none absolute right-3 bottom-[8.5rem] left-3 z-20 flex items-end justify-between">
      <div
        ref={base}
        role="application"
        aria-label="Movement joystick"
        className="pointer-events-auto flex h-28 w-28 touch-none items-center justify-center rounded-full border-2 border-white/80 bg-black/30"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          move(e)
        }}
        onPointerMove={(e) => {
          if (e.buttons || e.pointerType === 'touch') move(e)
        }}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div ref={knob} className="h-12 w-12 rounded-full border-2 border-white bg-white/70" />
      </div>
      {flying && (
        <div className="pointer-events-auto flex flex-col gap-2">
          <button type="button" className="btn h-12 w-12 touch-none" aria-label="Fly up" {...hold(1)}>
            ▲
          </button>
          <button type="button" className="btn h-12 w-12 touch-none" aria-label="Fly down" {...hold(-1)}>
            ▼
          </button>
        </div>
      )}
    </div>
  )
}
