import { Page, Locator, FrameLocator } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { FREE_TRIAL_SELECTORS } from '../config/selectors';

export type PlanKey = 'launchpad' | 'pro' | 'flexifunnels';
export type BillingCycle = 'monthly' | 'yearly';

/**
 * Loose fallback patterns for each plan's "Continue with ..." button.
 * Only used if the exact text from FREE_TRIAL_SELECTORS.plans is not found,
 * so the working Pro path is unchanged.
 */
const PLAN_BUTTON_PATTERNS: Record<PlanKey, RegExp> = {
  launchpad: /continue\s*with\s*launch\s*pad/i,
  pro: /continue\s*with\s*pro\b/i,
  // The 3rd plan is called "Flexifunnels" in the button but "Premium" on the page/checkout
  flexifunnels: /continue\s*with\s*(flexi\s*funnels?|premium)/i,
};

/** "Skip — start trial without a card". Tolerant of em-dash / en-dash / hyphen / no dash. */
const ADDON_SKIP_PATTERN = /skip\s*[—–-]?\s*start\s+trial\s+without/i;

/** Landing URLs that mean the account + trial were created. */
const POST_CHECKOUT_URL = /welcome|dashboard/i;


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

  async selectPlan(plan: PlanKey, billingCycle: BillingCycle = 'monthly') {
    // 1. Billing cycle.
    //    MONTHLY: click the "Monthly" toggle (the page opens on yearly by default).
    //    YEARLY : do nothing - the page already shows the yearly plans, and
    //             clicking around here is what used to risk landing on the wrong view.
    if (billingCycle === 'monthly') {
      const monthlyBtn = this.page.getByRole('button', { name: FREE_TRIAL_SELECTORS.monthlyToggleBtn });
      const monthlyShown = await monthlyBtn
        .waitFor({ state: 'visible', timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (monthlyShown) {
        await monthlyBtn.click();
        await this.waitStep(1000);
      }
    } else {
      console.log('>>> Billing: YEARLY - leaving the default (yearly) plans view untouched.');
    }

    // 2. Click the plan button (same button as before for Pro; tolerant for other plans)
    const planButton = await this.findPlanButton(plan);
    await planButton.scrollIntoViewIfNeeded().catch(() => {});
    await planButton.click();
    console.log(`>>> Selected plan: ${plan} (${billingCycle})`);
    await this.waitStep(2000);

    // 3. Click SUBSCRIBE & START TRIAL -> (if present). Real wait, not an instant check.
    const subscribeBtn = this.page.getByRole('button', { name: new RegExp(FREE_TRIAL_SELECTORS.subscribeAndStartTrialBtn, 'i') });
    const subscribeShown = await subscribeBtn
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (subscribeShown) {
      await subscribeBtn.click();
      await this.waitStep(3000);
    }
  }

  /**
   * Flow A: Free trial WITHOUT Card - matches the recorded flow, strictly in order:
   *   1. "Skip — start trial without a card" link (clicked ONCE)
   *   2. "Skip plan selection" pop-up -> "Skip for now"   (pop-up is slow to load, waits up to 45s)
   *   3. "START MY FREE TRIAL →"
   *
   * No plan is selected and SUBSCRIBE is never clicked (that opens the Paddle ZIP/card screen).
   * The skip link stays visible behind the pop-up, so it is never clicked again once the
   * pop-up is on its way - that was what stopped "Skip for now" from being clicked.
   */
  async completeTrialWithoutCard() {
    const skipLink = () => this.firstVisible(ADDON_SKIP_PATTERN);
    const skipForNow = this.page.getByRole('button', { name: /^\s*skip\s*for\s*now\s*$/i }).first();

    // ── Step 1: "Skip — start trial without a card" (once; one retry only if the pop-up never came)
    const link = await this.waitForVisible(ADDON_SKIP_PATTERN, 30000);
    if (!link) {
      await this.dumpDiagnostics('nocard-skip-link-missing');
      throw new Error('No-card flow: "Skip — start trial without a card" link did not appear on the plans page.');
    }
    await link.scrollIntoViewIfNeeded().catch(() => {});
    console.log('>>> No-card flow: clicking "Skip — start trial without a card"');
    await link.click();

    // ── Step 2: wait for the slow "Skip plan selection" pop-up, then "Skip for now"
    console.log('>>> No-card flow: waiting for the "Skip plan selection" pop-up (can be slow)...');
    let popupShown = await skipForNow.waitFor({ state: 'visible', timeout: 45000 }).then(() => true).catch(() => false);

    if (!popupShown) {
      // Pop-up never showed: the first click probably did not register. Retry the link ONCE.
      const again = await skipLink();
      if (again) {
        console.log('>>> No-card flow: pop-up did not appear - clicking the skip link one more time.');
        await again.click().catch(() => {});
        popupShown = await skipForNow.waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false);
      }
    }
    if (!popupShown) {
      await this.assertNoPaddle();
      await this.dumpDiagnostics('nocard-skip-for-now-missing');
      throw new Error('No-card flow: the "Skip plan selection" pop-up ("Skip for now") did not appear.');
    }

    await this.waitStep(800); // let the pop-up finish its open animation
    console.log('>>> No-card flow: clicking "Skip for now"');
    await skipForNow.click();

    // ── Step 3: "START MY FREE TRIAL →"
    const start = await this.waitForVisible(/start\s*my\s*free\s*trial/i, 45000);
    if (!start) {
      if (POST_CHECKOUT_URL.test(this.page.url())) return; // already moved on
      await this.assertNoPaddle();
      await this.dumpDiagnostics('nocard-start-trial-missing');
      throw new Error('No-card flow: "START MY FREE TRIAL" button did not appear after "Skip for now".');
    }
    console.log('>>> No-card flow: clicking "START MY FREE TRIAL"');
    await start.click();
    await this.waitStep(3000);
  }

  /** Fails fast with a clear message if the Paddle card/ZIP checkout opened during a no-card run. */
  private async assertNoPaddle() {
    if (await this.page.locator(FREE_TRIAL_SELECTORS.paddleFrame).first().isVisible().catch(() => false)) {
      await this.dumpDiagnostics('nocard-paddle-opened');
      throw new Error('No-card flow: the Paddle card/ZIP checkout opened, which should not happen for a no-card trial.');
    }
  }

  /**
   * Flow B: Subscribe WITH Card (Paddle checkout iframe)
   */
  async completeTrialWithCard(card: CardDetails) {
    const paddleFrame = this.page.frameLocator(FREE_TRIAL_SELECTORS.paddleFrame);

    // NOTE: "Skip — start trial without a..." is the NO-CARD button on the plans page,
    // so the card flow must never click it. We go straight to the Paddle checkout.

    // 1. Postcode (Paddle "Your details" step)
    const postCode = await this.resolvePostcodeField(paddleFrame);
    const cardNumber = paddleFrame.getByTestId(FREE_TRIAL_SELECTORS.cardNumberInput);

    // 2. Submit location (ZIP). Never hangs: every click and wait has a time limit, and it
    //    moves on to valid 6-digit Indian PIN codes if Paddle does not accept the first ZIP.
    await this.submitZipUntilCardFields(paddleFrame, postCode, cardNumber, card.postalCode || '1234560');

    // 3. Card details
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
  }

  /**
   * After payment / trial start: get past the welcome screen, close pop-ups and return,
   * so the next test in the queue can start.
   *
   * Every wait here is a REAL, bounded wait (Playwright's isVisible({timeout}) ignores its
   * timeout and returns instantly). The last step only fails if we are clearly back on the
   * login/register screen; it no longer hangs waiting for one specific URL.
   */
  async finishOnboarding() {
    // 1. Wait (max 45s) until we have left the plan / Paddle screens
    const leaveDeadline = Date.now() + 45000;
    while (Date.now() < leaveDeadline) {
      if (POST_CHECKOUT_URL.test(this.page.url())) break;
      if (await this.hasLeftCheckout()) break;
      await this.page.waitForTimeout(1000);
    }
    await this.waitStep();

    // 2. "Continue to dashboard" (wait up to 15s)
    const toDashboard = await this.waitForVisible(/continue\s*to\s*dashboard/i, 15000);
    if (toDashboard) {
      await toDashboard.click();
      await this.waitStep();
    }

    // 3. Close any welcome / onboarding pop-ups
    await this.closeOnboardingPopups();

    // 4. Done - the account exists. Only fail if we were bounced back to login/register.
    const finalUrl = this.page.url();
    console.log(`>>> Onboarding finished. Final URL: ${finalUrl}`);
    if (/new-login|register|signup/i.test(finalUrl)) {
      await this.dumpDiagnostics('onboarding-bad-url');
      throw new Error(`Expected to be inside the app after onboarding but landed on: ${finalUrl}`);
    }
  }

  // ───────────────────────── helpers for multi-plan support ─────────────────────────

  /**
   * Returns the first VISIBLE "Continue with <plan>" button.
   * 1st try = the exact selector used before (so Pro behaves identically),
   * then looser fallbacks for plans whose button text/markup differs.
   */
  private async findPlanButton(plan: PlanKey): Promise<Locator> {
    const pattern = PLAN_BUTTON_PATTERNS[plan];

    // Wait for the plans screen to render at least one plan button
    await this.page
      .getByRole('button', { name: /continue\s*with/i })
      .first()
      .waitFor({ state: 'visible', timeout: 20000 })
      .catch(() => {});

    const candidates: Locator[] = [
      this.page.getByRole('button', { name: FREE_TRIAL_SELECTORS.plans[plan] }),
      this.page.getByRole('button', { name: pattern }),
      this.page.getByRole('link', { name: pattern }),
      this.page.locator('button, a, [role="button"]').filter({ hasText: pattern }),
    ];

    for (const candidate of candidates) {
      const count = await candidate.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const el = candidate.nth(i);
        if (await el.isVisible().catch(() => false)) return el;
      }
    }

    await this.dumpDiagnostics(`plan-button-${plan}`);
    throw new Error(`Could not find a visible "Continue with ${plan}" button. See screenshot + button list above.`);
  }

  /** First visible button/link whose text matches the pattern, or null (no waiting). */
  private async firstVisible(pattern: RegExp): Promise<Locator | null> {
    const strategies: Locator[] = [
      this.page.getByRole('button', { name: pattern }),
      this.page.getByRole('link', { name: pattern }),
      this.page.locator('button, a, [role="button"]').filter({ hasText: pattern }),
    ];
    for (const loc of strategies) {
      const n = await loc.count().catch(() => 0);
      for (let i = 0; i < n; i++) {
        const el = loc.nth(i);
        if (await el.isVisible().catch(() => false)) return el;
      }
    }
    return null;
  }

  /** Polls up to timeoutMs for a matching visible button/link. */
  private async waitForVisible(pattern: RegExp, timeoutMs: number): Promise<Locator | null> {
    const end = Date.now() + timeoutMs;
    do {
      const el = await this.firstVisible(pattern);
      if (el) return el;
      await this.page.waitForTimeout(400);
    } while (Date.now() < end);
    return null;
  }

  /** True when neither the Paddle overlay nor the "Continue with <plan>" buttons are on screen. */
  private async hasLeftCheckout(): Promise<boolean> {
    const paddleVisible = await this.page.locator(FREE_TRIAL_SELECTORS.paddleFrame).first().isVisible().catch(() => false);
    if (paddleVisible) return false;
    const planButton = await this.firstVisible(/continue\s*with/i);
    return planButton === null;
  }

  /** Closes up to 4 stacked welcome / onboarding pop-ups. */
  private async closeOnboardingPopups() {
    for (let pass = 0; pass < 4; pass++) {
      const candidates: Locator[] = [
        this.page.getByRole('button', { name: FREE_TRIAL_SELECTORS.closeBtn }).first(),
        this.page.locator('div').filter({ hasText: /^Close$/ }).first(),
      ];
      let closed = false;
      for (const candidate of candidates) {
        const visible = await candidate
          .waitFor({ state: 'visible', timeout: pass === 0 ? 5000 : 2000 })
          .then(() => true)
          .catch(() => false);
        if (visible) {
          await candidate.click().catch(() => {});
          await this.waitStep();
          closed = true;
          break;
        }
      }
      if (!closed) break;
    }
  }

  /**
   * Paddle ZIP field. Tries the known test id first (identical to before),
   * then falls back to label / autocomplete based locators.
   */
  private async resolvePostcodeField(frame: FrameLocator): Promise<Locator> {
    const byTestId = frame.getByTestId(FREE_TRIAL_SELECTORS.postcodeInput);
    if (await byTestId.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)) {
      return byTestId;
    }
    const fallback = frame
      .getByLabel(/zip|post\s*code/i)
      .or(frame.locator('input[autocomplete="postal-code"], input[name*="postcode" i], input[name*="zip" i]'))
      .first();
    if (await fallback.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)) {
      console.log('>>> ZIP field found via fallback locator (test id not present).');
      return fallback;
    }
    await this.dumpDiagnostics('paddle-not-shown');
    throw new Error('Paddle checkout (ZIP/postcode field) did not appear after selecting the plan. See screenshot + frame/button list above.');
  }

  /**
   * Tries each ZIP until Paddle shows the card fields.
   * Order: configured ZIP first (unchanged behaviour when it works), then valid 6-digit PINs.
   */
  private async submitZipUntilCardFields(frame: FrameLocator, postCode: Locator, cardNumber: Locator, firstZip: string) {
    const zips = [...new Set([firstZip, '248001', '110001'])];

    for (let i = 0; i < zips.length; i++) {
      const zip = zips[i];
      console.log(`>>> Paddle: entering ZIP/PIN "${zip}" (attempt ${i + 1}/${zips.length})`);
      const submitted = await this.submitPaddleLocation(frame, postCode, zip);
      if (!submitted) continue; // Continue was disabled for this ZIP - try the next one now

      // Wait up to 30s for card fields (Paddle can be slow calculating tax on yearly plans)
      const end = Date.now() + 30000;
      while (Date.now() < end) {
        if (await cardNumber.isVisible().catch(() => false)) {
          console.log(`>>> Paddle: ZIP "${zip}" accepted - card fields are showing.`);
          return;
        }
        const errText = await this.paddleErrorText(frame);
        if (errText) {
          console.log(`>>> Paddle: ZIP "${zip}" rejected - "${errText}"`);
          break;
        }
        await this.page.waitForTimeout(1000);
      }
      if (await cardNumber.isVisible().catch(() => false)) return;
      if (!(await postCode.isVisible().catch(() => false))) {
        // Left the ZIP step but no card fields yet - give it a little longer, then stop.
        if (await cardNumber.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)) return;
        break;
      }
    }

    await this.dumpDiagnostics('paddle-zip-stuck');
    throw new Error('Paddle did not move from the ZIP/Postcode step to the card details step. See screenshot + Paddle text above.');
  }

  /** Visible validation error inside the Paddle frame, if any. */
  private async paddleErrorText(frame: FrameLocator): Promise<string | null> {
    const err = frame.locator('[role="alert"], [aria-invalid="true"] ~ *, [class*="error" i]').filter({ hasText: /\S/ }).first();
    if (await err.isVisible().catch(() => false)) {
      return ((await err.innerText({ timeout: 2000 }).catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 120) || null;
    }
    return null;
  }

  /** Types the ZIP and presses Paddle's "Continue" on the "Your details" step (time-limited). */
  private async submitPaddleLocation(frame: FrameLocator, postCode: Locator, zip: string): Promise<boolean> {
    await postCode.click({ timeout: 10000 });
    await postCode.fill('', { timeout: 10000 });
    await postCode.fill(zip, { timeout: 10000 });
    // If Paddle's field did not take the value (e.g. maxlength / masked input), type it key by key
    const typed = await postCode.inputValue({ timeout: 5000 }).catch(() => '');
    if (typed !== zip) {
      await postCode.fill('', { timeout: 10000 }).catch(() => {});
      await postCode.pressSequentially(zip, { delay: 80, timeout: 15000 }).catch(() => {});
    }
    await postCode.press('Tab', { timeout: 5000 }).catch(() => {}); // trigger Paddle validation
    await this.waitStep(800);
    console.log(`>>> Paddle: ZIP field now contains "${await postCode.inputValue({ timeout: 5000 }).catch(() => '?')}"`);

    let locationBtn: Locator = frame.getByTestId(FREE_TRIAL_SELECTORS.authLocationSubmitBtn);
    if (!(await locationBtn.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false))) {
      locationBtn = frame.getByRole('button', { name: /^continue$/i }).first();
      await locationBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    }
    if (!(await locationBtn.isEnabled().catch(() => true))) {
      console.log('>>> Paddle: Continue button is disabled for this ZIP.');
      return false;
    }
    await locationBtn.click({ timeout: 15000 }).catch((e) => console.log(`>>> Paddle: Continue click failed: ${String(e).split('\n')[0]}`));
    await this.waitStep(2500);
    return true;
  }

  /** Saves a screenshot and prints all visible button labels, to debug a failing step. */
  private async dumpDiagnostics(tag: string) {
    try {
      const dir = path.join(__dirname, '../test-results');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `freetrial-${tag}-${Date.now()}.png`);
      await this.page.screenshot({ path: file, fullPage: true });
      console.log(`>>> [DIAGNOSTIC] Screenshot saved: ${file}`);

      const labels = await this.page.evaluate(() =>
        Array.from(document.querySelectorAll('button, a, [role="button"]'))
          .filter((el) => {
            const r = (el as HTMLElement).getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          })
          .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
          .filter((t) => t.length > 0 && t.length < 80)
      );
      console.log(`>>> [DIAGNOSTIC] URL: ${this.page.url()}`);
      console.log('>>> [DIAGNOSTIC] Frames: ' + this.page.frames().map((f) => `${f.name() || '(no name)'} -> ${f.url().slice(0, 80)}`).join(' | '));
      const paddleText = await this.page
        .frameLocator(FREE_TRIAL_SELECTORS.paddleFrame)
        .locator('body')
        .innerText({ timeout: 3000 })
        .catch(() => '');
      if (paddleText) console.log('>>> [DIAGNOSTIC] Paddle checkout text:\n  ' + paddleText.replace(/\n+/g, ' | ').slice(0, 600));
      console.log('>>> [DIAGNOSTIC] Visible buttons/links:\n  - ' + [...new Set(labels)].join('\n  - '));
    } catch (e) {
      console.log('>>> [DIAGNOSTIC] Could not capture diagnostics:', e);
    }
  }
}
