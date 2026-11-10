import { expect, test, type Page } from '@playwright/test'

/** Performance mode keeps software-rendered CI runs quick; behaviour under test is identical. */
const URL = '/#p=1'

async function enter(page: Page) {
  await page.goto(URL)
  await expect(page.getByRole('heading', { name: 'CUHK Voxel Campus' })).toBeVisible()
  const explore = page.getByRole('button', { name: 'Explore campus' })
  await expect(explore).toBeEnabled({ timeout: 90_000 })
  await explore.click()
  await expect(page.getByRole('navigation', { name: 'Camera' })).toBeVisible()
}
const state = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__cuhk
    const s = c.store.getState()
    return { mode: s.mode, selected: s.selected, layers: s.layers, loaded: s.loaded, goal: { ...c.rig.goal }, cur: { ...c.rig.cur }, tris: c.gl.info.render.triangles }
  })

test('initial load shows the landing screen, progress and attribution', async ({ page }) => {
  await page.goto(URL)
  await expect(page.getByRole('heading', { name: 'CUHK Voxel Campus' })).toBeVisible()
  await expect(page.getByText('A data-informed block-scale digital recreation')).toBeVisible()
  await expect(page.getByRole('progressbar', { name: 'Loading campus model' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sources & licences' })).toBeVisible()
  await enter(page)
  await expect(page.getByText('OpenStreetMap').first()).toBeVisible()
  await expect(page.getByText(/Lands Department/).first()).toBeVisible()
  await expect.poll(async () => (await state(page)).loaded, { timeout: 90_000 }).toBe(true)
  // the scene actually draws geometry
  await expect.poll(async () => (await state(page)).tris, { timeout: 60_000 }).toBeGreaterThan(100_000)
})

test('search by building code focuses the camera and opens the inspector', async ({ page }) => {
  await enter(page)
  const before = (await state(page)).goal
  const box = page.getByRole('combobox', { name: /Search buildings/ })
  await box.fill('LSK')
  await expect(page.getByRole('option').first()).toContainText('Lee Shau Kee Building')
  await box.press('Enter')
  const panel = page.getByRole('complementary', { name: 'Selected place' })
  await expect(panel).toContainText('Lee Shau Kee Building')
  await expect(panel).toContainText('李兆基樓')
  await expect(panel).toContainText('Code LSK')
  await expect(panel).toContainText('Central Campus')
  await expect(panel).toContainText(/Verified geometry|Inferred geometry/)
  const after = (await state(page)).goal
  expect(after.dist).toBeLessThan(before.dist / 2)
  expect(Math.hypot(after.tx - before.tx, after.tz - before.tz)).toBeGreaterThan(50)
  // back to overview
  await panel.getByRole('button', { name: 'Overview' }).click()
  await expect(panel).toBeHidden()
})

test('layer toggles and day/night switch update the scene state', async ({ page }) => {
  await enter(page)
  await page.getByRole('button', { name: 'Layers' }).click()
  const trees = page.getByRole('switch', { name: 'Trees & vegetation' })
  await expect(trees).toBeChecked()
  await trees.click()
  await expect(trees).not.toBeChecked()
  expect((await state(page)).layers.trees).toBe(false)
  await page.getByRole('switch', { name: 'Source-confidence overlay' }).click()
  await expect(page.getByText('Verified geometry')).toBeVisible()
  await expect(page.getByText('Stylised / approximate')).toBeVisible()
  await page.getByRole('button', { name: 'night' }).click()
  await expect(page).toHaveURL(/t=night/)
  await expect(page).toHaveURL(/l=1110111001/)
})

test('camera modes switch and reset returns to the campus overview', async ({ page }) => {
  await enter(page)
  await page.getByRole('button', { name: 'Orbit', exact: true }).click()
  expect((await state(page)).mode).toBe('orbit')
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect.poll(async () => (await state(page)).goal.dist).toBeLessThan(2000)
  await page.getByRole('button', { name: 'Explore', exact: true }).click()
  expect((await state(page)).mode).toBe('explore')
  await expect(page.getByRole('button', { name: /Flying|Walking/ })).toBeVisible()
  await page.getByRole('button', { name: 'Reset to campus overview' }).click()
  await expect.poll(async () => (await state(page)).mode).toBe('iso')
  await expect.poll(async () => (await state(page)).goal.dist).toBeGreaterThan(2500)
  // keyboard: R also resets, N turns north-up
  await page.keyboard.press('n')
  await expect.poll(async () => Math.abs(Math.sin((await state(page)).goal.az))).toBeLessThan(0.01)
})

test('clicking a building in the 3-D view selects it', async ({ page }) => {
  await enter(page)
  await expect.poll(async () => (await state(page)).loaded, { timeout: 90_000 }).toBe(true)
  // put the University Library in the middle of the view, then click its projected position
  const pt = await page.evaluate(async () => {
    const c = (window as any).__cuhk
    const f = c.runtime.world.features.find((x: any) => x.name === 'University Library' && x.kind === 'building')
    const pose = { tx: f.x, tz: f.z, ty: f.y - 15, az: 0.6, pol: 0.5, dist: 260 }
    Object.assign(c.rig.goal, pose)
    Object.assign(c.rig.cur, pose)
    await new Promise((r) => setTimeout(r, 1500))
    const cam = c.three().camera
    cam.updateMatrixWorld()
    const v = { x: f.x, y: f.y - 1, z: f.z }
    const e = cam.matrixWorldInverse.elements,
      p = cam.projectionMatrix.elements
    const vx = e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12],
      vy = e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13],
      vz = e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14]
    const cx = p[0] * vx + p[4] * vy + p[8] * vz + p[12],
      cy = p[1] * vx + p[5] * vy + p[9] * vz + p[13],
      cw = p[3] * vx + p[7] * vy + p[11] * vz + p[15]
    const r = c.gl.domElement.getBoundingClientRect()
    return { x: r.left + ((cx / cw) * 0.5 + 0.5) * r.width, y: r.top + (-(cy / cw) * 0.5 + 0.5) * r.height, id: f.i }
  })
  await page.mouse.click(pt.x, pt.y)
  await expect.poll(async () => (await state(page)).selected).toBe(pt.id)
  await expect(page.getByRole('complementary', { name: 'Selected place' })).toContainText('University Library')
  await expect(page).toHaveURL(/s=way\/134410449/)
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await state(page)).selected).toBeNull()
})

test('text directory and information panels are reachable without the 3-D view', async ({ page }) => {
  await enter(page)
  await page.getByRole('button', { name: 'Directory' }).click()
  await expect(page.getByRole('heading', { name: /Chung Chi College/ })).toBeVisible()
  await page.getByRole('searchbox').fill('chapel')
  await expect(page.getByRole('button', { name: /Chung Chi College Chapel/ })).toBeVisible()
  await page.getByRole('button', { name: 'About & sources' }).click()
  await page.getByRole('tab', { name: 'Sources & licences' }).click()
  await expect(page.getByText('Open Database License (ODbL) 1.0')).toBeVisible()
  await page.getByRole('tab', { name: 'Accuracy' }).click()
  await expect(page.getByText(/Do not use this model for navigation/)).toBeVisible()
})

test('mobile layout keeps the controls usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await enter(page)
  await expect(page.getByRole('combobox', { name: /Search buildings/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Isometric' })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
