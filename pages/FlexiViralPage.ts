import { Locator, Page, expect } from '@playwright/test';
import { Logger } from '../utils/logger';
import { PopupHandler } from '../utils/popup-handler';
import { waitForManualStep } from '../utils/manual-assist';
import { AppsPage } from './AppsPage';

/** Entry methods as in the recording: [category button (if the method is inside one), method button]. */
export const FLEXIVIRAL_ENTRIES: [string | null, string][] = [
  ['Questions', 'Answer a Question'], ['Questions', 'Choose an Image'], ['Questions', 'Single Choice Question'], ['Questions', 'Multiple Choice Question'],
  [null, 'Follow us on Instagram'], [null, 'Visit Facebook'],
  ['YouTube', 'Watch a Video'], ['YouTube', 'Submit a Video'], ['YouTube', 'Subscribe to Our Channel'], ['YouTube', 'Visit Our Page'],
  ['X', 'Post a Tweet'], ['X', 'Tweet with Hashtag'],
  [null, 'Viral Share'], [null, 'Bonus Entry'], [null, 'Custom Entry'],
];

/**
 * FlexiViral (from the recording): Apps -> FlexiViral -> Go to Contest -> Create New Contest -> name -> dates + time zone
 * -> Next -> entry methods (each: open, fill its fields, Save) -> Next -> prize -> Next -> settings -> Save -> Visit
 * -> register on the contest page.
 */
export class FlexiViralPage {
  constructor(public app: Page) {}

  static async open(main: Page): Promise<FlexiViralPage> {
    const app = await new AppsPage(main).launchApp('FlexiViral');
    await app.waitForLoadState('domcontentloaded').catch(() => {});
    if (!/flexiviral/i.test(app.url())) await app.goto('https://flexiviral.flexifunnels.com/dashboard', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await PopupHandler.closeFreshChatNotifications(app);
    return new FlexiViralPage(app);
  }

  private async visible(l: Locator, ms: number) { return l.waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false); }

  async createContest(name: string) {
    const p = this.app;
    const go = p.getByRole('link', { name: 'Go to Contest' }).first();
    if (await this.visible(go, 15000)) await go.click();
    await p.getByRole('button', { name: 'Create New Contest' }).click();
    const nm = p.getByRole('textbox', { name: 'Contest Name', exact: true });
    await expect(nm).toBeVisible({ timeout: 15000 });
    await nm.fill(name);
    await p.getByRole('button', { name: 'Create', exact: true }).click();
    await p.waitForTimeout(3000);
    Logger.info('FLEXIVIRAL', `Contest "${name}" created`);
  }

  /** Picks a day in the open date picker: the first enabled cell for `day` in the shown month (not greyed out). */
  private async pickDay(input: Locator, day: number, nextMonth = false) {
    await input.click();
    await this.app.waitForTimeout(600);
    if (nextMonth) {
      const nxt = this.app.getByRole('button', { name: /next|›|»|>/i }).or(this.app.locator('[class*="next" i]')).first();
      if (await nxt.isVisible().catch(() => false)) { await nxt.click().catch(() => {}); await this.app.waitForTimeout(500); }
    }
    const cells = this.app.getByRole('cell', { name: String(day), exact: true });
    const n = await cells.count();
    for (let i = 0; i < n; i++) {
      const c = cells.nth(i);
      if (!(await c.isVisible().catch(() => false))) continue;
      const off = await c.evaluate((el) => /disabled|old|new|prev|next|outside|text-gray-(300|400)|opacity/i.test((el.className || '') + ' ' + ((el.firstElementChild as HTMLElement)?.className || '')) || el.getAttribute('aria-disabled') === 'true').catch(() => false);
      if (!off) { await c.click(); return true; }
    }
    return false;
  }

