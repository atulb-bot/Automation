import { test, expect, Browser, Page } from '@playwright/test';

/**
 * CHECK EXISTING (read-only): look at a page / split test URL that already exists and report what is there
 * and what is missing. Nothing is edited, published, submitted or bought.
 *
 *   CHECK_URL=https://xyz.flexi-funnels.com/abc  npm run check:url
 *   CHECK_VISITS=6        how many fresh visits (to see which versions a split URL serves)
 *   CHECK_FOLLOW_CTA=0    don't follow the sales page's CTA to its checkout
 *
 * Report lines look like ">>> CHECK ✅ ..." / "⚠️" / "❌" (the dashboard shows them as a checklist).
 * The test fails only when something is clearly broken (❌).
 */
type Version = { key: string; headline: string; url: string; status: number; fields: string[]; submit: boolean; ctas: string[]; seen: number };
const CTA = /get access|buy|order|join|enrol|enroll|click here|add to cart|purchase|sign ?up|start|claim|yes/i;
const report: { s: '✅' | '⚠️' | '❌'; t: string }[] = [];
const say = (s: '✅' | '⚠️' | '❌', t: string) => { report.push({ s, t }); console.log(`>>> CHECK ${s} ${t}`); };

async function inspect(p: Page): Promise<Omit<Version, 'seen' | 'status' | 'url'>> {
  await p.waitForLoadState('domcontentloaded').catch(() => {});
  await p.waitForTimeout(2500);
  const headline = ((await p.locator('h1, h2').first().innerText({ timeout: 5000 }).catch(() => '')) || (await p.title())).trim().replace(/\s+/g, ' ').slice(0, 90);
  const fields = await p.locator('input:visible, textarea:visible, select:visible').evaluateAll((els) => els
    .filter((e) => !['hidden', 'submit', 'button', 'checkbox', 'radio'].includes((e as HTMLInputElement).type))
    .map((e) => (e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.getAttribute('name') || '').trim()).filter(Boolean)).catch(() => [] as string[]);
  const submit = (await p.getByRole('link', { name: /^\s*submit\s*$/i }).or(p.getByRole('button', { name: /^\s*submit\s*$/i })).count()) > 0;
  const ctas = (await p.getByRole('link').or(p.getByRole('button')).allInnerTexts().catch(() => [] as string[]))
    .map((t) => t.trim().replace(/\s+/g, ' ')).filter((t) => t && CTA.test(t) && !/no,?\s*thanks/i.test(t)).slice(0, 5);
  return { key: headline.toLowerCase(), headline, fields: [...new Set(fields)], submit, ctas };
}

/** Re-opens the URL until THIS version (same headline) is served, clicks its CTA, and looks at where it leads. */
async function followCta(browser: Browser, url: string, v: { key: string; ctas: string[] }) {
  for (let attempt = 1; attempt <= 10; attempt++) {
    const ctx = await browser.newContext(); const p = await ctx.newPage();
    try {
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); await p.waitForTimeout(2000);
      const headline = ((await p.locator('h1, h2').first().innerText({ timeout: 5000 }).catch(() => '')) || (await p.title())).trim().replace(/\s+/g, ' ').slice(0, 90).toLowerCase();
      if (headline !== v.key) continue; // the split served the other version - try again
      const before = p.url();
      let status = 0;
      ctx.on('response', (r) => { if (r.request().isNavigationRequest() && r.request().frame() === r.frame() && r.frame().parentFrame() === null) status = r.status(); });
      const cta = p.getByRole('link', { name: v.ctas[0] }).or(p.getByRole('button', { name: v.ctas[0] })).first();
      const popup = ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null);
      await cta.click({ timeout: 10000 });
      const target = (await popup) || p;
      await target.waitForLoadState('domcontentloaded').catch(() => {}); await target.waitForTimeout(3000);
      const errorPage = status >= 400 || (await target.getByText(/^\s*(404|not found|page not found|500|server error)\b/i).count()) > 0;
      const isCheckout = (await target.getByRole('textbox', { name: /first name|email/i }).count()) > 0 && (await target.getByText(/complete order|stripe|payment|card/i).count()) > 0;
      const stripe = (await target.getByText(/stripe/i).count()) > 0 || (await target.locator('#stripe-ref-0').count()) > 0;
      return { found: true, moved: target.url() !== before, url: target.url(), status, errorPage, isCheckout, stripe };
    } catch (e) { return { found: true, moved: false, url: '', status: 0, errorPage: false, isCheckout: false, stripe: false, error: String((e as Error).message).split('\n')[0] }; }
    finally { await ctx.close().catch(() => {}); }
  }
  return { found: false, moved: false, url: '', status: 0, errorPage: false, isCheckout: false, stripe: false };
}

