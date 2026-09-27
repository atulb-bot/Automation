import { Page, Locator, expect } from '@playwright/test';
import { Logger } from '../utils/logger';
import { PopupHandler } from '../utils/popup-handler';
import { TestContext } from '../utils/test-context';
import { Helpers } from '../utils/helpers';
import { SELECTORS } from '../config/selectors';

export interface ProductConfig {
  key: 'FE' | 'OTO1' | 'DS1' | 'OTO2' | 'DS2';
  productName: string;
  salesPageName: string;
  checkoutPageName: string;
  price: string;
}

export class ProductsPage {
  constructor(private page: Page, private context: TestContext) {}

  public async openProducts(): Promise<void> {
    this.context.recordStep('Open Products');
    Logger.info('PRODUCT', 'Navigating to Products...');
    await PopupHandler.dismissKnownPopups(this.page);

    const productsLink = this.page.getByRole('link', { name: SELECTORS.products.navLink, exact: true });
    if (await productsLink.isVisible({ timeout: 4000 }).catch(() => false)) {
      await productsLink.click();
    } else {
      await this.page.goto('https://app.flexifunnels.com/products', { waitUntil: 'domcontentloaded' });
    }

    await this.page.waitForLoadState('domcontentloaded');
    await PopupHandler.dismissKnownPopups(this.page);
    await expect(
      this.page.getByRole('button', { name: SELECTORS.products.createProductBtn }).first()
    ).toBeVisible({ timeout: 25000 });
  }

  /**
   * Basics + pricing + gateway. Order confirmed via live recording:
   * name -> Continue -> (skip image) -> Continue to Pricing -> toggle Mukesh
   * Test Account gateway -> Add Pricing -> Add Price -> Save & Continue ->
   * price -> purchase limit -> Save & Continue -> Finish Setup.
   */
  public async createProduct(productName: string, price: string): Promise<void> {
    this.context.recordStep(`Create Product: ${productName}`);
    this.context.productName = productName;
    Logger.info('PRODUCT', `Creating product: "${productName}" @ price ${price}`);

    await PopupHandler.dismissKnownPopups(this.page);

    // 1. Click "Create Product"
    const createBtn = this.page.getByRole('button', { name: SELECTORS.products.createProductBtn }).first();
    await expect(createBtn).toBeVisible({ timeout: 20000 });
    await createBtn.click();
    await Helpers.waitForAppReady(this.page); // product-type modal renders async after this click
    await Helpers.stepDelay(this.page);

    // 2. Choose "Digital Product" (confirmed accessible name)
    const digitalProductBtn = this.page.getByRole('button', { name: SELECTORS.products.digitalProductType }).first();
    await expect(digitalProductBtn).toBeVisible({ timeout: 15000 });
    await digitalProductBtn.click();
    await Helpers.waitForAppReady(this.page);
    await Helpers.stepDelay(this.page);

    // 3. Continue
    await this.page.getByRole('button', { name: SELECTORS.products.continueBtn, exact: true }).click();
    await Helpers.waitForAppReady(this.page); // wizard step transition — name field isn't wired until this settles
    await Helpers.stepDelay(this.page);

    // 4. Fill product name
    const nameInput = this.page.getByRole('textbox', { name: SELECTORS.products.productNameInput })
      .or(this.page.getByPlaceholder(SELECTORS.products.productNameInput)).first();
    await expect(nameInput).toBeVisible({ timeout: 15000 });
    await nameInput.click();
    await nameInput.fill(productName);
    await expect(nameInput).toHaveValue(productName, { timeout: 3000 }); // guard against the fill landing before the field is fully interactive
    await Helpers.stepDelay(this.page);

    await PopupHandler.closeFreshChatNotifications(this.page);

    // 5. Image upload is optional. If the codegen-observed "Image Gallery"
    // dialog opens without an explicit selection, close it rather than
    // leaving it blocking the wizard.
    const galleryDialog = this.page.getByRole('dialog', { name: SELECTORS.products.galleryDialog });
    if (await galleryDialog.isVisible({ timeout: 1500 }).catch(() => false)) {
      await this.page.keyboard.press('Escape').catch(() => {});
    }

    // 6. Continue to Pricing
    const continuePricingBtn = this.page.getByRole('button', { name: SELECTORS.products.continuePricingBtn });
    await expect(continuePricingBtn).toBeVisible({ timeout: 10000 });
    await expect(continuePricingBtn).toBeEnabled({ timeout: 8000 });
    await continuePricingBtn.click();
    await Helpers.waitForAppReady(this.page); // pricing/payment-provider step fetches gateway list async
    await Helpers.stepDelay(this.page);

    // 7. Enable every toggle on the payment-providers step (must happen before Add Pricing).
    await this.enableAllPaymentToggles();
    await Helpers.stepDelay(this.page);

    // 8. Add Pricing -> Add Price -> Save & Continue
    const addPricingBtn = this.page.getByRole('button', { name: SELECTORS.products.addPricingBtn });
    if (await addPricingBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
      await addPricingBtn.click();
      await Helpers.stepDelay(this.page);
    }
    const addPriceBtn = this.page.getByRole('button', { name: SELECTORS.products.addPriceBtn });
    if (await addPriceBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
      await addPriceBtn.click();
      await Helpers.stepDelay(this.page);
    }
    const saveContinue1 = this.page.getByRole('button', { name: SELECTORS.products.saveAndContinueBtn }).first();
    if (await saveContinue1.isVisible({ timeout: 6000 }).catch(() => false)) {
      await saveContinue1.click();
      await Helpers.stepDelay(this.page);
    }

    // 9. Price + purchase limit
    const priceInput = this.page.getByRole('textbox', { name: SELECTORS.products.priceInput })
      .or(this.page.getByPlaceholder(SELECTORS.products.priceInput)).first();
    await expect(priceInput).toBeVisible({ timeout: 10000 });
    await priceInput.click();
    await priceInput.fill(price);
    await Helpers.stepDelay(this.page);

    const purchaseLimit = this.page.getByRole('listbox', { name: 'Purchase limit' });
    if (await purchaseLimit.isVisible({ timeout: 4000 }).catch(() => false)) {
      await purchaseLimit.click();
      const multiOption = this.page.getByRole('option', { name: 'Allow multiple purchases' });
      if (await multiOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await multiOption.click();
      }
      await Helpers.stepDelay(this.page);
    }

    // 10. Save & Continue (final), then Finish Setup
    const saveContinue2 = this.page.getByRole('button', { name: SELECTORS.products.saveAndContinueBtn }).first();
    await expect(saveContinue2).toBeVisible({ timeout: 10000 });
    await saveContinue2.click();
    await Helpers.stepDelay(this.page);

    const finishSetupBtn = this.page.getByRole('button', { name: SELECTORS.products.finishSetupBtn });
    if (await finishSetupBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      await finishSetupBtn.click();
      await Helpers.stepDelay(this.page);
    }

    await this.page.waitForLoadState('domcontentloaded');
    await PopupHandler.dismissKnownPopups(this.page);
    Logger.info('PRODUCT', `✅ Product "${productName}" created with pricing + gateway.`);
  }

