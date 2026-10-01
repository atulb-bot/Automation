import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { ProjectsPage } from '../pages/ProjectsPage';
import { ProductsPage, ProductConfig } from '../pages/ProductsPage';
import { FunnelPage } from '../pages/FunnelPage';
import { FunnelBuilderPage } from '../pages/FunnelBuilderPage';
import { PaymentPage } from '../pages/PaymentPage';
import { SplitTestPage } from '../pages/SplitTestPage';
import { FlexiProofPage } from '../pages/FlexiProofPage';
import { TEST_CREDENTIALS } from '../config/test-credentials';
import { TestContext } from '../utils/test-context';
import { generateAlphaNumericId, generateProjectName, generateCustomerEmail } from '../utils/test-data';
import { FlowReporter } from '../utils/flow-reporter';
import { keepBrowserOpenIfSingleRun } from '../utils/free-trial-runner';

/**
 * Combined: single product + split test + FlexiProof
 *   project, FE Sales + FE Sales Variant + FE Checkout + Thank You, FE product, both CTAs -> same product
 *   -> split campaign -> FlexiProof campaign on the project's pages -> republish the pages + checkout
 *   -> widget check on the pages -> buy through both FE versions.
 *   npm run combo:single-split-proof
 */
const VARIANT = 'FE Sales Variant';
test('Single product + split test + FlexiProof', async ({ page, browser }) => {
  test.setTimeout(60 * 60 * 1000);
  const ctx = new TestContext('regular');
  const base = generateAlphaNumericId(6);
  const projectName = generateProjectName('QA') + ` ${base} Combo Project`;
  const flow = new FlowReporter('Single product + split + FlexiProof', 10, { Project: projectName });
  const projects = new ProjectsPage(page, ctx), productsPage = new ProductsPage(page, ctx), pages = new FunnelPage(page, ctx), builder = new FunnelBuilderPage(page, ctx);
  const product: ProductConfig = { key: 'FE', productName: `QA ${base} FE`, salesPageName: 'FE Sales', checkoutPageName: 'FE Checkout', price: '100' };

  await flow.step('Login', async () => { const l = new LoginPage(page, ctx); await l.openLogin(); await l.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password); });
  await flow.step('Project + pages (FE Sales, FE Sales Variant, FE Checkout, Thank You)', async () => {
    await projects.openProjects(); await projects.createProject(projectName);
    const fe = FunnelPage.FUNNEL_PAGES.find((p) => p.name === 'FE Sales')!;
    await pages.createPages([fe, { ...fe, name: VARIANT }, ...FunnelPage.FUNNEL_PAGES.filter((p) => p.name === 'FE Checkout' || p.name === 'Thank You')]);
  });
  await flow.step('FE product', async () => { await productsPage.openProducts(); await productsPage.createProduct(product.productName, product.price); await productsPage.connectProductPages(product.productName, projectName, 'FE Sales', 'FE Checkout'); });
  await flow.step('Wire + publish both sales pages (same product)', async () => {
    await builder.wireAndPublishSalesPage(product, { withNoThanks: false, blank: process.env.PAGE_MODE !== 'template', headline: 'Sales FE' });
    await builder.wireAndPublishSalesPage({ ...product, salesPageName: VARIANT }, { withNoThanks: false, blank: process.env.PAGE_MODE !== 'template', headline: 'Sales FE Variant' });
  });
  await flow.step('Publish checkout + Thank You', async () => { await builder.publishAllCheckoutPages([product]); await builder.publishThankYouPage(); });
  const split = new SplitTestPage(page, ctx);
  const campaign = `Split Test ${base}`;
  const live = await flow.step('Split campaign: FE Sales vs FE Sales Variant, launch', async () => { await split.openSplitTestApp(); return split.createCampaign({ name: campaign, project: projectName, controlPage: 'FE Sales', variantPage: VARIANT, notes: 'V2' }); });
  const splitUrl = live.url();
  await flow.step('FlexiProof campaign on the project (all pages)', async () => { const fp = await FlexiProofPage.open(page); await fp.createCampaign(`Proof ${base}`, projectName); });
  await flow.step('Republish the pages + checkout (widget goes live)', async () => {
    await page.bringToFront();
    for (const n of ['FE Sales', VARIANT, 'FE Checkout', 'Thank You']) await (builder as any).publishExistingPage(n);
  });
  const widget: Record<string, string> = {};
  await flow.step('Widget check: FE Sales, Variant, Checkout', async () => {
    for (const n of ['FE Sales', VARIANT, 'FE Checkout']) { const l = await builder.openPublishedUrl(n); widget[`FlexiProof on ${n}`] = (await FlexiProofPage.widgetOn(l)) ? 'found' : 'NOT found'; await l.close().catch(() => {}); }
  });
  const both = await flow.step('Buy through both FE versions -> Thank You', () => split.completeOnBothVersions(browser, splitUrl, live,
    async (p) => p.getByText(/Sales FE Variant/i).first().isVisible().catch(() => false),
    async (p, v) => new PaymentPage(p, ctx).buySingleProduct(p, { name: `${v} buyer`, email: generateCustomerEmail() })));
  expect(both.original.result).toBeTruthy(); expect(both.variant.result).toBeTruthy();
  console.log(`>>> ✅ TEST COMPLETE: purchased from BOTH pages, FlexiProof on the project. Check the stats in the split test dashboard for campaign "${campaign}".`);
  flow.completed({ 'Split URL': splitUrl, ...widget, 'Original purchase': both.original.result, 'Variant purchase': both.variant.result });
  await keepBrowserOpenIfSingleRun(live);
});
