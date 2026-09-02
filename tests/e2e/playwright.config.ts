import { defineConfig, devices } from '@playwright/test';

/**
 * governance.md §9 — "Playwright (for end-to-end flows, layout testing, and automatic
 * video/screenshot capture on failure)."
 *
 * Runs against a locally published build, not the deployed site. Two reasons: the free F0
 * tier of Document Intelligence allows 500 pages a month and roughly two calls a minute, so
 * a suite that hit the real model would exhaust the quota and flake on throttling; and a
 * test that depends on a deployment being current fails for reasons that have nothing to do
 * with the change under test.
 *
 * The deployed site is covered instead by the smoke test in deploy.yml, which is the right
 * shape for that question: is the thing that just shipped alive?
 */

const PORT = 5199;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: BASE_URL,
    // §9 asks for automatic capture on failure. Retained only for failures: keeping video
    // for passing runs would bury the one recording anybody wants to watch.
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Serves the published API, which includes the built client in wwwroot — the same single
  // artifact the deploy step ships, so the tests exercise the real hosting arrangement
  // rather than the Vite dev server.
  webServer: {
    command: 'node ./start-app.mjs',
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
