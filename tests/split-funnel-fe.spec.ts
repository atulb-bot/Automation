import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { FunnelPage } from '../pages/FunnelPage';
import { FunnelBuilderPage } from '../pages/FunnelBuilderPage';
import { PaymentPage } from '../pages/PaymentPage';
import { ProductConfig } from '../pages/ProductsPage';
import { SplitTestPage } from '../pages/SplitTestPage';
import { TEST_CREDENTIALS } from '../config/test-credentials';
import { TestContext } from '../utils/test-context';
import { FlowReporter } from '../utils/flow-reporter';
import { buildFunnelProject } from '../utils/funnel-build';
import { generateCustomerEmail } from '../utils/test-data';
import { keepBrowserOpenIfSingleRun } from '../utils/free-trial-runner';

/**
 * Funnel split test - FE variant:
 *   One-Click funnel (the normal build) -> "FE Sales Variant" (CTA -> Go To Next Step In Funnel -> same funnel / FE)
 *   -> split campaign FE Sales vs FE Sales Variant -> buy through the WHOLE funnel from both FE versions.
 *   npm run split:funnel-fe
 */
test('Funnel split test: FE Sales vs FE Sales Variant, full funnel bought from both', async ({ page, browser }) => {
  test.setTimeout(90 * 60 * 1000);
  const ctx = new TestContext('regular');
  const flow = new FlowReporter('Funnel split test - FE variant', 6);
  await flow.step('Login', async () => { const l = new LoginPage(page, ctx); await l.openLogin(); await l.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password); });
  const built = await flow.step('Build the One-Click funnel (normal build)', () => buildFunnelProject(page, ctx, 'oneclick'));
  const base = built.funnelName.split(' ')[1];
  const fe: ProductConfig = { key: 'FE', productName: `QA ${base} FE`, salesPageName: 'FE Sales Variant', checkoutPageName: 'FE Checkout', price: '100' };
  const builder = new FunnelBuilderPage(page, ctx);
  await flow.step('Create + wire + publish "FE Sales Variant"', async () => {
    const spec = FunnelPage.FUNNEL_PAGES.find((p) => p.name === 'FE Sales')!;
    await new FunnelPage(page, ctx).createSinglePage({ ...spec, name: 'FE Sales Variant' }, 0);
    await builder.wireAndPublishSalesPage(fe, { funnelName: built.funnelName, withNoThanks: false, blank: process.env.PAGE_MODE !== 'template', headline: 'Sales FE Variant' });
  });
  const split = new SplitTestPage(page, ctx);
  const campaign = `Split ${base} FE`;
  const live = await flow.step('Split campaign: FE Sales vs FE Sales Variant (equal, manual winner), launch', async () => {
    await split.openSplitTestApp();
    return split.createCampaign({ name: campaign, project: built.projectName, controlPage: 'FE Sales', variantPage: 'FE Sales Variant', notes: 'V2' });
  });
  const both = await flow.step('Buy the whole funnel from both FE versions -> Thank You', () =>
    split.completeOnBothVersions(browser, live.url(), live,
      async (p) => p.getByText(/Sales FE Variant/i).first().isVisible().catch(() => false),
      async (p) => new PaymentPage(p, ctx).completeFunnelPurchase(p, 'accept', undefined, { name: 'Split buyer', email: generateCustomerEmail() }, 'oneclick')));
  expect(both.original.result).toBeTruthy(); expect(both.variant.result).toBeTruthy();
  console.log(`>>> ✅ TEST COMPLETE: bought the funnel from BOTH FE pages. Check the stats in the split test dashboard for campaign "${campaign}".`);
  flow.completed({ Funnel: built.funnelName, 'Original FE': both.original.result, 'Variant FE': both.variant.result, Campaign: campaign });
  await keepBrowserOpenIfSingleRun(live);
});
