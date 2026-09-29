import { test } from '@playwright/test';
import { TEST_CREDENTIALS } from '../config/test-credentials';
import { Logger } from '../utils/logger';
import { TestContext } from '../utils/test-context';
import { generateAlphaNumericId, generateProjectName, generateCustomerEmail, saveRunState } from '../utils/test-data';
import { LoginPage } from '../pages/LoginPage';
import { ProjectsPage } from '../pages/ProjectsPage';
import { ProductsPage, ProductConfig } from '../pages/ProductsPage';
import { FunnelPage } from '../pages/FunnelPage';
import { FunnelBuilderPage } from '../pages/FunnelBuilderPage';
import { SalesPage } from '../pages/SalesPage';
import { PaymentPage } from '../pages/PaymentPage';

/**
 * Single-product, no-funnel run: login -> create project -> create ONLY the
 * 3 pages a standalone product needs (FE Sales, FE Checkout, Thank You) ->
 * create ONE product wired to those pages -> add a new CTA button AND a
 * "No thanks" decline button on the Sales page and wire both via the
 * product-level "Go To Next Step In Product" step (there is no funnel here,
 * so the funnel-wiring popup/dropdown never comes into play) -> publish
 * Sales, Checkout, and Thank You -> run a live buyer purchase and verify it
 * lands on the Thank You page.
 *
 * Does NOT call FunnelBuilderPage.createFunnel() or wireAllSalesPages() --
 * those are the funnel-tree path used by full-funnel-flow.spec.ts and are
 * left completely untouched by this spec.
 *
 * ⚠️ This hits the live payment gateway in TEST MODE and charges a test
 * amount per README — never point this at a production gateway.
 */
test.describe('FlexiFunnels Single Product (No Funnel)', () => {
  test('project + single FE product wired directly (no funnel) -> live purchase', async ({ page }) => {
    // Much shorter than the full 5-product journey: 1 product's wizard
    // steps + 3 page creations + product-level wiring + a live checkout.
    test.setTimeout(12 * 60 * 1000); // 12 minutes

    const testContext = new TestContext('regular');
    const baseRandom = generateAlphaNumericId(6);
    const projectName = generateProjectName('QA') + ` ${baseRandom} Project`;
    testContext.customerEmail = generateCustomerEmail();

    Logger.info('START', '='.repeat(60));
    Logger.info('START', `Single-product (no funnel) run | Project: "${projectName}" | Base ID: "${baseRandom}"`);
    Logger.info('START', '='.repeat(60));

    const loginPage = new LoginPage(page, testContext);
    const projectsPage = new ProjectsPage(page, testContext);
    const productsPage = new ProductsPage(page, testContext);
    const funnelPage = new FunnelPage(page, testContext);
    const funnelBuilderPage = new FunnelBuilderPage(page, testContext);
    const salesPage = new SalesPage(page, testContext);
    const paymentPage = new PaymentPage(page, testContext);

    // 1. Auth
    await loginPage.openLogin();
    await loginPage.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);

    // 2. Project
    await projectsPage.openProjects();
    await projectsPage.createProject(projectName);

    // 2b. Only the 3 pages this single product actually needs -- not all 11
    // funnel pages. Pulled straight from FunnelPage.FUNNEL_PAGES so the
    // page-type/template/publish behavior is identical to the full flow.
    const pageSpecs = FunnelPage.FUNNEL_PAGES.filter((p) =>
      p.name === 'FE Sales' || p.name === 'FE Checkout' || p.name === 'Thank You'
    );
    await funnelPage.createPages(pageSpecs);

    // 3. A single product, connected to those 3 pages.
    const product: ProductConfig = {
      key: 'FE',
      productName: `QA ${baseRandom} FE`,
      salesPageName: 'FE Sales',
      checkoutPageName: 'FE Checkout',
      price: '100',
    };

    await productsPage.openProducts();
    await productsPage.createProduct(product.productName, product.price);
    await productsPage.connectProductPages(product.productName, projectName, product.salesPageName, product.checkoutPageName);
    Logger.info('FLOW', `✅ "${product.productName}" configured (no funnel).`);

    // 4. No funnel tree here. Add a new CTA button on FE Sales and wire it
    // via the product-level "Go To Next Step In Product" popup. IMPORTANT:
    // that popup's "Add Product" search lists PRODUCTS (e.g. "QA xxx FE"),
    // never pages — passing a page name like "FE Checkout" here always
    // returns "No matches" (confirmed). Selecting the product ITSELF is
    // what sends the buyer to its checkout — there's no separate downsell
    // product in a single-product/no-funnel run, so both the main CTA and
    // the "No thanks" decline button wire to this same product.
    await funnelBuilderPage.wireSalesPageToProduct(
      product.salesPageName,
      product.productName,
      product.productName
    );

    // 4b. Publish Checkout + Thank You now that the CTA is wired.
    await funnelBuilderPage.publishAllCheckoutPages([product]);
    await funnelBuilderPage.publishThankYouPage();

    // 5. Live buyer journey: FE Sales -> Checkout -> Payment -> Thank You.
    // No acceptUpsell() call -- there's no upsell in a no-funnel single
    // product flow.
    Logger.info('BUYER', 'Starting live checkout...');
    const liveSalesPage = await salesPage.openLiveSalesPage();
    try {
      await paymentPage.openBuyerJourney(liveSalesPage);
      await paymentPage.fillCustomerDetails(liveSalesPage);
      await paymentPage.completeStripePayment(liveSalesPage);
      await paymentPage.verifyFinalPage(liveSalesPage);
    } finally {
      await liveSalesPage.close().catch(() => {});
    }

    // 6. Persist state, same as the other specs.
    saveRunState({ projectName, projectUrl: testContext.projectUrl, baseRandom });

    Logger.info('FINISH', '🎉 Single-product (no funnel) run complete!');
  });
});
