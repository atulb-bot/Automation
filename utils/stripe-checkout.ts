import { Frame, Locator, Page } from '@playwright/test';
import { Logger } from './logger';
import { waitForManualStep } from './manual-assist';
import { ME, testEmail } from './my-details';

/**
 * ONE Stripe checkout for every checkout page (membership, funnel, single product).
 * Same steps and the same test card as the working membership purchase.
 */
export const TEST_CARD = { number: '4242 4242 4242 4242', expiry: '02 / 36', cvc: '225', postal: '248001' };

export interface Buyer {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
}

/** Unique buyer, same format as membership: "Atul Xxxxx" / atul.b+xxxxxxxx@flexifunnels.com */
export function newBuyer(): Buyer {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const pick = (n: number) => Array.from({ length: n }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  const suffix = pick(5);
  return { name: `${ME.firstName} ${suffix[0].toUpperCase()}${suffix.slice(1)}`, email: testEmail(pick(8)) };
}

/**
 * Checkout page: First Name, Email ID (+ Phone / Billing / City / State / Country when shown)
 * -> plan option -> Terms -> Stripe (#stripe-ref-0, radio, "Stripe" text) -> WAIT for the card
 * -> card -> Complete Order -> waits until the page moves on.
 */
/**
 * Pays on a checkout page. If that fails (card fields don't load, Complete Order doesn't go
 * through...), asks you to finish the checkout by hand and continues once the page moves on.
 */
export async function payOnStripeCheckout(page: Page, buyer: Buyer, card = TEST_CARD): Promise<void> {
  const start = page.url();
  try {
    await payOnStripeCheckoutSteps(page, buyer, card);
  } catch (err) {
    Logger.warn('CHECKOUT', `Checkout failed: ${String(err instanceof Error ? err.message : err).split('\n')[0]}`);
    const done = await waitForManualStep(page, 'Finish this checkout by hand',
      `Fill the form, choose Stripe, card ${card.number} / ${card.expiry} / ${card.cvc}, then Complete Order.`,
      async () => page.url() !== start && !(await page.getByRole('textbox', { name: 'First Name' }).isVisible().catch(() => false)));
    if (!done) throw err;
  }
}

async function payOnStripeCheckoutSteps(page: Page, buyer: Buyer, card = TEST_CARD): Promise<void> {
  // 1. Details
  const firstName = page.getByRole('textbox', { name: 'First Name' });
  await firstName.waitFor({ state: 'visible', timeout: 45000 });
  await firstName.fill(buyer.name);
  const optional: [string, string][] = [
    ['Email ID', buyer.email],
    ['Phone Number', buyer.phone ?? ME.phone],
    ['Billing Address', buyer.address ?? 'Dehradun'],
    ['City', buyer.city ?? ME.city],
    ['State', 'Uttarakhand'],
    ['Country', 'India'],
  ];
  for (const [name, value] of optional) {
    const box = page.getByRole('textbox', { name, exact: true });
    if (await box.isVisible().catch(() => false)) await box.fill(value, { timeout: 5000 }).catch(() => {});
  }
  Logger.info('CHECKOUT', `Details filled for ${buyer.email}`);

  // 2. Plan option (a .form-check with a radio that is not Terms / a gateway)
  const plan = page.locator('.form-check').filter({ hasNotText: /terms|stripe|paypal|razorpay/i }).filter({ has: page.locator('input[type="radio"]') }).first();
  if ((await plan.isVisible().catch(() => false)) && !(await plan.locator('input[type="radio"]').first().isChecked().catch(() => false))) {
    await plan.click({ timeout: 5000 }).catch(() => {});
  }

  // 3. Terms
  const terms = page.getByRole('checkbox', { name: /I agree to the Terms/i });
  if (await terms.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
    await terms.check({ timeout: 5000 }).catch(async () => terms.click({ force: true }).catch(() => {}));
  }

  // 4. Stripe FIRST, even when other gateways are shown: #stripe-ref-0 -> radio -> "Stripe" text,
  //    then confirm Stripe really is the selected gateway before touching the card.
  await selectStripe(page);

  // 5. Card (combined field or separate number / expiry / CVC frames)
  await fillStripeCard(page, card);

  // 6. Complete Order
  const before = page.url();
  const complete = page.getByRole('link', { name: /complete\s*order/i }).or(page.getByRole('button', { name: /complete\s*order/i })).first();
  await complete.waitFor({ state: 'visible', timeout: 15000 });
  await complete.click();
  Logger.info('CHECKOUT', 'Clicked "Complete Order" - waiting for the next page...');
  let moved = await page.waitForURL((u) => u.toString() !== before, { timeout: 60000 }).then(() => true).catch(() => false);
  if (!moved) {
    const pay = page.getByRole('button', { name: /^\s*(pay|submit|confirm)\b/i }).first();
    if (await pay.isVisible().catch(() => false)) {
      await pay.click().catch(() => {});
      moved = await page.waitForURL((u) => u.toString() !== before, { timeout: 45000 }).then(() => true).catch(() => false);
    }
  }
  if (!moved) {
    await page.screenshot({ path: `test-results/complete-order-stuck-${Date.now()}.png`, fullPage: true }).catch(() => {});
    throw new Error('Clicked "Complete Order" but the page did not move on (check the card / required fields).');
  }
}

/** Selects Stripe as the payment gateway and confirms it (fails clearly if another gateway stays selected). */
export async function selectStripe(page: Page): Promise<void> {
  const ref = page.locator('#stripe-ref-0');
  const radio = page.getByRole('radio', { name: /stripe/i }).first();
  const text = page.getByText(/^\s*stripe\s*$/i).first();
  const isStripeSelected = async () => {
    if (await ref.count().catch(() => 0)) {
      const checked = await ref.isChecked().catch(() => null);
      if (checked !== null) return checked;
    }
    if (await radio.count().catch(() => 0)) return radio.isChecked().catch(() => false);
    return null; // no gateway choice on this page (Stripe is the only one)
  };

  await ref.waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (await ref.count().catch(() => 0)) await ref.click({ timeout: 8000 }).catch(async () => ref.click({ force: true, timeout: 5000 }).catch(() => {}));
    if (await radio.isVisible().catch(() => false)) await radio.check({ timeout: 5000 }).catch(() => {});
    if (await text.isVisible().catch(() => false)) await text.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
    const sel = await isStripeSelected();
    if (sel === null) {
      Logger.info('CHECKOUT', 'Only one payment gateway on this checkout - continuing');
      return;
    }
    if (sel) {
      Logger.info('CHECKOUT', 'Stripe selected - waiting for the card details...');
      return;
    }
    Logger.warn('CHECKOUT', `Stripe is not selected yet (attempt ${attempt}/3) - selecting it again`);
  }
  await page.screenshot({ path: `test-results/stripe-not-selected-${Date.now()}.png`, fullPage: true }).catch(() => {});
  throw new Error('Could not select Stripe on the checkout page - another payment gateway stays selected.');
}

