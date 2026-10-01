import { defineConfig, devices } from '@playwright/test';

/** Which browsers to run: BROWSERS=chromium,firefox,edge (default: chromium only). */
function wantedBrowsers(): string[] {
  const list = (process.env.BROWSERS || 'chromium').split(',').map((b) => b.trim().toLowerCase()).filter(Boolean);
  return list.length ? list : ['chromium'];
}

/**
 * Only when started from the dashboard (npm run dashboard): lets it show a live view of the browser.
 * Each parallel worker gets its own port (9333, 9334, ...). Chromium and Edge only - Firefox has no such port.
 */
function cdpArgs(): string[] {
  if (!process.env.PW_CDP_PORT) return [];
  return [`--remote-debugging-port=${Number(process.env.PW_CDP_PORT) + Number(process.env.TEST_PARALLEL_INDEX || 0)}`, '--remote-allow-origins=*'];
}

export default defineConfig({
  testDir: './tests',
  timeout: 180000,
  expect: {
    timeout: 15000,
  },
  fullyParallel: false,
  workers: 1,
  // 'list' = same console output as before. run-mode-reporter decides whether a
  // single-test run keeps the browser open at the end (see utils/run-mode-reporter.ts).
  // 'html' also writes playwright-report/ (opened from the dashboard's "Playwright report" link)
  reporter: [['list'], ['html', { open: 'never' }], ['./utils/run-mode-reporter.ts']],
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
    headless: process.env.HEADLESS === '1', // dashboard "Mode: Headless" sets HEADLESS=1; default shows the browser
    launchOptions: {
      slowMo: 150, // small per-action pause so the run is actually watchable, not just a flash
    },
  },
  // Browsers. Only Chromium runs unless BROWSERS says otherwise, so every existing command behaves as before.
  //   BROWSERS=chromium,firefox,edge   (the dashboard sets this from its "Browsers" choice)
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { slowMo: 150, args: cdpArgs() } },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 }, launchOptions: { slowMo: 150 } },
    },
    {
      name: 'edge', // the Microsoft Edge installed on this computer
      use: { ...devices['Desktop Edge'], channel: 'msedge', viewport: { width: 1440, height: 900 }, launchOptions: { slowMo: 150, args: cdpArgs() } },
    },
  ].filter((p) => wantedBrowsers().includes(p.name)),
});