  /**
   * Enables every toggle/switch rendered on the payment-providers step
   * (gateways, and any other on/off switches on that page), not just a
   * single named gateway. Each switch's own id (headlessui-switch-:rNN:) is
   * React-generated and changes every render, so switches are re-queried by
   * role each pass rather than cached by id or index.
   *
   * Sequence: wait for the switches to actually be hydrated -> for each one
   * still off, click it and re-read its state until confirmed on (retrying
   * up to 3x per switch, since a click during a slow render can land before
   * the switch is wired and silently no-op) -> one final settle wait before
   * handing control back to the Add Pricing step, so pricing UI doesn't race
   * a toggle's own async save.
   */
  private async enableAllPaymentToggles(): Promise<void> {
    const toggleSelector = '[role="switch"], input[type="checkbox"], button[class*="toggle" i]';

    // Wait for at least one switch to actually be hydrated — acting on the
    // list while it's still loading is what caused toggles to no-op.
    await expect(async () => {
      const count = await this.page.locator(toggleSelector).count();
      if (count < 1) {
        throw new Error('No toggles rendered on payment step yet');
      }
    }).toPass({ timeout: 15000, intervals: [300, 500, 800, 1200] });

    const toggleCount = await this.page.locator(toggleSelector).count();
    Logger.info('PRODUCT', `Found ${toggleCount} toggle(s) on the payment step — enabling all.`);

    for (let i = 0; i < toggleCount; i++) {
      const toggle = this.page.locator(toggleSelector).nth(i);
      await toggle.scrollIntoViewIfNeeded().catch(() => {});

      if (!(await toggle.isVisible({ timeout: 4000 }).catch(() => false))) {
        Logger.warn('PRODUCT', `Toggle ${i + 1}/${toggleCount} not visible — skipping.`);
        continue;
      }

      let confirmed = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (await this.isToggleOn(toggle)) {
          confirmed = true;
          Logger.info('PRODUCT', attempt === 1
            ? `Toggle ${i + 1}/${toggleCount} already ON.`
            : `Toggle ${i + 1}/${toggleCount} confirmed ON (attempt ${attempt}).`);
          break;
        }
        await toggle.click({ force: true }).catch(() => {});
        await this.page.waitForTimeout(500); // let the switch's own state update commit before re-reading it
        if (await this.isToggleOn(toggle)) {
          confirmed = true;
          Logger.info('PRODUCT', `Toggled ${i + 1}/${toggleCount} ON (attempt ${attempt}).`);
          break;
        }
        Logger.warn('PRODUCT', `Toggle ${i + 1}/${toggleCount} click attempt ${attempt}/3 did not register — retrying.`);
      }
      if (!confirmed) {
        Logger.warn('PRODUCT', `Could not confirm toggle ${i + 1}/${toggleCount} switched ON after 3 attempts.`);
      }
    }

