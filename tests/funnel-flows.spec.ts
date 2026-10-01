import { test, expect, BrowserContext } from '@playwright/test';
import { TEST_CREDENTIALS } from '../config/test-credentials';
import { TestContext } from '../utils/test-context';
import { LoginPage } from '../pages/LoginPage';
import { PaymentPage, OfferStep } from '../pages/PaymentPage';
import { FlowReporter } from '../utils/flow-reporter';
import { newBuyer } from '../utils/stripe-checkout';
import { buildFunnelProject, loadBuiltFunnel, BuiltFunnel, FunnelType } from '../utils/funnel-build';
import { openSharedContext, markTestFinished, holdWindowOpenAtEnd, ensureLoggedIn } from '../utils/shared-window';

/**
 * Funnel wiring test cases, for BOTH funnel types (One-Click and Regular).
 * Each type: "Build" creates the project, blank pages, products, funnel and wiring ONCE,
 * then each path buys through the live funnel in a new tab and checks every page it lands on
 *   Regular   : every purchase -> that product's checkout page -> card -> Complete Order
 *   One-Click : card only once on FE; buying an upsell goes straight to the next page
 * ("Sales OTO1", "Sales DS1", ...). Thank You tabs stay open.
 *
 * Run one path again later without rebuilding: the last build is saved in state/funnel-<type>.json.
 */
const PATHS: { title: string; steps: OfferStep[] }[] = [
  {
    title: 'Path 1: FE buy -> OTO1 no thanks -> DS1 buy -> OTO2 buy -> Thank You',
    steps: [{ page: 'OTO1', action: 'no' }, { page: 'DS1', action: 'buy' }, { page: 'OTO2', action: 'buy' }],
  },
  {
    title: 'Path 2: FE buy -> OTO1 buy -> OTO2 no thanks -> DS2 buy -> Thank You',
    steps: [{ page: 'OTO1', action: 'buy' }, { page: 'OTO2', action: 'no' }, { page: 'DS2', action: 'buy' }],
  },
  {
    title: 'Path 3: FE buy -> OTO1 buy -> OTO2 no thanks -> DS2 no thanks -> Thank You',
    steps: [{ page: 'OTO1', action: 'buy' }, { page: 'OTO2', action: 'no' }, { page: 'DS2', action: 'no' }],
  },
];

const TYPES: { type: FunnelType; name: string }[] = [
  { type: 'oneclick', name: 'One-Click' },
  { type: 'regular', name: 'Regular' },
];

for (const { type, name } of TYPES) {
  test.describe(`${name} Funnel`, () => {
    test.describe.configure({ mode: 'serial' }); // build first, then the paths use it

    let context: BrowserContext;
    let built: BuiltFunnel | null = null;

    test.beforeAll(async ({ browser }, testInfo) => {
      context = await openSharedContext(browser, testInfo);
    });
    test.afterEach(async ({}, testInfo) => {
      markTestFinished();
      console.log(`\n>>> [${String(testInfo.status).toUpperCase()}] ${testInfo.title} (${(testInfo.duration / 1000).toFixed(1)}s)\n`);
    });
    test.afterAll(async ({}, testInfo) => {
      await holdWindowOpenAtEnd(context, testInfo);
    });

    test(`Build (${name}): project + blank pages + products + funnel + wiring`, async () => {
      test.setTimeout(45 * 60 * 1000);
      const page = await context.newPage();
      const ctx = new TestContext(type);
      const flow = new FlowReporter(`${name} funnel build`, 2);
      await flow.step('Login', () => ensureLoggedIn(new LoginPage(page, ctx), page, TEST_CREDENTIALS.email, TEST_CREDENTIALS.password));
      built = await flow.step('Build project, pages, products, funnel and wiring', () => buildFunnelProject(page, ctx, type));
      flow.completed({ Project: built.projectName, Funnel: built.funnelName, 'FE live URL': built.feUrl });
      await page.close().catch(() => {}); // keep the window for the Thank You tabs
    });

    for (const p of PATHS) {
      test(`${p.title} (${name})`, async () => {
        test.setTimeout(15 * 60 * 1000);
        // FE_URL (dashboard "FE page link" field) runs this path on any existing funnel
        const funnel = process.env.FE_URL
          ? { type, projectName: '(existing)', funnelName: '(from FE link)', feUrl: process.env.FE_URL, builtAt: '' }
          : built ?? loadBuiltFunnel(type);
        if (!funnel) throw new Error(`No ${name} funnel to buy through yet. Either run "Build a ${name} funnel" first (it is saved for the paths), or give this path an FE page link (dashboard: FE page link field / terminal: FE_URL=...).`);

        const buyer = newBuyer();
        const flow = new FlowReporter(`${name} funnel - ${p.title}`, 1, { Funnel: funnel.funnelName, Buyer: buyer.email });
        const page = await context.newPage(); // new tab
        await page.goto(funnel.feUrl, { waitUntil: 'domcontentloaded' });

        const ctx = new TestContext(type);
        ctx.customerEmail = buyer.email;
        const thankYou = await flow.step(p.title, () => new PaymentPage(page, ctx).completeFunnelPurchase(page, p.steps, undefined, buyer, type));
        expect(thankYou).toBeTruthy();
        flow.completed({ 'Thank-you URL': thankYou, 'Thank-you tab': 'left open' });
      });
    }
  });
}
