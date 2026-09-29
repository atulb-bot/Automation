<<<<<<< HEAD
import { Page, expect } from '@playwright/test';
=======
import { Page, Locator, FrameLocator, expect } from '@playwright/test';
>>>>>>> 3b74662e3a642703c199e584d84b4d058f47ff14
import { FREE_TRIAL_SELECTORS } from '../config/selectors';

export type PlanKey = 'launchpad' | 'pro' | 'flexifunnels';

export interface CardDetails {
  fullName: string;
  postalCode?: string;
  cardNumber?: string;
  expiry?: string;
  cvv?: string;
}

export class FreeTrialPage {
  readonly page: Page;
  private readonly defaultDelay: number;

  constructor(page: Page, defaultDelay: number = 1500) {
    this.page = page;
    this.defaultDelay = defaultDelay;
  }

  async waitStep(ms: number = this.defaultDelay) {
    await this.page.waitForTimeout(ms);
  }

  async navigateToRegister() {
    await this.page.goto(FREE_TRIAL_SELECTORS.loginUrl);
    await this.waitStep();

    await this.page.getByRole('link', { name: FREE_TRIAL_SELECTORS.createFreeAccountLink }).click();
    await this.waitStep();

    const acceptCookies = this.page.getByRole('button', { name: FREE_TRIAL_SELECTORS.acceptAllCookiesBtn });
    if (await acceptCookies.isVisible({ timeout: 4000 }).catch(() => false)) {
      await acceptCookies.click();
      await this.waitStep(800);
    }
  }

  async submitRegistration(fullName: string, email: string) {
    await this.page.getByRole('textbox', { name: FREE_TRIAL_SELECTORS.fullNameInput }).fill(fullName);
    await this.waitStep(500);

    await this.page.getByRole('textbox', { name: FREE_TRIAL_SELECTORS.emailInput }).fill(email);
    await this.waitStep(500);

    await this.page.getByRole('button', { name: FREE_TRIAL_SELECTORS.createAccountBtn }).click();
    await this.waitStep();
  }

  /**
   * Pauses test for manual OTP entry. Resumes as soon as you submit in the browser.
   */
  async waitForManualOtp(timeoutMs: number = 90000) {
    console.log('\n=============================================================');
    console.log('>>> PAUSED: Enter the 6-digit OTP manually in the browser.');
    console.log('>>> Waiting for submission and next screen transition...');
    console.log('=============================================================\n');

    const continueBtn = this.page.getByRole('button', { name: FREE_TRIAL_SELECTORS.continueToPlansBtn });
    const phoneInput = this.page.getByRole('textbox', { name: FREE_TRIAL_SELECTORS.phoneNumberInput });
    const acceptCookies = this.page.getByRole('button', { name: FREE_TRIAL_SELECTORS.acceptAllCookiesBtn });

    await Promise.race([
      continueBtn.waitFor({ state: 'visible', timeout: timeoutMs }),
      phoneInput.waitFor({ state: 'visible', timeout: timeoutMs }),
      acceptCookies.waitFor({ state: 'visible', timeout: timeoutMs }),
    ]);

    await this.waitStep();
  }

  async fillPhoneAndProceed(phoneNumber: string = '1234567890') {
    const cookieBtn = this.page.getByRole('button', { name: FREE_TRIAL_SELECTORS.acceptAllCookiesBtn });
    if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cookieBtn.click();
      await this.waitStep(500);
    }

    const phoneInput = this.page.getByRole('textbox', { name: FREE_TRIAL_SELECTORS.phoneNumberInput });
    if (await phoneInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await phoneInput.fill(phoneNumber);
      await this.waitStep(500);
    }

