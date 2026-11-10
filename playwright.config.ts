import { defineConfig, devices } from '@playwright/test'

/** End-to-end tests run against the production build (`npm run build` first, or let webServer do it). */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1280, height: 800 },
    // use the real GPU where available; falls back to software WebGL otherwise
    launchOptions: { args: ['--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: { command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 180_000 },
})
