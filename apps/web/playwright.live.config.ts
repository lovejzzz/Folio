import { defineConfig, devices } from '@playwright/test';

/**
 * End to end against a real model. Start the bridge first
 * (`node scripts/claude-bridge.mjs`), then `pnpm test:live`.
 * Results, screenshots and each course land in live-results/;
 * `python3 scripts/score-live.py` scores them.
 */
process.env.LANG ||= 'C.UTF-8';
const port = Number(process.env.FOLIO_PORT ?? 4190);

export default defineConfig({
  testDir: './e2e-live',
  timeout: 40 * 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 3,
  retries: 0,
  reporter: 'list',
  outputDir: './live-results/playwright',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1440, height: 900 },
    // The course follows the teacher's locale; en-GB unless LOCALE says otherwise.
    locale: process.env.LOCALE ?? 'en-GB',
    trace: 'retain-on-failure',
  },
  webServer: { command: `pnpm exec vite preview --port ${port} --strictPort`, port, reuseExistingServer: true },
});
