import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { OptinPage } from '../pages/OptinPage';
import { TEST_CREDENTIALS } from '../config/test-credentials';
import { TestContext } from '../utils/test-context';
import { generateRandomLetters } from '../utils/helpers';
import { FlowReporter } from '../utils/flow-reporter';
import { keepBrowserOpenIfSingleRun } from '../utils/free-trial-runner';
import { ME, testEmail } from '../utils/my-details';

/**
 * Email opt-in: project -> blank opt-in page + Thank You template -> Thank You published (URL copied)
 * -> opt-in page built (section, 2 columns, headline, form with Name, Email, Phone, Address, City;
 *    Form Submit Action -> Submit -> Thank You URL)
 * -> published -> live form filled and submitted -> Thank You page.
 *
 *   npm run optin:email
 */
test.describe('Email Opt-in', () => {
  test('Email opt-in page: build, publish, sign up -> Thank You page', async ({ page }) => {
    test.setTimeout(20 * 60 * 1000);
    const ctx = new TestContext('regular');
    const id = generateRandomLetters(6);
    const project = `${ME.firstName} Email Optin ${id}`;
    const lead = { first: ME.firstName, last: generateRandomLetters(5), email: testEmail('opt' + generateRandomLetters(6).toLowerCase()) };
    const optin = new OptinPage(page, ctx);
    const flow = new FlowReporter('Email opt-in', 9, { Project: project, Lead: lead.email });

    await flow.step('Login', async () => {
      const login = new LoginPage(page, ctx);
      await login.openLogin();
      await login.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
      await page.waitForTimeout(3000);
    });
    await flow.step('Create project', () => optin.createOptinProject(project));
    await flow.step('Email Optin Page: Blank Template', () => optin.chooseBlankForOptin());
    await flow.step('Thank You Page: choose a template', () => optin.chooseThankYouTemplate());
    const thankYouUrl = await flow.step('Publish the Thank You page and copy its URL', () => optin.publishThankYouAndGetUrl());
    await flow.step('Build the opt-in page (section, 2 columns, headline, form)', () => optin.buildOptinPage());
    await flow.step('Form fields + Form Submit Action -> Thank You URL', () => optin.setUpForm(thankYouUrl));
    const live = await flow.step('Publish the opt-in page and open it', () => optin.publishOptinAndOpenLive());
    const reached = await flow.step('Sign up on the live page -> Thank You page', () => optin.submitLiveForm(live, lead, thankYouUrl));
    expect(reached).toBeTruthy();

    flow.completed({ 'Thank-you URL': reached, 'Thank-you tab': 'left open' });
    await keepBrowserOpenIfSingleRun(live);
  });
});