    const continueBtn = this.page.getByRole('button', { name: FREE_TRIAL_SELECTORS.continueToPlansBtn });
    if (await continueBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await continueBtn.click();
      await this.waitStep(2500);
    }
  }

  async selectPlan(plan: PlanKey, billingCycle: 'monthly' | 'yearly' = 'monthly') {
    // 1. Toggle billing cycle
    if (billingCycle === 'monthly') {
      const monthlyBtn = this.page.getByRole('button', { name: FREE_TRIAL_SELECTORS.monthlyToggleBtn });
      if (await monthlyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await monthlyBtn.click();
        await this.waitStep(1000);
      }
    } else {
      const yearlyBtn = this.page.getByRole('button', { name: new RegExp(FREE_TRIAL_SELECTORS.yearlyToggleBtn, 'i') });
      if (await yearlyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await yearlyBtn.click();
        await this.waitStep(1000);
      }
    }

    // 2. Click the plan button
    const planButtonName = FREE_TRIAL_SELECTORS.plans[plan];
    await this.page.getByRole('button', { name: planButtonName }).click();
    await this.waitStep(2000);

    // 3. Click SUBSCRIBE & START TRIAL → (if present)
    const subscribeBtn = this.page.getByRole('button', { name: new RegExp(FREE_TRIAL_SELECTORS.subscribeAndStartTrialBtn, 'i') });
    if (await subscribeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await subscribeBtn.click();
      await this.waitStep(3000);
    }
  }

  /**
   * Flow A: Subscribe WITHOUT Card
   */
  async completeTrialWithoutCard() {
    const skipAddonBtn = this.page.getByRole('button', { name: new RegExp(FREE_TRIAL_SELECTORS.skipTrialWithoutAddonBtn, 'i') });
    await skipAddonBtn.waitFor({ state: 'visible', timeout: 10000 });
    await skipAddonBtn.click();
    await this.waitStep();

    const skipForNowBtn = this.page.getByRole('button', { name: FREE_TRIAL_SELECTORS.skipForNowBtn });
    await skipForNowBtn.waitFor({ state: 'visible', timeout: 8000 });
    await skipForNowBtn.click();
    await this.waitStep();

    const startTrialBtn = this.page.getByRole('button', { name: FREE_TRIAL_SELECTORS.startMyFreeTrialBtn });
    await startTrialBtn.waitFor({ state: 'visible', timeout: 8000 });
    await startTrialBtn.click();
    await this.waitStep(3000);
  }

