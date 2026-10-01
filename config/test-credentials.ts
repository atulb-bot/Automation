import { ME } from '../utils/my-details';
/**
 * Test credentials configuration.
 * Environment variables always override these fallback values.
 * Never commit real production secrets here.
 */
export const TEST_CREDENTIALS = {
  email: process.env.FLEXI_EMAIL || ME.loginEmail || 'testingflexifunnels@gmail.com',
  password: process.env.FLEXI_PASSWORD || ME.loginPassword || 'Flexi@123#',

  testCustomerEmail:
    process.env.TEST_CUSTOMER_EMAIL || 'customer_test@example.com',

  stripe: {
    cardNumber: process.env.STRIPE_TEST_CARD || '4242424242424242',
    expiry: process.env.STRIPE_TEST_EXPIRY || '12 / 34',
    cvc: process.env.STRIPE_TEST_CVC || '123',
  },
};