import { test } from '@playwright/test';
import { TEST_CREDENTIALS } from '../config/test-credentials';
import { Logger } from '../utils/logger';
import { TestContext } from '../utils/test-context';
import { getLastRunState } from '../utils/test-data';
import { LoginPage } from '../pages/LoginPage';
import { ProductConfig } from '../pages/ProductsPage';
import { FunnelBuilderPage } from '../pages/FunnelBuilderPage';

/**
 * Funnel-only run: builds (and wires the CTA for) a funnel against products
 * that were already created by a previous full-funnel-flow.spec.ts run —
 * it does NOT create a project or products, and does NOT run the live
 * checkout. Useful for iterating on funnel-build selectors without paying
 * the ~10-15 min cost of recreating 5 products every time.
 *
 * Reuses the project/product naming from the last full run via
 * state/last-run.json (written by full-funnel-flow.spec.ts). To target a
 * specific past run instead of the most recent one, override with:
 *   QA_BASE_RANDOM=abc123 QA_PROJECT_NAME="QAProj... Project" npx playwright test tests/funnel-only.spec.ts
 *
 * Requires that a project with 5 products (FE/OTO1/DS1/OTO2/DS2, named
 * "QA <baseRandom> <STEP>") and their pages already exist in the account —
 * run full-funnel-flow.spec.ts at least once first if they don't.
 */
test.describe('FlexiFunnels Funnel Build Only', () => {
  test('build funnel against existing products', async ({ page }) => {
    test.setTimeout(10 * 60 * 1000); // 10 minutes — no product creation, just the funnel build + CTA wiring

    const lastRun = getLastRunState();
    const baseRandom = process.env.QA_BASE_RANDOM || lastRun?.baseRandom;

    if (!baseRandom) {
      throw new Error(
        'No previous run state found (state/last-run.json is missing/empty) and no QA_BASE_RANDOM env var was set. ' +
        'Set QA_BASE_RANDOM to the ID used in your product names (e.g. "QA vLOWEh FE" -> QA_BASE_RANDOM=vLOWEh), ' +
        'or run full-funnel-flow.spec.ts once first so its state is saved automatically.'
      );
    }

    // Project name isn't actually used to navigate anywhere in this spec —
    // createFunnel() finds products purely by name (baseRandom), and
    // wireSalesPageToFunnel() opens whatever project's "Open Project" button
    // it finds first. It's only kept here for logging/diagnostics, so it's
    // optional: falls back to a readable default derived from baseRandom
    // instead of forcing you to type/copy the exact project name every run.
    const projectName = process.env.QA_PROJECT_NAME || lastRun?.projectName || `QA ${baseRandom} Project`;

    const testContext = new TestContext('regular');
    testContext.projectName = projectName;

    Logger.info('START', '='.repeat(60));
    Logger.info('START', `Funnel-only run | Project: "${projectName}" | Base ID: "${baseRandom}"`);
    Logger.info('START', '='.repeat(60));

    const loginPage = new LoginPage(page, testContext);
    const funnelBuilderPage = new FunnelBuilderPage(page, testContext);

    // Same naming convention full-funnel-flow.spec.ts uses when it created
    // these products — must match exactly for the search-and-select product
    // pickers in the funnel builder to find them.
    const products: ProductConfig[] = [
      { key: 'FE', productName: `QA ${baseRandom} FE`, salesPageName: 'FE Sales', checkoutPageName: 'FE Checkout', price: '100' },
      { key: 'OTO1', productName: `QA ${baseRandom} OTO1`, salesPageName: 'OTO1 Sales', checkoutPageName: 'OTO1 Checkout', price: '100' },
      { key: 'DS1', productName: `QA ${baseRandom} DS1`, salesPageName: 'DS1 Sales', checkoutPageName: 'DS1 Checkout', price: '100' },
      { key: 'OTO2', productName: `QA ${baseRandom} OTO2`, salesPageName: 'OTO2 Sales', checkoutPageName: 'OTO2 Checkout', price: '100' },
      { key: 'DS2', productName: `QA ${baseRandom} DS2`, salesPageName: 'DS2 Sales', checkoutPageName: 'DS2 Checkout', price: '100' },
    ];

    // 1. Auth
    await loginPage.openLogin();
    await loginPage.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);

    // 2. Build the funnel pipeline (FE -> OTO1/DS1 -> OTO2/DS2) and wire the CTA.
    // `true` = One-Click Upsell funnel type. Pass `false` instead to build a
    // Normal Funnel.
    Logger.info('FUNNEL', 'Building funnel pipeline...');
    const funnelName = `QA ${baseRandom} Funnel`;
    await funnelBuilderPage.createFunnel(funnelName, true, products);
    await funnelBuilderPage.wireAllSalesPages(products, funnelName);

    // 2b. Final publish pass for Checkout pages + the single Thank You page.
    await funnelBuilderPage.publishAllCheckoutPages(products);
    await funnelBuilderPage.publishThankYouPage();

    Logger.info('FINISH', '🎉 Funnel-only run complete!');
  });
});