<<<<<<< HEAD
  /**
   * Flow B: Subscribe WITH Card (Paddle checkout iframe)
   */
  async completeTrialWithCard(card: CardDetails) {
    const paddleFrame = this.page.frameLocator(FREE_TRIAL_SELECTORS.paddleFrame);

    // 1. Postcode
    const postCode = paddleFrame.getByTestId(FREE_TRIAL_SELECTORS.postcodeInput);
    await postCode.waitFor({ state: 'visible', timeout: 15000 });
    await postCode.click();
    await postCode.fill(card.postalCode || '1234560');
    await this.waitStep(500);

    // 2. Submit location
    const locationBtn = paddleFrame.getByTestId(FREE_TRIAL_SELECTORS.authLocationSubmitBtn);
    await locationBtn.waitFor({ state: 'visible', timeout: 10000 });
    await locationBtn.click();
    await this.waitStep(2500);

    // 3. Card details
    const cardNumber = paddleFrame.getByTestId(FREE_TRIAL_SELECTORS.cardNumberInput);
    await cardNumber.waitFor({ state: 'visible', timeout: 15000 });
    await cardNumber.click();
    await cardNumber.fill(card.cardNumber || '4242 4242 4242 4242');
    await this.waitStep(500);

    const cardHolder = paddleFrame.getByTestId(FREE_TRIAL_SELECTORS.cardholderNameInput);
    await cardHolder.click();
    await cardHolder.fill(card.fullName);
    await this.waitStep(500);

    const expiryField = paddleFrame.getByTestId(FREE_TRIAL_SELECTORS.expiryDateField);
    await expiryField.click();
    await expiryField.fill(card.expiry || '03 / 33');
    await this.waitStep(500);

    const cvvField = paddleFrame.getByTestId(FREE_TRIAL_SELECTORS.cvvInput);
    await cvvField.click();
    await cvvField.fill(card.cvv || '258');
    await this.waitStep(800);

    // 4. Submit Payment
    const submitPaymentBtn = paddleFrame.getByTestId(FREE_TRIAL_SELECTORS.cardPaymentSubmitBtn);
    await submitPaymentBtn.click();
    await this.waitStep(5000);
=======
  // ---------------------------------------------------------------------------
  // Flow B: Subscribe WITH Card (Paddle checkout iframe)
  // ---------------------------------------------------------------------------

  /** The visible Paddle checkout iframe (there can be hidden leftovers in the DOM). */
  private paddle(): FrameLocator {
    return this.page
      .locator(FREE_TRIAL_SELECTORS.paddleFrame)
      .filter({ visible: true })
      .last()
      .contentFrame();
  }

  /**
   * Pincode field. Paddle does not always render it the same way: for Pro it is
   * on the first "location" step with test-id `postcodeInput`, for other plans
   * it can appear on the card step or with a different id/label. So we match
   * every known variant and take whichever is on screen.
   */
  private postcodeField(frame: FrameLocator): Locator {
    return frame
      .getByTestId(FREE_TRIAL_SELECTORS.postcodeInput)
      .or(frame.locator(FREE_TRIAL_SELECTORS.postcodeCssFallback))
      .or(frame.getByLabel(FREE_TRIAL_SELECTORS.postcodeLabel))
      .or(frame.getByPlaceholder(FREE_TRIAL_SELECTORS.postcodeLabel))
      .filter({ visible: true })
      .first();
  }

  /** Types a value like a real user (masked Paddle inputs sometimes ignore .fill()). */
  private async typeInto(field: Locator, value: string) {
    await field.click();
    await field.fill('');
    await field.pressSequentially(value, { delay: 60 });
    const typed = (await field.inputValue().catch(() => '')).replace(/\s/g, '');
    if (typed !== value.replace(/\s/g, '')) {
      await field.fill(value);
    }
  }

  /** Fills the pincode if the field is currently shown. Returns true if it filled it. */
  private async fillPostcodeIfShown(frame: FrameLocator, postcode: string, timeoutMs = 3000): Promise<boolean> {
    const field = this.postcodeField(frame);
    if (!(await field.isVisible({ timeout: timeoutMs }).catch(() => false))) return false;

    const current = (await field.inputValue().catch(() => '')).trim();
    if (current === postcode) {
      console.log(`[free-trial] Pincode already filled (${postcode}).`);
      return true;
    }
    await this.typeInto(field, postcode);
    console.log(`[free-trial] Pincode filled: ${postcode}`);
    await this.waitStep(500);
    return true;
  }

  /**
   * Some plans show an extra "how do you want to start your trial" screen before
   * Paddle opens. If Paddle is not already open, try the card/continue buttons.
   */
  private async ensurePaddleOpen() {
    const frameEl = this.page.locator(FREE_TRIAL_SELECTORS.paddleFrame).filter({ visible: true }).last();
    if (await frameEl.isVisible({ timeout: 15000 }).catch(() => false)) return;

    const cardChoice = this.page
      .getByRole('button', { name: FREE_TRIAL_SELECTORS.addCardChoiceBtn })
      .filter({ visible: true })
      .first();
    if (await cardChoice.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[free-trial] Clicking card option to open Paddle checkout.');
      await cardChoice.click();
    }

    if (!(await frameEl.isVisible({ timeout: 20000 }).catch(() => false))) {
      await this.page.screenshot({ path: 'test-results/paddle-not-opened.png', fullPage: true }).catch(() => {});
      const buttons = await this.page.getByRole('button').filter({ visible: true }).allInnerTexts().catch(() => []);
      throw new Error(
        'Paddle checkout did not open. Screenshot: test-results/paddle-not-opened.png\n' +
          'Buttons on screen: ' + buttons.map((b) => b.trim()).filter(Boolean).join(' | '),
      );
    }
  }

  async completeTrialWithCard(card: CardDetails) {
    const postcode = card.postalCode || FREE_TRIAL_SELECTORS.defaultPostcode;

    await this.ensurePaddleOpen();
    const frame = this.paddle();

    const cardNumber = frame.getByTestId(FREE_TRIAL_SELECTORS.cardNumberInput);
    const locationBtn = frame.getByTestId(FREE_TRIAL_SELECTORS.authLocationSubmitBtn);

    // 1. Wait until Paddle has rendered its first step (location step OR card step).
    await this.postcodeField(frame).or(locationBtn).or(cardNumber).first()
      .waitFor({ state: 'visible', timeout: 30000 });
    await this.waitStep(800);

    // 2. Location step (Pro shows pincode here; other plans may not have this step).
    let postcodeDone = await this.fillPostcodeIfShown(frame, postcode);
    if (await locationBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await locationBtn.click();
      await this.waitStep(2500);

      // Still on location step? Pincode was required but missing/rejected.
      if (!(await cardNumber.isVisible({ timeout: 15000 }).catch(() => false))) {
        postcodeDone = (await this.fillPostcodeIfShown(frame, postcode)) || postcodeDone;
        await locationBtn.click();
        await this.waitStep(2500);
      }
    }

    // 3. Card details.
    await cardNumber.waitFor({ state: 'visible', timeout: 20000 });
    await this.typeInto(cardNumber, card.cardNumber || '4242 4242 4242 4242');
    await this.waitStep(500);

    await this.typeInto(frame.getByTestId(FREE_TRIAL_SELECTORS.cardholderNameInput), card.fullName);
    await this.waitStep(500);

    await this.typeInto(frame.getByTestId(FREE_TRIAL_SELECTORS.expiryDateField), card.expiry || '03 / 33');
    await this.waitStep(500);

    await this.typeInto(frame.getByTestId(FREE_TRIAL_SELECTORS.cvvInput), card.cvv || '258');
    await this.waitStep(500);

    // 4. For LaunchPad / FlexiFunnels the pincode can show up here, on the card step.
    postcodeDone = (await this.fillPostcodeIfShown(frame, postcode, 2000)) || postcodeDone;
    if (!postcodeDone) {
      console.log('[free-trial] No pincode field was shown by Paddle for this plan.');
    }

    // 5. Submit payment.
    const submitPaymentBtn = frame.getByTestId(FREE_TRIAL_SELECTORS.cardPaymentSubmitBtn);
    await submitPaymentBtn.click();
    await this.waitStep(5000);

    // 6. If Paddle is still showing the form with an empty pincode, fill it and retry once.
    if (await submitPaymentBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      if (await this.fillPostcodeIfShown(frame, postcode, 2000)) {
        console.log('[free-trial] Paddle asked for pincode again after submit - retrying payment.');
        await submitPaymentBtn.click();
        await this.waitStep(5000);
      }
    }
>>>>>>> 3b74662e3a642703c199e584d84b4d058f47ff14
  }

  async finishOnboarding() {
    await this.page.waitForURL(/.*welcome|dashboard.*/, { timeout: 35000 }).catch(() => {});
    await this.waitStep();

    const continueToDashboard = this.page.getByRole('link', { name: FREE_TRIAL_SELECTORS.continueToDashboardLink });
    if (await continueToDashboard.isVisible({ timeout: 15000 }).catch(() => false)) {
      await continueToDashboard.click();
      await this.waitStep();
    }

    const closeBtn = this.page.getByRole('button', { name: FREE_TRIAL_SELECTORS.closeBtn }).first();
    if (await closeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await closeBtn.click();
      await this.waitStep();
    }

    const closeDiv = this.page.locator('div').filter({ hasText: /^Close$/ }).first();
    if (await closeDiv.isVisible({ timeout: 3000 }).catch(() => false)) {
      await closeDiv.click();
      await this.waitStep();
    }

    await expect(this.page).toHaveURL(/.*dashboard|welcome.*/);
  }
}