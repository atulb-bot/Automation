import * as fs from 'fs';
import * as path from 'path';

/**
 * "Finish run": a test that keeps its browser open at the end (Thank You page) ends normally,
 * as PASSED, when this signal appears - sent by the dashboard's "Finish run" button
 * or by `npm run finish`. Closing the browser window still works too.
 */
const FLAG = path.resolve(process.cwd(), 'state', 'finish.flag');

export function clearFinishSignal() {
  try { fs.rmSync(FLAG, { force: true }); } catch {}
}

/** Resolves when the finish signal appears or done() becomes true (checked every second). */
export function waitForFinishOr(done: () => boolean): Promise<'finish' | 'closed'> {
  return new Promise((resolve) => {
    const t = setInterval(() => {
      if (fs.existsSync(FLAG)) { clearInterval(t); clearFinishSignal(); resolve('finish'); return; }
      if (done()) { clearInterval(t); resolve('closed'); }
    }, 1000);
  });
}
