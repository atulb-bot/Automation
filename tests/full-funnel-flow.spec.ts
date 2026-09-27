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
 * Full journey, single run: login -> create project -> create FE..DS2 products
 * (with pages wired + test payment gateway enabled) -> build the funnel tree
 * -> wire the FE sales page CTA into the funnel -> execute a live buyer
 * checkout including the upsell -> verify the final page.
 *
 * ⚠️ This hits the live payment gateway in TEST MODE and charges a test
 * amount per README — never point this at a production gateway.
 */
test.describe('FlexiFunnels Full Journey', () => {
  test('project creation through funnel build to live checkout', async ({ page }) => {
    // The product wizard now carries a deliberate 4-5s settle delay after
    // each step (5 products x ~28 delayed steps ≈ 10-12 min of intentional
    // waiting alone), on top of real page-load/network time for login,
    // project setup, funnel build, and the live checkout. The 180s default
    // in playwright.config.ts is nowhere near enough for that and made the
    // run look "stuck" (it was just quietly running toward a timeout kill).
    test.setTimeout(25 * 60 * 1000); // 25 minutes

    const testContext = new TestContext('regular');
    const baseRandom = generateAlphaNumericId(6);
    const projectName = generateProjectName('QA') + ` ${baseRandom} Project`;
    testContext.customerEmail = generateCustomerEmail();

    Logger.info('START', '='.repeat(60));
    Logger.info('START', `Full journey | Project: "${projectName}" | Base ID: "${baseRandom}"`);
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

    // 2b. Create the actual funnel pages (FE Sales/Checkout ... DS2
    // Sales/Checkout, Thank You) inside the project BEFORE wiring any
    // product to them. Without this step the pages simply don't exist yet,
    // so every "select a sales/checkout/thank you page" dropdown in the
    // product wizard below has nothing to pick from.
    await funnelPage.createAllFunnelPages();

    // 3. Product hierarchy: FE -> OTO1 -> DS1 -> OTO2 -> DS2
    const products: ProductConfig[] = [
      { key: 'FE', productName: `QA ${baseRandom} FE`, salesPageName: 'FE Sales', checkoutPageName: 'FE Checkout', price: '100' },
      { key: 'OTO1', productName: `QA ${baseRandom} OTO1`, salesPageName: 'OTO1 Sales', checkoutPageName: 'OTO1 Checkout', price: '100' },
      { key: 'DS1', productName: `QA ${baseRandom} DS1`, salesPageName: 'DS1 Sales', checkoutPageName: 'DS1 Checkout', price: '100' },
      { key: 'OTO2', productName: `QA ${baseRandom} OTO2`, salesPageName: 'OTO2 Sales', checkoutPageName: 'OTO2 Checkout', price: '100' },
      { key: 'DS2', productName: `QA ${baseRandom} DS2`, salesPageName: 'DS2 Sales', checkoutPageName: 'DS2 Checkout', price: '100' },
    ];

    await productsPage.openProducts();
    for (let i = 0; i < products.length; i++) {
      const prod = products[i];
      Logger.info('FLOW', `[${i + 1}/${products.length}] Processing product: "${prod.productName}"...`);

      await productsPage.createProduct(prod.productName, prod.price);
      await productsPage.connectProductPages(prod.productName, projectName, prod.salesPageName, prod.checkoutPageName);

      Logger.info('FLOW', `[${i + 1}/${products.length}] ✅ "${prod.productName}" configured.`);
      await productsPage.openProducts(); // back to list before next product
    }

    // 4. Build the funnel pipeline (FE -> OTO1/DS1 -> OTO2/DS2) and wire the CTA
    Logger.info('FUNNEL', 'Building funnel pipeline...');
    const funnelName = `QA ${baseRandom} Funnel`;
    // `true` = One-Click Upsell funnel type (selects "One-Click Upsell Save
    // payment" instead of "Normal Funnel Standard" on the create-funnel
    // step). The tree-building/wiring logic below is unchanged either way.
    await funnelBuilderPage.createFunnel(funnelName, true, products);
    await funnelBuilderPage.wireAllSalesPages(products, funnelName);

    // 4b. Final publish pass for Checkout pages + the single Thank You page,
    // now that every product/funnel wiring is finished — same treatment the
    // Sales pages just got inside wireAllSalesPages().
    await funnelBuilderPage.publishAllCheckoutPages(products);
    await funnelBuilderPage.publishThankYouPage();

    // 5. Live buyer journey
    Logger.info('BUYER', 'Starting live checkout and upsell verification...');
    const liveSalesPage = await salesPage.openLiveSalesPage();
    try {
      await paymentPage.openBuyerJourney(liveSalesPage);
      await paymentPage.fillCustomerDetails(liveSalesPage);
      await paymentPage.completeStripePayment(liveSalesPage);
      await paymentPage.acceptUpsell(liveSalesPage);
      await paymentPage.verifyFinalPage(liveSalesPage);
    } finally {
      await liveSalesPage.close().catch(() => {});
    }

    // 6. Persist state so a follow-up run/spec can reuse this project
    saveRunState({ projectName, projectUrl: testContext.projectUrl, baseRandom });

    Logger.info('FINISH', '🎉 Full journey (project -> products -> funnel -> checkout) complete!');
  });
});
