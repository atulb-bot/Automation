import { Page, Locator } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { MEMBERSHIP_SELECTORS } from '../config/selectors';
import { Logger } from '../utils/logger';
import { waitForManualStep } from '../utils/manual-assist';
import { PopupHandler } from '../utils/popup-handler';

export type PricingInterval = 'weekly' | 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';

/** The dropdown may call it "6 Months", "Six Months", "Half-yearly" or "Semi-annually". */
const SIX_MONTHS_OPTION = /^\s*((6|six)[\s-]*months?|half[\s-]*year(ly)?|semi[\s-]*annual(ly)?)\b/i;

export interface CourseConfig {
  courseName: string;
  courseSummary: string;
  instructorName: string;
  instructorBio: string;
  city: string;
  supportEmail: string;
  pricingType: 'free' | 'one_time' | 'subscription';
  currency?: 'USD' | 'INR';
  price?: string;
  interval?: PricingInterval;
  duration?: 'until_cancelled' | 'fixed';
  paymentsCount?: string;
  gatewayName?: string;
  moduleName: string;
  lessonName: string;
  youtubeUrl?: string;
  /** How many lessons to add to the module (default 1). Lessons are named "<lessonName> 1..N". */
  lessonCount?: number;
  /** Optional different video per lesson; otherwise youtubeUrl is used for every lesson. */
  youtubeUrls?: string[];
}

export interface LessonSpec {
  name: string;
  youtubeUrl?: string;
}

/** Builds the lesson list for a course config (1 lesson unless lessonCount is set). */
export function buildLessons(config: CourseConfig): LessonSpec[] {
  const count = Math.max(1, config.lessonCount ?? 1);
  return Array.from({ length: count }, (_, i) => ({
    name: count === 1 ? config.lessonName : `${config.lessonName} ${i + 1}`,
    youtubeUrl: config.youtubeUrls?.[i] ?? config.youtubeUrl,
  }));
}

export class MembershipPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async launchMembershipApp(): Promise<Page> {
    Logger.info('MEMBERSHIP', 'Launching Membership Application');

    // FIX (confirmed via two live recordings, both showing this exact
    // click): a FreshChat widget notification ("Close Notifications" inside
    // the fc_widget iframe) appears right after login and again after
    // clicking "Apps" -- it was never dismissed anywhere in this file, which
    // can silently block the clicks that follow if it's sitting on top of
    // them. This method never even clicked "Apps" at all before -- both
    // recordings do, before "Projects" -- so add that too.
    await PopupHandler.dismissKnownPopups(this.page);
    await this.page.getByRole('link', { name: MEMBERSHIP_SELECTORS.appsLink }).click();
    await PopupHandler.dismissKnownPopups(this.page);
    await this.page.waitForTimeout(1000);

    await this.page.getByRole('link', { name: MEMBERSHIP_SELECTORS.projectsLink }).click();
    await this.page.waitForTimeout(2000);

    await this.page.getByRole('button', { name: MEMBERSHIP_SELECTORS.createProjectBtn }).click();
    await this.page.waitForTimeout(1500);

    await this.page.getByRole('button', { name: MEMBERSHIP_SELECTORS.launchCourseOptionBtn }).click();
    await this.page.waitForTimeout(1500);

    const popupPromise = this.page.waitForEvent('popup');
    await this.page.getByRole('button', { name: MEMBERSHIP_SELECTORS.launchBtn, exact: true }).click();
    const membershipTab = await popupPromise;
    await membershipTab.waitForLoadState('domcontentloaded');
    await membershipTab.waitForTimeout(4000);

