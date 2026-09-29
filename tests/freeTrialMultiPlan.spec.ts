import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { FreeTrialPage, PlanKey } from '../pages/FreeTrialPage';

const ACCOUNTS_LOG_FILE = path.join(__dirname, '../created_accounts.csv');

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

interface TestFlowConfig {
  testTitle: string;
  plan: PlanKey;
  flowType: 'no-card' | 'with-card';
  billing: 'monthly' | 'yearly';
}

const TEST_FLOWS: TestFlowConfig[] = [
  {
    testTitle: 'Flow 1: Free Trial WITHOUT Card (LaunchPad - No Card)',
    plan: 'launchpad',
    flowType: 'no-card',
    billing: 'monthly',
  },
  {
    testTitle: 'Flow 2: Free Trial WITH Card (LaunchPad - Monthly)',
    plan: 'launchpad',
    flowType: 'with-card',
    billing: 'monthly',
  },
  {
    testTitle: 'Flow 3: Free Trial WITH Card (Pro - Monthly)',
    plan: 'pro',
    flowType: 'with-card',
    billing: 'monthly',
  },
  {
    testTitle: 'Flow 4: Free Trial WITH Card (FlexiFunnels - Monthly)',
    plan: 'flexifunnels',
    flowType: 'with-card',
    billing: 'monthly',
  },
];

test.describe('FlexiFunnels Complete Plan & Trial Flows', () => {
  test.setTimeout(300000); // 5 minutes timeout per test for manual OTP and payment steps

  for (const config of TEST_FLOWS) {
    test(config.testTitle, async ({ page }) => {
      const freeTrialPage = new FreeTrialPage(page, 1500);

      // Name: "Atul" followed by letters only
      const randomLetters = generateRandomAlphabets(5);
      const fullName = `Atul ${randomLetters}`;

      // Email: atul.b+<randomalphanumeric>@flexifunnels.com
      const randomSuffix = `${generateAlphanumeric(4)}${Date.now()}`;
      const email = `atul.b+${randomSuffix}@flexifunnels.com`;

      // 1. Record email to CSV file
      saveEmailToFile(email, fullName, config.plan, config.flowType, config.billing);

      // 2. Open login & start free account signup
      await freeTrialPage.navigateToRegister();
      await freeTrialPage.submitRegistration(fullName, email);

      // 3. Enter OTP manually (Waits up to 90 seconds for your manual entry)
      await freeTrialPage.waitForManualOtp(90000);

      // 4. Fill hardcoded phone number ('1234567890') and proceed
      await freeTrialPage.fillPhoneAndProceed('1234567890');

      // 5. Select plan & billing cycle
      await freeTrialPage.selectPlan(config.plan, config.billing);

      // 6. Complete either No-Card or With-Card flow
      if (config.flowType === 'no-card') {
        await freeTrialPage.completeTrialWithoutCard();
      } else {
        await freeTrialPage.completeTrialWithCard({
          fullName: fullName,
<<<<<<< HEAD
          postalCode: '1234560',
=======
          postalCode: '248001',
>>>>>>> 3b74662e3a642703c199e584d84b4d058f47ff14
          cardNumber: '4242 4242 4242 4242',
          expiry: '03 / 33',
          cvv: '258',
        });
      }

      // 7. Onboarding cleanup and dashboard check
      await freeTrialPage.finishOnboarding();
    });
  }
});