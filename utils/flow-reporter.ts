import { test } from '@playwright/test';

/**
 * Prints each step of a flow to the terminal and a clear COMPLETED / FAILED summary at the end.
 *
 *   const flow = new FlowReporter('Course Yearly', 7, { Project: 'Project Yearly Abc' });
 *   await flow.step('Login', async () => { ... });
 *   flow.completed({ 'Thank-you URL': url });
 */
export class FlowReporter {
  private current = 0;
  private readonly started = Date.now();
  private readonly done: string[] = [];

  constructor(
    private readonly name: string,
    private readonly totalSteps: number,
    private readonly details: Record<string, string> = {}
  ) {
    console.log('\n' + '='.repeat(64));
    console.log(`>>> FLOW STARTED: ${name}`);
    for (const [k, v] of Object.entries(details)) console.log(`    ${k}: ${v}`);
    console.log('='.repeat(64) + '\n');
  }

  /** Runs one step, printing "[STEP n/N] ... " before and "✔ done (Xs)" after. */
  async step<T>(title: string, fn: () => Promise<T>): Promise<T> {
    this.current++;
    const label = `[STEP ${this.current}/${this.totalSteps}] ${title}`;
    console.log(`\n>>> ${label} ...`);
    const t = Date.now();
    try {
      // test.step also makes the step show up in the Playwright report / UI
      const result = await test.step(title, fn);
      console.log(`>>> ${label} ✔ done (${((Date.now() - t) / 1000).toFixed(1)}s)`);
      this.done.push(title);
      return result;
    } catch (err) {
      this.failed(title, err);
      throw err;
    }
  }

  /** Big green-light summary at the end of a successful flow. */
  completed(extra: Record<string, string> = {}) {
    const secs = ((Date.now() - this.started) / 1000).toFixed(1);
    console.log('\n' + '#'.repeat(64));
    console.log(`>>> ✅ FLOW COMPLETED SUCCESSFULLY: ${this.name}`);
    for (const [k, v] of Object.entries({ ...this.details, ...extra })) console.log(`    ${k}: ${v}`);
    console.log(`    Steps: ${this.done.length}/${this.totalSteps} passed | Time: ${secs}s`);
    console.log('#'.repeat(64) + '\n');
  }

  private failed(stepTitle: string, err: unknown) {
    const msg = String(err instanceof Error ? err.message : err).split('\n')[0];
    console.log('\n' + '!'.repeat(64));
    console.log(`>>> ❌ FLOW FAILED: ${this.name}`);
    console.log(`    Failed at: [STEP ${this.current}/${this.totalSteps}] ${stepTitle}`);
    console.log(`    Reason: ${msg}`);
    if (this.done.length) console.log(`    Completed before failing: ${this.done.join(' -> ')}`);
    console.log('!'.repeat(64) + '\n');
  }
}
