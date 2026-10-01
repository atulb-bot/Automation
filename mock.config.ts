import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './mock-tests', timeout: 120000, workers: 1, reporter: [['list']],
  use: { headless: true, launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] } } });
