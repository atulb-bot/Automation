import { test, expect, BrowserContext } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { MembershipPage, CourseConfig, PricingInterval, buildLessons } from '../pages/MembershipPage';
import { generateRandomLetters } from '../utils/helpers';
import { TEST_CREDENTIALS } from '../config/test-credentials';
import { TestContext } from '../utils/test-context';
import { FlowReporter } from '../utils/flow-reporter';
import { openSharedContext, markTestFinished, holdWindowOpenAtEnd, ensureLoggedIn } from '../utils/shared-window';
import { ME, testEmail } from '../utils/my-details';

/**
 * One test per course. Each test:
 *   login -> new random project -> course with its own pricing -> module + 1 lesson (YouTube)
 *   -> community group -> product wizard -> landing pages (wait for sections) -> Sales & Checkout -> Save changes -> Visit
 *   -> Enroll now -> checkout -> Stripe card -> Complete Order -> thank-you page (= test passed)
 *
 * INR version of membership-billing-frequencies.spec.ts (same flow, Indian Rupee pricing).
 *
 * Run one:  npx playwright test tests/membership-billing-frequencies-inr.spec.ts -g "Quarterly" --headed
 * Run all:  npx playwright test tests/membership-billing-frequencies-inr.spec.ts --headed
 */

interface CourseRun {
  title: string;         // used in the test title and the random names ("Course Weekly Abcde")
  pricingType: 'subscription' | 'one_time';
  interval?: PricingInterval;
  price: string;
}

// INR prices (₹)
const COURSES: CourseRun[] = [
  // INR prices are ₹1 each (cheap manual Razorpay / Cashfree test payments)
  { title: 'Weekly',    pricingType: 'subscription', interval: 'weekly',      price: '1' },
  { title: 'Monthly',   pricingType: 'subscription', interval: 'monthly',     price: '1' },
  { title: 'Quarterly', pricingType: 'subscription', interval: 'quarterly',   price: '1' },
  { title: '6 Months',  pricingType: 'subscription', interval: 'half_yearly', price: '1' },
  { title: 'Yearly',    pricingType: 'subscription', interval: 'yearly',      price: '1' },
  { title: 'One-Time',  pricingType: 'one_time',                              price: '1' },
];

const LESSONS_PER_MODULE = 1;
/** INR courses are sold through Razorpay (default) or Cashfree; the payment itself is done by hand. */
const INR_GATEWAY: 'razorpay' | 'cashfree' = process.env.INR_GATEWAY === 'cashfree' ? 'cashfree' : 'razorpay';
const YOUTUBE_URL = 'https://youtu.be/9QyiEgv33z4';

