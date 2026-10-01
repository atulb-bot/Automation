import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { MembershipPage, CourseConfig, buildLessons } from '../pages/MembershipPage';
import { generateRandomLetters } from '../utils/helpers';
import { TEST_CREDENTIALS } from '../config/test-credentials';
import { TestContext } from '../utils/test-context';

test.describe('FlexiFunnels Scalable Membership & Multi-Course Engine', () => {
  test.setTimeout(45 * 60 * 1000); // 45 min: 2 courses x 10 lessons with videos, publishing, and live checkout

  function generateLettersOnlySet() {
    return {
      membershipName: `Membership${generateRandomLetters(6)}`,
      courseOneName: `Subscription${generateRandomLetters(5)}`,
      courseTwoName: `OneTime${generateRandomLetters(6)}`,
      groupName: `Community${generateRandomLetters(5)}`,
      instructorName: `Instructor${generateRandomLetters(5)}`,
      instructorTwoName: `Instructor${generateRandomLetters(5)}`,
      buyerName: `Buyer${generateRandomLetters(6)}`,
      buyerEmail: `${generateRandomLetters(10).toLowerCase()}@flexifunnels.com`,
    };
  }

  test('Multi-Course Lifecycle: Subscription + One-Time + Live Stripe Purchase', async ({ page }) => {
    const testContext = new TestContext('regular');
    // FIX: LoginPage's real constructor takes (page, TestContext) -- this
    // was calling `new LoginPage(page)` with only one argument, which
    // TypeScript would catch (TS2554: Expected 2 arguments, but got 1) but
    // Playwright's per-file transpile-only runner doesn't type-check across
    // files, so it ran anyway and failed at runtime on the very next line.
    const loginPage = new LoginPage(page, testContext);
    const membershipPage = new MembershipPage(page);
    const data = generateLettersOnlySet();

    // 1. Dashboard Login
    // FIX: LoginPage has no `navigate()` method -- it's `openLogin()`. This
    // is the exact TypeError from the failed run
    // (test-results/.../error-context.md): "loginPage.navigate is not a
    // function".
    await loginPage.openLogin();
    await loginPage.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
    await page.waitForTimeout(3000);

    // 2. Launch Membership Builder Tab
    const membershipTab = await membershipPage.launchMembershipApp();

    try {
      // 3. Create Root Membership Project
      await membershipPage.createMembershipProject(
        membershipTab,
        data.membershipName,
        'Enterprise Course Academy container'
      );

      // 4. Build Course 1: Recurring Monthly Subscription with Stripe
      const subscriptionCourse: CourseConfig = {
        courseName: data.courseOneName,
        courseSummary: 'Ongoing monthly mentorship syllabus',
        instructorName: data.instructorName,
        instructorBio: 'Seasoned platform educator',
        city: 'Dehradun',
        supportEmail: 'support@flexifunnels.com',
        pricingType: 'subscription',
        currency: 'USD',
        price: '29',
        interval: 'monthly', // Options: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
        duration: 'until_cancelled',
        gatewayName: 'stripe',
        moduleName: 'Foundation Module',
        lessonName: 'Setup Overview',
        youtubeUrl: 'https://youtu.be/9QyiEgv33z4',
        lessonCount: 1, // lessons in this module (each gets the YouTube video above)
      };

      await membershipPage.createCourse(membershipTab, subscriptionCourse);
      await membershipPage.addModuleWithLessons(
        membershipTab,
        subscriptionCourse.courseName,
        subscriptionCourse.moduleName,
        buildLessons(subscriptionCourse)
      );

      // 5. Build Course 2: One-Time Lifetime Access in the Same Project
      const oneTimeCourse: CourseConfig = {
        courseName: data.courseTwoName,
        courseSummary: 'Single payment lifetime training material',
        instructorName: data.instructorTwoName, // new instructor for the 2nd course
        instructorBio: 'Seasoned platform educator',
        city: 'Dehradun',
        supportEmail: 'support@flexifunnels.com',
        pricingType: 'one_time',
        currency: 'USD',
        price: '97',
        moduleName: 'Advanced Playbook',
        lessonName: 'Execution Blueprint',
        youtubeUrl: 'https://youtu.be/9QyiEgv33z4',
        lessonCount: 1, // lessons in this module (each gets the YouTube video above)
      };

      await membershipPage.createCourse(membershipTab, oneTimeCourse);
      await membershipPage.addModuleWithLessons(
        membershipTab,
        oneTimeCourse.courseName,
        oneTimeCourse.moduleName,
        buildLessons(oneTimeCourse)
      );

      // 6. Create Community Group
      await membershipPage.createGroup(
        membershipTab,
        data.groupName,
        'Exclusive Mastermind discussion group',
        true
      );

      // 7. Publish Course 1 Pages & Extract Live Sales Page
      await membershipPage.publishProductPages(membershipTab, data.courseOneName);

      // 8. Launch Live Sales Page in a new tab & Complete Order
      const salesPagePromise = membershipTab.waitForEvent('popup');
      await membershipTab.getByRole('link', { name: 'Visit' }).first().click();
      const salesPageTab = await salesPagePromise;
      await salesPageTab.waitForLoadState('domcontentloaded');

      try {
        await membershipPage.executeLivePurchase(salesPageTab, {
          fullName: data.buyerName,
          email: data.buyerEmail,
        });

        // 9. Verify Thank-you URL reached
        expect(salesPageTab.url()).toContain('thank-you');
      } finally {
        await salesPageTab.close();
      }
    } finally {
      await membershipTab.close();
    }
  });
});