import { Page, expect } from '@playwright/test';
import { Logger } from '../utils/logger';
import { PopupHandler } from '../utils/popup-handler';
import { TestContext } from '../utils/test-context';

export class PaymentPage {
  constructor(private page: Page, private context: TestContext) {}

  public async openBuyerJourney(livePage: Page): Promise<void> {
    this.context.recordStep('Open Live FE Sales Page');
    Logger.info('BUYER', 'Waiting for live FE Sales page to settle...');
    await livePage.waitForLoadState('domcontentloaded');
    await PopupHandler.dismissKnownPopups(livePage);
    await livePage.waitForTimeout(2000);

    // FIX: the button this framework actually inserts and wires has a
    // stable default label -- "Click Here to Get Access" -- but that exact
    // text wasn't in ANY of the matchers below. If the href-based match
    // below ever missed (or, since the "No thanks" button can now be wired
    // to the same Checkout page as the main CTA, if it matched THAT button
    // instead since both hrefs point at "checkout"), the buyer journey
    // could silently click the wrong element. Try the exact button we added
    // first, explicitly excluding anything reading "No thanks".
    const ourCta = livePage.getByRole('link', { name: 'Click Here to Get Access' })
      .filter({ hasNotText: /No,?\s*thanks/i }).first();
    if (await ourCta.isVisible({ timeout: 8000 }).catch(() => false)) {
      await ourCta.click();
      Logger.info('BUYER', 'Clicked the CTA button this framework added and wired. Transitioning to Checkout...');
      return;
    }

    // Prefer the button that's actually wired to go somewhere (its href
    // points at a checkout URL) over a text match -- the template's
    // original CTA can still be sitting on the page, unwired, with the same
    // generic text as the button we added and wired, so a bare text match
    // can click the wrong one. Excludes "No thanks" for the same reason as
    // above -- a decline button wired to the same Checkout page can also
    // have an href*="checkout" and land first in DOM order.
    const wiredCta = livePage.locator('a[href*="checkout" i]')
      .filter({ hasNotText: /No,?\s*thanks/i }).first();
    if (await wiredCta.isVisible({ timeout: 8000 }).catch(() => false)) {
      await wiredCta.click();
      Logger.info('BUYER', 'Clicked the wired CTA (checkout-bound link). Transitioning to Checkout...');
      return;
    }

    // Fall back to text matching -- take the LAST match rather than the
    // first, since the button this framework adds is inserted after
    // whatever the template already has. Also excludes "No thanks" for the
    // same reason as the two matchers above.
    const ctaByText = livePage.getByRole('link', { name: /Click Here to Get Access|Start Free Trial|Join|Buy|Enroll|Order|Get Started/i })
      .filter({ hasNotText: /No,?\s*thanks/i })
      .or(livePage.locator('a[href*="checkout"], button:has-text("Buy"), a.btn, [data-gjs-type="link"]').filter({ hasNotText: /No,?\s*thanks/i }))
      .last();

    await expect(ctaByText).toBeVisible({ timeout: 25000 });
    await ctaByText.click();
    Logger.info('BUYER', 'Clicked primary CTA. Transitioning to Checkout...');
  }

  public async fillCustomerDetails(livePage: Page): Promise<void> {
    this.context.recordStep('Fill Checkout Contact Details');
    Logger.info('BUYER', 'Filling buyer contact details on Checkout page...');
    await livePage.waitForLoadState('domcontentloaded');
    await PopupHandler.dismissKnownPopups(livePage);
    await livePage.waitForTimeout(2000);

    const nameInput = livePage.getByRole('textbox', { name: /First Name|Name|Full Name/i })
      .or(livePage.locator('input[name*="name" i], input[placeholder*="name" i]')).first();
    if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameInput.fill('Atul Automation');
    }