    // Let the last toggle's async save settle before moving into Add Pricing.
    await Helpers.waitForAppReady(this.page);
  }

  private async isToggleOn(toggle: Locator): Promise<boolean> {
    const ariaChecked = await toggle.getAttribute('aria-checked').catch(() => null);
    if (ariaChecked !== null) return ariaChecked === 'true';
    const checked = await toggle.isChecked().catch(() => null);
    return checked === true;
  }

  /**
   * Page-wiring stage of the wizard, confirmed via recording:
   * Sales page -> Continue to Checkout -> Checkout page -> Continue to
   * Purchase -> Support Email -> Digital Asset -> Continue -> Continue ->
   * Thank You page -> Save & Continue -> Next -> Back to My Products.
   * Call immediately after createProduct() while still in the wizard.
   */
  public async connectProductPages(
    productName: string,
    projectName: string,
    salesPageName: string,
    checkoutPageName: string,
    supportEmail?: string,
    thankYouPageName: string = 'Thank You'
  ): Promise<void> {
    this.context.recordStep(`Wire Pages for ${productName}`);
    Logger.info('PRODUCT', `Wiring "${productName}" -> Sales: "${salesPageName}", Checkout: "${checkoutPageName}"`);
    await PopupHandler.dismissKnownPopups(this.page);

    // --- Sales page ---
    await this.selectProject(projectName);
    await Helpers.stepDelay(this.page);
    await this.pickDropdownOptionByText(/Select a sales page/i, salesPageName, 'sales page');
    await Helpers.stepDelay(this.page);
    await this.clickIfVisible('Continue to Checkout');
    await Helpers.stepDelay(this.page);

    // --- Checkout page ---
    await this.selectProject(projectName);
    await Helpers.stepDelay(this.page);
    await this.pickDropdownOptionByText(/Default Checkout page|Select a checkout page/i, checkoutPageName, 'checkout page');
    await Helpers.stepDelay(this.page);
    await this.clickIfVisible('Continue to Purchase');
    await Helpers.stepDelay(this.page);

    // --- Purchase / delivery details ---
    const emailInput = this.page.getByRole('textbox', { name: /Support Email/i });
    if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await emailInput.click();
      await emailInput.fill(supportEmail || this.context.customerEmail || 'support@qa-automation.test');
      await Helpers.stepDelay(this.page);
    }

    const assetTrigger = this.page.locator('div').filter({ hasText: /Select \/ search your Digital Asset/i }).last();
    if (await assetTrigger.isVisible({ timeout: 5000 }).catch(() => false)) {
      const assetMenu = await Helpers.openDropdownAndGetOptions(
        this.page,
        assetTrigger,
        '.absolute.z-10, [role="listbox"]',
        1
      ).catch(() => this.page.locator('.absolute.z-10, [role="listbox"]').first());
      const assetOptions = assetMenu.locator('li, [role="option"], div[class*="cursor-pointer"], p');
      const assetCount = await assetOptions.count();
      if (assetCount > 0) {
        // Per spec: always take the 2nd rendered option (index 1), falling
        // back to the only option if just one renders.
        const targetIndex = assetCount > 1 ? 1 : 0;
        await assetOptions.nth(targetIndex).click({ force: true }).catch(() => {});
        Logger.info('PRODUCT', `Selected Digital Asset option index ${targetIndex} of ${assetCount}.`);
      } else {
        Logger.warn('PRODUCT', 'No Digital Asset options found — leaving unset. Product may need a pre-existing asset created first.');
      }
      await Helpers.stepDelay(this.page);
    }

    await this.clickIfVisible('Continue');
    await Helpers.stepDelay(this.page);
    await this.clickIfVisible('Continue');
    await Helpers.stepDelay(this.page);

    // --- Thank You page ---
    // Same dropdown pattern as Sales/Checkout above (pickDropdownOptionByText):
    // open via the trigger, read the actual rendered option text, match by
    // name. The previous version of this block used a different, direct
    // getByRole('listbox', { name: 'Select a Thank you page' }) selector
    // paired with an UNSCOPED getByRole('option') query (matching option
    // elements anywhere on the page, not just inside this dropdown's menu),
    // and always took whatever rendered last instead of matching by name —
    // that selector mismatch is the likely cause of this step intermittently
    // appearing "stuck". Removed in favor of reusing the same helper that
    // already works reliably for Sales/Checkout.
    await this.selectProject(projectName);
    await Helpers.stepDelay(this.page);
    await this.pickDropdownOptionByText(/Select a Thank you page/i, thankYouPageName, 'Thank You page');
    await Helpers.stepDelay(this.page);

    await this.clickIfVisible(SELECTORS.products.saveAndContinueBtn);
    await Helpers.stepDelay(this.page);
    await this.clickIfVisible('Next');
    await Helpers.stepDelay(this.page);
    await this.clickIfVisible('Back to My Products');
    await Helpers.stepDelay(this.page);

    Logger.info('PRODUCT', `Finished wiring pass for "${productName}".`);
  }

  /**
   * Selects the project from the "Select / search your project" dropdown by
   * always picking the 2nd rendered option (index 1) rather than matching
   * projectName text — per spec, these pickers should just take the 2nd
   * element in the list. Falls back to the only option if just one renders.
   */
  private async selectProject(projectName: string): Promise<void> {
    const trigger = this.page.locator('div').filter({ hasText: /^Select \/ search your project$/ }).last();
    if (!(await trigger.isVisible({ timeout: 5000 }).catch(() => false))) {
      return; // Project already selected / not on this step.
    }
    const menu = await Helpers.openDropdownAndGetOptions(this.page, trigger, '[role="listbox"], .absolute.z-10', 1);
    const options = menu.locator('li, [role="option"], div[class*="cursor-pointer"], p');
    const count = await options.count();
    const targetIndex = count > 1 ? 1 : 0;
    await options.nth(targetIndex).click({ force: true }).catch(() => {});
    Logger.info('PRODUCT', `Selected project dropdown option index ${targetIndex} of ${count}.`);
  }

  /**
   * Opens a page-picker dropdown matching triggerPattern and selects the
   * option whose text matches targetText (exact match first, case-insensitive
   * substring as fallback), instead of blindly always taking the 2nd option.
   * Blind index-1 selection was wiring every product to whatever page
   * happened to sit 2nd in the list, rather than that product's own page
   * (e.g. OTO1 was getting "FE Sales" instead of "OTO1 Sales"). Only falls
   * back to index 1 if no option's text matches targetText at all, so a
   * naming mismatch degrades instead of silently picking the wrong page.
   */
  private async pickDropdownOptionByText(triggerPattern: RegExp, targetText: string, description: string): Promise<void> {
    const trigger = this.page.locator('div').filter({ hasText: triggerPattern }).last();
    if (!(await trigger.isVisible({ timeout: 5000 }).catch(() => false))) {
      Logger.warn('PRODUCT', `Dropdown matching ${triggerPattern} not found — ${description} wiring skipped.`);
      return;
    }

    const menu = await Helpers.openDropdownAndGetOptions(
      this.page,
      trigger,
      '[role="listbox"], .absolute.z-10',
      1
    ).catch(() => {
      return this.page.locator('[role="listbox"], .absolute.z-10').first();
    });

    const options = menu.locator('li, [role="option"], div[class*="cursor-pointer"], p');
    const count = await options.count();
    if (count < 1) {
      Logger.warn('PRODUCT', `No options rendered in ${description} dropdown — leaving default selection.`);
      await this.page.keyboard.press('Escape').catch(() => {});
      return;
    }

    const texts: string[] = [];
    for (let i = 0; i < count; i++) {
      texts.push((await options.nth(i).innerText().catch(() => '')).trim());
    }

    // 1. Exact match (case-insensitive).
    let matchedIndex = texts.findIndex((t) => t.toLowerCase() === targetText.toLowerCase());
    // 2. Substring match, either direction, as fallback (handles trailing
    //    labels like "OTO1 Sales (Published)").
    if (matchedIndex === -1) {
      matchedIndex = texts.findIndex(
        (t) => t.toLowerCase().includes(targetText.toLowerCase()) || targetText.toLowerCase().includes(t.toLowerCase())
      );
    }
    if (matchedIndex === -1) {
      Logger.warn(
        'PRODUCT',
        `No option matching "${targetText}" found in ${description} dropdown (options: ${texts.join(', ') || 'none'}) — falling back to 2nd option.`
      );
      matchedIndex = count > 1 ? 1 : 0;
    }

    await options.nth(matchedIndex).click({ force: true });
    Logger.info('PRODUCT', `Selected ${description} option "${texts[matchedIndex] || targetText}" (index ${matchedIndex} of ${count}).`);
  }

  private async clickIfVisible(name: string | RegExp, timeout: number = 6000): Promise<boolean> {
    const btn = this.page.getByRole('button', { name, exact: false }).first();
    if (await btn.isVisible({ timeout }).catch(() => false)) {
      await btn.click();
      await this.page.waitForTimeout(400);
      return true;
    }
    Logger.warn('PRODUCT', `Expected button "${name}" was not visible — step skipped.`);
    return false;
  }
}