    return membershipTab;
  }

  async createMembershipProject(membershipTab: Page, name: string, description: string) {
    Logger.info('MEMBERSHIP', `Creating Membership Project: ${name}`);
    const newMembershipBtn = membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.newMembershipBtn, exact: true });
    await newMembershipBtn.waitFor({ state: 'visible', timeout: 20000 });
    await newMembershipBtn.click();
    await membershipTab.waitForTimeout(1500);

    await membershipTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.membershipNameInput }).fill(name);
    await membershipTab.waitForTimeout(500);
    await membershipTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.membershipDescInput }).fill(description);
    await membershipTab.waitForTimeout(500);

    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.createBtn, exact: true }).click();
    await membershipTab.waitForTimeout(5000);
  }

  async applyRandomTemplate(membershipTab: Page): Promise<string> {
    const templates = MEMBERSHIP_SELECTORS.templates;
    const chosenTemplate = templates[Math.floor(Math.random() * templates.length)];
    Logger.info('MEMBERSHIP', `Applying Random Layout Template: "${chosenTemplate}"`);

    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.settingsBtn }).click();
    await membershipTab.waitForTimeout(1500);
    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.generalIdentityBtn }).click();
    await membershipTab.waitForTimeout(1500);
    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.templatesOptionBtn }).click();
    await membershipTab.waitForTimeout(2000);

    await membershipTab.getByRole('button', { name: chosenTemplate }).click();
    await membershipTab.waitForTimeout(1000);
    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.applyTemplateBtn }).click();
    await membershipTab.waitForTimeout(2000);

    const closeBtn = membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.closeModalBtn });
    if (await closeBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      await closeBtn.click();
      await membershipTab.waitForTimeout(1000);
    }

    return chosenTemplate;
  }

  async createGroup(membershipTab: Page, groupName: string, groupDesc: string, isPrivate: boolean = true) {
    Logger.info('MEMBERSHIP', `Creating Group: ${groupName} (Private: ${isPrivate})`);
    await membershipTab.getByRole('link', { name: MEMBERSHIP_SELECTORS.groupsLink }).click();
    await membershipTab.waitForTimeout(2000);

    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.newGroupBtn }).first().click();
    await membershipTab.waitForTimeout(1500);

    if (isPrivate) {
      await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.privateGroupBtn }).click();
    } else {
      await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.publicGroupBtn }).click();
    }
    await membershipTab.waitForTimeout(1000);

    await membershipTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.groupNameInput }).fill(groupName);
    await membershipTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.groupDescInput }).fill(groupDesc);
    await membershipTab.waitForTimeout(1000);

    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.createGroupSubmitBtn }).click();
    await membershipTab.waitForTimeout(3000);
  }

  async createCourse(membershipTab: Page, config: CourseConfig) {
    Logger.info('MEMBERSHIP', `Creating Course: "${config.courseName}" with Pricing: [${config.pricingType.toUpperCase()}]`);
    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.newCourseBtn }).first().click();
    await membershipTab.waitForTimeout(2000);

    await membershipTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.courseNameInput }).fill(config.courseName);
    await membershipTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.courseSummaryInput }).fill(config.courseSummary);
    await membershipTab.locator(MEMBERSHIP_SELECTORS.courseRichEditor).fill(config.courseSummary);
    await membershipTab.waitForTimeout(1000);

    // Instructor Setup - works for the 1st course (empty manager -> "Add your first instructor")
    // and for later courses (manager lists existing instructors -> "+ New/Add instructor").
    await this.createInstructor(membershipTab, config);

    // Pricing Architecture
    // Every option below lives in a dropdown. pickOption() clicks it if it is already
    // showing, otherwise it opens the dropdown ("the bar") first and then picks it.
    const PRICING_TYPES = [MEMBERSHIP_SELECTORS.oneTimePaymentBtn, MEMBERSHIP_SELECTORS.subscriptionBtn];
    const CURRENCIES = [MEMBERSHIP_SELECTORS.currencyUsdBtn, MEMBERSHIP_SELECTORS.currencyInrBtn];
    const INTERVALS: (string | RegExp)[] = [
      MEMBERSHIP_SELECTORS.intervalWeeklyBtn,
      MEMBERSHIP_SELECTORS.intervalMonthlyBtn,
      MEMBERSHIP_SELECTORS.intervalQuarterlyBtn,
      SIX_MONTHS_OPTION,
      MEMBERSHIP_SELECTORS.intervalYearlyBtn,
    ];
    const DURATIONS = [MEMBERSHIP_SELECTORS.untilCancelledBtn, MEMBERSHIP_SELECTORS.fixedPaymentsBtn];

    if (config.pricingType === 'free') {
      await this.pickOption(membershipTab, MEMBERSHIP_SELECTORS.freeAccessBtn, [MEMBERSHIP_SELECTORS.paidAccessBtn], 'Access: Free');
    } else {
      await this.pickOption(membershipTab, MEMBERSHIP_SELECTORS.paidAccessBtn, [MEMBERSHIP_SELECTORS.freeAccessBtn], 'Access: Paid');
      await membershipTab.waitForTimeout(1000);

      const supportEmail = membershipTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.supportEmailInput });
      await supportEmail.waitFor({ state: 'visible', timeout: 15000 });
      await supportEmail.fill(config.supportEmail);
      await membershipTab.waitForTimeout(500);

      if (config.pricingType === 'subscription') {
        await this.pickOption(membershipTab, MEMBERSHIP_SELECTORS.subscriptionBtn, PRICING_TYPES, 'Pricing type: Subscription');

        // Currency
        const currency = config.currency === 'INR' ? MEMBERSHIP_SELECTORS.currencyInrBtn : MEMBERSHIP_SELECTORS.currencyUsdBtn;
        await this.pickOption(membershipTab, currency, CURRENCIES, `Currency: ${config.currency ?? 'USD'}`);

        // Price
        await this.fillAmount(membershipTab, config.price || '25');

        // Intervals (Monthly, Weekly, Quarterly, Yearly)
        const intervalMap: Record<PricingInterval, string | RegExp> = {
          weekly: MEMBERSHIP_SELECTORS.intervalWeeklyBtn,
          monthly: MEMBERSHIP_SELECTORS.intervalMonthlyBtn,
          quarterly: MEMBERSHIP_SELECTORS.intervalQuarterlyBtn,
          half_yearly: SIX_MONTHS_OPTION,
          yearly: MEMBERSHIP_SELECTORS.intervalYearlyBtn,
        };
        const interval = intervalMap[config.interval ?? 'monthly'];
        await this.pickOption(membershipTab, interval, INTERVALS, `Interval: ${config.interval ?? 'monthly'}`);

        // Duration
        if (config.duration === 'fixed' && config.paymentsCount) {
          await this.pickOption(membershipTab, MEMBERSHIP_SELECTORS.fixedPaymentsBtn, DURATIONS, 'Duration: Fixed');
          await membershipTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.numberOfPaymentsInput }).fill(config.paymentsCount);
        } else {
          await this.pickOption(membershipTab, MEMBERSHIP_SELECTORS.untilCancelledBtn, DURATIONS, 'Duration: Until Cancelled');
        }
        await membershipTab.waitForTimeout(500);

        // Gateway
        if (config.gatewayName) {
          await this.selectGateway(membershipTab, config.gatewayName);
        }
      } else {
        // One-time payment setup
        await this.pickOption(membershipTab, MEMBERSHIP_SELECTORS.oneTimePaymentBtn, PRICING_TYPES, 'Pricing type: One-Time');
        // USD is the default for one-time, so only INR needs picking (USD path unchanged)
        if (config.currency === 'INR') {
          await this.pickOption(membershipTab, MEMBERSHIP_SELECTORS.currencyInrBtn, CURRENCIES, 'Currency: INR');
        }
        await this.fillAmount(membershipTab, config.price || '99', false);
      }
    }

    // FIX (confirmed via two live recordings -- present in BOTH, regardless
    // of pricing type): a star-rating field ("★" opener button -> pick a
    // specific rating option, e.g. "3.0 ★" / "4.0 ★") appears right before
    // "Create Course" and was never handled anywhere in this file. If it's a
    // required field, leaving it unset could silently block course
    // creation. Best-effort: open it if present, pick a reasonable
    // mid-range rating.
    const ratingOpener = membershipTab.getByRole('button', { name: '★', exact: true });
    if (await ratingOpener.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ratingOpener.click();
      await membershipTab.waitForTimeout(500);
      const ratingOption = membershipTab.getByRole('button', { name: /^(3\.0|4\.0)\s*★/ }).first();
      if (await ratingOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await ratingOption.click();
        await membershipTab.waitForTimeout(500);
      }
    }

    // Submit Course Creation
    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.createCourseSubmitBtn }).click();
    
    // CRITICAL WAIT: FlexiFunnels backend compiles the project, generates bundle links, and provisions product records
    Logger.info('MEMBERSHIP', 'Waiting 10s for platform backend to auto-generate the synchronized product & pricing...');
    await membershipTab.waitForTimeout(10000);
  }

  /** Kept for older callers: one module with a single lesson. */
  async addModuleAndLesson(membershipTab: Page, moduleName: string, lessonName: string, youtubeUrl?: string, courseName?: string) {
    await this.addModuleWithLessons(membershipTab, courseName ?? '', moduleName, [{ name: lessonName, youtubeUrl }]);
  }

  /**
   * After "Create Course":
   *   1. open the course   2. Add Module   3. click the module to open it
   *   4. add every lesson (name + YouTube video), saving each one.
   */
  async addModuleWithLessons(membershipTab: Page, courseName: string, moduleName: string, lessons: LessonSpec[]) {
    Logger.info('MEMBERSHIP', `Adding Module "${moduleName}" with ${lessons.length} lesson(s)`);

    // 1. Open the course so the curriculum (Add Module) is showing
    await this.openCourse(membershipTab, courseName);

    // 2. Add Module
    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.addModuleBtn }).first().click();
    const moduleInput = membershipTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.moduleNameInput });
    await moduleInput.waitFor({ state: 'visible', timeout: 15000 });
    await moduleInput.fill(moduleName);
    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.confirmAddModuleBtn, exact: true }).click();
    await membershipTab.waitForTimeout(3000);

    // 3 + 4. Lessons
    for (let i = 0; i < lessons.length; i++) {
      const lesson = lessons[i];
      Logger.info('MEMBERSHIP', `Lesson ${i + 1}/${lessons.length}: "${lesson.name}"`);
      await this.openLessonEditor(membershipTab, moduleName, i);

      const lessonNameBox = membershipTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.lessonNameInput });
      await lessonNameBox.waitFor({ state: 'visible', timeout: 15000 });
      await lessonNameBox.fill(lesson.name);
      await membershipTab.waitForTimeout(800);

      if (lesson.youtubeUrl) {
        await this.attachYoutubeVideo(membershipTab, lesson.youtubeUrl);
      }

      const saveBtn = membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.saveChangesBtn });
      await saveBtn.waitFor({ state: 'visible', timeout: 15000 });
      await saveBtn.click();
      await membershipTab.waitForTimeout(4000);
      Logger.info('MEMBERSHIP', `Lesson ${i + 1}/${lessons.length} saved.`);
    }
  }

  async publishProductPages(membershipTab: Page, courseName: string): Promise<string> {
    Logger.info('MEMBERSHIP', `Locating synced product and publishing pages for: ${courseName}`);
    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.productsMenuBtn }).click();
    await membershipTab.getByRole('link', { name: MEMBERSHIP_SELECTORS.myProductsLink }).click();
    await membershipTab.waitForTimeout(3000);

    const searchInput = membershipTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.searchProductInput });
    await searchInput.fill(courseName);
    // FIX: one of the two live recordings explicitly clicked a "Search"
    // (exact) button after filling this box, rather than pressing Enter --
    // support both since either can be the one that actually triggers the
    // filter on a given render.
    const searchBtn = membershipTab.getByRole('button', { name: 'Search', exact: true });
    if (await searchBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchBtn.click();
    } else {
      await searchInput.press('Enter');
    }
    await membershipTab.waitForTimeout(3000);

    // Open product
    await membershipTab.getByRole('button', { name: new RegExp(courseName, 'i') }).first().click();
    await membershipTab.waitForTimeout(2000);

    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.continueToPaymentPricingBtn }).click();
    await membershipTab.waitForTimeout(1500);
    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.continueToAfterPurchaseBtn }).click();
    await membershipTab.waitForTimeout(1500);
    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.continueToLandingPageBtn }).click();
    await membershipTab.waitForTimeout(2500);

    const startDesigning = membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.startDesigningBtn });
    if (await startDesigning.isVisible({ timeout: 5000 }).catch(() => false)) {
      await startDesigning.click();
      await membershipTab.waitForTimeout(2000);
    }

    // 1. Publish Sales Page
    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.editBtn }).first().click();
    await membershipTab.waitForTimeout(1500);
    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.publishSalesPageBtn }).click();
    Logger.info('MEMBERSHIP', 'Sales Page published. Waiting 4s...');
    await membershipTab.waitForTimeout(4000);

    // 2. Publish Checkout Page
    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.checkoutPageTabBtn, exact: true }).click();
    await membershipTab.waitForTimeout(1500);
    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.editBtn }).first().click();
    await membershipTab.waitForTimeout(1500);
    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.publishCheckoutPageBtn }).click();
    Logger.info('MEMBERSHIP', 'Checkout Page published. Waiting 4s...');
    await membershipTab.waitForTimeout(4000);

    // 3. Publish Thank-you Page
    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.thankyouPageTabBtn }).click();
    await membershipTab.waitForTimeout(1500);
    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.publishThankyouPageBtn }).click();
    Logger.info('MEMBERSHIP', 'Thank-you Page published. Waiting 4s...');
    await membershipTab.waitForTimeout(4000);

    // Navigate to Sales & Checkout link tab to extract published URL
    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.salesAndCheckoutTabBtn }).click();
    await membershipTab.waitForTimeout(2000);

    return courseName;
  }

  async executeLivePurchase(salesPageTab: Page, buyerData: { fullName: string; email: string }) {
    Logger.info('MEMBERSHIP', `Completing live course enrollment for buyer: ${buyerData.fullName}`);

    // FIX (confirmed via live recording): the recording explicitly clicked
    // the SECOND "Enroll now" link (.nth(1)), not the first -- this page
    // template apparently renders one earlier in the layout (e.g. a nav/hero
    // link) that isn't the real checkout CTA. Using .first() here risked
    // clicking the wrong one.
    const enrollBtn = salesPageTab.getByRole('link', { name: MEMBERSHIP_SELECTORS.enrollNowBtn }).nth(1);
    const enrollBtnReady = await enrollBtn.isVisible({ timeout: 8000 }).catch(() => false);
    if (enrollBtnReady) {
      await enrollBtn.click();
    } else {
      // Fall back to the first match if a second one doesn't exist on this
      // particular template.
      const firstEnrollBtn = salesPageTab.getByRole('link', { name: MEMBERSHIP_SELECTORS.enrollNowBtn }).first();
      await firstEnrollBtn.waitFor({ state: 'visible', timeout: 20000 });
      await firstEnrollBtn.click();
    }
    await salesPageTab.waitForTimeout(3000);

    // Fill customer contact fields
    await salesPageTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.checkoutFirstNameInput }).fill(buyerData.fullName);
    await salesPageTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.checkoutEmailInput }).fill(buyerData.email);
    await salesPageTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.checkoutPhoneInput }).fill('9876543210');
    await salesPageTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.checkoutBillingAddress }).fill('Green Park Colony');
    await salesPageTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.checkoutCity }).fill('Dehradun');
    await salesPageTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.checkoutState }).fill('Uttarakhand');
    await salesPageTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.checkoutCountry }).fill('India');
    await salesPageTab.waitForTimeout(1000);

    // FIX (confirmed via live recording): the recording explicitly selected
    // a pricing-plan radio button before touching the card fields --
    // executeLivePurchase() never selected one at all. If a product has more
    // than one active price plan (or even just one that still needs
    // explicit selection), skipping this could leave no plan chosen and
    // silently block "Complete Order". Best-effort: select the first visible
    // plan radio if one renders.
    const planRadio = salesPageTab.getByRole('radio').first();
    if (await planRadio.isVisible({ timeout: 4000 }).catch(() => false)) {
      await planRadio.check().catch(() => {});
      await salesPageTab.waitForTimeout(500);
    }

    // Stripe iframe card elements (dynamic frame match)
    const stripeFrame = salesPageTab.frameLocator('iframe[name^="__privateStripeFrame"]').first();
    const cardInput = stripeFrame.getByRole('textbox', { name: 'Card number' });
    await cardInput.waitFor({ state: 'visible', timeout: 20000 });
    await cardInput.fill('4242 4242 4242 4242');
    await salesPageTab.waitForTimeout(500);

    await stripeFrame.getByRole('textbox', { name: 'Expiry date' }).fill('02 / 36');
    await salesPageTab.waitForTimeout(500);
    await stripeFrame.getByRole('textbox', { name: 'Security code' }).fill('225');
    await salesPageTab.waitForTimeout(1000);

    // Terms & Submit
    const terms = salesPageTab.getByRole('checkbox', { name: MEMBERSHIP_SELECTORS.termsCheckbox });
    if (await terms.isVisible({ timeout: 3000 }).catch(() => false)) {
      await terms.check();
      await salesPageTab.waitForTimeout(500);
    }

    await salesPageTab.getByRole('link', { name: MEMBERSHIP_SELECTORS.completeOrderLink }).click();
    Logger.info('MEMBERSHIP', 'Order submitted. Awaiting order confirmation and thank-you redirect...');
    await salesPageTab.waitForURL(/.*thank-you.*/, { timeout: 45000 });
    await salesPageTab.waitForTimeout(5000);
  }
  // ───────────────────────── recorded sales-page purchase flow ─────────────────────────

  /**
   * Product flow for a NEWLY created course:
   *   Products -> My Products -> search -> product -> Continue to Payment & Pricing
   *   -> Continue to After Purchase -> Continue to Landing page -> [Don't show this again] -> Start designing
   *   -> LANDING PAGES (same steps as publishProductPages, now with waits until sections are generated):
   *        Sales page:     wait -> Edit -> Publish sales page -> wait
   *        Checkout page:  tab -> wait -> Edit -> Publish checkout page -> wait
   *        Thank-you page: tab -> wait -> Edit -> Publish thank-you page -> wait
   *   -> Continue to Sales & Checkout -> Save changes -> Visit (returns the live sales page tab)
   */
  async buildLandingPagesAndVisit(tab: Page, courseName: string): Promise<Page> {
    const click = async (name: string | RegExp, label: string, opts: { exact?: boolean; timeout?: number; optional?: boolean; first?: boolean } = {}) => {
      const btn = tab.getByRole('button', { name, exact: opts.exact });
      // Wait for it, then take the FIRST visible match (same as the original .click()/.first())
      const found = await this.waitForAny(btn, opts.timeout ?? 30000);
      const el = found ? ((await this.visibleOf(btn))[0] ?? found) : null;
      if (!el) {
        if (opts.optional) return false;
        await this.dumpDiagnostics(tab, `product-${label}`);
        throw new Error(`Product flow: "${label}" button did not appear.`);
      }
      const end = Date.now() + 15000;
      while (!(await el.isEnabled().catch(() => true)) && Date.now() < end) await tab.waitForTimeout(500);
      await el.scrollIntoViewIfNeeded().catch(() => {});
      await el.click();
      Logger.info('MEMBERSHIP', `Clicked "${label}"`);
      return true;
    };

    // 1. Products -> My Products -> search -> product (unchanged from publishProductPages)
    await click(MEMBERSHIP_SELECTORS.productsMenuBtn, 'Products');
    const myProducts = tab.getByRole('link', { name: MEMBERSHIP_SELECTORS.myProductsLink });
    await myProducts.waitFor({ state: 'visible', timeout: 15000 });
    await myProducts.click();
    await tab.waitForTimeout(3000);

    const searchInput = tab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.searchProductInput });
    if (await searchInput.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)) {
      await searchInput.fill(courseName);
      const searchBtn = tab.getByRole('button', { name: 'Search', exact: true });
      if (await searchBtn.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false)) {
        await searchBtn.click();
      } else {
        await searchInput.press('Enter');
      }
      await tab.waitForTimeout(3000);
    }
    const esc = courseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const product = await this.waitForAny(tab.getByRole('button', { name: new RegExp(esc, 'i') }), 20000);
    if (!product) {
      await this.dumpDiagnostics(tab, 'my-products');
      throw new Error(`Product for "${courseName}" not found in My Products.`);
    }
    await product.click();
    Logger.info('MEMBERSHIP', `Opened product "${courseName}"`);
    await tab.waitForTimeout(2000);

    // 2. Wizard steps
    await click(MEMBERSHIP_SELECTORS.continueToPaymentPricingBtn, 'Continue to Payment & Pricing');
    await tab.waitForTimeout(1500);
    await click(MEMBERSHIP_SELECTORS.continueToAfterPurchaseBtn, 'Continue to After Purchase');
    await tab.waitForTimeout(1500);
    await click(MEMBERSHIP_SELECTORS.continueToLandingPageBtn, 'Continue to Landing page');
    await tab.waitForTimeout(2500);

    // 3. Intro pop-up (optional): "Don't show this again" + Start designing
    const dontShow = tab.getByRole('checkbox', { name: /don.?t\s*show\s*this\s*again/i });
    if (await dontShow.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)) {
      await dontShow.check({ timeout: 5000 }).catch(() => {});
    }
    if (await click(MEMBERSHIP_SELECTORS.startDesigningBtn, 'Start designing', { timeout: 15000, optional: true })) {
      await tab.waitForTimeout(2000);
    }

    // 4. LANDING PAGES - same publish steps as before, waiting for sections each time
    // 4a. Sales page
    await this.waitForPageGeneration(tab, 'Sales page');
    await click(MEMBERSHIP_SELECTORS.editBtn, 'Edit (sales page)', { first: true, timeout: 60000 });
    await tab.waitForTimeout(1500);
    await click(MEMBERSHIP_SELECTORS.publishSalesPageBtn, 'Publish sales page', { timeout: 60000 });
    await this.waitForPageGeneration(tab, 'Sales page publish');

    // 4b. Checkout page
    await click(MEMBERSHIP_SELECTORS.checkoutPageTabBtn, 'Checkout Page', { exact: true, timeout: 60000 });
    await this.waitForPageGeneration(tab, 'Checkout page');
    await click(MEMBERSHIP_SELECTORS.editBtn, 'Edit (checkout page)', { first: true, timeout: 60000 });
    await tab.waitForTimeout(1500);
    await click(MEMBERSHIP_SELECTORS.publishCheckoutPageBtn, 'Publish checkout page', { timeout: 60000 });
    await this.waitForPageGeneration(tab, 'Checkout page publish');

    // 4c. Thank-you page
    // exact: "Thank-you Page" must not match the "Publish thank-you page" button
    await click(MEMBERSHIP_SELECTORS.thankyouPageTabBtn, 'Thank-you Page', { exact: true, timeout: 60000 });
    await this.waitForPageGeneration(tab, 'Thank-you page');
    await click(MEMBERSHIP_SELECTORS.editBtn, 'Edit (thank-you page)', { first: true, timeout: 60000 });
    await tab.waitForTimeout(1500);
    await click(MEMBERSHIP_SELECTORS.publishThankyouPageBtn, 'Publish thank-you page', { timeout: 60000 });
    await this.waitForPageGeneration(tab, 'Thank-you page publish');

    // 5. NEXT SECTION: Continue to Sales & Checkout -> Save changes
    await click(/continue\s*to\s*sales\s*&\s*checkout/i, 'Continue to Sales & Checkout', { timeout: 60000 });
    await tab.waitForTimeout(2500);
    await click(/^\s*save\s*changes\s*$/i, 'Save changes', { timeout: 30000 });
    await tab.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await tab.waitForTimeout(3000);

    // 6. Visit -> live sales page in a new tab
    const visit = tab.getByRole('link', { name: MEMBERSHIP_SELECTORS.visitPageLink }).first();
    if (!(await visit.waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false))) {
      await this.dumpDiagnostics(tab, 'visit');
      throw new Error('"Visit" link did not appear after Save changes.');
    }
    const popupPromise = tab.waitForEvent('popup', { timeout: 30000 });
    await visit.click();
    const salesTab = await popupPromise;
    await salesTab.waitForLoadState('domcontentloaded');
    Logger.info('MEMBERSHIP', `Live sales page opened: ${salesTab.url()}`);
    return salesTab;
  }

  /**
   * Waits until the builder has finished generating a page's sections:
   * no spinners / progress bars / "Generating..." / "Loading..." text in the page or its frames,
   * steady for 5 seconds. Always waits at least 5s; gives up waiting (and carries on) after 3 minutes.
   */
  private async waitForPageGeneration(tab: Page, label: string, maxMs = 180000) {
    Logger.info('MEMBERSHIP', `Waiting for ${label} sections to finish generating...`);
    const start = Date.now();
    await tab.waitForTimeout(5000);
    let quietSince = 0;
    let lastLog = Date.now();

    const isBusy = async (): Promise<boolean> => {
      for (const frame of tab.frames()) {
        const busy = await frame
          .evaluate(() => {
            const vis = (el: Element) => {
              const r = (el as HTMLElement).getBoundingClientRect();
              const cs = getComputedStyle(el as HTMLElement);
              return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
            };
            const spinner = Array.from(
              document.querySelectorAll('.animate-spin, .spinner, .loader, .loading, [aria-busy="true"], [role="progressbar"], .skeleton, .animate-pulse')
            ).some(vis);
            if (spinner) return true;
            const re = /(generat|creating|building|preparing|loading|please\s*wait)/i;
            return Array.from(document.querySelectorAll('body *')).some((el) => {
              if (el.children.length) return false;
              const t = (el.textContent || '').trim();
              return t.length > 0 && t.length < 80 && re.test(t) && vis(el);
            });
          })
          .catch(() => false);
        if (busy) return true;
      }
      return false;
    };

    while (Date.now() - start < maxMs) {
      if (await isBusy()) {
        quietSince = 0;
      } else if (!quietSince) {
        quietSince = Date.now();
      } else if (Date.now() - quietSince >= 5000) {
        Logger.info('MEMBERSHIP', `${label} ready (${((Date.now() - start) / 1000).toFixed(0)}s)`);
        return;
      }
      if (Date.now() - lastLog > 15000) {
        Logger.info('MEMBERSHIP', `...still generating ${label} (${((Date.now() - start) / 1000).toFixed(0)}s)`);
        lastLog = Date.now();
      }
      await tab.waitForTimeout(1000);
    }
    Logger.info('MEMBERSHIP', `${label}: still showing activity after ${maxMs / 1000}s - continuing anyway`);
  }

  /**
   * Recorded flow: Products -> My Products -> open this course's product
   * -> "Sales & Checkout page" -> "Visit" (opens the live sales page in a new tab).
   */
  async openLiveSalesPage(tab: Page, courseName: string): Promise<Page> {
    const esc = courseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    await tab.getByRole('button', { name: MEMBERSHIP_SELECTORS.productsMenuBtn }).first().click();
    const myProducts = tab.getByRole('link', { name: MEMBERSHIP_SELECTORS.myProductsLink });
    await myProducts.waitFor({ state: 'visible', timeout: 15000 });
    await myProducts.click();
    await tab.waitForTimeout(2500);

    // The product card reads e.g. "Live Course Yearly NPMyjA ID ..."
    const productBtn = tab.getByRole('button', { name: new RegExp(esc, 'i') });
    let product = await this.waitForAny(productBtn, 15000);
    if (!product) {
      // Not on the first screen - search for it
      const search = tab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.searchProductInput });
      if (await search.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
        await search.fill(courseName);
        await search.press('Enter');
        product = await this.waitForAny(productBtn, 15000);
      }
    }
    if (!product) {
      await this.dumpDiagnostics(tab, 'my-products');
      throw new Error(`Product for "${courseName}" not found in My Products.`);
    }
    Logger.info('MEMBERSHIP', `Opening product "${courseName}"`);
    await product.click();

    const salesTabBtn = tab.getByRole('button', { name: MEMBERSHIP_SELECTORS.salesAndCheckoutTabBtn });
    await salesTabBtn.waitFor({ state: 'visible', timeout: 20000 });
    await salesTabBtn.click();

    const visit = tab.getByRole('link', { name: MEMBERSHIP_SELECTORS.visitPageLink }).first();
    await visit.waitFor({ state: 'visible', timeout: 20000 });
    const popupPromise = tab.waitForEvent('popup', { timeout: 30000 });
    await visit.click();
    const salesTab = await popupPromise;
    await salesTab.waitForLoadState('domcontentloaded');
    Logger.info('MEMBERSHIP', `Live sales page opened: ${salesTab.url()}`);
    return salesTab;
  }

  /**
   * Recorded flow on the live sales page:
   *   "Enroll now" (top navigation) -> First Name, Email, Phone, Billing Address (+ City if shown)
   *   -> plan option -> Terms -> select Stripe -> WAIT for the card pop-up -> card details
   *   -> Complete Order -> thank-you page.
   * Returns the thank-you URL. Every wait has a time limit.
   */
  async completeSalesPagePurchase(
    salesTab: Page,
    buyer: { fullName: string; email: string; phone?: string; address?: string; city?: string },
    card = { number: '4242 4242 4242 4242', expiry: '02 / 36', cvc: '225', postal: '248001' },
    /** 'stripe' = card filled by the script; 'razorpay' / 'cashfree' = you pay in the gateway's window */
    gateway: 'stripe' | 'razorpay' | 'cashfree' = 'stripe'
  ): Promise<string> {
    const THANK_YOU = /thank[-_\s]?you/i;
    const GW = gateway === 'razorpay' ? 'Razorpay' : gateway === 'cashfree' ? 'Cashfree' : 'Stripe';

    // 1. Enroll now - the one in the top navigation (as recorded), else any other one
    const navEnroll = salesTab.getByRole('navigation').getByRole('link', { name: /enroll\s*now/i });
    const anyEnroll = salesTab.getByRole('link', { name: /enroll\s*now/i }).or(salesTab.getByRole('button', { name: /enroll\s*now/i }));
    const enroll = (await this.waitForAny(navEnroll, 20000)) ?? (await this.waitForAny(anyEnroll, 10000));
    if (!enroll) {
      await this.dumpDiagnostics(salesTab, 'enroll-now');
      throw new Error('"Enroll now" button not found on the live sales page.');
    }
    await enroll.scrollIntoViewIfNeeded().catch(() => {});
    await enroll.click();
    Logger.info('MEMBERSHIP', 'Clicked "Enroll now"');

    // 2. Checkout form
    const firstName = salesTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.checkoutFirstNameInput });
    if (!(await firstName.waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false))) {
      await this.dumpDiagnostics(salesTab, 'checkout-form');
      throw new Error('Checkout form (First Name) did not appear after "Enroll now".');
    }
    await firstName.fill(buyer.fullName);
    await salesTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.checkoutEmailInput }).fill(buyer.email, { timeout: 10000 });
    // Optional fields - only filled if this checkout shows them (the recorded checkout has only name + email)
    for (const [name, value] of [
      [MEMBERSHIP_SELECTORS.checkoutPhoneInput, buyer.phone ?? '1234567890'],
      [MEMBERSHIP_SELECTORS.checkoutBillingAddress, buyer.address ?? 'Dehradun'],
      [MEMBERSHIP_SELECTORS.checkoutCity, buyer.city ?? 'Dehradun'],
      [MEMBERSHIP_SELECTORS.checkoutState, 'Uttarakhand'],
      [MEMBERSHIP_SELECTORS.checkoutCountry, 'India'],
    ] as const) {
      const box = salesTab.getByRole('textbox', { name, exact: true });
      if (await box.isVisible().catch(() => false)) await box.fill(value, { timeout: 5000 }).catch(() => {});
    }
    Logger.info('MEMBERSHIP', 'Checkout details filled');

    // 3. Plan option (a ".form-check" that is NOT the Terms box or a gateway), only if one is shown
    const plan = salesTab.locator('.form-check').filter({ hasNotText: /terms|stripe|paypal|razorpay|cashfree/i }).filter({ has: salesTab.locator('input[type="radio"]') });
    const planEl = (await this.visibleOf(plan))[0];
    if (planEl && !(await planEl.locator('input[type="radio"]').first().isChecked().catch(() => false))) {
      await planEl.click({ timeout: 5000 }).catch(() => {});
      await salesTab.waitForTimeout(500);
    }

    // 4. Terms
    const terms = salesTab.getByRole('checkbox', { name: MEMBERSHIP_SELECTORS.termsCheckbox });
    if (await terms.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
      await terms.check({ timeout: 5000 }).catch(async () => terms.click({ force: true }));
    }

    if (gateway === 'stripe') {
      // 5. Select Stripe exactly as recorded: #stripe-ref-0 first, then the "Stripe" text.
      //    Then WAIT for the card pop-up to load.
      const stripeRef = salesTab.locator('#stripe-ref-0');
      let stripeSelected = false;
      if (await stripeRef.waitFor({ state: 'attached', timeout: 15000 }).then(() => true).catch(() => false)) {
        await stripeRef.scrollIntoViewIfNeeded().catch(() => {});
        await stripeRef.click({ timeout: 10000 }).catch(async () => stripeRef.click({ force: true, timeout: 5000 }).catch(() => {}));
        stripeSelected = true;
      } else {
        // Fallback: a Stripe radio / option by name
        const radio = await this.waitForAny(salesTab.getByRole('radio', { name: /stripe/i }), 5000);
        if (radio) {
          await radio.click({ timeout: 10000 }).catch(() => {});
          stripeSelected = true;
        }
      }
      const stripeText = salesTab.getByText(/^\s*stripe\s*$/i).first();
      if (await stripeText.isVisible().catch(() => false)) {
        await stripeText.click({ timeout: 5000 }).catch(() => {});
        stripeSelected = true;
      }
      Logger.info(
        'MEMBERSHIP',
        stripeSelected ? 'Selected Stripe - waiting for the card details pop-up...' : 'No Stripe option found - using the card fields on the page'
      );

      await this.fillStripeCard(salesTab, card);
    } else {
      // 5. Razorpay / Cashfree: choose the gateway on the checkout (no card on this page)
      await this.selectGatewayOnCheckout(salesTab, gateway, GW);
    }

    // 6. Complete Order -> thank-you page
    const complete = salesTab
      .getByRole('link', { name: /complete\s*order/i })
      .or(salesTab.getByRole('button', { name: /complete\s*order/i }));
    const completeBtn = await this.waitForAny(complete, 15000);
    if (!completeBtn) {
      await this.dumpDiagnostics(salesTab, 'complete-order');
      throw new Error('"Complete Order" button not found.');
    }
    await completeBtn.click();
    Logger.info('MEMBERSHIP', 'Order submitted - waiting for the thank-you page...');

    if (gateway !== 'stripe') {
      // The gateway window opens: the payment is done BY HAND, then the run carries on at the Thank You page
      let thanksUrl = '';
      const thankYouSeen = async () => {
        for (const p of salesTab.context().pages()) {
          if (!p.isClosed() && THANK_YOU.test(p.url())) { thanksUrl = p.url(); return true; }
        }
        return false;
      };
      const paid = await waitForManualStep(salesTab, `Pay in the ${GW} window`,
        `Complete the test payment in the ${GW} window (pop-up or new page). The test carries on when the Thank You page shows.`,
        thankYouSeen, Math.max(Number(process.env.MANUAL_WAIT_MIN || 0), 15));
      if (!paid || !(thanksUrl || (await thankYouSeen()))) {
        await this.dumpDiagnostics(salesTab, `${gateway}-payment`);
        throw new Error(`The ${GW} payment was not completed - the Thank You page did not appear.`);
      }
      Logger.info('MEMBERSHIP', `Thank-you page reached after the ${GW} payment: ${thanksUrl}`);
      return thanksUrl;
    }

    let reached = await salesTab.waitForURL(THANK_YOU, { timeout: 60000 }).then(() => true).catch(() => false);
    if (!reached) {
      // Some card pop-ups have their own Pay / Submit button
      const pay = await this.waitForAny(salesTab.getByRole('button', { name: /^\s*(pay|submit|confirm)\b/i }), 3000);
      if (pay) {
        await pay.click().catch(() => {});
        reached = await salesTab.waitForURL(THANK_YOU, { timeout: 45000 }).then(() => true).catch(() => false);
      }
    }
    if (!reached) {
      await this.dumpDiagnostics(salesTab, 'thank-you');
      throw new Error(`Did not reach the thank-you page after Complete Order. Current URL: ${salesTab.url()}`);
    }
    await salesTab.waitForLoadState('domcontentloaded').catch(() => {});
    Logger.info('MEMBERSHIP', `Thank-you page reached: ${salesTab.url()}`);
    return salesTab.url();
  }

  /** Picks Razorpay / Cashfree as the payment gateway on the checkout page and checks it is selected. */
  private async selectGatewayOnCheckout(tab: Page, gateway: string, label: string): Promise<void> {
    const name = new RegExp(gateway, 'i');
    const ref = tab.locator(`[id^="${gateway}-ref"], input[value*="${gateway}" i]`).first();
    const radio = tab.getByRole('radio', { name }).first();
    const text = tab.getByText(new RegExp(`^\\s*${label}\\s*$`, 'i')).first();
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (await ref.count().catch(() => 0)) await ref.click({ timeout: 8000 }).catch(async () => ref.click({ force: true, timeout: 5000 }).catch(() => {}));
      if (await radio.isVisible().catch(() => false)) await radio.check({ timeout: 5000 }).catch(() => {});
      if (await text.isVisible().catch(() => false)) await text.click({ timeout: 5000 }).catch(() => {});
      await tab.waitForTimeout(800);
      const on = (await ref.isChecked().catch(() => null)) ?? (await radio.isChecked().catch(() => null));
      if (on === null) { Logger.info('MEMBERSHIP', `Only one gateway on this checkout - using it (${label} expected)`); return; }
      if (on) { Logger.info('MEMBERSHIP', `Selected ${label} as the payment gateway`); return; }
    }
    await this.dumpDiagnostics(tab, `${gateway}-not-selected`);
    throw new Error(`Could not select ${label} on the checkout page.`);
  }

  /**
   * Waits (up to 60s) for Stripe's card fields to load, then fills them.
   * Works whether Stripe shows one combined card field or separate number/expiry/CVC frames.
   */
  private async fillStripeCard(tab: Page, card: { number: string; expiry: string; cvc: string; postal: string }) {
    type Field = { label: string; value: string; locate: (f: import('@playwright/test').Frame) => Locator; required: boolean };
    const fields: Field[] = [
      { label: 'card number', value: card.number, required: true,
        locate: (f) => f.getByRole('textbox', { name: /card\s*number/i }).or(f.locator('input[name="cardnumber"], input[autocomplete="cc-number"]')) },
      { label: 'expiry', value: card.expiry, required: true,
        locate: (f) => f.getByRole('textbox', { name: /expir/i }).or(f.locator('input[name="exp-date"], input[autocomplete="cc-exp"]')) },
      { label: 'CVC', value: card.cvc, required: true,
        locate: (f) => f.getByRole('textbox', { name: /security\s*code|cvc|cvv/i }).or(f.locator('input[name="cvc"], input[autocomplete="cc-csc"]')) },
      { label: 'postal code', value: card.postal, required: false,
        locate: (f) => f.getByRole('textbox', { name: /zip|postal/i }).or(f.locator('input[name="postal"], input[autocomplete="postal-code"]')) },
    ];

    const findField = async (field: Field): Promise<Locator | null> => {
      for (const frame of tab.frames()) {
        const isStripe = /__privateStripeFrame|js\.stripe\.com/i.test(frame.name() + ' ' + frame.url());
        if (!isStripe) continue;
        const el = field.locate(frame).first();
        if (await el.isVisible().catch(() => false)) return el;
      }
      return null;
    };

    // Wait for the card number field (the pop-up can take a while)
    const end = Date.now() + 60000;
    let cardNumber: Locator | null = null;
    while (Date.now() < end && !(cardNumber = await findField(fields[0]))) await tab.waitForTimeout(1000);
    if (!cardNumber) {
      await this.dumpDiagnostics(tab, 'stripe-card');
      throw new Error('Stripe card details did not load within 60s after selecting Stripe.');
    }
    await tab.waitForTimeout(1000); // let the pop-up finish rendering
    Logger.info('MEMBERSHIP', 'Card details pop-up loaded - entering card');

    for (const field of fields) {
      const el = field === fields[0] ? cardNumber : await findField(field);
      if (!el) {
        if (field.required) {
          await this.dumpDiagnostics(tab, `stripe-${field.label}`);
          throw new Error(`Stripe ${field.label} field not found.`);
        }
        continue;
      }
      await el.click({ timeout: 10000 });
      await el.fill(field.value, { timeout: 10000 });
      await tab.waitForTimeout(500);
    }
  }

  // ───────────────────────── dropdown / course / video helpers ─────────────────────────

  /** Visible elements of a locator, in DOM order. */
  private async visibleOf(loc: Locator, max = 20): Promise<Locator[]> {
    const out: Locator[] = [];
    const n = Math.min(await loc.count().catch(() => 0), max);
    for (let i = 0; i < n; i++) {
      const el = loc.nth(i);
      if (await el.isVisible().catch(() => false)) out.push(el);
    }
    return out;
  }

  /** Anything that can be a dropdown option with this exact label. */
  private optionLocator(tab: Page, name: string | RegExp): Locator {
    const o = typeof name === 'string' ? { name, exact: true } : { name };
    return tab
      .getByRole('button', o)
      .or(tab.getByRole('option', o))
      .or(tab.getByRole('menuitem', o))
      .or(tab.getByRole('radio', o))
      .or(tab.getByRole('menuitemradio', o));
  }

  /**
   * Selects `option` in a custom dropdown.
   *  - already visible   -> click it (if that only opened the list, click it again in the list)
   *  - not visible       -> find the dropdown bar and open it, then click the option
   * `siblings` are the other options of the same dropdown; the bar usually shows one of them.
   */
  private async pickOption(tab: Page, option: string | RegExp, siblings: (string | RegExp)[], label: string) {
    const all = [...new Set([option, ...siblings])];
    const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const anyValue = new RegExp(all.map((x) => (typeof x === 'string' ? esc(x) : x.source.replace(/^\^/, ''))).join('|'), 'i');

    // Native <select> (just in case)
    for (const sel of await this.visibleOf(tab.locator('select'))) {
      const opt = sel.locator('option', { hasText: option }).first();
      if (await opt.count().catch(() => 0)) {
        const text = ((await opt.textContent().catch(() => '')) || '').trim();
        await sel.selectOption({ label: text });
        Logger.info('MEMBERSHIP', `${label} (native select)`);
        await tab.waitForTimeout(600);
        return;
      }
    }

    // 1. Option already on screen
    const before = await this.visibleOf(this.optionLocator(tab, option));
    if (before.length) {
      await before[before.length - 1].click();
      await tab.waitForTimeout(700);
      // If that click was on the bar and it just opened the list, pick from the list
      const after = await this.visibleOf(this.optionLocator(tab, option));
      if (after.length > before.length) {
        await after[after.length - 1].click();
        await tab.waitForTimeout(600);
      }
      Logger.info('MEMBERSHIP', label);
      return;
    }

    // 2. Open the dropdown bar first, then pick
    const bars: Locator[] = [
      tab.getByRole('button', { name: anyValue }),
      tab.getByRole('combobox').filter({ hasText: anyValue }),
      tab.locator('[aria-haspopup]').filter({ hasText: anyValue }),
      tab.getByRole('combobox'),
      tab.locator('[aria-haspopup="listbox"], [aria-haspopup="menu"], [aria-haspopup="true"]'),
      tab.getByRole('button', { name: /^\s*(select|choose)\b/i }),
    ];
    let tries = 0;
    for (const barLoc of bars) {
      for (const bar of await this.visibleOf(barLoc, 8)) {
        if (++tries > 14) break;
        await bar.scrollIntoViewIfNeeded().catch(() => {});
        await bar.click({ timeout: 5000 }).catch(() => {});
        const opened = await this.waitForAny(this.optionLocator(tab, option), 3000);
        if (opened) {
          await opened.click();
          await tab.waitForTimeout(600);
          Logger.info('MEMBERSHIP', `${label} (opened dropdown first)`);
          return;
        }
        await tab.keyboard.press('Escape').catch(() => {});
        await tab.waitForTimeout(300);
      }
    }

    await this.dumpDiagnostics(tab, `dropdown-${String(option)}`);
    throw new Error(`Could not open the dropdown to select "${option}" (${label}). See screenshot + button list above.`);
  }

  /** Waits up to timeoutMs for any visible element of loc; returns the LAST visible one. */
  private async waitForAny(loc: Locator, timeoutMs: number): Promise<Locator | null> {
    const end = Date.now() + timeoutMs;
    do {
      const vis = await this.visibleOf(loc);
      if (vis.length) return vis[vis.length - 1];
      await loc.page().waitForTimeout(300);
    } while (Date.now() < end);
    return null;
  }

  /**
   * Opens the instructor manager, gets the NEW-instructor form open (first or later course),
   * fills it, picks the city from the suggestions, saves, and closes the manager.
   */
  private async createInstructor(tab: Page, config: CourseConfig) {
    const nameInput = tab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.instructorNameInput });
    const formOpen = () => nameInput.isVisible().catch(() => false);

    // Open the manager
    const openBtn = await this.waitForAny(tab.getByRole('button', { name: MEMBERSHIP_SELECTORS.createInstructorBtn }), 15000);
    if (!openBtn) {
      await this.dumpDiagnostics(tab, 'instructor-open');
      throw new Error('"Create Instructor" button not found on the course form.');
    }
    const visibleBefore = await this.visibleOf(tab.getByRole('button', { name: MEMBERSHIP_SELECTORS.createInstructorBtn }));
    await visibleBefore[0].click();
    await nameInput.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

    // Get the new-instructor form open
    if (!(await formOpen())) {
      const openers: Locator[] = [
        tab.getByRole('button', { name: MEMBERSHIP_SELECTORS.addFirstInstructorBtn }),
        tab.getByRole('button', { name: /^\s*\+?\s*(add|new|create)\s*(a\s*|new\s*|another\s*)?instructor\s*$/i }),
        tab.getByRole('button', { name: /(add|new)\s*(a\s*|new\s*|another\s*)?instructor/i }),
        tab.getByRole('button', { name: /^\s*\+\s*(add|new)?\s*$/i }),
        tab.getByRole('button', { name: MEMBERSHIP_SELECTORS.createInstructorBtn }),
      ];
      outer: for (const loc of openers) {
        for (const btn of await this.visibleOf(loc, 6)) {
          const label = ((await btn.textContent().catch(() => '')) || '').trim();
          await btn.click({ timeout: 5000 }).catch(() => {});
          if (await nameInput.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
            Logger.info('MEMBERSHIP', `Opened new-instructor form via "${label}"`);
            break outer;
          }
        }
      }
    }
    if (!(await formOpen())) {
      await this.dumpDiagnostics(tab, 'instructor-form');
      throw new Error('Could not open the new-instructor form in the instructor manager.');
    }

    await nameInput.fill(config.instructorName);
    await tab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.instructorBioInput }).fill(config.instructorBio);
    await this.selectLocation(tab, config.city);

    // Save: the form's own "Create Instructor" (submit if marked, otherwise the last one showing)
    const createBtns = await this.visibleOf(tab.getByRole('button', { name: MEMBERSHIP_SELECTORS.createInstructorBtn }));
    let submit: Locator | undefined;
    for (const b of createBtns) {
      if ((await b.getAttribute('type').catch(() => null)) === 'submit') submit = b;
    }
    submit = submit ?? createBtns[createBtns.length - 1];
    if (!submit) {
      await this.dumpDiagnostics(tab, 'instructor-submit');
      throw new Error('"Create Instructor" (save) button not found in the instructor form.');
    }
    await submit.click();
    Logger.info('MEMBERSHIP', `Instructor created: ${config.instructorName}`);
    await tab.waitForTimeout(2000);

    const closeBtn = tab.getByRole('button', { name: MEMBERSHIP_SELECTORS.closeInstructorManagerBtn });
    if (await closeBtn.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)) {
      await closeBtn.click();
    } else {
      await tab.keyboard.press('Escape').catch(() => {});
    }
    await tab.waitForTimeout(1500);
  }

  /** Types the city and CLICKS the matching suggestion (e.g. "Dehradun, Uttarakhand, India"). */
  private async selectLocation(tab: Page, city: string) {
    const input = tab.getByRole('combobox', { name: MEMBERSHIP_SELECTORS.instructorLocationInput });
    await input.waitFor({ state: 'visible', timeout: 15000 });
    await input.click();
    // Clear anything left from the previous course, then type key by key so the search fires
    await input.fill('');
    await input.press('ControlOrMeta+a').catch(() => {});
    await input.press('Backspace').catch(() => {});
    await input.pressSequentially(city, { delay: 120 });

    const cityRe = new RegExp(city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const suggestionsLoc = () =>
      tab
        .getByRole('option', { name: cityRe })
        .or(tab.getByRole('button', { name: cityRe }))
        .or(tab.getByRole('listitem').filter({ hasText: cityRe }))
        .or(tab.locator('[role="listbox"] *, .pac-item, li').filter({ hasText: cityRe }));
    let suggestion = await this.waitForAny(suggestionsLoc(), 12000);
    if (!suggestion) {
      // Suggestions did not open (common on the 2nd course) - retype once
      Logger.info('MEMBERSHIP', `No suggestions for "${city}" yet - retyping`);
      await input.fill('');
      await input.pressSequentially(city.slice(0, -1), { delay: 150 });
      await tab.waitForTimeout(500);
      await input.pressSequentially(city.slice(-1), { delay: 150 });
      suggestion = await this.waitForAny(suggestionsLoc(), 15000);
    }
    if (suggestion) {
      // Prefer the FIRST suggestion in the list (closest match)
      const first = (await this.visibleOf(
        tab.getByRole('option', { name: cityRe }).or(tab.getByRole('listitem').filter({ hasText: cityRe }))
      ))[0] ?? suggestion;
      await first.click();
      Logger.info('MEMBERSHIP', `Location selected: ${city}`);
    } else {
      Logger.info('MEMBERSHIP', `No clickable suggestion for "${city}" - selecting with keyboard (ArrowDown + Enter)`);
      await input.press('ArrowDown');
      await input.press('Enter');
    }
    await tab.waitForTimeout(1000);
  }

  private async fillAmount(tab: Page, amount: string, required = true) {
    const amountInput = tab.getByRole('spinbutton', { name: MEMBERSHIP_SELECTORS.amountInput });
    const shown = await amountInput.waitFor({ state: 'visible', timeout: required ? 15000 : 5000 }).then(() => true).catch(() => false);
    if (!shown) return;
    await amountInput.fill(amount);
    await tab.waitForTimeout(500);
  }

  private async selectGateway(tab: Page, gatewayName: string) {
    const trigger = tab.getByRole('button', { name: MEMBERSHIP_SELECTORS.selectGatewaysBtn });
    await trigger.waitFor({ state: 'visible', timeout: 15000 });
    await trigger.click();
    const option = await this.waitForAny(tab.getByRole('button', { name: new RegExp(gatewayName, 'i') }).or(tab.getByRole('option', { name: new RegExp(gatewayName, 'i') })).or(tab.getByRole('checkbox', { name: new RegExp(gatewayName, 'i') })), 10000);
    if (!option) {
      await this.dumpDiagnostics(tab, 'gateway');
      throw new Error(`Payment gateway "${gatewayName}" did not appear in the gateways dropdown.`);
    }
    await option.click();
    await tab.locator(MEMBERSHIP_SELECTORS.backdropDismiss).click({ force: true, timeout: 3000 }).catch(() => {});
    await tab.keyboard.press('Escape').catch(() => {});
    await tab.waitForTimeout(500);
    Logger.info('MEMBERSHIP', `Gateway: ${gatewayName}`);
  }

  /** Opens the course so its curriculum ("Add Module") is on screen. */
  private async openCourse(tab: Page, courseName: string) {
    const addModule = tab.getByRole('button', { name: MEMBERSHIP_SELECTORS.addModuleBtn }).first();
    const ready = () => addModule.isVisible().catch(() => false);

    if (!(await ready()) && courseName) {
      const nameRe = new RegExp(courseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const card = await this.waitForAny(
        tab.getByRole('link', { name: nameRe }).or(tab.getByRole('button', { name: nameRe })).or(tab.getByText(courseName, { exact: true })),
        15000
      );
      if (card) {
        Logger.info('MEMBERSHIP', `Opening course "${courseName}"`);
        await card.click();
        await tab.waitForTimeout(2500);
      }
    }

    const editCourseBtn = tab.getByRole('button', { name: /Edit course/i }).first();
    if (!(await ready()) && (await editCourseBtn.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false))) {
      await editCourseBtn.click();
      await tab.waitForTimeout(2000);
    }

    if (!(await addModule.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false))) {
      await this.dumpDiagnostics(tab, 'open-course');
      throw new Error(`Could not open course "${courseName}" - "Add Module" never appeared.`);
    }
  }

  /**
   * Gets the lesson editor open for lesson #index:
   *   lesson 1 : click the module name -> "Edit lesson details" on the lesson it comes with
   *   lesson 2+: open the module if needed -> "Add lesson" -> "Edit lesson details" on the new lesson
   */
  private async openLessonEditor(tab: Page, moduleName: string, index: number) {
    const lessonNameBox = tab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.lessonNameInput });
    const editorOpen = () => lessonNameBox.isVisible().catch(() => false);
    const editLesson = tab
      .getByRole('button', { name: /edit\s*lesson/i })
      .or(tab.getByRole('link', { name: /edit\s*lesson/i }))
      .or(tab.getByText(/^\s*edit\s*lesson(\s*details)?\s*$/i));
    const addLessonBtn = tab.getByRole('button', { name: /add\s*(a\s*|new\s*)?lesson/i });
    const moduleHeader = tab
      .getByRole('button', { name: new RegExp(moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
      .or(tab.getByText(moduleName, { exact: true }));

    if (await editorOpen()) return;

    /** Clicks the module name until its lessons ("Edit lesson details") are showing. */
    const openModule = async (need: Locator) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        if ((await this.visibleOf(need)).length) return true;
        const mod = await this.waitForAny(moduleHeader, 15000);
        if (!mod) break;
        Logger.info('MEMBERSHIP', `Clicking module "${moduleName}"`);
        await mod.click();
        if (await this.waitForAny(need, 8000)) return true; // opened
        // if that click collapsed it (was already open), the next loop clicks again
      }
      return (await this.visibleOf(need)).length > 0;
    };

    if (index === 0) {
      // Lesson 1: module name -> Edit lesson details
      if (!(await openModule(editLesson))) {
        // Module might come with no lesson yet - add one
        if (await openModule(addLessonBtn)) {
          await (await this.waitForAny(addLessonBtn, 5000))!.click();
          await tab.waitForTimeout(2000);
        }
      }
    } else {
      // Lesson 2+: Add lesson inside the module
      const before = (await this.visibleOf(editLesson, 50)).length;
      if (!(await openModule(addLessonBtn))) {
        await this.dumpDiagnostics(tab, `add-lesson-${index + 1}`);
        throw new Error(`Lesson ${index + 1}: could not find "Add lesson" after clicking module "${moduleName}".`);
      }
      const add = (await this.visibleOf(addLessonBtn)).pop()!;
      Logger.info('MEMBERSHIP', `Adding lesson ${index + 1}`);
      await add.click();
      // wait for the new lesson row to appear
      const end = Date.now() + 10000;
      while (Date.now() < end && !(await editorOpen()) && (await this.visibleOf(editLesson, 50)).length <= before) {
        await tab.waitForTimeout(400);
      }
      if (!(await editorOpen())) await openModule(editLesson);
    }

    if (!(await editorOpen())) {
      const rows = await this.visibleOf(editLesson, 50);
      if (rows.length) {
        const target = index === 0 ? rows[0] : rows[rows.length - 1]; // newest lesson is last
        Logger.info('MEMBERSHIP', `Clicking "Edit lesson details" (lesson ${index + 1})`);
        await target.click();
      } else {
        // Older layout: the lesson row itself opens the editor
        const legacy = await this.waitForAny(tab.getByRole('button', { name: /Lesson Title|Untitled lesson|New lesson/i }), 5000);
        if (legacy) await legacy.click();
      }
    }

    if (!(await lessonNameBox.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false))) {
      await this.dumpDiagnostics(tab, `lesson-editor-${index + 1}`);
      throw new Error(`Lesson ${index + 1}: the lesson editor did not open after "Edit lesson details".`);
    }
  }

  /** Choose -> YouTube -> paste URL -> Search -> WAIT for the video to load -> click it -> Save video. */
  private async attachYoutubeVideo(tab: Page, youtubeUrl: string) {
    await tab.getByRole('button', { name: MEMBERSHIP_SELECTORS.chooseVideoBtn }).first().click();
    await tab.waitForTimeout(1000);
    const ytTab = tab.getByRole('button', { name: MEMBERSHIP_SELECTORS.youtubeTabBtn });
    await ytTab.waitFor({ state: 'visible', timeout: 15000 });
    await ytTab.click();
    await tab.waitForTimeout(1000);

    const urlInput = tab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.youtubeUrlInput });
    await urlInput.waitFor({ state: 'visible', timeout: 15000 });
    await urlInput.fill(youtubeUrl);
    await tab.waitForTimeout(500);
    await tab.getByRole('button', { name: MEMBERSHIP_SELECTORS.searchVideoBtn }).click();

    // Wait for the searched video to load (thumbnail / preview), then click it
    Logger.info('MEMBERSHIP', 'Waiting for the YouTube video to load...');
    const videoResult = await this.waitForAny(
      tab.locator('img[src*="ytimg"], img[src*="youtube"], iframe[src*="youtube"], [data-video-id], video'),
      45000
    );
    if (videoResult) {
      await tab.waitForTimeout(1500); // let the thumbnail finish rendering
      await videoResult.scrollIntoViewIfNeeded().catch(() => {});
      await videoResult.click({ timeout: 10000 }).catch(async () => {
        // an iframe/preview can swallow clicks - click its container instead
        await videoResult.locator('xpath=..').click({ timeout: 10000 }).catch(() => {});
      });
      Logger.info('MEMBERSHIP', 'Clicked the loaded video.');
      await tab.waitForTimeout(1000);
    } else {
      Logger.info('MEMBERSHIP', 'No video thumbnail detected after 45s - trying "Save video" directly.');
    }

    const saveVideo = tab.getByRole('button', { name: new RegExp(MEMBERSHIP_SELECTORS.saveVideoBtn, 'i') });
    const canSave = await saveVideo.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
    if (!canSave) {
      await this.dumpDiagnostics(tab, 'save-video');
      throw new Error(`"Save video" did not appear after loading ${youtubeUrl}.`);
    }
    const end = Date.now() + 15000;
    while (!(await saveVideo.isEnabled().catch(() => false)) && Date.now() < end) await tab.waitForTimeout(500);
    await saveVideo.click();
    await tab.waitForTimeout(1500);
  }

  /** Screenshot + visible button list, so a failing step can be fixed quickly. */
  private async dumpDiagnostics(tab: Page, tag: string) {
    try {
      const dir = path.join(__dirname, '../test-results');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `membership-${tag.replace(/[^a-z0-9-]/gi, '_')}-${Date.now()}.png`);
      await tab.screenshot({ path: file, fullPage: true });
      console.log(`>>> [DIAGNOSTIC] Screenshot saved: ${file}`);
      const labels = await tab.evaluate(() =>
        Array.from(document.querySelectorAll('button, a, [role="button"], [role="combobox"], [role="option"]'))
          .filter((el) => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; })
          .map((el) => (el.textContent || (el as HTMLElement).getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())
          .filter((t) => t.length > 0 && t.length < 80)
      );
      console.log(`>>> [DIAGNOSTIC] URL: ${tab.url()}`);
      console.log('>>> [DIAGNOSTIC] Visible buttons/links:\n  - ' + [...new Set(labels)].join('\n  - '));
    } catch (e) {
      console.log('>>> [DIAGNOSTIC] Could not capture diagnostics:', e);
    }
  }
}
