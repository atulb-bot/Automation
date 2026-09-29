# FlexiFunnels Playwright + TypeScript Automation Framework

A production-grade, dynamic QA automation framework engineered for **[FlexiFunnels](https://app.flexifunnels.com)**.

---

> ⚠️ **PAYMENT SAFETY WARNING**
> 
> The buyer test executes an end-to-end checkout charging **₹100 INR**.
> **USE ONLY STRIPE TEST MODE AND TEST CARDS.** Never configure real credit card or banking information.

---

## 1. Setup Instructions

1. Install project dependencies:
   ```bash
   npm install
   ```

2. Install the Playwright browser binaries (one-time):
   ```bash
   npx playwright install chromium
   ```

3. Configure credentials (optional). The framework falls back to the values
   in `config/test-credentials.ts` if these aren't set, but you can override
   them with environment variables instead of editing that file:
   ```bash
   export FLEXI_EMAIL="your-test-account@example.com"
   export FLEXI_PASSWORD="your-test-password"
   export TEST_CUSTOMER_EMAIL="buyer@example.com"
   export STRIPE_TEST_CARD="4242424242424242"
   export STRIPE_TEST_EXPIRY="12 / 34"
   export STRIPE_TEST_CVC="123"
   ```
   Only ever point `FLEXI_EMAIL`/`FLEXI_PASSWORD` at a disposable QA/test
   FlexiFunnels account — never a production account.

## 2. Running the Tests

All runs default to a visible (non-headless) browser with a small per-action
delay so the run is watchable; use `test:headless` for CI.

```bash
npm test              # run everything
npm run test:headed   # visible browser, single worker
npm run test:regular  # regular (non one-click) funnel variant
npm run test:oneclick # one-click upsell funnel variant
npm run test:debug    # Playwright Inspector step-through
npm run test:headless # headless, for CI
npm run report        # open the last HTML report
```

Individual specs (in `tests/`):

| Spec | What it covers |
|---|---|
| `full-funnel-flow.spec.ts` | Full journey: project → 5 products (FE…DS2) → funnel tree → CTA + "No thanks" wiring → **live Stripe checkout + upsell** (~25 min) |
| `funnel-only.spec.ts` | Funnel tree construction without the live buyer journey |
| `products-only.spec.ts` | Product creation + page wiring only |
| `single-product-no-funnel.spec.ts` | Single FE product, no funnel tree |
| `flexifunnels.spec.ts` | Minimal smoke test |

Diagnostic screenshots on failure are saved to `test-results/`; traces and
videos are retained on failure per `playwright.config.ts`.

## 3. Project Structure

```
config/      Selectors and test credentials
pages/       Page Object Model — one class per FlexiFunnels screen
utils/       Retry/wait helpers, popup handling, logging, test data
tests/       Playwright specs
```