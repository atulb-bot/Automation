// tests/testOtp.spec.ts
import { test, chromium } from '@playwright/test';
import * as os from 'os';
import * as path from 'path';

test('Verify Gmail OTP extraction from Chrome Profile', async () => {
  // Path to your local Chrome profile
  const userDataDir = path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data');

  console.log(`Connecting to Chrome profile at: ${userDataDir}`);

  // Launch persistent context with Chrome
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: false, // Run headed so you can see it navigate to Gmail
    args: ['--profile-directory=Default'],
  });

  const page = await context.newPage();

  console.log('Navigating to Gmail...');
  await page.goto('https://mail.google.com/mail/u/0/#inbox');

  // Verify that you are logged in
  await page.waitForURL(/.*mail\.google\.com.*/, { timeout: 20000 });
  console.log('Successfully loaded Gmail inbox!');

  // Look for the most recent email with FlexiFunnels or Verification
  console.log('Searching for latest verification email...');
  const emailRow = page.locator('tr').filter({ hasText: /FlexiFunnels|Verification|OTP/i }).first();
  await emailRow.waitFor({ state: 'visible', timeout: 15000 });

  console.log('Email found! Opening email...');
  await emailRow.click();

  // Read email content
  const emailBody = page.locator('div[role="main"]');
  await emailBody.waitFor({ state: 'visible', timeout: 10000 });
  const text = await emailBody.innerText();

  // Extract 6-digit number
  const match = text.match(/\b\d{6}\b/);

  if (match) {
    console.log('\n=============================================');
    console.log(`>>> SUCCESS! Extracted OTP: ${match[0]}`);
    console.log(`>>> Split Digits: ${JSON.stringify(match[0].split(''))}`);
    console.log('=============================================\n');
  } else {
    console.log('Failed to match a 6-digit code. Email snippet:');
    console.log(text.slice(0, 300));
  }

  // Keep it open for 5 seconds so you can see it
  await page.waitForTimeout(5000);

  await page.close();
  await context.close();
});