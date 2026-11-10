/**
 * Captures the documentation screenshots into docs/screenshots/.
 * Run on a machine with a GPU:  SHOTS=1 npx playwright test e2e/screenshots.spec.ts
 */
import { expect, test } from '@playwright/test'

const SHOTS: { file: string; hash: string }[] = [
  { file: '01-overview-isometric.png', hash: '#m=iso' },
  { file: '02-central-campus.png', hash: '#m=orbit&c=-150,40,0.9,1.0,430' },
  { file: '03-chung-chi-lake.png', hash: '#m=orbit&c=270,440,0.4,1.1,330' },
  { file: '04-hillside-from-the-east.png', hash: '#m=orbit&c=300,250,1.57,1.18,1100' },
  { file: '05-new-asia-water-tower.png', hash: '#m=orbit&c=171,-65,0.6,1.2,190' },
  { file: '06-street-level-university-mall.png', hash: '#m=explore&c=-60,102.7,62,1.571,0.08' },
  { file: '07-night.png', hash: '#m=orbit&c=-150,40,0.9,1.05,420&t=night' },
  { file: '08-confidence-overlay.png', hash: '#m=iso&c=-100,100,1.02,0.93,900&l=1111111001' },
  { file: '09-campus-zones.png', hash: '#m=iso&l=1111111010' },
]

test.describe('documentation screenshots', () => {
  test.skip(!process.env.SHOTS, 'set SHOTS=1 to regenerate docs/screenshots')
  for (const s of SHOTS) {
    test(s.file, async ({ page }) => {
      await page.goto('/' + s.hash)
      const explore = page.getByRole('button', { name: 'Explore campus' })
      await expect(explore).toBeEnabled({ timeout: 90_000 })
      await explore.click()
      await expect.poll(() => page.evaluate(() => (window as any).__cuhk?.store.getState().loaded), { timeout: 120_000 }).toBe(true)
      await page.waitForTimeout(6000)
      await page.screenshot({ path: `docs/screenshots/${s.file}` })
    })
  }
})
