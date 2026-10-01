import { Browser, BrowserContext, Locator, Page, expect, chromium, firefox } from '@playwright/test';
import { Logger } from '../utils/logger';
import { PopupHandler } from '../utils/popup-handler';
import { TestContext } from '../utils/test-context';
import { Helpers } from '../utils/helpers';
import { waitForManualStep } from '../utils/manual-assist';

export interface CampaignConfig {
  name: string;          // e.g. "Split Test Abc123"
  project: string;       // project that holds both pages
  controlPage: string;   // Original
  variantPage: string;   // Variant
  notes?: string;        // e.g. "V2"
}

/**
 * Split test app (from the recording):
 *   Apps -> Launch (split test app) -> New Campaign -> name -> project -> control page -> Create & continue
 *   -> variant: project -> page -> notes -> Next -> Equal distribution -> Next -> Manual winner -> Next
 *   -> Launch Campaign -> Visit (the split URL)
 */
export class SplitTestPage {
  constructor(private page: Page, private context: TestContext) {}

  private async visible(l: Locator, ms: number) {
    return l.waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false);
  }

  /** Apps -> Launch the split test app (same tab or a new one). Returns the app's page. */
  async openSplitTestApp(): Promise<Page> {
    // Go straight to the Apps page (the editor has no top menu, so clicking an "Apps" link there can hang)
    await this.page.goto('https://app.flexifunnels.com/apps', { waitUntil: 'domcontentloaded' });
    await PopupHandler.dismissKnownPopups(this.page);
    await this.page.getByText('All Apps').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
    await this.page.waitForTimeout(1500);
    await PopupHandler.closeFreshChatNotifications(this.page);

    // The "Flexi Split Test" card, then its Launch (link or button)
    const card = this.page.locator('div')
      .filter({ has: this.page.getByText('Flexi Split Test', { exact: true }) })
      .filter({ has: this.page.getByRole('link', { name: /launch/i }).or(this.page.getByRole('button', { name: /launch/i })) })
      .last();
    const launch = card.getByRole('link', { name: /launch/i }).or(card.getByRole('button', { name: /launch/i })).first();
    await expect(launch).toBeVisible({ timeout: 20000 });
    const popup = this.page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null);
    await launch.click();
    const opened = await popup;
    const app = opened || this.page;
    await app.waitForLoadState('domcontentloaded').catch(() => {});
    await app.getByRole('button', { name: 'New Campaign' }).waitFor({ state: 'visible', timeout: 40000 });
    Logger.info('SPLIT', `Split test app open: ${app.url()}`);
    this.page = app;
    return app;
  }

  /**
   * The app's own dropdowns ("Select a project" / "Select a control page" / "Select a page"):
   * open it, then pick the entry whose text is exactly `value` (not just "contains").
   */
  private async pick(placeholder: RegExp, value: string, which: 'first' | 'last' = 'last') {
    // only dropdowns on the screen now (earlier screens can still be in the page, hidden)
    const triggers = this.page.locator('div').filter({ hasText: placeholder }).filter({ visible: true });
    await triggers.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    const n = await triggers.count();
    if (!n) {
      const ok = await waitForManualStep(this.page, `Choose "${value}"`, `Open the "${placeholder.source.replace(/[\^$\\]/g, '')}" dropdown and choose "${value}".`);
      if (!ok) throw new Error(`The "${placeholder.source}" dropdown was not found.`);
      return;
    }
    const trigger = which === 'last' ? triggers.nth(n - 1) : triggers.first();
    await trigger.click({ timeout: 10000 });
    await this.page.waitForTimeout(800);
    const panel = this.page.locator('.absolute.z-\\[60\\]').filter({ visible: true }).last();
    await panel.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    const search = panel.getByRole('textbox').first();
    if (await search.isVisible().catch(() => false)) { await search.fill(value); await this.page.waitForTimeout(800); }
    // exact text first; otherwise the shortest entry containing it (so "FE Sales" never picks "FE Sales Variant")
    const esc = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exact = panel.getByText(new RegExp(`^\\s*${esc}\\s*$`, 'i')).first();
    if (await this.visible(exact, 6000)) { await exact.click({ timeout: 10000 }); }
    else {
      const items = panel.getByText(new RegExp(esc, 'i'));
      const count = await items.count();
      let best = -1, bestLen = 1e9;
      for (let i = 0; i < count; i++) { const t = ((await items.nth(i).innerText().catch(() => '')) || '').trim(); if (t && t.length < bestLen) { best = i; bestLen = t.length; } }
      if (best < 0) {
        const ok = await waitForManualStep(this.page, `Choose "${value}"`, `In the split test form, open the dropdown and choose "${value}".`);
        if (!ok) throw new Error(`"${value}" is not in the dropdown.`);
        return;
      }
      await items.nth(best).click({ timeout: 10000 });
    }
    await this.page.waitForTimeout(800);
    Logger.info('SPLIT', `Chose "${value}"`);
  }

  async createCampaign(c: CampaignConfig): Promise<Page> {
    const p = this.page;
    await p.getByRole('button', { name: 'New Campaign' }).click();
    const name = p.getByRole('textbox', { name: 'e.g. Homepage Hero Test' });
    await expect(name).toBeVisible({ timeout: 15000 });
    await name.fill(c.name);

    // 1. control (Original)
    await this.pick(/^Select a project$/, c.project);
    await this.pick(/^Select a control page$/, c.controlPage);
    await PopupHandler.closeFreshChatNotifications(p);
    await p.getByRole('button', { name: 'Create & continue' }).click();
    await p.waitForTimeout(2500);
    Logger.info('SPLIT', `Campaign "${c.name}": control page "${c.controlPage}"`);

    // 2. variant
    await this.pick(/^Select a project$/, c.project);
    await this.pick(/^Select a page$/, c.variantPage);
    const notes = p.getByRole('textbox', { name: 'Add notes…' });
    if (await this.visible(notes, 5000)) await notes.fill(c.notes ?? 'V2');
    // confirm the variant row with its green ✓ (ACTION column) - Next stays disabled until then
    await this.saveVariantRow(c.variantPage);
    await this.next('variant', p.getByRole('button', { name: /Equal distribution/i }),
      `Add "${c.variantPage}" as the variant, then press Next.`);
    Logger.info('SPLIT', `Variant page "${c.variantPage}" added`);

    // 3. distribution: equal
    await p.getByRole('button', { name: /Equal distribution/i }).click();
    await this.next('distribution', p.getByText(/Declare a winner|You pick the winner/i).first(), 'Choose Equal distribution, then press Next.');

    // 4. winner: manual
    await p.getByText(/ManualYou pick the winner|You pick the winner/i).first().click();
    await this.next('winner', p.getByRole('button', { name: 'Launch Campaign' }), 'Choose Manual (you pick the winner), then press Next.');

    // 5. launch
    await p.getByRole('button', { name: 'Launch Campaign' }).click();
    const visit = p.getByRole('button', { name: 'Visit' }).first();
    if (!(await this.visible(visit, 30000))) {
      await Helpers.captureDiagnosticScreenshot(p, 'split-launch');
      throw new Error('The campaign did not show a "Visit" button after Launch Campaign.');
    }
    Logger.info('SPLIT', `✅ Campaign "${c.name}" launched`);
    this.campaignPage = p;
    const live = await this.visit();
    return live;
  }

  /** The campaign's page in the split test app (where its "Visit" button is). */
  campaignPage: Page | null = null;
  /** The Visit link itself - the split URL, before FlexiFunnels redirects to Original / Variant. */
  splitUrl = '';

  /**
   * Clicks the campaign's "Visit" (always used to open the split page in this browser) and returns the page.
   * Records the first address Visit opens as the split URL (so another browser can open exactly that link).
   */
  async visit(): Promise<Page> {
    const p = this.campaignPage || this.page;
    await p.bringToFront().catch(() => {});
    const btn = p.getByRole('button', { name: 'Visit' }).or(p.getByRole('link', { name: 'Visit' })).first();
    await btn.waitFor({ state: 'visible', timeout: 20000 });
    const href = await btn.getAttribute('href').catch(() => null);
    const firstNav: string[] = [];
    const onReq = (r: import('@playwright/test').Request) => { if (r.isNavigationRequest() && !r.redirectedFrom() && /^https?:/.test(r.url())) firstNav.push(r.url()); };
    p.context().on('request', onReq);
    const popup = p.waitForEvent('popup', { timeout: 30000 });
    await btn.click();
    const live = await popup;
    await live.waitForLoadState('domcontentloaded').catch(() => {});
    p.context().off('request', onReq);
    const entry = (href && /^https?:/.test(href) ? href : '') || firstNav.find((u) => !/app\.flexifunnels\.com/.test(u)) || firstNav[0] || live.url();
    if (!this.splitUrl) this.splitUrl = entry;
    Logger.info('SPLIT', `Visit -> split link ${this.splitUrl}${live.url() !== this.splitUrl ? ` (served: ${live.url()})` : ''}`);
    return live;
  }

  /**
   * Another, DIFFERENT browser for the next visitor: Edge -> Chrome, Chrome/Chromium -> Edge, then the
   * other installed ones (Chrome, Edge, Playwright's Chromium, Firefox). Returns null when none can start.
   * Overridable (e.g. for tests): splitTest.otherBrowser = async (i, current) => ...
   */
  otherBrowser = async (i: number, current: string): Promise<{ browser: Browser; name: string } | null> => {
    const headless = process.env.HEADLESS === '1';
    const order: { name: string; launch: () => Promise<Browser> }[] = [
      { name: 'Google Chrome', launch: () => chromium.launch({ channel: 'chrome', headless }) },
      { name: 'Microsoft Edge', launch: () => chromium.launch({ channel: 'msedge', headless }) },
      { name: 'Chromium', launch: () => chromium.launch({ headless }) },
      { name: 'Firefox', launch: () => firefox.launch({ headless }) },
    ].filter((b) => b.name !== current) as any;
    if (current !== 'Microsoft Edge') order.sort((x, y) => (x.name === 'Microsoft Edge' ? -1 : y.name === 'Microsoft Edge' ? 1 : 0)); // Chrome / Chromium -> Edge first
    for (let k = 0; k < order.length; k++) {
      const b = order[(i + k) % order.length];
      try { const browser = await b.launch(); return { browser, name: b.name }; } catch { /* not installed - try the next */ }
    }
    return null;
  };

  /** Next is usable (not greyed out). */
  private async nextEnabled(): Promise<boolean> {
    const next = this.page.getByRole('button', { name: 'Next' }).first();
    if (!(await next.isVisible().catch(() => false))) return false;
    if (!(await next.isEnabled().catch(() => false))) return false;
    const aria = await next.getAttribute('aria-disabled').catch(() => null);
    const cls = (await next.getAttribute('class').catch(() => '')) || '';
    return aria !== 'true' && !/\b(disabled|opacity-50|cursor-not-allowed|pointer-events-none)\b/.test(cls);
  }

  /**
   * The variant row (the one with the notes box) has a green ✓ and a trash icon in its ACTION column.
   * Clicks the ✓ and checks the row was saved: Next becomes usable, or the row turns into a saved row
   * (with "Visit Page", like the control row). Falls back to the recorded clicks, then asks you.
   */
  private async saveVariantRow(variantPage: string): Promise<void> {
    const p = this.page;
    const visitBefore = await p.getByText(/visit page/i).count().catch(() => 0);
    const saved = async () => (await this.nextEnabled()) || (await p.getByText(/visit page/i).count().catch(() => 0)) > visitBefore;

    const notes = p.getByRole('textbox', { name: 'Add notes…' }).first();
    const row = p.locator('div').filter({ has: notes }).filter({ has: p.locator('button') }).last();
    const iconButtons = row.locator('button').filter({ hasText: /^\s*$/ });
    const n = await iconButtons.count().catch(() => 0);
    // prefer a green button (the ✓); otherwise the first icon-only button (the trash comes after it)
    let tick = -1;
    for (let i = 0; i < n; i++) {
      const green = await iconButtons.nth(i).evaluate((b) => {
        const cls = (b.getAttribute('class') || '') + ' ' + (b.querySelector('svg')?.getAttribute('class') || '');
        if (/green|emerald|success|teal|check/i.test(cls)) return true;
        const m = getComputedStyle(b).backgroundColor.match(/\d+/g);
        return !!m && +m[1] > 140 && +m[1] > +m[0] + 40 && +m[1] > +m[2] + 20; // clearly green
      }).catch(() => false);
      if (green) { tick = i; break; }
    }
    if (tick < 0 && n) tick = 0;
    if (tick >= 0) {
      await iconButtons.nth(tick).click({ timeout: 8000 }).catch(() => {});
      await p.waitForTimeout(1500);
      if (await saved()) { Logger.info('SPLIT', `✅ Variant row saved (✓) - "${variantPage}"`); return; }
    }
    // fallback: the clicks from the recording
    const col = p.locator('div:nth-child(3) > .col-span-1').first();
    if (await col.isVisible().catch(() => false)) await col.click({ timeout: 5000 }).catch(() => {});
    const add = p.getByRole('button').filter({ hasText: /^$/ }).nth(4);
    if (await add.isVisible().catch(() => false)) await add.click({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(1500);
    if (await saved()) { Logger.info('SPLIT', `✅ Variant row saved - "${variantPage}"`); return; }
    const ok = await waitForManualStep(p, 'Save the variant row', `Click the green ✓ on the "${variantPage}" variant row (ACTION column), so Next becomes usable.`, saved);
    if (!ok) throw new Error('The variant row was not saved (green ✓), so Next stayed disabled.');
  }

  /** Next -> wait for the following screen; asks you to do it by hand if it does not come. */
  private async next(stage: string, nextScreen: Locator, howTo: string) {
    const btn = this.page.getByRole('button', { name: 'Next' }).first();
    const end = Date.now() + 10000;
    while (!(await this.nextEnabled()) && Date.now() < end) await this.page.waitForTimeout(500);
    if (await this.visible(btn, 5000)) await btn.click({ timeout: 8000 }).catch(() => {});
    if (await this.visible(nextScreen, 15000)) return;
    const ok = await waitForManualStep(this.page, `Split test: ${stage} step`, howTo, () => nextScreen.isVisible());
    if (!ok) throw new Error(`Split test: could not get past the ${stage} step.`);
  }

  /**
   * Split URL, both versions - in the order that makes FlexiFunnels serve the Variant:
   *  1. complete the purchase (or sign-up) on the first sales page (window 1, normally the Original);
   *  2. open the same sales page again in that window;
   *  3. open a DIFFERENT browser window with the same link - the other version (Variant) comes there;
   *  4. complete the purchase there too.
   * If a new window shows a version that is already done, it stays open and another new window is tried
   * (up to `maxVisits`). Only those extra windows are closed at the end.
   */
  async completeOnBothVersions(browser: Browser, url: string, first: Page, isVariant: (p: Page) => Promise<boolean>,
    action: (p: Page, version: 'Original' | 'Variant') => Promise<string>, maxVisits = 12) {
    type V = 'Original' | 'Variant';
    const link = this.splitUrl || url;
    const classify = async (p: Page): Promise<V> => { await p.waitForLoadState('domcontentloaded').catch(() => {}); await p.waitForTimeout(2500); return (await isVariant(p)) ? 'Variant' : 'Original'; };
    const ua = await first.evaluate(() => navigator.userAgent).catch(() => '');
    const current = /Edg\//.test(ua) ? 'Microsoft Edge' : /Firefox\//.test(ua) ? 'Firefox' : 'Chromium'; // Chrome and Chromium look the same; both go to Edge next
    const done: Partial<Record<V, { result: string; visit: number }>> = {};
    const others: { browser: Browser; ctx: BrowserContext; used: boolean }[] = [];
    let visits = 1;

    // 1. the page Visit opened (this browser): complete the purchase there first
    const v1 = await classify(first);
    Logger.info('SPLIT', `Visit 1 (${current}): ${v1} - completing the purchase here first`);
    done[v1] = { result: await action(first, v1), visit: 1 };
    Logger.info('SPLIT', `✅ ${v1} done (visit 1)`);
    // 2. open the same page again with the campaign's Visit button
    if (this.campaignPage) { await this.visit().catch(() => null); }
    else await first.goto(link, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    visits++;
    Logger.info('SPLIT', `Visit ${visits}: opened the split page again with Visit (${current})`);

    // 3. a DIFFERENT browser opens the same Visit link, until the other version comes
    for (let i = 0; !(done.Original && done.Variant) && visits < maxVisits; i++) {
      const ob = await this.otherBrowser(i, current);
      if (!ob) throw new Error('No other browser could be started for the next visitor (install Google Chrome or Microsoft Edge, or run: npx playwright install chromium).');
      const ctx = await ob.browser.newContext({ viewport: { width: 1440, height: 900 } });
      const p = await ctx.newPage();
      others.push({ browser: ob.browser, ctx, used: false });
      await p.goto(link, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      visits++;
      const v = await classify(p);
      if (done[v]) { Logger.info('SPLIT', `Visit ${visits} (${ob.name}): ${v} again - keeping it open, trying another browser`); continue; }
      // 4. complete the purchase there too
      Logger.info('SPLIT', `Visit ${visits} (${ob.name}): ${v} - completing the purchase`);
      others[others.length - 1].used = true;
      done[v] = { result: await action(p, v), visit: visits };
      Logger.info('SPLIT', `✅ ${v} done (visit ${visits}, ${ob.name})`);
    }
    for (const o of others) if (!o.used) await o.browser.close().catch(() => {});
    if (!done.Original || !done.Variant) {
      const missing = !done.Original ? 'Original' : 'Variant';
      throw new Error(`The ${missing} page was never served in ${visits} visits of ${link} (other browsers tried) - check the campaign's traffic split.`);
    }
    return { original: done.Original, variant: done.Variant, visits };
  }

  /**
   * Opens the split URL in several fresh browsers and counts which page was served
   * (told apart by their headlines). Logs the counts; warns if only one version showed up.
   */
  async checkBothVersions(browser: Browser, url: string, isVariant: (p: Page) => Promise<boolean>, visits = 6) {
    const seen = { original: 0, variant: 0 };
    for (let i = 0; i < visits; i++) {
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      try {
        await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await p.waitForTimeout(2500);
        (await isVariant(p)) ? seen.variant++ : seen.original++;
      } catch { /* a slow visit is skipped */ } finally { await ctx.close().catch(() => {}); }
    }
    Logger.info('SPLIT', `Split URL opened ${visits}x in fresh browsers: Original ${seen.original}, Variant ${seen.variant}`);
    if (!seen.original && !seen.variant) Logger.warn('SPLIT', 'None of the extra visits loaded the split URL - the version check was skipped.');
    else if (!seen.original || !seen.variant) Logger.warn('SPLIT', 'Only one version was served in these visits - with 50/50 traffic this can happen by chance; check the campaign if it keeps happening.');
    return seen;
  }
}
