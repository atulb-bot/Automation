import { Page, expect } from '@playwright/test';
import { Logger } from '../utils/logger';
import { PopupHandler } from '../utils/popup-handler';
import { TestContext } from '../utils/test-context';

export class SalesPage {
  constructor(private page: Page, private context: TestContext) {}

  public async openLiveSalesPage(salesPageName: string = 'FE Sales'): Promise<Page> {
    this.context.recordStep('Launch Live Sales Page Tab');
    Logger.info('SALES', `Opening live "${salesPageName}" in a new browser context...`);

    // Go straight to THIS run's project rather than the projects list --
    // clicking "Open Project" there just grabs whichever project renders
    // first, which is not necessarily the one this run just created (it
    // could be an older project sitting above it). context.projectUrl is
    // set by ProjectsPage.createProject() right after creation, so it's the
    // reliable source of truth for "the project this run is using".
    if (this.context.projectUrl) {
      await this.page.goto(this.context.projectUrl, { waitUntil: 'domcontentloaded' });
    } else {
      Logger.warn('SALES', 'No project URL captured on context — falling back to opening the first project in the list.');
      await this.page.goto('https://app.flexifunnels.com/projects', { waitUntil: 'domcontentloaded' });
      await PopupHandler.cleanAllPopupsAndFocus(this.page);
      const openBtn = this.page.getByRole('button', { name: 'Open Project' }).first();
      await expect(openBtn).toBeVisible({ timeout: 20000 });
      await openBtn.click();
    }
    await PopupHandler.cleanAllPopupsAndFocus(this.page);
    await this.page.waitForTimeout(1500);

    // Confirmed via recording: filter the page list through "Search pages…"
    // first -- the list can be lazily rendered, and a plain text-match
    // locator can miss a page that hasn't scrolled/rendered into view yet
    // (the same class of issue already fixed for this pattern elsewhere in
    // the project, e.g. FunnelBuilderPage.openPageInProjectEditor()). The
    // recording typed a short token ("FE"), not the full page name, so use
    // the first word of salesPageName here too rather than the whole string
    // -- some search boxes filter on a prefix/word match, not a full-phrase
    // match, so searching "FE Sales" verbatim can return zero rows where
    // "FE" reliably surfaces it.
    const searchBox = this.page.getByRole('textbox', { name: 'Search pages…' });
    const searchToken = salesPageName.split(/\s+/)[0] || salesPageName;
    if (await searchBox.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchBox.click().catch(() => {});
      await searchBox.fill(searchToken).catch(() => {});
      await this.page.waitForTimeout(800);
    }

    // Match the specific page requested (defaults to FE Sales) rather than
    // any row containing "FE Sales" text loosely across the whole list.
    const feRow = this.page.locator('tr, li, div').filter({ hasText: new RegExp(salesPageName, 'i') }).first();
    await expect(feRow).toBeVisible({ timeout: 15000 });

    // Confirmed via recording: click the page's name/text once first (this
    // is what actually surfaces the row's own action icons -- clicking
    // straight for the icon without this first click missed it on some
    // renders), THEN find the icon-only "visit live page" link within it.
    await feRow.click().catch(() => {});
    await this.page.waitForTimeout(500);

    const [newPage] = await Promise.all([
      this.page.context().waitForEvent('page', { timeout: 15000 }).catch(() => null),
      feRow.locator('a[target="_blank"], button[title*="View" i], svg[class*="external"]').first().click().catch(async () => {
        // Confirmed via recording: when no explicitly-titled "view" element
        // renders, the actual trigger is an icon-only link (empty
        // accessible name) among a few others in the row -- the 3rd one
        // (nth(2)) in the recording. Try that within the row's own scope
        // before falling back to a page-wide click, so this doesn't
        // accidentally hit an unrelated icon-only link elsewhere on the
        // page.
        const iconLink = feRow.getByRole('link').filter({ hasText: /^$/ }).nth(2);
        if (await iconLink.isVisible({ timeout: 3000 }).catch(() => false)) {
          await iconLink.click().catch(() => {});
        } else {
          await feRow.click().catch(() => {});
        }
      }),
    ]);

    if (newPage) {
      await newPage.waitForLoadState('domcontentloaded');
      return newPage;
    }

    return this.page;
  }
}