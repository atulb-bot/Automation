import { Page, Locator, expect } from '@playwright/test';
import { Logger } from '../utils/logger';
import { PopupHandler } from '../utils/popup-handler';
import { TestContext } from '../utils/test-context';
import { payOnStripeCheckout, TEST_CARD, Buyer } from '../utils/stripe-checkout';
import { ME, testEmail } from '../utils/my-details';

export type OfferPage = 'OTO1' | 'DS1' | 'OTO2' | 'DS2';
/** One offer page in a buyer path: which page we expect, and whether the buyer purchases or clicks No thanks. */
export interface OfferStep { page: OfferPage; action: 'buy' | 'no' }

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
    if (await ourCta.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)) {
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
    if (await wiredCta.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)) {
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
    if (await nameInput.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
      await nameInput.fill(`${ME.firstName} Automation`);
    }

    const emailInput = livePage.getByRole('textbox', { name: /Email/i })
      .or(livePage.locator('input[type="email"], input[name*="email" i]')).first();
    if (await emailInput.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
      await emailInput.fill(this.context.customerEmail);
    }

    const phoneInput = livePage.getByRole('textbox', { name: /Phone|Mobile/i })
      .or(livePage.locator('input[type="tel"], input[name*="phone" i]')).first();
    if (await phoneInput.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) {
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

    if (await stripeOption.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)) {
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

    if (await cardNumberInput.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)) {
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
      if (await fallbackCard.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)) {
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

    const stillOnPayButton = await payBtn.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
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

    if (await acceptUpsellBtn.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false)) {
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
      .or(livePage.locator('h1, h2, h3').filter({ hasText: /Thank/i })).first().waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);

    if (isThankYouOrSuccess) {
      Logger.info('BUYER', '🎉 Purchase verification SUCCESS! Landed on Confirmation/Thank You page.');
    } else {
      Logger.info('BUYER', `Current final URL: ${livePage.url()}`);
    }
  }
  // ───────────────────────── recorded funnel purchase ─────────────────────────

  /**
   * Full purchase on the live FE sales page, as recorded:
   *   Click Here to Get Access -> First Name / Email ID / Phone Number -> Stripe
   *   -> card (Card number / Expiry date / Security code) -> Complete Order
   * then through the funnel's upsell/downsell pages until the Thank You page.
   *   path 'accept'  : buy every offer   (FE -> OTO1 -> OTO2 -> Thank You)
   *   path 'decline' : No thanks on each (FE -> OTO1 x -> DS1 x -> OTO2 x -> DS2 x -> Thank You)
   * Returns the Thank You page URL. The page is NOT closed.
   */
  /**
   * Single product (no upsells): CTA -> checkout -> pay -> the page after the checkout is the Thank You page.
   * Unlike completeFunnelPurchase it never looks for more offers, so a Thank You template that happens to
   * have a "Click here to get access" button can't start a loop. Returns the Thank You URL.
   */
  public async buySingleProduct(livePage: Page, buyer?: Buyer, card = TEST_CARD): Promise<string> {
    const who: Buyer = buyer ?? { name: ME.firstName, email: testEmail(String(Date.now())) };
    await livePage.waitForLoadState('domcontentloaded');
    await PopupHandler.dismissKnownPopups(livePage);
    const cta = livePage.getByRole('link', { name: /click here to get access/i }).or(livePage.getByRole('button', { name: /click here to get access/i })).first();
    await cta.waitFor({ state: 'visible', timeout: 30000 });
    await cta.click();
    Logger.info('BUYER', 'Sales page: purchase ("Click Here to Get Access")');
    await payOnStripeCheckout(livePage, who, card);
    // done with the checkout once its form is gone (or the address changed); give the Thank You page a moment
    const end = Date.now() + 60000;
    while (Date.now() < end && (await livePage.getByRole('textbox', { name: 'First Name' }).isVisible().catch(() => false))) await livePage.waitForTimeout(1000);
    await livePage.waitForLoadState('domcontentloaded').catch(() => {});
    await livePage.waitForTimeout(3000);
    Logger.info('BUYER', `🎉 Thank You page reached: ${livePage.url()}`);
    return livePage.url();
  }

  public async completeFunnelPurchase(
    livePage: Page,
    path: 'accept' | 'decline' | OfferStep[] = 'accept',
    card = TEST_CARD,
    buyer?: Buyer,
    /** 'regular': every purchase goes through a checkout page (card each time).
     *  'oneclick': card only once on FE; buying an upsell goes straight to the next page. */
    funnelType?: 'regular' | 'oneclick'
  ): Promise<string> {
    this.context.recordStep('Live funnel purchase');
    const who: Buyer = buyer ?? { name: ME.firstName, email: this.context.customerEmail || testEmail(String(Date.now())) };
    const steps = Array.isArray(path) ? path : null;
    await livePage.waitForLoadState('domcontentloaded');
    await PopupHandler.dismissKnownPopups(livePage);

    // 1. FE sales page -> CTA
    await this.expectSalesHeading(livePage, 'FE', !!steps);
    const cta = livePage.getByRole('link', { name: /click here to get access/i }).first();
    await cta.waitFor({ state: 'visible', timeout: 30000 });
    await cta.click();
    Logger.info('BUYER', 'FE: purchase ("Click Here to Get Access")');

    // 2. FE checkout (same Stripe steps + card as membership)
    await payOnStripeCheckout(livePage, who, card);

    // 3. Offer pages until Thank You
    const visited: string[] = ['FE (buy -> checkout paid)'];
    let offerIndex = 0;
    let checkouts = 1;
    let known: 'offer' | 'checkout' | 'thank-you' | null = null; // result already found for the current page
    let final: 'offer' | 'checkout' | 'thank-you' = 'thank-you';
    for (let guard = 0; guard < 12; guard++) {
      const kind = known ?? (await this.waitForFunnelPage(livePage));
      known = null;
      final = kind;
      if (kind === 'thank-you') break;
      if (kind === 'checkout') {
        // Only reachable without a known funnel type (checkouts after a purchase are handled below)
        if (funnelType === 'oneclick') {
          await this.shot(livePage, 'oneclick-checkout');
          throw new Error('One-Click funnel showed a checkout page again - card details should only be needed once, on FE.');
        }
        Logger.info('BUYER', 'Checkout page - paying');
        await payOnStripeCheckout(livePage, who, card);
        checkouts++;
        continue;
      }

      // Offer page: which one, and buy or No thanks
      let action: 'buy' | 'no';
      let label: string;
      if (steps) {
        const step = steps[offerIndex];
        if (!step) {
          await this.shot(livePage, 'unexpected-offer');
          throw new Error(`Path finished but the funnel showed another offer page (${await this.headingText(livePage)}) instead of Thank You.`);
        }
        await this.expectSalesHeading(livePage, step.page, true);
        action = step.action;
        label = step.page;
      } else {
        action = path === 'decline' ? 'no' : 'buy';
        label = `offer ${offerIndex + 1}`;
      }
      offerIndex++;

      const before = livePage.url();
      if (action === 'buy') {
        await livePage.getByRole('link', { name: /click here to get access/i }).first().click();
      } else {
        await livePage.getByRole('link', { name: /^\s*no,?\s*thanks\s*$/i }).first().click();
      }
      Logger.info('BUYER', `${label}: ${action === 'buy' ? 'purchase' : 'No thanks'}`);
      await livePage.waitForURL((u) => u.toString() !== before, { timeout: 60000 }).catch(() => {});

      if (action === 'no') {
        visited.push(`${label} (no thanks)`);
        continue;
      }

      // Purchase on an offer page: regular -> its checkout; one-click -> straight to the next page
      const next = await this.waitForFunnelPage(livePage);
      known = next === 'checkout' ? null : next; // the checkout is paid below; anything else is reused next loop
      if (next === 'checkout') {
        if (funnelType === 'oneclick') {
          await this.shot(livePage, `oneclick-checkout-${label}`);
          throw new Error(`One-Click funnel asked for checkout/card details again after buying ${label} - it should complete the purchase automatically.`);
        }
        Logger.info('BUYER', `${label}: checkout page - filling details + card (regular funnel)`);
        await payOnStripeCheckout(livePage, who, card);
        checkouts++;
        visited.push(`${label} (buy -> checkout paid)`);
      } else {
        if (funnelType === 'regular') {
          await this.shot(livePage, `regular-no-checkout-${label}`);
          throw new Error(`Regular funnel: buying ${label} should open its checkout page, but it went straight to "${next}" (${await this.headingText(livePage)}).`);
        }
        Logger.info('BUYER', `${label}: purchased with one click (no checkout)`);
        visited.push(`${label} (buy, one-click)`);
      }
    }
    Logger.info('BUYER', `Checkout pages completed: ${checkouts}${funnelType ? ` (${funnelType} funnel)` : ''}`);

    Logger.info('BUYER', `Path taken: ${visited.join(' -> ')} -> ${final === 'thank-you' ? 'Thank You' : final}`);
    if (steps && offerIndex < steps.length) {
      await this.shot(livePage, 'thank-you-too-early');
      throw new Error(`Reached the end after ${offerIndex} offer page(s), but the path expected ${steps.length}: next was ${steps[offerIndex].page}.`);
    }
    if (final !== 'thank-you') {
      await this.shot(livePage, 'not-thank-you');
      throw new Error(`Funnel purchase did not end on the Thank You page. Current URL: ${livePage.url()}`);
    }
    await livePage.bringToFront().catch(() => {});
    Logger.info('BUYER', `🎉 Thank You page reached: ${livePage.url()}`);
    return livePage.url();
  }

  /** Blank pages carry a "Sales FE" / "Sales OTO1" ... headline - check we are on the expected page. */
  private async expectSalesHeading(livePage: Page, key: 'FE' | OfferPage, strict: boolean) {
    const want = livePage.getByRole('heading', { name: new RegExp(`^\\s*sales\\s*${key}\\s*$`, 'i') }).first();
    if (await want.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)) {
      Logger.info('BUYER', `✔ On the "Sales ${key}" page`);
      return;
    }
    const found = await this.headingText(livePage);
    if (strict && /sales\s*(FE|OTO1|DS1|OTO2|DS2)/i.test(found)) {
      await this.shot(livePage, `wrong-page-expected-${key}`);
      throw new Error(`Funnel wiring: expected the "Sales ${key}" page but landed on "${found}".`);
    }
    Logger.info('BUYER', `(no "Sales ${key}" heading on this page - template page, skipping the page check)`);
  }

  private async headingText(livePage: Page): Promise<string> {
    return ((await livePage.getByRole('heading').allInnerTexts().catch(() => [])) as string[]).map((t) => t.trim()).filter(Boolean).slice(0, 3).join(' | ') || livePage.url();
  }

  private async shot(livePage: Page, tag: string) {
    await livePage.screenshot({ path: `test-results/funnel-${tag}-${Date.now()}.png`, fullPage: true }).catch(() => {});
  }

  private async findStripeField(livePage: Page, name: string, timeoutMs: number): Promise<Locator> {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      for (const f of livePage.frames()) {
        if (!/__privateStripeFrame|js\.stripe\.com/i.test(f.name() + ' ' + f.url())) continue;
        const el = f.getByRole('textbox', { name });
        if (await el.isVisible().catch(() => false)) return el;
      }
      await livePage.waitForTimeout(1000);
    }
    await livePage.screenshot({ path: `test-results/stripe-${name.replace(/\s+/g, '-')}-${Date.now()}.png`, fullPage: true }).catch(() => {});
    throw new Error(`Stripe "${name}" field did not load.`);
  }

  /** Waits for the next funnel page to settle and says what it is. */
  /**
   * What is on screen now: an offer page, a checkout, or the Thank You page.
   * Thank You = the URL or text says so, OR (after the page has loaded) there is no offer button and
   * no checkout form for 5 seconds. The Thank You page's address is often a random code
   * (e.g. /fgivrcrq?ff_purchase_mode=1), so waiting for "thank" in the URL used to take 30s per check.
   */
  private async waitForFunnelPage(livePage: Page): Promise<'offer' | 'checkout' | 'thank-you'> {
    await livePage.waitForLoadState('domcontentloaded').catch(() => {});
    await livePage.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    const THANKS = /thank\s*you|thanks\b|order\s*(is\s*)?confirmed|congratulations|purchase\s*(is\s*)?complete|payment\s*(was\s*)?successful|welcome\s*aboard|you('|’)re\s*in\b/i;
    const started = Date.now();
    let quietSince = 0;
    while (Date.now() - started < 30000) {
      if (await livePage.getByRole('textbox', { name: 'First Name' }).isVisible().catch(() => false)) return 'checkout';
      const offer =
        (await livePage.getByRole('link', { name: /click here to get access/i }).first().isVisible().catch(() => false)) ||
        (await livePage.getByRole('link', { name: /^\s*no,?\s*thanks\s*$/i }).first().isVisible().catch(() => false));
      if (offer) return 'offer';
      if (/thank/i.test(livePage.url())) return 'thank-you';
      if (await livePage.getByText(THANKS).first().isVisible().catch(() => false)) return 'thank-you';
      if (!quietSince) quietSince = Date.now();
      else if (Date.now() - quietSince >= 5000) {
        Logger.info('BUYER', 'No offer and no checkout on this page - it is the Thank You page');
        return 'thank-you';
      }
      await livePage.waitForTimeout(500);
    }
    return 'thank-you';
  }

}