  /** Start = today, end = the 28th of next month (always valid), time zone Asia/Kolkata. */
  async setDatesAndTimezone() {
    const p = this.app;
    const start = p.getByRole('textbox', { name: /Contest Start Date/i });
    const end = p.getByRole('textbox', { name: /Contest End Date/i });
    await start.waitFor({ state: 'visible', timeout: 20000 });
    const okStart = await this.pickDay(start, new Date().getDate());
    const okEnd = await this.pickDay(end, 28, true);
    await p.keyboard.press('Escape').catch(() => {});
    const tz = p.getByLabel(/Choose the appropriate time/i);
    if (!(await tz.isVisible().catch(() => false))) await p.locator('.grid.grid-cols-4 > div:nth-child(4)').click().catch(() => {});
    await tz.selectOption('Asia/Kolkata').catch(() => {});
    const filled = async () => !!(await start.inputValue().catch(() => '')) && !!(await end.inputValue().catch(() => ''));
    if (!okStart || !okEnd || !(await filled())) {
      const ok = await waitForManualStep(p, 'Set the contest dates', 'Pick a start date (today) and an end date (later), time zone Asia/Kolkata.', filled);
      if (!ok) throw new Error('The contest dates were not set.');
    }
    Logger.info('FLEXIVIRAL', `Dates: ${await start.inputValue().catch(() => '?')} -> ${await end.inputValue().catch(() => '?')}, Asia/Kolkata`);
  }

  async next() {
    const n = this.app.getByRole('button', { name: 'Next', exact: true }).first();
    await n.waitFor({ state: 'visible', timeout: 20000 });
    await n.click();
    await this.app.waitForTimeout(2500);
  }

  /** A sensible value for a field, by its label / placeholder. */
  private valueFor(label: string, method: string): string {
    const l = label.toLowerCase();
    if (/youtube|video url|video link/.test(l)) return 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    if (/channel/.test(l)) return 'https://www.youtube.com/@flexifunnels';
    if (/instagram/.test(l)) return 'https://www.instagram.com/flexifunnels';
    if (/facebook|page url|website|link|url/.test(l)) return 'https://www.facebook.com/flexifunnels';
    if (/hashtag|tweet|#/.test(l)) return '#FlexiFunnels';
    if (/beach|option|choice|answers?|comma/.test(l)) return 'Beach, Mountains, City';
    if (/question/.test(l)) return 'What is your favourite place?';
    if (/headline|title/.test(l)) return `${method} (automation)`;
    if (/description|instruction/.test(l)) return 'Added by the automation test.';
    if (/entry text|button/.test(l)) return 'Enter';
    return 'Automation test';
  }

  /** Fill only the fields that appeared for this entry method (marked before opening it). */
  private async fillNewFields(method: string) {
    const p = this.app;
    const fields = p.locator('input:visible:not([data-ff-seen]), textarea:visible:not([data-ff-seen])');
    const n = await fields.count();
    for (let i = 0; i < n; i++) {
      const f = fields.nth(i);
      const type = (await f.getAttribute('type').catch(() => '')) || 'text';
      if (['checkbox', 'radio', 'file', 'hidden', 'submit', 'button', 'search'].includes(type)) continue;
      if ((await f.inputValue().catch(() => '')).trim()) continue;
      const label = (await f.evaluate((el) => (el.getAttribute('aria-label') || el.getAttribute('placeholder') || (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) || el.getAttribute('name') || ''))).trim();
      await f.fill(type === 'number' ? '1' : this.valueFor(label, method)).catch(() => {});
    }
  }

  private async markSeen() {
    await this.app.locator('input, textarea').evaluateAll((els) => els.forEach((e) => e.setAttribute('data-ff-seen', '1'))).catch(() => {});
  }

  /** Adds one entry method: open it (inside its category if needed), fill its fields, Save. */
  async addEntry(category: string | null, method: string): Promise<boolean> {
    const p = this.app;
    const btn = p.getByRole('button', { name: method, exact: true }).first();
    if (!(await btn.isVisible().catch(() => false)) && category) {
      await p.getByRole('button', { name: category, exact: true }).first().click({ timeout: 8000 }).catch(() => {});
      await p.waitForTimeout(800);
    }
    if (!(await this.visible(btn, 6000))) { Logger.warn('FLEXIVIRAL', `Entry method "${method}" not found - skipped`); return false; }
    await this.markSeen();
    await btn.click();
    await p.waitForTimeout(1000);
    const save = p.getByRole('button', { name: 'Save', exact: true }).last();
    for (let attempt = 1; attempt <= 2; attempt++) {
      await this.fillNewFields(method);
      if (!(await this.visible(save, 5000))) break;
      await save.click().catch(() => {});
      await p.waitForTimeout(1500);
      // saved when the form closed (its fields gone) or a success message appeared
      const stillOpen = (await p.locator('input:visible:not([data-ff-seen]), textarea:visible:not([data-ff-seen])').count()) > 0;
      const okMsg = await p.getByText(/saved|added|success/i).first().isVisible().catch(() => false);
      if (!stillOpen || okMsg) { Logger.info('FLEXIVIRAL', `Entry method added: ${method}`); return true; }
    }
    Logger.warn('FLEXIVIRAL', `"${method}" may not have saved (the form is still open) - continuing`);
    await p.keyboard.press('Escape').catch(() => {});
    return false;
  }

  /** Prize: the first prize in the list, a prize value, Save. */
  async setPrize() {
    const p = this.app;
    const sel = p.getByLabel(/Prize That Is Issued/i);
    if (await this.visible(sel, 15000)) {
      const opts = await sel.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter((v) => v));
      if (opts.length) await sel.selectOption(opts[0]).catch(() => {});
      else {
        const ok = await waitForManualStep(p, 'Choose a prize', 'There is no prize in the list yet: create one in FlexiViral, choose it, then Continue.');
        if (!ok) throw new Error('No prize to choose.');
      }
    }
    const value = p.getByRole('textbox', { name: /Prize Value Text/i });
    if (await this.visible(value, 5000)) await value.fill('Gift card worth ₹1');
    await p.getByRole('button', { name: 'Save', exact: true }).last().click().catch(() => {});
    await p.waitForTimeout(1500);
    Logger.info('FLEXIVIRAL', 'Prize set');
  }

