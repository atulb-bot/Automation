export const SELECTORS = {
  login: {
    emailInput: 'Email ID',
    passwordInput: 'Password',
    rememberCheckbox: 'Remember me',
    submitButton: 'Login Now',
    cookieAccept: 'Accept All',
    chatIframe: 'iframe[name="fc_widget"]',
    chatClose: 'Close Notifications',
  },
  projects: {
    navLink: 'Projects',
    createProjectBtn: 'Create Project',
    projectNameInput: 'Project Name',
    customFunnelCard: 'Custom Funnel A personalized',
    createBtn: 'Create',
  },
  pagesModal: {
    addPageSidebarBtn: 'Add New Page',
    pageNameInput: 'Enter Page name',
    pathInput: 'Enter Path',
    typeTrigger: 'Select a page type',
    typeTriggerAlt: '#page-type-button',
    types: {
      sales: 'Used to pitch or sell',
      checkout: 'Checkout Page',
      thankyou: 'Shown after successful',
    },
    addPageSubmitBtn: 'Add Page',
    useTemplateBtn: 'Use This Template',
  },
  products: {
    navLink: 'Products',
    createProductBtn: 'Create Product',
    digitalProductType: 'Digital Product Perfect for',
    continueBtn: 'Continue',
    productNameInput: 'e.g. Ultimate Marketing Course',
    uploadImageBox: 'Click to upload PNG, JPG up',
    galleryDialog: 'Image Gallery',
    continuePricingBtn: 'Continue to Pricing',
    addPricingBtn: 'Add Pricing',
    addPriceBtn: 'Add Price',
    oneTimeBtn: 'One-Time',
    saveAndContinueBtn: 'Save & Continue',
    priceInput: 'Price in INR',
    finishSetupBtn: 'Finish Setup',
    paymentPricingTab: 'Payment & Pricing',
    paymentProvidersTab: 'Payment Providers',
  },
  funnelBuilder: {
    navLink: 'Funnel',
    createFunnelBtn: 'Create New Funnel',
    funnelNameInput: 'Enter Funnel name',
    nextBtn: 'Next →',
    regularType: 'Normal Funnel Standard',
    oneClickType: 'One-Click Upsell Save payment',
    searchProductTrigger: 'Search and select a product...',
    productDropdownMenu: '.absolute.z-50',
    createFunnelSubmit: 'Create Funnel',
    addNextStepBtn: 'Add Next Step',
    continueToAddBtn: 'Continue to Add',
  },
  editor: {
    editPageLink: 'Edit Page',
    publishBtn: 'Publish Publish the page live.',
    publishAsSalesBtn: 'Publish as Sales Page',
    publishAsThankYouBtn: 'Publish as Thank You (',
    styleSettingsBtn: 'Style Settings',
    goToNextStepFunnel: 'Go To Next Step In Funnel',
    goToNextStepProduct: 'Go To Next Step In Product',
  },
  payment: {
    stripeCardFrame: 'iframe[name^="__privateStripeFrame"]',
    cardNumber: 'Card number',
    expiryDate: 'Expiry date',
    securityCode: 'Security code',
    completeOrderLink: 'Complete Order ',
  }
};

export const FREE_TRIAL_SELECTORS = {
  loginUrl: 'https://app.flexifunnels.com/new-login',
  createFreeAccountLink: 'Create free account',
  acceptAllCookiesBtn: 'Accept All',

  // Registration & Phone Form
  fullNameInput: 'Full name',
  emailInput: 'Email address',
  createAccountBtn: 'Create Account',
  verifyAndContinueBtn: 'Verify & Continue',
  phoneNumberInput: 'Your phone number',
  continueToPlansBtn: 'CONTINUE TO PLANS →',

  // Billing Cycle Toggles
  monthlyToggleBtn: 'Monthly',
  yearlyToggleBtn: 'Yearly',

  // 3 Plan Selection Buttons
  plans: {
    launchpad: 'Continue with LaunchPad',
    pro: 'Continue with Pro',
    flexifunnels: 'Continue with Flexifunnels',
  },

  // Plan Subscribe CTA Buttons
  subscribeAndStartTrialBtn: 'SUBSCRIBE & START TRIAL →',

  // Without-Card Flow Modals & Buttons
  skipTrialWithoutAddonBtn: 'Skip — start trial without a',
  skipForNowBtn: 'Skip for now',
  startMyFreeTrialBtn: 'START MY FREE TRIAL →',

  // Paddle Checkout Iframe Elements (Matched to paddle_frame recording)
  paddleFrame: 'iframe[name="paddle_frame"]',
  postcodeInput: 'postcodeInput',
<<<<<<< HEAD
=======
  // Fallbacks: Paddle shows the pincode differently depending on plan
  postcodeCssFallback:
    'input[name*="postcode" i], input[name*="postal" i], input[name*="zip" i], input[autocomplete="postal-code"], input[id*="postcode" i]',
  postcodeLabel: /post\s*code|postal|zip|pin\s*code/i,
  defaultPostcode: '248001', // valid 6-digit Indian PIN
  // Button that opens Paddle when a plan shows a 'with card / without card' choice first
  addCardChoiceBtn: /add (a )?card|with (a )?card|continue with card|enter card|pay with card/i,
>>>>>>> 3b74662e3a642703c199e584d84b4d058f47ff14
  authLocationSubmitBtn: 'combinedAuthenticationLocationFormSubmitButton',
  cardNumberInput: 'cardNumberInput',
  cardholderNameInput: 'cardholderNameInput',
  expiryDateField: 'expiryDateField',
  cvvInput: 'cardVerificationValueInput',
  cardPaymentSubmitBtn: 'cardPaymentFormSubmitButton',

  // Dashboard & Onboarding Modals
  continueToDashboardLink: 'Continue to dashboard',
  closeBtn: 'Close',
};

