import type { Reporter, FullConfig, Suite } from '@playwright/test/reporter';

/**
 * Runs before any test starts and counts how many tests were selected.
 * Result is shared with the tests through process.env.FF_TOTAL_TESTS
 * (workers are started after this, so they inherit it).
 *
 *   1 test selected  -> browser stays open at the dashboard after the flow
 *   2+ tests         -> normal: close, open a new browser, next account/plan
 */
export default class RunModeReporter implements Reporter {
  onBegin(_config: FullConfig, suite: Suite) {
    const total = suite.allTests().length;
    process.env.FF_TOTAL_TESTS = String(total);
    const mode = total === 1
      ? 'SINGLE test - browser will stay open at the dashboard when done'
      : `FULL run (${total} tests) - each account runs in a fresh browser, one after another`;
    console.log(`\n>>> RUN MODE: ${mode}\n`);
  }

  printsToStdio() {
    return false;
  }
}
