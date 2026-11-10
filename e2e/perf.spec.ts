/** Frame-rate probe (informational). Run:  PERF=1 npx playwright test e2e/perf.spec.ts */
import { expect, test } from '@playwright/test'

test('frame rate in overview, close orbit and street level', async ({ page }) => {
  test.skip(!process.env.PERF, 'set PERF=1 to run the frame-rate probe')
  await page.goto('/')
  const explore = page.getByRole('button', { name: 'Explore campus' })
  await expect(explore).toBeEnabled({ timeout: 90_000 })
  await explore.click()
  await expect.poll(() => page.evaluate(() => (window as any).__cuhk?.store.getState().loaded), { timeout: 120_000 }).toBe(true)
  const probe = (label: string, setup: string) =>
    page.evaluate(
      async ([label, setup]) => {
        const c = (window as any).__cuhk
        new Function('c', setup)(c)
        await new Promise((r) => setTimeout(r, 2500))
        let n = 0
        const t0 = performance.now()
        await new Promise<void>((r) => {
          const f = () => {
            n++
            if (performance.now() - t0 < 3000) requestAnimationFrame(f)
            else r()
          }
          requestAnimationFrame(f)
        })
        const gl = c.gl.getContext()
        const ext = gl.getExtension('WEBGL_debug_renderer_info')
        return {
          label,
          fps: Math.round(n / 3),
          triangles: c.gl.info.render.triangles,
          calls: c.gl.info.render.calls,
          renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
          pixels: `${c.gl.domElement.width}×${c.gl.domElement.height}`,
        }
      },
      [label, setup],
    )
  const pose = (m: string, p: string) => `c.store.setState({mode:'${m}'}); Object.assign(c.rig.goal, ${p}); Object.assign(c.rig.cur, ${p});`
  const results = [
    await probe('isometric overview', ''),
    await probe('orbit, central campus', pose('orbit', '{tx:-150,tz:40,az:0.9,pol:1.05,dist:420}')),
    await probe('orbit, low angle', pose('orbit', '{tx:-150,tz:40,az:0.9,pol:1.4,dist:160}')),
    await probe('street level', `c.store.setState({mode:'explore', flying:false}); c.rig.etween=null; c.rig.pos.set(-60,102.7,62); c.rig.yaw=1.57; c.rig.pitch=0.05;`),
    await probe(
      'performance mode overview',
      `c.store.setState({mode:'iso', perf:true}); c.bus = 0;` + `Object.assign(c.rig.goal,{tx:30,tz:20,az:1.02,pol:0.93,dist:3200}); Object.assign(c.rig.cur,c.rig.goal);`,
    ),
  ]
  console.table(results)
})
