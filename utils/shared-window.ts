import { Browser, BrowserContext, Page, TestInfo, expect } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LoginPage } from '../pages/LoginPage';
import { clearFinishSignal, waitForFinishOr } from './finish-signal';

/**
 * One browser window for the whole run: every test opens its flow in a NEW TAB,
 * finished thank-you pages stay open, and at the very end the window stays open
 * until you close it (or press Ctrl+C). Set KEEP_OPEN=0 to close normally.
 */

/** Same browser settings as the "chromium" project in playwright.config.ts. */
export async function openSharedContext(browser: Browser, testInfo: TestInfo): Promise<BrowserContext> {
  const u = testInfo.project.use;
  return browser.newContext({
    baseURL: u.baseURL,
    viewport: u.viewport,
    userAgent: u.userAgent,
    deviceScaleFactor: u.deviceScaleFactor,
    isMobile: u.isMobile,
    hasTouch: u.hasTouch,
    extraHTTPHeaders: u.extraHTTPHeaders,
  });
}

// Counts finished tests across worker restarts (the runner process id stays the same)
const counterFile = path.join(os.tmpdir(), `ff-shared-window-${process.ppid}.count`);

export function markTestFinished() {
  const n = fs.existsSync(counterFile) ? Number(fs.readFileSync(counterFile, 'utf8')) || 0 : 0;
  fs.writeFileSync(counterFile, String(n + 1));
}

/**
 * Call from test.afterAll. Once the LAST selected test has run, keeps the window open
 * until every tab is closed by you (or the browser is closed / Ctrl+C).
 */
export async function holdWindowOpenAtEnd(context: BrowserContext | undefined, testInfo: TestInfo) {
  if (!context || process.env.KEEP_OPEN === '0') return;
  const finished = fs.existsSync(counterFile) ? Number(fs.readFileSync(counterFile, 'utf8')) || 0 : 0;
  const total = Number(process.env.FF_TOTAL_TESTS || '0');
  if (total && finished < total) return; // worker restarting mid-run after a failure - don't block the next tests

  fs.rmSync(counterFile, { force: true });
  const open = context.pages().filter((p) => !p.isClosed());
  if (!open.length) return;

  testInfo.setTimeout(0); // no time limit while you look around
  console.log('\n' + '='.repeat(64));
  console.log(`>>> ALL DONE (${finished} flow${finished === 1 ? '' : 's'}). ${open.length} tab(s) left open:`);
  for (const p of open) console.log(`    - ${p.url()}`);
  console.log('>>> Close the browser window (or press Ctrl+C) to end the run.');
  console.log('>>> Or press "Finish run" on the dashboard / run: npm run finish');
  console.log('='.repeat(64) + '\n');

  const browser = context.browser();
  clearFinishSignal();
  let gone = false;
  browser?.on('disconnected', () => (gone = true));
  const how = await waitForFinishOr(() => gone || context.pages().filter((p) => !p.isClosed()).length === 0);
  if (how === 'finish') {
    console.log('>>> Finish requested - closing the browser and ending the run.');
    await context.close().catch(() => {});
  }
}

/** Logs in, or skips it if this shared window is already logged in from an earlier tab. */
export async function ensureLoggedIn(loginPage: LoginPage, page: Page, email: string, password: string) {
  await loginPage.openLogin();
  const emailBox = page.getByRole('textbox', { name: 'Email ID' });
  const projects = page.getByRole('link', { name: 'Projects' });
  const state = await Promise.race([
    emailBox.waitFor({ state: 'visible', timeout: 20000 }).then(() => 'login' as const),
    projects.waitFor({ state: 'visible', timeout: 20000 }).then(() => 'in' as const),
  ]).catch(() => 'login' as const);

  if (state === 'in') {
    console.log('>>> Already logged in (shared window) - skipping login');
    return;
  }
  await loginPage.login(email, password);
  await expect(projects).toBeVisible({ timeout: 35000 });
}
