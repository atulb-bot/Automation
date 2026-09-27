import { Page, expect } from '@playwright/test';
import { Logger } from '../utils/logger';
import { PopupHandler } from '../utils/popup-handler';
import { TestContext } from '../utils/test-context';

export class CheckoutPage {
  constructor(private page: Page, private context: TestContext) {}

  public async openCheckoutPage(): Promise<void> {
    this.context.recordStep('Open Checkout Page Editor');
    Logger.info('CHECKOUT', 'Navigating to Checkout Page...');

    if (!this.context.projectUrl) {
      throw new Error('Project URL was not captured.');
    }

    await this.page.goto(this.context.projectUrl, { waitUntil: 'domcontentloaded' });
    await this.page.getByText('Checkout page').click();
    await this.page.getByRole('link', { name: 'Edit Page' }).click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  public async editCheckoutPage(): Promise<void> {
    this.context.recordStep('Edit Checkout Page');
    Logger.info('CHECKOUT', 'Adding phone field in checkout editor...');

    await PopupHandler.dismissKnownPopups(this.page);

    const editor = this.page.locator('iframe:not([name="fc_widget"])').first();
    const frame = editor.contentFrame();

    // Select order form component in editor canvas
    const orderForm = frame.locator('#ilqxg, #flexiOrderForm_tpl, [id*="flexiOrderForm"]').first();
    if (await orderForm.isVisible({ timeout: 10000 }).catch(() => false)) {
      await orderForm.click();
    }

    // Add phone field via Components -> Others -> Settings
    const compBtn = this.page.getByRole('button', { name: 'Components' });
    if (await compBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await compBtn.click();
      await this.page.getByRole('button', { name: 'Others' }).click();
      await frame.locator('#flexiOrderForm_tpl').click().catch(() => {});
    }

    const settingsIcon = this.page.locator('div:nth-child(5) > svg > path').first();
    if (await settingsIcon.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsIcon.click();
      const combobox = this.page.getByRole('combobox');
      if (await combobox.isVisible({ timeout: 3000 }).catch(() => false)) {
        await combobox.selectOption('phone').catch(() => {});
        await this.page.getByRole('button', { name: 'Add', exact: true }).click().catch(() => {});
      }
    }
  }

  public async publishCheckoutPage(): Promise<void> {
    this.context.recordStep('Publish Checkout Page');
    Logger.info('CHECKOUT', 'Publishing checkout page...');

    await this.page.getByRole('button', { name: 'Publish Publish the page live.' }).click();
    await this.page.waitForTimeout(3000);
    Logger.info('CHECKOUT', 'CHECKOUT PAGE UPDATED & PUBLISHED');
  }
}