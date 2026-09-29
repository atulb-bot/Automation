<<<<<<< HEAD
import { test, expect } from '@playwright/test';
import { FreeTrialPage } from '../pages/FreeTrialPage';

// Increase test timeout to accommodate manual OTP input
test.setTimeout(180000);

/**
 * Generates random alphabets only (A-Z, a-z, NO numbers/digits)
 */
function generateRandomAlphabets(length: number = 8): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return result;
}

/**
 * Generates a random alphanumeric string (letters and digits only)
 */
function generateRandomAlphanumeric(length: number = 6): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
=======
import { test } from '@playwright/test';
import { FreeTrialPage, PlanKey } from '../pages/FreeTrialPage';

// Single free-trial run WITH card. Pick the plan with FREE_TRIAL_PLAN:
//   FREE_TRIAL_PLAN=launchpad | pro | flexifunnels   (default: launchpad)
const PLAN = (process.env.FREE_TRIAL_PLAN || 'launchpad') as PlanKey;

test.setTimeout(300000); // time for manual OTP + Paddle

function randomLetters(length: number): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) result += letters.charAt(Math.floor(Math.random() * letters.length));
  return result;
}

function randomAlphanumeric(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
>>>>>>> 3b74662e3a642703c199e584d84b4d058f47ff14
  return result;
}

test.describe('Free Trial Onboarding & Subscription Flow', () => {
<<<<<<< HEAD
  test('should successfully complete free trial signup and navigate to subscription', async ({ page }) => {
    // 2-second delay between steps for smooth UI pacing
    const freeTrialPage = new FreeTrialPage(page, 2000);

    // Name: Alphabets only (letters only, no numbers or special characters)
    const alphabetName = `${generateRandomAlphabets(5)} ${generateRandomAlphabets(6)}`;

    // Email: atul.b+<randomalphanumeric>@flexifunnels.com
    const randomSuffix = `${generateRandomAlphanumeric(5)}${Date.now()}`;
    const formattedEmail = `atul.b+${randomSuffix}@flexifunnels.com`;

    // 1. Visit Login & initiate Free Account Signup
    await freeTrialPage.navigateToLogin();
    await freeTrialPage.startFreeAccountCreation();

    // 2. Register Account & Wait for manual OTP entry
    await freeTrialPage.submitAccountForm(alphabetName, formattedEmail);
    await freeTrialPage.waitForManualOtp(90000); // 90 seconds window to enter OTP manually

    // 3. Navigate Plans & Select Trial
    await freeTrialPage.selectPlanFlow();

    // 4. Fill Paddle Payment Modal
    await freeTrialPage.fillPaddleCheckout({
      fullName: alphabetName,
      postalCode: '248001',
      cardNumber: '4242 4242 4242 4242',
      cardholderName: alphabetName,
=======
  test(`free trial with card - ${PLAN}`, async ({ page }) => {
    const freeTrialPage = new FreeTrialPage(page, 2000);

    const fullName = `${randomLetters(5)} ${randomLetters(6)}`;
    const email = `atul.b+${randomAlphanumeric(5)}${Date.now()}@flexifunnels.com`;
    console.log(`\n>>> Plan: ${PLAN} | Name: ${fullName} | Email: ${email}\n`);

    // 1. Open signup and register
    await freeTrialPage.navigateToRegister();
    await freeTrialPage.submitRegistration(fullName, email);

    // 2. Enter the OTP manually in the browser (90 seconds)
    await freeTrialPage.waitForManualOtp(90000);

    // 3. Phone number, then plans
    await freeTrialPage.fillPhoneAndProceed('1234567890');
    await freeTrialPage.selectPlan(PLAN, 'monthly');

    // 4. Paddle checkout - pincode is filled on whichever step Paddle shows it
    await freeTrialPage.completeTrialWithCard({
      fullName,
      postalCode: '248001',
      cardNumber: '4242 4242 4242 4242',
>>>>>>> 3b74662e3a642703c199e584d84b4d058f47ff14
      expiry: '02 / 36',
      cvv: '225',
    });

<<<<<<< HEAD
    // 5. Dismiss Dashboard Prompts & Open My Subscription
    await freeTrialPage.dismissOnboardingWidgetsAndVerifySubscription();
  });
});
=======
    // 5. Close onboarding popups and confirm we reached the dashboard
    await freeTrialPage.finishOnboarding();
  });
});
>>>>>>> 3b74662e3a642703c199e584d84b4d058f47ff14
