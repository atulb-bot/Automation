import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * When the script can't do a step, it asks YOU to do it in the test browser and then carries on.
 * It continues as soon as it can see the result (isDone), or when you press
 * "I've done it - continue" on the dashboard / run `npm run continue`.
 * Turn off with MANUAL_ASSIST=0 (then failures stop the run straight away, as before).
 */
const FLAG = path.resolve(process.cwd(), 'state', 'continue.flag');

export async function waitForManualStep(
  page: Page | null,
  step: string,
  what: string,
  isDone?: () => Promise<boolean>,
  minutes = Number(process.env.MANUAL_WAIT_MIN || 5)
): Promise<boolean> {
  if (process.env.MANUAL_ASSIST === '0') return false;
  try { fs.rmSync(FLAG, { force: true }); } catch {}
  const started = Date.now();
  console.log('\n' + '~'.repeat(64));
  console.log(`>>> ✋ MANUAL STEP NEEDED: ${step}`);
  console.log(`    What to do: ${what}`);
  console.log(`    The test continues by itself when it sees this is done (waiting up to ${minutes} min),`);
  console.log(`    or press "I've done it - continue" on the dashboard (or run: npm run continue).`);
  console.log('~'.repeat(64) + '\n');
  while (Date.now() - started < minutes * 60000) {
    if (page && page.isClosed()) break;
    if (fs.existsSync(FLAG)) {
      try { fs.rmSync(FLAG, { force: true }); } catch {}
      console.log(`>>> ✅ MANUAL STEP DONE (you pressed continue): ${step}`);
      return true;
    }
    if (isDone && (await isDone().catch(() => false))) {
      console.log(`>>> ✅ MANUAL STEP DONE (detected): ${step}`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(`>>> ⏱ MANUAL STEP NOT DONE within ${minutes} min: ${step}`);
  return false;
}
