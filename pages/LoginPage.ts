import { Page, expect } from '@playwright/test';
import { Logger } from '../utils/logger';
import { PopupHandler } from '../utils/popup-handler';
import { TestContext } from '../utils/test-context';

export class LoginPage {
  constructor(private page: Page, private context: TestContext) {}

  public async openLogin(): Promise<void> {
    this.context.recordStep('Open Login Page');
    Logger.info('LOGIN', 'Opening login page...');
    await this.page.goto('/login', { waitUntil: 'domcontentloaded' });
    await PopupHandler.dismissKnownPopups(this.page);
  }

  public async login(email: string, pass: string): Promise<void> {
    this.context.recordStep('Submit Login Credentials');
    Logger.info('LOGIN', `Logging in as: ${email}`);

    const emailInput = this.page.getByRole('textbox', { name: 'Email ID' });
    await expect(emailInput).toBeVisible({ timeout: 20000 });
    await emailInput.fill(email);

    const passInput = this.page.getByRole('textbox', { name: 'Password' });
    await expect(passInput).toBeVisible({ timeout: 20000 });
    await passInput.fill(pass);

    await PopupHandler.dismissKnownPopups(this.page);

    const submitBtn = this.page.getByRole('button', { name: 'Login Now' });
    await expect(submitBtn).toBeVisible({ timeout: 15000 });
    await submitBtn.click();

    await PopupHandler.dismissKnownPopups(this.page);
    await expect(this.page.getByRole('link', { name: 'Projects' })).toBeVisible({ timeout: 35000 });
    Logger.info('LOGIN', 'Login successful. Projects link verified.');
  }
}