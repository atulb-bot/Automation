import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { ProjectsPage } from '../pages/ProjectsPage';
import { ProductsPage, ProductConfig } from '../pages/ProductsPage';
import { FunnelPage } from '../pages/FunnelPage';
import { FunnelBuilderPage } from '../pages/FunnelBuilderPage';
import { PaymentPage } from '../pages/PaymentPage';
import { SplitTestPage } from '../pages/SplitTestPage';
import { TEST_CREDENTIALS } from '../config/test-credentials';
import { TestContext } from '../utils/test-context';
import { generateAlphaNumericId, generateProjectName, generateCustomerEmail } from '../utils/test-data';
import { FlowReporter } from '../utils/flow-reporter';
import { keepBrowserOpenIfSingleRun } from '../utils/free-trial-runner';

/**
 * Split test - single product:
 *   project -> pages: FE Sales (Original), FE Sales Variant, FE Checkout, Thank You
 *   -> FE product (sales = FE Sales) -> both sales pages: CTA -> Go To Next Step In Product -> the same FE product
 *   -> checkout + Thank You published
 *   -> split test app: campaign (control = FE Sales, variant = FE Sales Variant, equal, manual winner) -> Launch
 *   -> Visit: buy through the split URL -> Thank You; plus fresh visits to see both versions served.
 *
 *   npm run split:single
 */
const VARIANT_PAGE = 'FE Sales Variant';

test('Split test: single product (FE Sales vs FE Sales Variant)', async ({ page, browser }) => {
  test.setTimeout(40 * 60 * 1000);
  const ctx = new TestContext('regular');
  const base = generateAlphaNumericId(6);
  const projectName = generateProjectName('QA') + ` ${base} Split Project`;
  ctx.customerEmail = generateCustomerEmail();
  const flow = new FlowReporter('Split test - single product', 9, { Project: projectName, Buyer: ctx.customerEmail });

  const projects = new ProjectsPage(page, ctx), productsPage = new ProductsPage(page, ctx), pages = new FunnelPage(page, ctx);
  const builder = new FunnelBuilderPage(page, ctx), pay = new PaymentPage(page, ctx);
  const product: ProductConfig = { key: 'FE', productName: `QA ${base} FE`, salesPageName: 'FE Sales', checkoutPageName: 'FE Checkout', price: '100' };

  await flow.step('Login', async () => {
    const login = new LoginPage(page, ctx);
    await login.openLogin();
    await login.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
  });
  await flow.step('Create project', async () => { await projects.openProjects(); await projects.createProject(projectName); });
  await flow.step('Pages: FE Sales, FE Sales Variant, FE Checkout, Thank You', async () => {
    const fe = FunnelPage.FUNNEL_PAGES.find((p) => p.name === 'FE Sales')!;
    const specs = [fe, { ...fe, name: VARIANT_PAGE }, ...FunnelPage.FUNNEL_PAGES.filter((p) => p.name === 'FE Checkout' || p.name === 'Thank You')];
    await pages.createPages(specs);
  });
  await flow.step('FE product (sales page: FE Sales)', async () => {
    await productsPage.openProducts();
    await productsPage.createProduct(product.productName, product.price);
    await productsPage.connectProductPages(product.productName, projectName, product.salesPageName, product.checkoutPageName);
  });
  await flow.step('Wire + publish FE Sales (Original)', () =>
    builder.wireAndPublishSalesPage(product, { withNoThanks: false, blank: process.env.PAGE_MODE !== 'template', headline: 'Sales FE' }));
  await flow.step('Wire + publish FE Sales Variant (same product)', () =>
    builder.wireAndPublishSalesPage({ ...product, salesPageName: VARIANT_PAGE }, { withNoThanks: false, blank: process.env.PAGE_MODE !== 'template', headline: 'Sales FE Variant' }));
  await flow.step('Publish checkout + Thank You pages', async () => {
    await builder.publishAllCheckoutPages([product]);
    await builder.publishThankYouPage();
  });

  const split = new SplitTestPage(page, ctx);
  const live = await flow.step('Split test campaign: FE Sales vs FE Sales Variant, equal split, launch', async () => {
    await split.openSplitTestApp();
    return split.createCampaign({ name: `Split Test ${base}`, project: projectName, controlPage: 'FE Sales', variantPage: VARIANT_PAGE, notes: 'V2' });
  });
  const splitUrl = live.url();
  const campaign = `Split Test ${base}`;
  // open the split URL until BOTH pages have come, and buy through each one (Original + Variant)
  const both = await flow.step('Buy through both versions: Original + Variant -> Thank You', () =>
    split.completeOnBothVersions(browser, splitUrl, live,
      async (p) => p.getByText(/Sales FE Variant/i).first().isVisible().catch(() => false),
      async (p, version) => new PaymentPage(p, ctx).buySingleProduct(p, { name: `${version} buyer`, email: generateCustomerEmail() })));
  expect(both.original.result).toBeTruthy();
  expect(both.variant.result).toBeTruthy();

  console.log(`>>> ✅ TEST COMPLETE: purchased from BOTH pages (Original + Variant) in ${both.visits} visits.`);
  console.log(`>>> Check the stats in the split test dashboard for campaign "${campaign}".`);
  flow.completed({ 'Split URL': splitUrl, 'Original purchase': `${both.original.result} (visit ${both.original.visit})`, 'Variant purchase': `${both.variant.result} (visit ${both.variant.visit})`,
    'Campaign': `${campaign} - check its stats in the split test dashboard` });
  await keepBrowserOpenIfSingleRun(live);
});
