import { test, expect } from '@playwright/test';
import { FreeTrialPage } from '../pages/FreeTrialPage';
import { testEmail } from '../utils/my-details';

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
  return result;
}

test.describe('Free Trial Onboarding & Subscription Flow', () => {
  test('should successfully complete free trial signup and navigate to subscription', async ({ page }) => {
    // 2-second delay between steps for smooth UI pacing
    const freeTrialPage = new FreeTrialPage(page, 2000);

    // Name: Alphabets only (letters only, no numbers or special characters)
    const alphabetName = `${generateRandomAlphabets(5)} ${generateRandomAlphabets(6)}`;

    // Email: atul.b+<randomalphanumeric>@flexifunnels.com
    const randomSuffix = `${generateRandomAlphanumeric(5)}${Date.now()}`;
    const formattedEmail = testEmail(String(randomSuffix));

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
      expiry: '02 / 36',
      cvv: '225',
    });

    // 5. Dismiss Dashboard Prompts & Open My Subscription
    await freeTrialPage.dismissOnboardingWidgetsAndVerifySubscription();
  });
});