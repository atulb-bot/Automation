import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { FlexiProofPage } from '../pages/FlexiProofPage';
import { FunnelBuilderPage } from '../pages/FunnelBuilderPage';
import { TEST_CREDENTIALS } from '../config/test-credentials';
import { TestContext } from '../utils/test-context';
import { FlowReporter } from '../utils/flow-reporter';
import { generateRandomLetters } from '../utils/helpers';
import { keepBrowserOpenIfSingleRun } from '../utils/free-trial-runner';
import { ME } from '../utils/my-details';

/**
 * FlexiProof (standalone) on a project that already exists:
 *   campaign (all its pages) -> republish the pages -> visit them and check the proof widget is there.
 *   QA_PROJECT_NAME="QAmULOmG bpPs3l Split Project"  FP_PAGES="FE Sales,FE Checkout"  npm run app:flexiproof
 */
test('FlexiProof: campaign on an existing project, republish, widget on the pages', async ({ page }) => {
  test.setTimeout(30 * 60 * 1000);
  const project = (process.env.QA_PROJECT_NAME || '').trim();
  expect(project, 'Give the project: QA_PROJECT_NAME="..." (dashboard: Project name)').not.toBe('');
  const pages = (process.env.FP_PAGES || 'FE Sales').split(',').map((s) => s.trim()).filter(Boolean);
  const ctx = new TestContext('regular');
  const flow = new FlowReporter('FlexiProof', 5, { Project: project, Pages: pages.join(', ') });

  await flow.step('Login', async () => { const l = new LoginPage(page, ctx); await l.openLogin(); await l.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password); });
  const fp = await flow.step('Open FlexiProof (Apps)', () => FlexiProofPage.open(page));
  await flow.step('Campaign: notifications, project + all its pages, Top-right, Save', () => fp.createCampaign(`${ME.firstName} Proof ${generateRandomLetters(5)}`, project));
  const builder = new FunnelBuilderPage(page, ctx);
  await flow.step('Republish the pages (so the widget is on them)', async () => {
    await page.bringToFront();
    await page.goto('https://app.flexifunnels.com/projects', { waitUntil: 'domcontentloaded' });
    const open = page.getByRole('button', { name: 'Open Project' });
    const card = page.locator('div').filter({ hasText: project }).filter({ has: open }).last();
    await (await card.count() ? card.getByRole('button', { name: 'Open Project' }) : open).first().click();
    await page.waitForURL(/\/projects\/[^/]+$/, { timeout: 30000 });
    ctx.projectUrl = page.url();
    for (const name of pages) await (builder as any).publishExistingPage(name);
  });
  const results: Record<string, string> = {};
  const live = await flow.step('Visit the pages: is the widget there?', async () => {
    let last = page;
    for (const name of pages) { const l = await builder.openPublishedUrl(name); results[name] = (await FlexiProofPage.widgetOn(l)) ? 'widget found' : 'widget NOT found'; last = l; }
    return last;
  });
  flow.completed(results);
  await keepBrowserOpenIfSingleRun(live);
});
