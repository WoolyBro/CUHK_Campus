import { useEffect, useRef } from 'react'
import { useApp } from '../app/store'

/** Opening screen: title, description, loading progress, Explore button and accuracy disclosure. */
export function Landing() {
  const { started, loadProgress, loadPhase, loaded, error } = useApp()
  const set = useApp((s) => s.set)
  const openInfo = useApp((s) => s.openInfo)
  const btn = useRef<HTMLButtonElement>(null)
  const ready = loadProgress >= 0.58
  useEffect(() => {
    if (ready) btn.current?.focus()
  }, [ready])
  if (started) return null
  const pct = Math.round(loadProgress * 100)
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-end justify-center p-4 sm:items-center sm:justify-start sm:p-10">
      <section aria-labelledby="landing-title" className="panel pointer-events-auto w-full max-w-md p-5 sm:p-7">
        <p className="mb-1 font-[family-name:var(--font-pixel)] text-sm tracking-widest text-[var(--color-grass)]">UNOFFICIAL · 1 BLOCK = 1 METRE</p>
        <h1 id="landing-title" className="font-[family-name:var(--font-pixel)] text-4xl leading-none font-semibold sm:text-5xl">
          CUHK Voxel Campus
        </h1>
        <p className="mt-3 text-base text-slate-700">A data-informed block-scale digital recreation of The Chinese University of Hong Kong.</p>
        <p className="mt-2 text-sm text-slate-600">
          Real terrain, roads, paths and building footprints from public geographic data, rebuilt block by block. Orbit, fly or walk through the whole Sha Tin campus.
        </p>
        <div className="mt-5" role="status" aria-live="polite">
          <div className="mb-1 flex justify-between text-xs font-semibold text-slate-600">
            <span>{error ? 'Could not load the campus' : loaded ? 'Campus ready' : `${loadPhase}…`}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-3 border-2 border-[var(--color-edge)] bg-white" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Loading campus model">
            <div className="h-full bg-[var(--color-grass)] transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
          {error && <p className="mt-2 text-sm font-semibold text-red-700">{error}</p>}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button ref={btn} type="button" className="btn btn-primary px-6 text-base" disabled={!ready} onClick={() => set({ started: true })}>
            {ready ? 'Explore campus' : 'Loading…'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              set({ started: true })
              set({ panel: 'directory' })
            }}
            disabled={!useApp.getState().catalogReady}
          >
            Text directory
          </button>
        </div>
        <p className="mt-4 text-xs text-slate-600">
          Not an official CUHK product and not for navigation.{' '}
          <button type="button" className="font-semibold underline" onClick={() => openInfo('sources')}>
            Sources &amp; licences
          </button>
          {' · '}
          <button type="button" className="font-semibold underline" onClick={() => openInfo('accuracy')}>
            Accuracy &amp; limitations
          </button>
        </p>
      </section>
    </div>
  )
}