test.describe('Membership Billing Frequencies - INR', () => {
  test.setTimeout(20 * 60 * 1000); // 20 min per course: build, publish and live checkout

  // One shared browser window: each pricing flow runs in a new tab; thank-you pages stay open.
  let context: BrowserContext;
  test.beforeAll(async ({ browser }, testInfo) => {
    context = await openSharedContext(browser, testInfo);
  });

  test.afterEach(async ({}, testInfo) => {
    markTestFinished();
    console.log(`\n>>> [${String(testInfo.status).toUpperCase()}] ${testInfo.title} (${(testInfo.duration / 1000).toFixed(1)}s)\n`);
  });

  // After the last flow: keep the window (all thank-you tabs) open until you close it
  test.afterAll(async ({}, testInfo) => {
    await holdWindowOpenAtEnd(context, testInfo);
  });

  for (const run of COURSES) {
    const label = run.pricingType === 'subscription' ? `Subscription ${run.title}` : run.title;

    test(`Course ${run.title} INR (${label})`, async () => {
      const page = await context.newPage(); // new tab in the shared window
      const suffix = generateRandomLetters(6);
      const names = {
        project: `Project ${run.title} INR ${suffix}`,
        course: `Course ${run.title} INR ${suffix}`,
        group: `Community ${run.title} INR ${suffix}`,
        instructor: `Instructor${generateRandomLetters(5)}`,
        buyerName: `${ME.firstName} ${generateRandomLetters(5)}`,
        buyerEmail: testEmail(generateRandomLetters(8).toLowerCase()),
      };
      const loginPage = new LoginPage(page, new TestContext('regular'));
      const membershipPage = new MembershipPage(page);
      const flow = new FlowReporter(`Course ${run.title} INR (${label})`, 7, {
        Project: names.project,
        Course: names.course,
        Pricing: `${label} - ₹${run.price} (INR)`,
      });

      // 1. Login
      await flow.step('Login', async () => {
        await ensureLoggedIn(loginPage, page, TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
        await page.waitForTimeout(3000);
      });

      // 2. Membership app + random project
      const membershipTab = await flow.step('Open membership app & create project', async () => {
        const tab = await membershipPage.launchMembershipApp();
        await membershipPage.createMembershipProject(tab, names.project, `${label} course project`);
        return tab;
      });

      let thankYouUrl = '';
      {
        // 3. Course with this billing frequency
        const course: CourseConfig = {
          courseName: names.course,
          courseSummary: `${label} access course`,
          instructorName: names.instructor,
          instructorBio: 'Seasoned platform educator',
          city: 'Dehradun',
          supportEmail: 'support@flexifunnels.com',
          pricingType: run.pricingType,
          currency: 'INR',
          price: run.price,
          interval: run.interval,
          duration: 'until_cancelled',
          gatewayName: INR_GATEWAY, // Razorpay (default) or Cashfree: INR_GATEWAY=cashfree
          moduleName: `Module ${run.title} INR`,
          lessonName: `Lesson ${run.title} INR`,
          youtubeUrl: YOUTUBE_URL,
          lessonCount: LESSONS_PER_MODULE,
        };
        await flow.step(`Create course (${label})`, () => membershipPage.createCourse(membershipTab, course));

        // 4. Module + lesson(s)
        await flow.step(`Add module & ${LESSONS_PER_MODULE} lesson(s)`, () =>
          membershipPage.addModuleWithLessons(membershipTab, course.courseName, course.moduleName, buildLessons(course))
        );

        // 5. Community group
        await flow.step('Create community group', () =>
          membershipPage.createGroup(membershipTab, names.group, `${label} members group`, true)
        );

        // 6. Product: wizard -> landing pages (sales / checkout / thank-you, waiting for sections)
        //    -> Continue to Sales & Checkout -> Save changes -> Visit
        const salesTab = await flow.step('Landing pages -> Sales & Checkout -> Save changes -> Visit', () =>
          membershipPage.buildLandingPagesAndVisit(membershipTab, names.course)
        );

        // 7. Enroll now -> checkout -> Stripe card -> Complete Order -> thank-you
        await flow.step(`Purchase with ${INR_GATEWAY === 'cashfree' ? 'Cashfree' : 'Razorpay'} (you pay by hand) -> thank-you page`, async () => {
          thankYouUrl = await membershipPage.completeSalesPagePurchase(salesTab, {
            fullName: names.buyerName,
            email: names.buyerEmail,
          }, undefined, INR_GATEWAY);
          expect(thankYouUrl, 'should land on the thank-you page').toMatch(/thank[-_\s]?you/i);
        });

        // Order complete: STOP here. Keep the thank-you tab open and in front; close only this
        // flow's dashboard + builder tabs so the window shows the thank-you pages.
        // (If anything above failed, nothing is closed so you can see where it stopped.)
        await membershipTab.close().catch(() => {});
        await page.close().catch(() => {});
        await salesTab.bringToFront().catch(() => {});
      }

      // Purchase done -> flow complete
      flow.completed({ 'Buyer email': names.buyerEmail, 'Thank-you URL': thankYouUrl, 'Thank-you tab': 'left open' });
    });
  }
});
