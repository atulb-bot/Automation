import { test } from '@playwright/test';
import { TEST_CREDENTIALS } from '../config/test-credentials';
import { Logger } from '../utils/logger';
import { TestContext } from '../utils/test-context';
import { generateAlphaNumericId, generateProjectName, generateCustomerEmail, saveRunState } from '../utils/test-data';
import { LoginPage } from '../pages/LoginPage';
import { ProjectsPage } from '../pages/ProjectsPage';
import { ProductsPage, ProductConfig } from '../pages/ProductsPage';
import { FunnelPage } from '../pages/FunnelPage';

/**
 * Products-only run: login -> create project -> create the 11 funnel pages
 * -> create FE..DS2 products and connect each to its sales/checkout page.
 * Stops there — does NOT build the funnel tree, wire any CTA, or run a live
 * checkout. Useful for iterating on the product wizard / page-connection
 * selectors without paying the extra time cost of the funnel build.
 *
 * Saves state/last-run.json on success (same as full-funnel-flow.spec.ts),
 * so a follow-up `npx playwright test tests/funnel-only.spec.ts` will pick
 * up this exact project/products automatically.
 */
test.describe('FlexiFunnels Products Only', () => {
  test('project + pages + products, no funnel build', async ({ page }) => {
    // 5 products x ~28 delayed steps in the product wizard ≈ 10-12 min of
    // intentional settle-delay alone, same as the product portion of the
    // full journey — see full-funnel-flow.spec.ts for the same note.
    test.setTimeout(20 * 60 * 1000); // 20 minutes

    const testContext = new TestContext('regular');
    const baseRandom = generateAlphaNumericId(6);
    const projectName = generateProjectName('QA') + ` ${baseRandom} Project`;
    testContext.customerEmail = generateCustomerEmail();

    Logger.info('START', '='.repeat(60));
    Logger.info('START', `Products-only run | Project: "${projectName}" | Base ID: "${baseRandom}"`);
    Logger.info('START', '='.repeat(60));

    const loginPage = new LoginPage(page, testContext);
    const projectsPage = new ProjectsPage(page, testContext);
    const productsPage = new ProductsPage(page, testContext);
    const funnelPage = new FunnelPage(page, testContext);

    // 1. Auth
    await loginPage.openLogin();
    await loginPage.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);

    // 2. Project
    await projectsPage.openProjects();
    await projectsPage.createProject(projectName);

    // 2b. The 11 funnel pages (FE Sales/Checkout ... DS2 Sales/Checkout,
    // Thank You) have to exist before products can be wired to them — the
    // "select a sales/checkout page" dropdowns in the product wizard read
    // straight off this project's page list.
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

    // 4. Persist state so funnel-only.spec.ts (or a re-run of this spec) can
    // pick up this exact project/products without recreating them.
    saveRunState({ projectName, projectUrl: testContext.projectUrl, baseRandom });

    Logger.info('FINISH', '🎉 Products-only run (project -> pages -> products) complete! Run funnel-only.spec.ts next to build the funnel.');
  });
});
