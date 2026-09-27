import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 180000,
  expect: {
    timeout: 15000,
  },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'https://app.flexifunnels.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Injects a CSS rule into EVERY page before any script runs
    extraHTTPHeaders: {},
    // Always show the actual browser window — without this, `npx playwright
    // test` defaults to headless and nothing visibly pops up even though
    // the run is happening. This removes the need to remember `--headed`.
    headless: false,
    launchOptions: {
      slowMo: 150, // small per-action pause so the run is actually watchable, not just a flash
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});