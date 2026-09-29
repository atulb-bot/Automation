import { chromium } from '@playwright/test';
import * as os from 'os';
import * as path from 'path';

export async function grabOtpFromExistingGmail(): Promise<string[]> {
  // Path to your default Chrome profile on Windows
  const userDataDir = path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data');

  // Launch a persistent context using your local Chrome session
  const browserContext = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: false,
    args: ['--profile-directory=Default'],
  });

  const mailPage = await browserContext.newPage();
  await mailPage.goto('https://mail.google.com/mail/u/0/#inbox');

  console.log('[OTP] Searching latest FlexiFunnels email in Gmail tab...');

  // Click the top matching email row
  const emailRow = mailPage.locator('tr').filter({ hasText: /FlexiFunnels|Verification|OTP/i }).first();
  await emailRow.waitFor({ state: 'visible', timeout: 30000 });
  await emailRow.click();

  // Extract OTP text
  const emailBody = mailPage.locator('div[role="main"]');
  await emailBody.waitFor({ state: 'visible', timeout: 10000 });
  const text = await emailBody.innerText();

  const match = text.match(/\b\d{6}\b/);

  await mailPage.close();
  await browserContext.close();

  if (!match) throw new Error('Could not find 6-digit OTP in the email body.');
  return match[0].split('');
}