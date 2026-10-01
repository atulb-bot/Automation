import { test, expect, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { FunnelPage } from '../pages/FunnelPage';
import { FunnelBuilderPage } from '../pages/FunnelBuilderPage';
import { PaymentPage } from '../pages/PaymentPage';
import { ProductConfig } from '../pages/ProductsPage';
import { SplitTestPage } from '../pages/SplitTestPage';
import { TEST_CREDENTIALS } from '../config/test-credentials';
import { TestContext } from '../utils/test-context';
import { FlowReporter } from '../utils/flow-reporter';
import { Logger } from '../utils/logger';
import { buildFunnelProject } from '../utils/funnel-build';
import { generateCustomerEmail } from '../utils/test-data';

/**
 * Funnel split test - a variant for EVERY sales page (FE, OTO1, DS1, OTO2, DS2):
 *   One-Click funnel (normal build) -> "<KEY> Sales Variant" for each page, wired to the same funnel / product
 *   -> one split campaign per page -> buyer journeys (path 1 and path 3 alternately, so every page is visited)
 *   in fresh browsers until every variant has been served; reports which version was served at each step.
 *   npm run split:funnel-all      (SPLIT_JOURNEYS=8 = most journeys)
 */
const KEYS = ['FE', 'OTO1', 'DS1', 'OTO2', 'DS2'] as const;
const PATH1 = [{ page: 'OTO1', action: 'no' }, { page: 'DS1', action: 'buy' }, { page: 'OTO2', action: 'buy' }] as any;   // FE, OTO1, DS1, OTO2
const PATH3 = [{ page: 'OTO1', action: 'buy' }, { page: 'OTO2', action: 'no' }, { page: 'DS2', action: 'no' }] as any;  // FE, OTO1, OTO2, DS2

test('Funnel split test: variants for every sales page', async ({ page, browser }) => {
  test.setTimeout(150 * 60 * 1000);
  const ctx = new TestContext('regular');
  const flow = new FlowReporter('Funnel split test - every page', 5);
  await flow.step('Login', async () => { const l = new LoginPage(page, ctx); await l.openLogin(); await l.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password); });
  const built = await flow.step('Build the One-Click funnel (normal build)', () => buildFunnelProject(page, ctx, 'oneclick'));
  const base = built.funnelName.split(' ')[1];
  const builder = new FunnelBuilderPage(page, ctx);
  await flow.step('Create + wire + publish a Variant for each sales page', async () => {
    const spec = FunnelPage.FUNNEL_PAGES.find((p) => p.name === 'FE Sales')!;
    for (const key of KEYS) {
      await new FunnelPage(page, ctx).createSinglePage({ ...spec, name: `${key} Sales Variant` }, 0);
      const product: ProductConfig = { key, productName: `QA ${base} ${key}`, salesPageName: `${key} Sales Variant`, checkoutPageName: `${key} Checkout`, price: '100' };
      await builder.wireAndPublishSalesPage(product, { funnelName: built.funnelName, withNoThanks: key !== 'FE', blank: process.env.PAGE_MODE !== 'template', headline: `Sales ${key} Variant` });
    }
  });
  const split = new SplitTestPage(page, ctx);
  let splitUrl = '';
  await flow.step('One split campaign per page (equal split, manual winner)', async () => {
    for (const key of KEYS) {
      await split.openSplitTestApp();
      const v = await split.createCampaign({ name: `Split ${base} ${key}`, project: built.projectName, controlPage: `${key} Sales`, variantPage: `${key} Sales Variant`, notes: 'V2' });
      if (key === 'FE') splitUrl = split.splitUrl || v.url(); // the FE campaign's Visit link
      await v.close().catch(() => {});
    }
  });

  // which version did each page of a journey show? (headline "Sales OTO1" vs "Sales OTO1 Variant")
  const seen: Record<string, { Original: number; Variant: number }> = Object.fromEntries(KEYS.map((k) => [k, { Original: 0, Variant: 0 }]));
  const maxJourneys = Math.max(2, Math.min(12, Number(process.env.SPLIT_JOURNEYS || 8)));
  const journeys: string[] = [];
  await flow.step('Buyer journeys until every variant was served', async () => {
    for (let j = 0; j < maxJourneys; j++) {
      // each journey is a new visitor in a different browser (Edge / Chrome / Chromium...), opening the Visit link
      const ob = await split.otherBrowser(j, j % 2 === 0 ? 'Chromium' : 'Microsoft Edge');
      const bc = ob ? await ob.browser.newContext({ viewport: { width: 1440, height: 900 } }) : await browser.newContext(); const p = await bc.newPage();
      const shown: string[] = [];
      const note = async (pg: Page) => { const h = ((await pg.locator('h1').first().innerText({ timeout: 4000 }).catch(() => '')) || '').trim(); const m = h.match(/^Sales (FE|OTO1|DS1|OTO2|DS2)( Variant)?$/i); if (m) shown.push(`${m[1].toUpperCase()}${m[2] ? ' Variant' : ''}`); };
      p.on('load', () => { note(p); });
      try {
        await p.goto(splitUrl, { waitUntil: 'domcontentloaded' });
        const path = j % 2 === 0 ? PATH1 : PATH3;
        const ty = await new PaymentPage(p, ctx).completeFunnelPurchase(p, path, undefined, { name: `Journey ${j + 1}`, email: generateCustomerEmail() }, 'oneclick');
        await p.waitForTimeout(500);
        for (const s of [...new Set(shown)]) { const [k, v] = s.split(' '); seen[k][v ? 'Variant' : 'Original']++; }
        journeys.push(`Journey ${j + 1} (path ${j % 2 === 0 ? 1 : 3}): ${[...new Set(shown)].join(' -> ')} -> Thank You`);
        Logger.info('SPLIT', journeys[journeys.length - 1] + ` (${ty})`);
      } finally { await bc.close().catch(() => {}); if (ob) await ob.browser.close().catch(() => {}); }
      if (KEYS.every((k) => seen[k].Variant > 0 && seen[k].Original > 0)) break;
    }
  });
  const table = KEYS.map((k) => `${k}: Original ${seen[k].Original} / Variant ${seen[k].Variant}`);
  const missing = KEYS.filter((k) => !seen[k].Variant || !seen[k].Original);
  table.forEach((t) => console.log(`>>> SERVED ${t}`));
  if (missing.length) Logger.warn('SPLIT', `Not every version was served in ${journeys.length} journeys: ${missing.join(', ')}. Check these campaigns' traffic split (or raise SPLIT_JOURNEYS).`);
  console.log(`>>> ✅ TEST COMPLETE: ${journeys.length} journeys bought through the split funnel. Check the stats in the split test dashboard for campaigns "Split ${base} FE / OTO1 / DS1 / OTO2 / DS2".`);
  flow.completed({ Funnel: built.funnelName, ...Object.fromEntries(table.map((t) => t.split(': '))), Journeys: String(journeys.length) });
  expect(journeys.length).toBeGreaterThan(0);
});
