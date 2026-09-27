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

    // Match the specific page requested (defaults to FE Sales) rather than
    // any row containing "FE Sales" text loosely across the whole list.
    const feRow = this.page.locator('tr, li, div').filter({ hasText: new RegExp(salesPageName, 'i') }).first();
    await expect(feRow).toBeVisible({ timeout: 15000 });

    const [newPage] = await Promise.all([
      this.page.context().waitForEvent('page', { timeout: 15000 }).catch(() => null),
      feRow.locator('a[target="_blank"], button[title*="View" i], svg[class*="external"]').first().click().catch(async () => {
        await feRow.click();
      }),
    ]);

    if (newPage) {
      await newPage.waitForLoadState('domcontentloaded');
      return newPage;
    }

    return this.page;
  }
}