test('Check existing: live page / split URL (read-only)', async ({ browser }) => {
  test.setTimeout(20 * 60 * 1000);
  const url = (process.env.CHECK_URL || '').trim();
  const visits = Math.max(1, Math.min(20, Number(process.env.CHECK_VISITS || 6)));
  expect(url, 'Give the page or split URL to check: CHECK_URL=https://... (or the "URL to check" field on the dashboard)').toMatch(/^https?:\/\//);
  console.log('='.repeat(64)); console.log('>>> FLOW STARTED: Check existing page (read-only)'); console.log('='.repeat(64));
  console.log(`>>> [STEP 1/3] Visit ${visits}x in fresh browsers ...`);

  const versions = new Map<string, Version>();
  for (let i = 0; i < visits; i++) {
    const ctx = await browser.newContext(); const p = await ctx.newPage();
    try {
      const res = await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const info = await inspect(p);
      const v = versions.get(info.key) || { ...info, url: p.url(), status: res ? res.status() : 0, seen: 0 };
      v.seen++; versions.set(info.key, v);
    } catch (e) { say('❌', `Visit ${i + 1}: the page did not load (${String((e as Error).message).split('\n')[0]})`); }
    finally { await ctx.close().catch(() => {}); }
  }
  console.log(`>>> [STEP 1/3] Visit ${visits}x in fresh browsers ✔ done`);

  console.log('>>> [STEP 2/3] Check each version ...');
  const list = [...versions.values()];
  if (!list.length) say('❌', 'No visit loaded the URL');
  else if (list.length === 1) say(visits > 1 ? '⚠️' : '✅', `One version served in ${visits} visit(s): "${list[0].headline}"${visits > 1 ? ' (for a split test, check the campaign is running and has a variant)' : ''}`);
  else say('✅', `Split URL serves ${list.length} versions: ${list.map((v) => `"${v.headline}" ${v.seen}x`).join(', ')}`);

  for (const v of list) {
    const name = `"${v.headline || '(no headline)'}"`;
    v.status && v.status < 400 ? say('✅', `${name}: loads (HTTP ${v.status}) at ${v.url}`) : say('❌', `${name}: HTTP ${v.status || 'error'} at ${v.url}`);
    if (!v.headline) say('⚠️', `${name}: no headline (h1/h2) on the page`);
    if (v.fields.length) {
      say('✅', `${name}: form with ${v.fields.length} field(s): ${v.fields.join(', ')}`);
      const has = (re: RegExp) => v.fields.some((f) => re.test(f));
      if (!has(/e-?mail/i)) say('❌', `${name}: the form has no Email field`);
      if (!has(/name/i)) say('⚠️', `${name}: the form has no Name field`);
      v.submit ? say('✅', `${name}: SUBMIT button present (not pressed - read-only)`) : say('❌', `${name}: no SUBMIT button on the form`);
    }
    if (v.ctas.length) say('✅', `${name}: call-to-action: "${v.ctas[0]}"${v.ctas.length > 1 ? ` (+${v.ctas.length - 1} more)` : ''}`);
    if (!v.fields.length && !v.ctas.length) say('⚠️', `${name}: no form and no call-to-action button found`);
  }
  console.log('>>> [STEP 2/3] Check each version ✔ done');

  console.log('>>> [STEP 3/3] Follow the CTA to the checkout (no purchase) ...');
  if (process.env.CHECK_FOLLOW_CTA !== '0') {
    for (const v of list.filter((x) => x.ctas.length && !x.fields.length)) {
      const r = await followCta(browser, url, v);
      const name = `"${v.headline}"`;
      if (!r.found) say('⚠️', `${name}: this version was not served again, so its CTA was not followed`);
      else if (!r.moved) say('❌', `${name}: clicking "${v.ctas[0]}" did not go anywhere${(r as any).error ? ` (${(r as any).error})` : ''}`);
      else if (r.errorPage) say('❌', `${name}: CTA leads to an error page${r.status ? ` (HTTP ${r.status})` : ''}: ${r.url}`);
      else if (r.isCheckout) say('✅', `${name}: CTA leads to a checkout${r.stripe ? ' with Stripe' : ' (no Stripe option seen)'}: ${r.url}`);
      else say('⚠️', `${name}: CTA goes to ${r.url}, which does not look like a checkout`);
    }
  }
  console.log('>>> [STEP 3/3] Follow the CTA to the checkout (no purchase) ✔ done');

  const bad = report.filter((r) => r.s === '❌').length, warn = report.filter((r) => r.s === '⚠️').length;
  console.log('#'.repeat(64));
  console.log(`>>> ${bad ? '❌ CHECK FINISHED WITH PROBLEMS' : '✅ FLOW COMPLETED SUCCESSFULLY: Check existing page'}`);
  console.log(`    URL: ${url}`); console.log(`    Result: ${report.length - bad - warn} ok, ${warn} warning(s), ${bad} problem(s)`);
  console.log('#'.repeat(64));
  expect(bad, report.filter((r) => r.s === '❌').map((r) => r.t).join('\n')).toBe(0);
});
