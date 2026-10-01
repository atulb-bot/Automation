import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { FlexiViralPage, FLEXIVIRAL_ENTRIES } from '../pages/FlexiViralPage';
import { TEST_CREDENTIALS } from '../config/test-credentials';
import { TestContext } from '../utils/test-context';
import { FlowReporter } from '../utils/flow-reporter';
import { generateRandomLetters } from '../utils/helpers';
import { keepBrowserOpenIfSingleRun } from '../utils/free-trial-runner';
import { ME, testEmail } from '../utils/my-details';

/**
 * FlexiViral (standalone): a contest with every entry method, a prize, saved, then a registration on its page.
 *   npm run app:flexiviral
 */
test('FlexiViral: create a contest with all entry methods and register', async ({ page }) => {
  test.setTimeout(30 * 60 * 1000);
  const ctx = new TestContext('regular');
  const name = `${ME.firstName} Contest ${generateRandomLetters(5)}`;
  const entrant = testEmail('viral' + generateRandomLetters(5).toLowerCase());
  const flow = new FlowReporter('FlexiViral contest', 7, { Contest: name, Entrant: entrant });
  let fv!: FlexiViralPage;

  await flow.step('Login', async () => { const l = new LoginPage(page, ctx); await l.openLogin(); await l.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password); });
  await flow.step('Open FlexiViral (Apps)', async () => { fv = await FlexiViralPage.open(page); });
  await flow.step('Create the contest: name, dates, Asia/Kolkata', async () => { await fv.createContest(name); await fv.setDatesAndTimezone(); await fv.next(); });
  const added = await flow.step('Entry methods (questions, image, choices, socials, video, X, share, bonus, custom)', async () => {
    let n = 0; for (const [cat, m] of FLEXIVIRAL_ENTRIES) if (await fv.addEntry(cat, m)) n++;
    return n;
  });
  expect(added, 'At least one entry method must be added').toBeGreaterThan(0);
  await flow.step('Prize', async () => { await fv.next(); await fv.setPrize(); await fv.next(); });
  await flow.step('Settings + save', () => fv.finish());
  const contest = await flow.step('Visit the contest page and register', () => fv.visitAndRegister(ME.firstName, entrant));
  flow.completed({ 'Entry methods added': `${added} of ${FLEXIVIRAL_ENTRIES.length}`, 'Contest page': contest.url(), Entrant: entrant });
  await keepBrowserOpenIfSingleRun(contest);
});
