import { Page, test } from '@playwright/test';
import { clearFinishSignal, waitForFinishOr } from './finish-signal';
import * as fs from 'fs';
import * as path from 'path';
import { FreeTrialPage, PlanKey, BillingCycle } from '../pages/FreeTrialPage';
import { ME, testEmail } from './my-details';

const ACCOUNTS_LOG_FILE = path.join(__dirname, '../created_accounts.csv');

export interface TestFlowConfig {
  testTitle: string;
  plan: PlanKey;
  flowType: 'no-card' | 'with-card';
  billing: BillingCycle;
}

function saveEmailToFile(email: string, fullName: string, plan: string, flowType: string, billing: string) {
  if (!fs.existsSync(ACCOUNTS_LOG_FILE)) {
    fs.writeFileSync(ACCOUNTS_LOG_FILE, 'timestamp,name,email,plan,flow_type,billing\n', 'utf8');
  }
  const timestamp = new Date().toISOString();
  fs.appendFileSync(
    ACCOUNTS_LOG_FILE,
    `"${timestamp}","${fullName}","${email}","${plan}","${flowType}","${billing}"\n`,
    'utf8'
  );
  console.log(`\n>>> [SAVED TO FILE] -> ${fullName} | ${email} | Plan: ${plan} | Flow: ${flowType} | Billing: ${billing}\n`);
}

function generateRandomAlphabets(length: number = 6): string {
  const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let res = '';
  for (let i = 0; i < length; i++) {
    res += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return res;
}

function generateAlphanumeric(length: number = 6): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let res = '';
  for (let i = 0; i < length; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

/**
 * One complete free-trial signup for a given plan + billing cycle.
 * Shared by the monthly and yearly specs so both behave identically
 * (only the plan and the billing toggle differ).
 */
export async function runFreeTrialFlow(page: Page, config: TestFlowConfig) {
  const freeTrialPage = new FreeTrialPage(page, 1500);

  // Name: "Atul" followed by letters only
  const randomLetters = generateRandomAlphabets(5);
  const fullName = `${ME.firstName} ${randomLetters}`;

  // Email: atul.b+<randomalphanumeric>@flexifunnels.com
  const randomSuffix = `${generateAlphanumeric(4)}${Date.now()}`;
  const email = testEmail(randomSuffix);

  // 1. Record email to CSV file
  saveEmailToFile(email, fullName, config.plan, config.flowType, config.billing);

  // 2. Open login & start free account signup
  await freeTrialPage.navigateToRegister();
  await freeTrialPage.submitRegistration(fullName, email);

  // 3. Enter OTP manually (Waits up to 90 seconds for your manual entry)
  await freeTrialPage.waitForManualOtp(90000);

  // 4. Fill hardcoded phone number ('1234567890') and proceed
  await freeTrialPage.fillPhoneAndProceed('1234567890');

  // 5 + 6. Complete either No-Card or With-Card flow
  if (config.flowType === 'no-card') {
    // No-card trial (recorded flow): NO plan is selected and SUBSCRIBE is not clicked -
    // go straight to "Skip — start trial without a..." -> "Skip for now" -> "START MY FREE TRIAL".
    await freeTrialPage.completeTrialWithoutCard();
  } else {
    // With-card trial: select plan & billing cycle, then Paddle card checkout (unchanged)
    await freeTrialPage.selectPlan(config.plan, config.billing);
    await freeTrialPage.completeTrialWithCard({
      fullName: fullName,
      postalCode: '1234560',
      cardNumber: '4242 4242 4242 4242',
      expiry: '03 / 33',
      cvv: '258',
    });
  }

  // 7. Onboarding cleanup and dashboard check
  await freeTrialPage.finishOnboarding();

  // 8. Single test -> keep the browser open at the dashboard. Full run -> close and continue.
  await keepBrowserOpenIfSingleRun(page);
}

/**
 * When exactly ONE test was selected, leave the browser open at the dashboard
 * until you close the window yourself (or press Ctrl+C in the terminal).
 * When several tests run, returns immediately so the next account starts.
 *
 * Override with KEEP_OPEN=1 (always keep open) or KEEP_OPEN=0 (never).
 */
export async function keepBrowserOpenIfSingleRun(page: Page) {
  const override = process.env.KEEP_OPEN;
  const single = process.env.FF_TOTAL_TESTS === '1';
  const keepOpen = override === '1' ? true : override === '0' ? false : single;
  if (!keepOpen) return;

  console.log('\n=============================================================');
  console.log('>>> DONE. Browser left open at the dashboard.');
  console.log('>>> Close the browser window (or press Ctrl+C) to end the test.');
  console.log('>>> Or press "Finish run" on the dashboard / run: npm run finish');
  console.log('=============================================================\n');

  test.setTimeout(0); // no time limit while you look around
  clearFinishSignal();
  let closed = false;
  page.once('close', () => (closed = true));
  const how = await waitForFinishOr(() => closed || page.isClosed());
  if (how === 'finish') console.log('>>> Finish requested - closing the browser and ending the test.');
}