export const MEMBERSHIP_SELECTORS = {
  // Navigation & Project Launch
  appsLink: 'Apps',
  projectsLink: 'Projects',
  createProjectBtn: 'Create Project',
  launchCourseOptionBtn: 'Launch a Course Membership',
  launchBtn: 'Launch',
  newMembershipBtn: 'New Membership',
  membershipNameInput: 'Membership Name *',
  membershipDescInput: 'Membership Description',
  createBtn: 'Create',

  // Course Details
  newCourseBtn: 'New Course',
  courseNameInput: 'Enter course name',
  courseSummaryInput: 'A short summary of this',
  courseRichEditor: '.jodit-wysiwyg',
  createInstructorBtn: 'Create Instructor',
  addFirstInstructorBtn: 'Add your first instructor',
  instructorNameInput: 'e.g. Jane Doe',
  instructorBioInput: 'A short bio shown on the',
  instructorLocationInput: 'Search a city or area — e.g.',
  closeInstructorManagerBtn: 'Close instructor manager',
  freeAccessBtn: 'Free — open to all members',
  paidAccessBtn: 'Paid — requires purchase',
  supportEmailInput: 'support@yourbrand.com or',
  createCourseSubmitBtn: 'Create Course',

  // Pricing Options
  oneTimePaymentBtn: 'One-Time Payment',
  subscriptionBtn: 'Subscription',
  currencyInrBtn: 'Indian Rupee (INR)',
  currencyUsdBtn: 'US Dollar (USD)',
  amountInput: '0.00',
  reviewPriceBtn: 'Review',
  savePriceBtn: 'Save Price',

  // Subscription Intervals & Durations
  intervalWeeklyBtn: 'Weekly',
  intervalMonthlyBtn: 'Monthly',
  intervalQuarterlyBtn: 'Quarterly',
  intervalYearlyBtn: 'Yearly',
  untilCancelledBtn: 'Until Cancelled (∞)',
  fixedPaymentsBtn: 'Fixed Number of Payments',
  numberOfPaymentsInput: 'e.g.',
  selectGatewaysBtn: 'Select payment gateways…',
  backdropDismiss: '.fixed.inset-0.z-\\[80\\]',

  // Modules & Lessons
  addModuleBtn: 'Add Module',
  moduleNameInput: 'e.g. Getting Started',
  confirmAddModuleBtn: 'Add module',
  lessonNameInput: 'e.g. Welcome & overview',
  chooseVideoBtn: 'Choose',
  youtubeTabBtn: 'YouTube',
  youtubeUrlInput: 'https://youtu.be/dQw4w9WgXcQ',
  searchVideoBtn: 'Search',
  saveVideoBtn: 'Save video',
  saveChangesBtn: 'Save Changes',

  // Groups
  groupsLink: 'Groups',
  newGroupBtn: 'New Group',
  publicGroupBtn: 'Public Group Anyone in the',
  privateGroupBtn: 'Private Group Only invited or',
  groupNameInput: 'Enter group name',
  groupDescInput: 'What is this group about? A',
  createGroupSubmitBtn: 'Create Group',

  // Settings & Templates
  settingsBtn: 'Settings',
  generalIdentityBtn: 'General Identity, links &',
  templatesOptionBtn: 'Templates Pick the layout',
  applyTemplateBtn: 'Apply template',
  closeModalBtn: 'close',

  // Available Project Templates
  templates: [
    'Classic Content & rail',
    'Studio Sidebar & library',
    'Catalog Browse & discover',
    'Campus Learning dashboard',
    'Creator Collapsible side nav',
    'Spotlight Banner-led pages &'
  ],

  // Products & Funnel Publishing
  productsMenuBtn: 'Products',
  myProductsLink: 'My Products',
  searchProductInput: 'Search by product name',
  continueToPaymentPricingBtn: 'Continue to Payment & Pricing',
  continueToAfterPurchaseBtn: 'Continue to After Purchase',
  continueToLandingPageBtn: 'Continue to Landing page',
  startDesigningBtn: 'Start designing',
  editBtn: 'Edit',
  publishSalesPageBtn: 'Publish sales page',
  checkoutPageTabBtn: 'Checkout Page',
  publishCheckoutPageBtn: 'Publish checkout page',
  thankyouPageTabBtn: 'Thank-you Page',
  publishThankyouPageBtn: 'Publish thank-you page',
  salesAndCheckoutTabBtn: 'Sales & Checkout page',
  visitPageLink: 'Visit',

  // Live Checkout Selectors
  enrollNowBtn: 'Enroll now',
  checkoutFirstNameInput: 'First Name',
  checkoutEmailInput: 'Email ID',
  checkoutPhoneInput: 'Phone Number',
  checkoutBillingAddress: 'Billing Address',
  checkoutCity: 'City',
  checkoutState: 'State',
  checkoutCountry: 'Country',
  termsCheckbox: 'I agree to the Terms &',
  completeOrderLink: 'Complete Order ',

  // Member Portal & Login
  membersTabLink: 'Members',
  inviteMembersBtn: 'Invite Members',
  memberFullNameInput: 'Full name',
  memberEmailInput: 'email@example.com',
  memberPasswordInput: 'Password',
  memberConfirmPasswordInput: 'Re-enter password',
  addMemberSubmitBtn: 'Add Member',
  memberPortalEmailInput: 'input[type="email"]',
  memberPortalPasswordInput: 'input[type="password"]',
  memberPortalLoginBtn: 'Login',
};