  /** The last steps: settings (left as they are) -> Save -> Next -> Save. */
  async finish() {
    const p = this.app;
    await p.getByRole('button', { name: 'Save', exact: true }).last().click().catch(() => {});
    await p.waitForTimeout(1500);
    const n = p.getByRole('button', { name: 'Next', exact: true }).first();
    if (await this.visible(n, 5000)) { await n.click(); await p.waitForTimeout(2000); }
    await p.getByRole('button', { name: 'Save', exact: true }).last().click().catch(() => {});
    await p.waitForTimeout(2500);
    Logger.info('FLEXIVIRAL', 'Contest saved');
  }

  /** Visit -> the contest page; registers with name + email. Returns the contest page. */
  async visitAndRegister(name: string, email: string): Promise<Page> {
    const p = this.app;
    const visit = p.getByRole('link', { name: 'Visit' }).first();
    if (!(await this.visible(visit, 10000))) await p.locator('.cursor-pointer > .text-gray-500 > svg').first().click().catch(() => {});
    await expect(visit).toBeVisible({ timeout: 20000 });
    const popup = p.waitForEvent('popup', { timeout: 30000 });
    await visit.click();
    const contest = await popup;
    await contest.waitForLoadState('domcontentloaded');
    Logger.info('FLEXIVIRAL', `Contest page: ${contest.url()}`);
    await contest.getByRole('textbox', { name: /Enter Your Name/i }).fill(name);
    await contest.getByRole('textbox', { name: /Enter Your Email/i }).fill(email);
    const join = contest.getByRole('button', { name: /join|register|enter|submit|participate|continue/i }).first();
    if (await this.visible(join, 5000)) { await join.click(); await contest.waitForTimeout(3000); Logger.info('FLEXIVIRAL', `Registered as ${email}`); }
    else Logger.warn('FLEXIVIRAL', 'Filled the registration form; no join / register button was found to press');
    return contest;
  }
}
