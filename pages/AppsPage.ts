import { Locator, Page } from '@playwright/test';
import { Logger } from '../utils/logger';
import { PopupHandler } from '../utils/popup-handler';

/** Names exactly as shown on the Apps page (app.flexifunnels.com/apps). */
export type AppName = 'FlexiProof' | 'Flexi Split Test' | 'FlexiViral' | 'Flexi Membership' | 'Flexi AI Marketing Agent' | 'Flexi AI Site Builder' | 'Flexi Website Cloner' | 'Flexi Cookie Consent' | 'Leads Navigator' | 'Timeline Domination';

/**
 * Shared "go to Apps and launch an app" step, used by the split test, FlexiProof and FlexiViral flows.
 * Opens /apps directly (works from anywhere, including the page editor), finds the app's card by its
 * title and clicks its Launch. Returns the page the app opened in (a new tab or the same tab).
 */
export class AppsPage {
  constructor(private page: Page) {}

  async openAppsList(): Promise<void> {
    await this.page.goto('https://app.flexifunnels.com/apps', { waitUntil: 'domcontentloaded' });
    await PopupHandler.dismissKnownPopups(this.page);
    await this.page.getByText('All Apps').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
    await this.page.waitForTimeout(1500);
    await PopupHandler.closeFreshChatNotifications(this.page);
  }

  private launchIn(card: Locator): Locator {
    return card.getByRole('link', { name: /launch/i }).or(card.getByRole('button', { name: /launch/i })).first();
  }

  async launchApp(app: AppName): Promise<Page> {
    await this.openAppsList();
    const card = this.page.locator('div')
      .filter({ has: this.page.getByText(app, { exact: true }) })
      .filter({ has: this.page.getByRole('link', { name: /launch/i }).or(this.page.getByRole('button', { name: /launch/i })) })
      .last();
    const launch = this.launchIn(card);
    await launch.waitFor({ state: 'visible', timeout: 20000 });
    const popup = this.page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null);
    await launch.click();
    const opened = await popup;
    const appPage = opened || this.page;
    await appPage.waitForLoadState('domcontentloaded').catch(() => {});
    Logger.info('APPS', `"${app}" opened: ${appPage.url()}`);
    return appPage;
  }
}
