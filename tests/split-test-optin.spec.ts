import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { OptinPage, OPTIN_PAGE } from '../pages/OptinPage';
import { SplitTestPage } from '../pages/SplitTestPage';
import { TEST_CREDENTIALS } from '../config/test-credentials';
import { TestContext } from '../utils/test-context';
import { generateRandomLetters } from '../utils/helpers';
import { FlowReporter } from '../utils/flow-reporter';
import { keepBrowserOpenIfSingleRun } from '../utils/free-trial-runner';
import { ME, testEmail } from '../utils/my-details';

/**
 * Split test - Email opt-in:
 *   project -> Thank You page (published, URL copied)
 *   -> Original opt-in page "Email Optin Page" (headline "Email Optin Original", form -> Thank You)
 *   -> Variant page "Email Optin Variant" (Add New Page, headline "Email Optin Variant", same form)
 *   -> split test app: campaign (control = Original, variant = Variant, equal split, manual winner) -> Launch
 *   -> Visit: sign up -> Thank You page; plus a few fresh visits to see both versions served.
 *
 *   npm run split:optin
 */
const VARIANT_PAGE = 'Email Optin Variant';

test('Split test: email opt-in (Original vs Variant)', async ({ page, browser }) => {
  test.setTimeout(35 * 60 * 1000);
  const ctx = new TestContext('regular');
  const id = generateRandomLetters(6);
  const project = `${ME.firstName} Split Optin ${id}`;
  const lead = { first: ME.firstName, last: generateRandomLetters(5), email: testEmail('split' + generateRandomLetters(6).toLowerCase()) };
  const optin = new OptinPage(page, ctx);
  const flow = new FlowReporter('Split test - email opt-in', 10, { Project: project, Lead: lead.email });

  await flow.step('Login', async () => {
    const login = new LoginPage(page, ctx);
    await login.openLogin();
    await login.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
    await page.waitForTimeout(3000);
  });
  await flow.step('Create project', () => optin.createOptinProject(project));
  await flow.step('Original opt-in page: Blank Template', () => optin.chooseBlankForOptin());
  await flow.step('Thank You page: choose a template', () => optin.chooseThankYouTemplate());
  const thankYouUrl = await flow.step('Publish the Thank You page and copy its URL', () => optin.publishThankYouAndGetUrl());
  await flow.step('Build + publish the Original opt-in page', async () => {
    await optin.buildOptinPage(OPTIN_PAGE, 'Email Optin Original');
    await optin.setUpForm(thankYouUrl);
    await optin.publishOptinPage(OPTIN_PAGE);
  });
  await flow.step(`Create the Variant page "${VARIANT_PAGE}"`, () => optin.createVariantPage(VARIANT_PAGE));
  await flow.step('Build + publish the Variant opt-in page', async () => {
    await optin.buildOptinPage(VARIANT_PAGE, 'Email Optin Variant');
    await optin.setUpForm(thankYouUrl);
    await optin.publishOptinPage(VARIANT_PAGE);
  });

  const split = new SplitTestPage(page, ctx);
  const live = await flow.step('Split test campaign: Original vs Variant, equal split, launch', async () => {
    await split.openSplitTestApp();
    return split.createCampaign({ name: `Split Test ${id}`, project, controlPage: OPTIN_PAGE, variantPage: VARIANT_PAGE, notes: 'V2' });
  });
  const splitUrl = live.url();
  const campaign = `Split Test ${id}`;
  // open the split URL until BOTH pages have come, and sign up through each one (Original + Variant)
  const both = await flow.step('Sign up through both versions: Original + Variant -> Thank You', () =>
    split.completeOnBothVersions(browser, splitUrl, live,
      async (p) => p.getByText(/Email Optin Variant/i).first().isVisible().catch(() => false),
      async (p, version) => new OptinPage(p, ctx).submitLiveForm(p, { ...lead, last: version, email: testEmail(`split${version.toLowerCase()}${generateRandomLetters(5).toLowerCase()}`) }, thankYouUrl)));
  expect(both.original.result).toBeTruthy();
  expect(both.variant.result).toBeTruthy();

  console.log(`>>> ✅ TEST COMPLETE: signed up through BOTH pages (Original + Variant) in ${both.visits} visits.`);
  console.log(`>>> Check the stats in the split test dashboard for campaign "${campaign}".`);
  flow.completed({ 'Split URL': splitUrl, 'Original sign-up': `${both.original.result} (visit ${both.original.visit})`, 'Variant sign-up': `${both.variant.result} (visit ${both.variant.visit})`,
    'Campaign': `${campaign} - check its stats in the split test dashboard` });
  await keepBrowserOpenIfSingleRun(live);
});
