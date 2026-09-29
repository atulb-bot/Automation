import { Page, expect } from '@playwright/test';
import { MEMBERSHIP_SELECTORS } from '../config/selectors';
import { Logger } from '../utils/logger';
import { PopupHandler } from '../utils/popup-handler';

export type PricingInterval = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

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

    // Instructor Setup
    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.createInstructorBtn }).click();
    await membershipTab.waitForTimeout(1500);
    const addFirst = membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.addFirstInstructorBtn });
    if (await addFirst.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addFirst.click();
      await membershipTab.waitForTimeout(1000);
    }
    await membershipTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.instructorNameInput }).fill(config.instructorName);
    await membershipTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.instructorBioInput }).fill(config.instructorBio);
    await membershipTab.getByRole('combobox', { name: MEMBERSHIP_SELECTORS.instructorLocationInput }).fill(config.city);
    await membershipTab.waitForTimeout(1000);
    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.createInstructorBtn }).nth(1).click();
    await membershipTab.waitForTimeout(2000);
    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.closeInstructorManagerBtn }).click();
    await membershipTab.waitForTimeout(1500);

    // Pricing Architecture
    if (config.pricingType === 'free') {
      await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.freeAccessBtn }).click();
    } else {
      await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.paidAccessBtn }).click();
      await membershipTab.waitForTimeout(1000);

      await membershipTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.supportEmailInput }).fill(config.supportEmail);
      await membershipTab.waitForTimeout(500);

      if (config.pricingType === 'subscription') {
        await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.subscriptionBtn }).click();
        await membershipTab.waitForTimeout(1000);

        // Currency
        if (config.currency === 'USD') {
          await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.currencyUsdBtn }).click();
        } else {
          await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.currencyInrBtn }).click();
        }
        await membershipTab.waitForTimeout(500);

        // Price
        await membershipTab.getByRole('spinbutton', { name: MEMBERSHIP_SELECTORS.amountInput }).fill(config.price || '25');
        await membershipTab.waitForTimeout(500);

        // Intervals (Monthly, Weekly, Quarterly, Yearly)
        switch (config.interval) {
          case 'weekly':
            await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.intervalWeeklyBtn }).click();
            break;
          case 'quarterly':
            await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.intervalQuarterlyBtn }).click();
            break;
          case 'yearly':
            await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.intervalYearlyBtn }).click();
            break;
          case 'monthly':
          default:
            await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.intervalMonthlyBtn }).click();
            break;
        }
        await membershipTab.waitForTimeout(500);

        // Duration
        if (config.duration === 'fixed' && config.paymentsCount) {
          await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.fixedPaymentsBtn }).click();
          await membershipTab.waitForTimeout(500);
          await membershipTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.numberOfPaymentsInput }).fill(config.paymentsCount);
        } else {
          await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.untilCancelledBtn }).click();
        }
        await membershipTab.waitForTimeout(500);

        // Gateway
        if (config.gatewayName) {
          await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.selectGatewaysBtn }).click();
          await membershipTab.waitForTimeout(1000);
          await membershipTab.getByRole('button', { name: new RegExp(config.gatewayName, 'i') }).click();
          await membershipTab.locator(MEMBERSHIP_SELECTORS.backdropDismiss).click({ force: true }).catch(() => {});
          await membershipTab.waitForTimeout(500);
        }
      } else {
        // One-time payment setup
        await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.oneTimePaymentBtn }).click();
        await membershipTab.waitForTimeout(500);
        const amountInput = membershipTab.getByRole('spinbutton', { name: MEMBERSHIP_SELECTORS.amountInput });
        if (await amountInput.isVisible()) {
          await amountInput.fill(config.price || '99');
        }
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

  async addModuleAndLesson(membershipTab: Page, moduleName: string, lessonName: string, youtubeUrl?: string) {
    Logger.info('MEMBERSHIP', `Adding Module "${moduleName}" and Lesson "${lessonName}"`);
    const editCourseBtn = membershipTab.getByRole('button', { name: /Edit course/i });
    if (await editCourseBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      await editCourseBtn.click();
      await membershipTab.waitForTimeout(2000);
    }

    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.addModuleBtn }).first().click();
    await membershipTab.waitForTimeout(1500);

    await membershipTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.moduleNameInput }).fill(moduleName);
    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.confirmAddModuleBtn, exact: true }).click();
    await membershipTab.waitForTimeout(3000);

    const lessonItem = membershipTab.getByRole('button', { name: /Lesson Title Video|Edit lesson/i }).first();
    await lessonItem.waitFor({ state: 'visible', timeout: 10000 });
    await lessonItem.click();
    await membershipTab.waitForTimeout(2000);

    const lessonNameBox = membershipTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.lessonNameInput });
    await lessonNameBox.fill(lessonName);
    await membershipTab.waitForTimeout(800);

    if (youtubeUrl) {
      await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.chooseVideoBtn }).click();
      await membershipTab.waitForTimeout(1000);
      await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.youtubeTabBtn }).click();
      await membershipTab.waitForTimeout(1000);

      const urlInput = membershipTab.getByRole('textbox', { name: MEMBERSHIP_SELECTORS.youtubeUrlInput });
      await urlInput.fill(youtubeUrl);
      await membershipTab.waitForTimeout(500);
      await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.searchVideoBtn }).click();
      await membershipTab.waitForTimeout(3000);

      const firstVideo = membershipTab.getByRole('button', { name: /Save video/i });
      if (await firstVideo.isVisible({ timeout: 6000 }).catch(() => false)) {
        await firstVideo.click();
        await membershipTab.waitForTimeout(1500);
      }
    }

    await membershipTab.getByRole('button', { name: MEMBERSHIP_SELECTORS.saveChangesBtn }).click();
    await membershipTab.waitForTimeout(4000);
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
}