async function fillStripeCard(page: Page, card: typeof TEST_CARD) {
  type Field = { label: string; value: string; required: boolean; locate: (f: Frame) => Locator };
  const fields: Field[] = [
    { label: 'card number', value: card.number, required: true,
      locate: (f) => f.getByRole('textbox', { name: /card\s*number/i }).or(f.locator('input[name="cardnumber"], input[autocomplete="cc-number"]')) },
    { label: 'expiry', value: card.expiry, required: true,
      locate: (f) => f.getByRole('textbox', { name: /expir/i }).or(f.locator('input[name="exp-date"], input[autocomplete="cc-exp"]')) },
    { label: 'CVC', value: card.cvc, required: true,
      locate: (f) => f.getByRole('textbox', { name: /security\s*code|cvc|cvv/i }).or(f.locator('input[name="cvc"], input[autocomplete="cc-csc"]')) },
    { label: 'postal code', value: card.postal, required: false,
      locate: (f) => f.getByRole('textbox', { name: /zip|postal/i }).or(f.locator('input[name="postal"], input[autocomplete="postal-code"]')) },
  ];
  const find = async (field: Field): Promise<Locator | null> => {
    for (const frame of page.frames()) {
      if (!/__privateStripeFrame|js\.stripe\.com/i.test(frame.name() + ' ' + frame.url())) continue;
      const el = field.locate(frame).first();
      if (await el.isVisible().catch(() => false)) return el;
    }
    return null;
  };

  const end = Date.now() + 60000;
  let number: Locator | null = null;
  while (Date.now() < end && !(number = await find(fields[0]))) await page.waitForTimeout(1000);
  if (!number) {
    await page.screenshot({ path: `test-results/stripe-card-not-loaded-${Date.now()}.png`, fullPage: true }).catch(() => {});
    throw new Error('Stripe card details did not load within 60s after selecting Stripe.');
  }
  await page.waitForTimeout(1000);
  for (const field of fields) {
    const el = field === fields[0] ? number : await find(field);
    if (!el) {
      if (field.required) throw new Error(`Stripe ${field.label} field not found.`);
      continue;
    }
    await el.click({ timeout: 10000 });
    await el.fill(field.value, { timeout: 10000 });
    await page.waitForTimeout(400);
  }
  Logger.info('CHECKOUT', `Card entered (${card.number}, ${card.expiry}, ${card.cvc})`);
}
