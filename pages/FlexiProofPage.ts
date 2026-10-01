import { Locator, Page, expect } from '@playwright/test';
import { Logger } from '../utils/logger';
import { PopupHandler } from '../utils/popup-handler';
import { waitForManualStep } from '../utils/manual-assist';
import { AppsPage } from './AppsPage';

/**
 * FlexiProof (from the recording): Apps -> FlexiProof -> Create New Campaign -> name -> Next -> notification types
 * -> Page Settings: project + its pages -> position Top-right, count -> Save.
 * The pages are then republished (so the widget is on them) and visited.
 */
export class FlexiProofPage {
  constructor(public app: Page) {}

  static async open(main: Page): Promise<FlexiProofPage> {
    const app = await new AppsPage(main).launchApp('FlexiProof');
    await app.waitForLoadState('domcontentloaded').catch(() => {});
    await PopupHandler.closeFreshChatNotifications(app);
    return new FlexiProofPage(app);
  }

  private async visible(l: Locator, ms: number) { return l.waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false); }

  /** Creates the campaign for `project`; pages = those whose names contain one of `pageNames` (all pages when empty). */
  async createCampaign(name: string, project: string, pageNames: string[] = []) {
    const p = this.app;
    await p.getByRole('link', { name: 'Create New Campaign' }).click();
    const nm = p.getByRole('textbox', { name: 'Campaign Name' });
    await expect(nm).toBeVisible({ timeout: 15000 });
    await nm.fill(name);
    await p.getByRole('link', { name: 'Next' }).click();
    await p.waitForTimeout(2000);
    // notification types: the first three, as recorded
    for (const i of [1, 2, 3]) {
      const l = p.locator('label').nth(i);
      if (await l.isVisible().catch(() => false)) await l.check().catch(async () => l.click().catch(() => {}));
    }
    await p.getByRole('tab', { name: 'Page Settings' }).click();
    await p.waitForTimeout(1500);

    // project (react-select): type the name, choose the exact entry
    const proj = p.locator('input[id^="react-select-"][id$="-input"]').first();
    await proj.click();
    await proj.fill(project).catch(() => {});
    await p.waitForTimeout(1200);
    const projOpt = p.getByText(project, { exact: true }).first();
    if (await this.visible(projOpt, 10000)) await projOpt.click();
    else {
      const ok = await waitForManualStep(p, `Choose the project "${project}"`, 'In Page Settings, choose the project in the project dropdown.');
      if (!ok) throw new Error(`Project "${project}" is not in FlexiProof's list.`);
    }
    await p.waitForTimeout(1500);

    // pages: tick each one (or only the named ones)
    await p.getByRole('combobox', { name: 'Select Pages' }).click();
    await p.waitForTimeout(1000);
    const options = p.getByRole('option');
    const n = await options.count();
    let ticked = 0;
    for (let i = 0; i < n; i++) {
      const o = options.nth(i);
      const text = ((await o.innerText().catch(() => '')) || '').trim();
      if (pageNames.length && !pageNames.some((pn) => text.startsWith(pn))) continue;
      const box = o.getByRole('checkbox');
      if (await box.isVisible().catch(() => false)) { await box.check().catch(() => {}); ticked++; }
    }
    await p.keyboard.press('Escape').catch(() => {});
    Logger.info('FLEXIPROOF', `${ticked} page(s) selected in "${project}"`);
    if (!ticked) {
      const ok = await waitForManualStep(p, 'Select the pages', `Open "Select Pages" and tick the pages of "${project}".`);
      if (!ok) throw new Error('No pages were selected for FlexiProof.');
    }

    // display: Top-right, alert after 1 count (as recorded)
    await p.getByText('Top-right', { exact: true }).first().click().catch(() => {});
    const count = p.getByRole('spinbutton').first();
    if (await count.isVisible().catch(() => false)) await count.fill('1').catch(() => {});
    await p.getByRole('button', { name: 'Save', exact: true }).first().click();
    await p.waitForTimeout(2500);
    Logger.info('FLEXIPROOF', `✅ Campaign "${name}" saved`);
  }

  /**
   * Is the FlexiProof widget on this live page? Looks for its script / requests / element for up to `ms`.
   */
  static async widgetOn(live: Page, ms = 25000): Promise<boolean> {
    let seen = false;
    const onReq = (r: { url: () => string }) => { if (/flexiproof|fproof|social-?proof/i.test(r.url())) seen = true; };
    live.on('request', onReq as any);
    try {
      await live.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      const end = Date.now() + ms;
      while (!seen && Date.now() < end) {
        seen = (await live.locator('script[src*="flexiproof" i], [id*="flexiproof" i], [class*="flexiproof" i], [class^="fp-" i], [id^="fp-" i]').count().catch(() => 0)) > 0;
        if (!seen) await live.waitForTimeout(1000);
      }
    } finally { live.off('request', onReq as any); }
    return seen;
  }
}