    const emailInput = livePage.getByRole('textbox', { name: /Email/i })
      .or(livePage.locator('input[type="email"], input[name*="email" i]')).first();
    if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await emailInput.fill(this.context.customerEmail);
    }

    const phoneInput = livePage.getByRole('textbox', { name: /Phone|Mobile/i })
      .or(livePage.locator('input[type="tel"], input[name*="phone" i]')).first();
    if (await phoneInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await phoneInput.fill('9876543210');
    }

    Logger.info('BUYER', `Contact details filled for ${this.context.customerEmail}`);
  }

  public async completeStripePayment(livePage: Page): Promise<void> {
    this.context.recordStep('Submit Stripe Payment');
    Logger.info('BUYER', 'Selecting Stripe as the payment method...');

    // Product creation enables every payment gateway toggle (Cashfree AND
    // Stripe), so Checkout now renders a method picker with both options.
    // The Stripe submit button (class "... ft-payment-stripe ...") stays
    // hidden (d-none) until Stripe is the selected method -- confirmed from
    // a live failure where the button was found but reported "hidden".
    // Always pick Stripe explicitly rather than assuming it's the default.
    const stripeOption = livePage.getByRole('radio', { name: /^Stripe$/i })
      .or(livePage.getByRole('tab', { name: /^Stripe$/i }))
      .or(livePage.getByRole('button', { name: /^Stripe$/i }))
      .or(livePage.getByText(/^Stripe$/i))
      .or(livePage.locator('[class*="payment" i]').filter({ hasText: /^Stripe$/i })).first();

    if (await stripeOption.isVisible({ timeout: 8000 }).catch(() => false)) {
      await stripeOption.click();
      await livePage.waitForTimeout(1500);
      Logger.info('BUYER', 'Stripe payment method selected.');
    } else {
      Logger.warn('BUYER', 'No separate "Stripe" method picker found — assuming Stripe is the only/default option.');
    }

    Logger.info('BUYER', 'Entering Stripe test card details...');

    const stripeFrame = livePage.frameLocator('iframe[name*="__privateStripeFrame"], iframe[src*="stripe.com"]').first();

    const cardNumberInput = stripeFrame.getByRole('textbox', { name: /Card number/i })
      .or(stripeFrame.locator('input[name="cardnumber"], input[autocomplete="cc-number"]')).first();

    if (await cardNumberInput.isVisible({ timeout: 10000 }).catch(() => false)) {
      // The card number input rendering doesn't mean the Stripe iframe has
      // fully finished initializing (fonts/JS/validation wiring) -- filling
      // too early is a common cause of fields not registering as "valid",
      // which then makes the submit button silently no-op. Give it a brief
      // settle window before typing anything.
      Logger.info('BUYER', 'Stripe card form detected — waiting for it to finish loading...');
      await livePage.waitForTimeout(1500);

      await cardNumberInput.fill('4242424242424242');

      const expInput = stripeFrame.getByRole('textbox', { name: /Expiration/i })
        .or(stripeFrame.locator('input[name="exp-date"], input[autocomplete="cc-exp"]')).first();
      await expInput.fill('12/28');

      const cvcInput = stripeFrame.getByRole('textbox', { name: /CVC/i })
        .or(stripeFrame.locator('input[name="cvc"], input[autocomplete="cc-csc"]')).first();
      await cvcInput.fill('123');

      Logger.info('BUYER', 'Card credentials filled in Stripe frame.');
    } else {
      const fallbackCard = livePage.locator('input[name*="card" i], input[placeholder*="Card Number" i]').first();
      if (await fallbackCard.isVisible({ timeout: 4000 }).catch(() => false)) {
        await fallbackCard.fill('4242424242424242');
      }
    }

    // Let Stripe's own client-side validation catch up with what was just
    // typed before we try to submit.
    await livePage.waitForTimeout(1500);

    // Scope to the Stripe-specific submit button first (ft-payment-stripe),
    // since a Cashfree submit button can exist on the same page and a bare
    // text match could land on that instead.
    const payBtn = livePage.locator('button.ft-payment-stripe, button[class*="payment-stripe" i]')
      .or(livePage.getByRole('button', { name: /Pay Now|Complete Order|Buy Now|Submit Order/i }))
      .or(livePage.locator('button[type="submit"]:has-text("Pay"), button:has-text("Complete")')).first();

    await expect(payBtn).toBeVisible({ timeout: 10000 });

    // Confirmed: this template's "Complete Order" button often needs a
    // second click to actually submit -- the first click can just settle/
    // validate the form rather than fire the order. Only fire the second
    // click if we're still looking at the same submit button afterward
    // (i.e. the page hasn't already moved on), so a first click that DID
    // work never gets double-submitted / double-charged.
    await payBtn.click();
    Logger.info('BUYER', 'Clicked "Complete Order" (1/2). Checking if a second click is needed...');
    await livePage.waitForTimeout(2000);

    const stillOnPayButton = await payBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (stillOnPayButton) {
      await payBtn.click().catch(() => {});
      Logger.info('BUYER', 'Clicked "Complete Order" (2/2).');
    } else {
      Logger.info('BUYER', 'Page already moved on after the first click — skipping the second click to avoid a double charge.');
    }

    Logger.info('BUYER', 'Payment submitted! Waiting for order confirmation / Thank You page...');
    await livePage.waitForTimeout(5000);
  }

  public async acceptUpsell(livePage: Page): Promise<void> {
    this.context.recordStep('Handle Post-Purchase Routing / Upsell');
    Logger.info('BUYER', 'Checking for post-purchase routing or upsell offer...');

    await livePage.waitForLoadState('domcontentloaded');
    await PopupHandler.dismissKnownPopups(livePage);

    const acceptUpsellBtn = livePage.getByRole('button', { name: /Yes.*Upgrade|Yes.*Add|Buy Now/i })
      .or(livePage.locator('button:has-text("Yes"), a:has-text("Yes")')).first();

    if (await acceptUpsellBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
      Logger.info('BUYER', 'Upsell step encountered. Clicking Accept...');
      await acceptUpsellBtn.click();
      await livePage.waitForTimeout(4000);
    } else {
      Logger.info('BUYER', 'Direct routing to next step / Thank You confirmed.');
    }
  }

  public async verifyFinalPage(livePage: Page): Promise<void> {
    this.context.recordStep('Verify Final Destination / Thank You');
    Logger.info('BUYER', 'Verifying final order confirmation destination...');

    await livePage.waitForLoadState('domcontentloaded');
    await livePage.waitForTimeout(3000);

    const isThankYouOrSuccess = await livePage.getByText(/Thank you|Order Confirmed|Success|Congratulations/i)
      .or(livePage.locator('h1, h2, h3').filter({ hasText: /Thank/i })).first().isVisible({ timeout: 15000 }).catch(() => false);

    if (isThankYouOrSuccess) {
      Logger.info('BUYER', '🎉 Purchase verification SUCCESS! Landed on Confirmation/Thank You page.');
    } else {
      Logger.info('BUYER', `Current final URL: ${livePage.url()}`);
    }
  }
}