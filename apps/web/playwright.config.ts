import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.FOLIO_PORT ?? 4173);

// Chromium needs a UTF-8 locale to keep non-ASCII download names (course titles, Chinese).
process.env.LANG ||= 'C.UTF-8';

/** A Chromium already on this machine, for the Chromium projects only: WebKit has its own. */
const chromium = process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {};

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...chromium, viewport: { width: 1440, height: 900 } }, testIgnore: /(phone|smoke)\.spec\.ts/ },
    { name: 'phone', use: { ...devices['Pixel 7'], ...chromium }, testMatch: /phone\.spec\.ts/ },
    // Safari's engine, on the paths every visit takes, and where course code is run: a sandboxed frame is the browser's own work.
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } }, testMatch: /(smoke|workshop)\.spec\.ts/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } }, testMatch: /workshop\.spec\.ts/ },
  ],
  webServer: {
    // Built apart from the release, with a stand-in Google client, so sign-in and Google Docs can be tested.
    command: `pnpm exec vite build --mode e2e --outDir dist-e2e --emptyOutDir --logLevel warn && pnpm exec vite preview --outDir dist-e2e --port ${port} --strictPort`,
    port,
    // Always this build: a server left running from an earlier one would be tested in its place.
    reuseExistingServer: false,
  },
});
