import { test } from '@playwright/test';
import { runFreeTrialFlow, TestFlowConfig } from '../utils/free-trial-runner';

// YEARLY billing flows (with card). The no-card trial does not pick a plan or
// billing cycle, so it only lives in freeTrialMultiPlan.spec.ts (Flow 1).
// The plans page opens on yearly by default, so these
// tests do NOT click the Monthly toggle - they pick the plan straight away.
const TEST_FLOWS: TestFlowConfig[] = [
  {
    testTitle: 'Yearly 2: Free Trial WITH Card (LaunchPad - Yearly)',
    plan: 'launchpad',
    flowType: 'with-card',
    billing: 'yearly',
  },
  {
    testTitle: 'Yearly 3: Free Trial WITH Card (Pro - Yearly)',
    plan: 'pro',
    flowType: 'with-card',
    billing: 'yearly',
  },
  {
    testTitle: 'Yearly 4: Free Trial WITH Card (FlexiFunnels - Yearly)',
    plan: 'flexifunnels',
    flowType: 'with-card',
    billing: 'yearly',
  },
];

test.describe('Free Trial Plan Flows - Yearly', () => {
  test.setTimeout(300000); // 5 minutes per test for manual OTP and payment steps

  test.afterEach(async ({}, testInfo) => {
    console.log(
      `\n>>> [${String(testInfo.status).toUpperCase()}] ${testInfo.title} (${(testInfo.duration / 1000).toFixed(1)}s) - next test starts automatically.\n`
    );
  });

  for (const config of TEST_FLOWS) {
    test(config.testTitle, async ({ page }) => {
      await runFreeTrialFlow(page, config);
    });
  }
});
