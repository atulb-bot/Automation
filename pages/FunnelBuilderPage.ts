import { Page, Locator, expect } from '@playwright/test';
import { Logger } from '../utils/logger';
import { PopupHandler } from '../utils/popup-handler';
import { waitForManualStep } from '../utils/manual-assist';
import { TestContext } from '../utils/test-context';
import { Helpers } from '../utils/helpers';
import { ProductConfig } from './ProductsPage';
import { saveEditorPage } from '../utils/editor-save';

export class FunnelBuilderPage {
  constructor(private page: Page, private context: TestContext) {}

  public async openFunnels(): Promise<void> {
    this.context.recordStep('Open Funnels Tab');
    Logger.info('FUNNEL_BUILDER', 'Navigating to Funnel Builder...');
    await PopupHandler.dismissKnownPopups(this.page);
    await this.page.goto('https://app.flexifunnels.com/funnels', { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Builds the funnel tree exactly as FlexiFunnels structures it (confirmed
   * against the live "Funnel Steps" list, not a flat chain):
   *
   *   FE --(Purchases)--> OTO1
   *   OTO1 --(Purchases/Upsell)--> OTO2
   *   OTO1 --(Say no to/Downsell)--> DS1
   *   OTO2 --(Say no to/Downsell)--> DS2
   *
   * `products` must be [FE, OTO1, DS1, OTO2, DS2] in that order. Every
   * product is selected from its dropdown by exact name (never a blind
   * positional click), and every "Add Next Step" click is targeted at the
   * specific branch row (Purchases vs Say no to) for the correct source
   * product -- not just "whichever button is last on screen" -- so OTO2
   * and DS1 can't get attached to the wrong parent.
   */
  public async createFunnel(funnelName: string, isOneClick: boolean, products: ProductConfig[]): Promise<void> {
    this.context.recordStep(`Create Funnel: ${funnelName}`);
    Logger.info('FUNNEL_BUILDER', `Creating ${isOneClick ? 'One-Click' : 'Regular'} Funnel: ${funnelName}`);

    await this.openFunnels();
    await PopupHandler.dismissKnownPopups(this.page);

    await this.page.getByRole('button', { name: 'Create New Funnel' }).click();
    await Helpers.stepDelay(this.page);

    const nameInput = this.page.getByRole('textbox', { name: 'Enter Funnel name' });
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.fill(funnelName);
    await this.page.getByRole('button', { name: 'Next →' }).click();
    await Helpers.stepDelay(this.page);

    if (isOneClick) {
      await this.page.getByRole('button', { name: 'One-Click Upsell Save payment' }).click();
    } else {
      await this.page.getByRole('button', { name: 'Normal Funnel Standard' }).click();
    }
    await this.page.getByRole('button', { name: 'Next →' }).click();
    await Helpers.stepDelay(this.page);

    const [feProduct, oto1Product, ds1Product, oto2Product, ds2Product] = products;
    if (!feProduct || !oto1Product || !ds1Product || !oto2Product || !ds2Product) {
      throw new Error('createFunnel requires exactly 5 products in order: [FE, OTO1, DS1, OTO2, DS2].');
    }

    const productTrigger = this.page.locator('div').filter({ hasText: /^Search and select a product\.\.\.$/ }).nth(1);
    await Helpers.selectProductFromDropdown(this.page, productTrigger, feProduct.productName);
    await Helpers.stepDelay(this.page);

    await this.page.getByRole('button', { name: 'Create Funnel' }).click();
    await Helpers.stepDelay(this.page);
    Logger.info('FUNNEL_BUILDER', `Main Funnel created with FE Product "${feProduct.productName}"`);

    // FE -> OTO1: only one "Add Next Step" exists at this point, so a plain
    // last-visible click is unambiguous -- no branch label to match yet.
    await this.addFunnelStep('OTO1 (FE -> Purchases)', oto1Product.productName, null, funnelName);

    // OTO1 -> OTO2 on the Purchases/Upsell branch of OTO1.
    await this.addFunnelStep('OTO2 (OTO1 -> Purchases)', oto2Product.productName, { sourceProductName: oto1Product.productName, branch: 'upsell' }, funnelName);

    // OTO1 -> DS1 on the Say no to/Downsell branch of OTO1.
    await this.addFunnelStep('DS1 (OTO1 -> Say no to)', ds1Product.productName, { sourceProductName: oto1Product.productName, branch: 'downsell' }, funnelName);

    // DS1 -> OTO2 on BOTH branches, wired immediately while DS1 is the only
    // node with unattached branches. Per spec, whether the visitor takes the
    // DS1 offer or not, the funnel continues on to the already-existing OTO2
    // step (not a new product page). Deliberately done BEFORE creating DS2
    // below: once DS2 exists it has its own pair of unattached "Add Next
    // Step" buttons, and if the position-matching for DS1's row ever misses
    // (virtualized-list/scroll timing), the old code's fallback would grab
    // "whatever Add Next Step button is last on screen" -- which is exactly
    // how a previous run ended up wiring DS2's "Say no to" branch to OTO2
    // instead of DS1's. Wiring DS1 first, before DS2 exists, removes that
    // ambiguity at the source; clickAddNextStep() below also no longer
    // blind-guesses a fallback button at all (see its comment).
    await this.addFunnelStep('OTO2 (DS1 -> Purchases)', oto2Product.productName, { sourceProductName: ds1Product.productName, branch: 'upsell' }, funnelName);
    await this.addFunnelStep('OTO2 (DS1 -> Say no to)', oto2Product.productName, { sourceProductName: ds1Product.productName, branch: 'downsell' }, funnelName);

    // OTO2 -> DS2 on the Say no to/Downsell branch of OTO2. Created last, so
    // there's no other node with fresh unattached branches for its click to
    // be mis-targeted onto.
    await this.addFunnelStep('DS2 (OTO2 -> Say no to)', ds2Product.productName, { sourceProductName: oto2Product.productName, branch: 'downsell' }, funnelName);
    await this.ensureStepWired('OTO2 -> Say no to -> DS2', ds2Product.productName, { sourceProductName: oto2Product.productName, branch: 'downsell' }, funnelName);

    // Verify the tree actually landed as intended before handing control
    // back to the caller (which typically wires the sales page next). This
    // is diagnostic only -- it logs warnings but never throws or blocks the
    // run. Two reasons: (1) the scroll+pixel-band heuristic this relies on
    // has already produced false reads a few times (cross-funnel text
    // bleed-through, mid-render mismatches), so it's not reliable enough to
    // gate the whole run on; (2) a single slow/stuck DOM read here used to
    // be able to hang the entire test with zero output, since nothing was
    // logged until the block finished. Every check below now has its own
    // hard timeout and its own log line, so a stall shows exactly where it
    // stalled instead of just going silent, and can never block progress to
    // wiring the sales pages.
    Logger.info('FUNNEL_BUILDER', 'Verifying funnel tree wiring (diagnostic only -- will not block the run)...');

    const checks: { sourceProductName: string; branch: 'upsell' | 'downsell'; expectedNext: string; label: string }[] = [
      { sourceProductName: oto1Product.productName, branch: 'upsell', expectedNext: oto2Product.productName, label: 'OTO1 -> OTO2 (Purchases)' },
      { sourceProductName: oto1Product.productName, branch: 'downsell', expectedNext: ds1Product.productName, label: 'OTO1 -> DS1 (Say no to)' },
      { sourceProductName: ds1Product.productName, branch: 'upsell', expectedNext: oto2Product.productName, label: 'DS1 -> OTO2 (Purchases)' },
      { sourceProductName: ds1Product.productName, branch: 'downsell', expectedNext: oto2Product.productName, label: 'DS1 -> OTO2 (Say no to)' },
      { sourceProductName: oto2Product.productName, branch: 'downsell', expectedNext: ds2Product.productName, label: 'OTO2 -> DS2 (Say no to)' },
    ];

    const failures: string[] = [];
    for (const check of checks) {
      Logger.info('FUNNEL_BUILDER', `Verifying: ${check.label}...`);
      const ok = await this.withTimeout(
        this.verifyStepWiring(check.sourceProductName, check.branch, check.expectedNext, funnelName),
        20000,
        false // timeout -> treat as "not confirmed" rather than hanging
      );
      if (!ok) {
        failures.push(check.label);
        Logger.warn('FUNNEL_BUILDER', `Could not confirm wire: ${check.label} (may still be correct -- verification is best-effort).`);
      }
    }

    // Also check DS2's own branches weren't accidentally wired to anything
    // (per spec both should stay on the default Thank You page) -- same
    // diagnostic-only treatment.
    const unexpectedWires: string[] = [];
    for (const branch of ['upsell', 'downsell'] as const) {
      Logger.info('FUNNEL_BUILDER', `Verifying: DS2 (${branch === 'upsell' ? 'Purchases' : 'Say no to'}) should be unwired...`);
      const result = await this.withTimeout(
        this.locateBranchRow(ds2Product.productName, branch, funnelName),
        20000,
        { button: null, nextStepText: null } // timeout -> assume nothing to report rather than hanging
      );
      if (result.nextStepText && result.nextStepText.trim().length > 0) {
        unexpectedWires.push(
          `DS2 (${branch === 'upsell' ? 'Purchases' : 'Say no to'}) unexpectedly shows next step "${result.nextStepText}" -- should be left as the default Thank You page.`
        );
      }
    }

    if (failures.length > 0 || unexpectedWires.length > 0) {
      Logger.warn(
        'FUNNEL_BUILDER',
        `Verification found possible issues (continuing anyway -- this does not stop the run): ` +
        (failures.length > 0 ? `Unconfirmed wires: ${failures.join(', ')}. ` : '') +
        (unexpectedWires.length > 0 ? `Unexpected wires: ${unexpectedWires.join(' ')} ` : '')
      );
    } else {
      Logger.info('FUNNEL_BUILDER', 'Verified all funnel branches wired to the correct next step.');
    }
  }

  /**
   * Confirms a branch is wired to the expected product. If not, adds the step once more;
   * if it is STILL not wired, stops the run with a clear message (used for the last step,
   * OTO2 -> "Say no to" -> DS2, which used to go missing silently).
   */
  private async ensureStepWired(
    label: string,
    expectedProductName: string,
    target: { sourceProductName: string; branch: 'upsell' | 'downsell' },
    funnelName?: string
  ): Promise<void> {
    const check = () =>
      this.withTimeout(this.verifyStepWiring(target.sourceProductName, target.branch, expectedProductName, funnelName), 30000, false);

    await this.page.waitForTimeout(2000);
    if (await check()) {
      Logger.info('FUNNEL_BUILDER', `✅ Confirmed: ${label}`);
      return;
    }
    Logger.warn('FUNNEL_BUILDER', `${label} not found in the funnel steps - adding it again.`);
    await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.page.waitForTimeout(4000);
    if (await check()) {
      Logger.info('FUNNEL_BUILDER', `✅ Confirmed after reload: ${label}`);
      return;
    }
    await this.addFunnelStep(`${label} (retry)`, expectedProductName, target, funnelName);
    await this.page.waitForTimeout(2000);
    if (await check()) {
      Logger.info('FUNNEL_BUILDER', `✅ Confirmed after retry: ${label}`);
      return;
    }
    await Helpers.captureDiagnosticScreenshot(this.page, `funnel-step-missing-${label}`);
    if (await waitForManualStep(this.page, `Add the funnel step: ${label}`,
      `In Funnel Steps: on the "${target.branch === 'upsell' ? 'Purchases' : 'Say no to'}" row of "${target.sourceProductName}" click Add Next Step and choose "${expectedProductName}".`,
      () => check())) return;
    throw new Error(`Funnel step missing: ${label}. The "${target.branch === 'upsell' ? 'Purchases' : 'Say no to'}" row of "${target.sourceProductName}" is not showing "${expectedProductName}" as its next step. Screenshot saved in test-results/.`);
  }

  /**
   * Races `promise` against a timeout so a single slow/stuck check can never
   * hang the run -- resolves to `fallback` instead if the timeout wins.
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  /**
   * Locates the "row" for a specific branch (Purchases/Say no to) off a
   * specific source product by PIXEL POSITION rather than DOM ancestry.
   *
   * Why: climbing DOM ancestors to find a shared "row" container turned out
   * to be unreliable here -- the Funnel Steps list renders as a flat
   * grid/list with no per-row wrapper element, so climbing ancestors from a
   * button just reached the entire panel (which contains every row's text
   * at once). That made every match trivially "succeed" on the very first
   * button checked, which is why every new step kept attaching to the
   * bottom-most Downsell row regardless of which branch was actually
   * requested (confirmed by the observed output: FE->OTO1->OTO2->DS1->DS2
   * all chained through "Say no to", every "Purchases" branch left empty).
   *
   * Position-based matching sidesteps DOM structure entirely: find the
   * exact-text action label ("Purchases"/"Say no to") and the exact-text
   * source product name, and treat them as the same row only if they sit in
   * the same horizontal band on screen (a real visual row) -- this is true
   * regardless of how the underlying markup nests things.
   *
   * Returns a Playwright Locator for either the target "Add Next Step"
   * button (if that row is still unattached) or the row's already-wired
   * "next step" text (if a real match was found), tagged via a temporary
   * `data-ff-row` attribute so the caller gets back a real, actionable
   * Locator rather than raw coordinates.
   */
  private async locateBranchRow(
    sourceProductName: string,
    branch: 'upsell' | 'downsell',
    funnelName?: string
  ): Promise<{ button: import('@playwright/test').Locator | null; nextStepText: string | null }> {
    const actionText = branch === 'upsell' ? 'Purchases' : 'Say no to';
    const marker = `ff-row-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    const result = await this.page.evaluate(
      ({ actionText, sourceProductName, marker, funnelName }) => {
        function ownExactText(el: Element): string {
          return (el.textContent || '').replace(/\s+/g, ' ').trim();
        }
        function yCenter(el: Element): number {
          const r = el.getBoundingClientRect();
          return r.top + r.height / 2;
        }
        function bySmallestArea(a: HTMLElement, b: HTMLElement): number {
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          return ra.width * ra.height - rb.width * rb.height;
        }

        const all = Array.from(document.querySelectorAll('body *')) as HTMLElement[];
        const actionEls = all.filter((el) => ownExactText(el) === actionText).sort(bySmallestArea);
        // Only the PRODUCT NAME cell of a row counts (it sits next to "ID: 133539").
        // The same name also appears as a chip in other rows' NEXT STEP column -- those have no ID
        // and used to be mistaken for this product's row.
        const isProductCell = (el: HTMLElement): boolean => {
          let n: HTMLElement | null = el;
          for (let i = 0; i < 3 && n; i++) {
            n = n.parentElement;
            if (!n) break;
            const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
            if (/ID:\s*\d+/.test(t) && t.length <= sourceProductName.length + 30) return true;
          }
          return false;
        };
        const productEls = all
          .filter((el) => ownExactText(el) === sourceProductName)
          .filter(isProductCell)
          .sort(bySmallestArea);
        const nextStepButtons = Array.from(document.querySelectorAll('button')).filter((b) =>
          (b.textContent || '').replace(/\s+/g, ' ').includes('Add Next Step')
        ) as HTMLButtonElement[];

        const ROW_BAND_PX = 45;

        for (const actionEl of actionEls) {
          const ay = yCenter(actionEl);
          const productMatch = productEls.find((p) => Math.abs(yCenter(p) - ay) < ROW_BAND_PX);
          if (!productMatch) continue;

          const btnMatch = nextStepButtons
            .map((b) => ({ b, dy: Math.abs(yCenter(b) - ay) }))
            .filter((x) => x.dy < ROW_BAND_PX)
            .sort((x, y) => x.dy - y.dy)[0];
          if (btnMatch) {
            btnMatch.b.setAttribute('data-ff-row', marker);
            return { hasButton: true, nextStepText: null };
          }

          // No unattached "Add Next Step" button on this row -- it's likely
          // already wired. Read whatever text sits in the same row band to
          // the right of the product name as the "next step" value.
          const rowTexts = all
            .filter((el) => el.children.length === 0) // leaf-ish text nodes only
            .filter((el) => Math.abs(yCenter(el) - ay) < ROW_BAND_PX)
            .map((el) => ownExactText(el))
            .filter((t) => t && t !== actionText && t !== sourceProductName && !/^ID:/i.test(t));
          const candidate = rowTexts.join(' | ') || null;

          // Guard against stale/overlay text bleeding in from a completely
          // DIFFERENT funnel (confirmed real case: this exact row band
          // matched text belonging to "QA vLOWEh Funnel(Copy 1)" while
          // building "QA TxxVuT Funnel" — a leftover/duplicate funnel's
          // row data sitting at the same pixel position, not this funnel's
          // actual state). "Next step" text is pipe-delimited
          // (Funnel | Timestamp | Branch | Target); if it names a funnel
          // and that funnel isn't the one we're building, it can't be this
          // row's real wiring -- skip it and keep checking other action-el
          // matches instead of trusting it or giving up.
          return { hasButton: false, nextStepText: candidate };
        }

        return { hasButton: false, nextStepText: null };
      },
      { actionText, sourceProductName, marker, funnelName: funnelName || null }
    );

    if (result.hasButton) {
      return { button: this.page.locator(`[data-ff-row="${marker}"]`).first(), nextStepText: null };
    }
    return { button: null, nextStepText: result.nextStepText };
  }

  /**
   * Confirms a specific branch row (source product + Purchases/Say no to)
   * actually shows `expectedNext` in its "Next Step" column, scrolling the
   * panel to the bottom first so rows that only exist below the current
   * scroll position are actually mounted/checkable.
   */
  private async verifyStepWiring(sourceProductName: string, branch: 'upsell' | 'downsell', expectedNext: string, funnelName?: string): Promise<boolean> {
    const anyRow = this.page.locator('div').filter({ hasText: sourceProductName }).last();
    await Helpers.scrollContainerToBottom(this.page, anyRow).catch(() => {});

    const { nextStepText } = await this.locateBranchRow(sourceProductName, branch, funnelName);
    return !!nextStepText && nextStepText.includes(expectedNext);
  }

  /**
   * Finds the nearest scrollable ancestor of `elementInsideContainer` (same
   * search logic as Helpers.scrollContainerToBottom) and returns an
   * ElementHandle for it, or null if none exists. Used so
   * scrollIncrementallyUntilFound() can drive the SAME container step by
   * step instead of jumping straight to its bottom.
   */
  private async getScrollableAncestor(elementInsideContainer: Locator): Promise<import('@playwright/test').JSHandle | null> {
    const handle = await elementInsideContainer.elementHandle().catch(() => null);
    if (!handle) return null;
    const scrollable = await this.page.evaluateHandle((el) => {
      function isScrollable(node: HTMLElement): boolean {
        const style = window.getComputedStyle(node);
        return /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 4;
      }
      let node = (el as HTMLElement).parentElement;
      while (node && node !== document.body) {
        if (isScrollable(node)) return node;
        node = node.parentElement;
      }
      return null;
    }, handle).catch(() => null);
    if (!scrollable || (await scrollable.evaluate((n) => n === null).catch(() => true))) return null;
    return scrollable;
  }

  /**
   * Searches for a specific branch row by scrolling its panel in small
   * increments from the TOP, checking after every step, instead of jumping
   * straight to the bottom.
   *
   * Why this replaced a straight "scroll to bottom" approach: the "Funnel
   * Steps" panel renders as a virtualized/lazily-mounted list, and jumping
   * straight to the very bottom can UNMOUNT a row that sits in the middle of
   * the list (like a node's second branch, right after its first branch was
   * just wired) instead of revealing it -- the opposite of what scrolling
   * was meant to do. Confirmed as the actual cause of a real stuck run:
   * "DS1 -> Say no to" is created right after "DS1 -> Purchases", so by the
   * time this runs there's meaningful content both above and below it, and
   * always scrolling to the absolute bottom scrolled straight past it.
   * Stepping down from the top and checking at every increment guarantees
   * the row's own viewport window is actually passed through and mounted.
   */
  private async scrollIncrementallyUntilFound(
    sourceProductName: string,
    branch: 'upsell' | 'downsell',
    funnelName?: string,
    maxSteps: number = 30
  ): Promise<{ button: Locator | null; nextStepText: string | null }> {
    // IMPORTANT: a `button` match is definitive and returns immediately --
    // it's a real, currently-rendered "Add Next Step" button, unambiguous.
    // A `nextStepText` match is NOT trusted on sight, though: the pixel-band
    // matching in locateBranchRow() searches the whole document, and another
    // already-wired row can legitimately contain the SAME product name as
    // plain text (e.g. searching for source "DS1" can land on the row for
    // "FE -> OTO1", since FE's own "next step" column happens to render
    // nearby text) if that other row is what's currently on screen. Treating
    // that as the final answer without ever scrolling down is exactly what
    // produced a false "already wired" for "DS1 -> Say no to" when the real
    // (still unattached) DS1 row was further down and simply hadn't been
    // scrolled into view yet. So: keep the most recent text match only as a
    // fallback candidate, and keep sweeping all the way to the bottom of the
    // panel looking for an actual button before ever trusting it.
    let candidateText: string | null = null;

    const anchor = this.page.locator('div').filter({ hasText: sourceProductName }).last();
    const scrollable = await this.getScrollableAncestor(anchor);

    // Cheap first check -- it might already be on screen with no scrolling
    // needed. Still only a candidate if it's text-only, not a final answer.
    let result = await this.locateBranchRow(sourceProductName, branch, funnelName);
    if (result.button) return result;
    if (result.nextStepText) candidateText = result.nextStepText;

    if (!scrollable) return { button: null, nextStepText: candidateText };

    // Reset to the top so every attempt sweeps the same ground the same way,
    // rather than starting from wherever a previous step's scrolling left off.
    await scrollable.evaluate((el) => { (el as HTMLElement).scrollTop = 0; }).catch(() => {});
    await this.page.waitForTimeout(400);

    for (let step = 0; step < maxSteps; step++) {
      result = await this.locateBranchRow(sourceProductName, branch, funnelName);
      if (result.button) return result; // definitive -- stop here
      if (result.nextStepText) candidateText = result.nextStepText; // keep sweeping past it

      const reachedBottom = await scrollable.evaluate((el) => {
        const node = el as HTMLElement;
        const before = node.scrollTop;
        node.scrollTop = Math.min(node.scrollTop + 300, node.scrollHeight);
        return node.scrollTop === before;
      }).catch(() => true);

      await this.page.waitForTimeout(350);
      if (reachedBottom) break;
    }

    // One last check at whatever position we ended on (in case the bottom
    // itself only just mounted the real row).
    const final = await this.locateBranchRow(sourceProductName, branch, funnelName);
    if (final.button) return final;
    if (final.nextStepText) candidateText = final.nextStepText;

    // No actual button was ever found across the full sweep -- only now is
    // the text candidate trustworthy enough to report as "already wired".
    return { button: null, nextStepText: candidateText };
  }

  /**
   * Finds and clicks the "Add Next Step" button for a specific branch off a
   * specific source product's row, via `locateBranchRow` (pixel-position
   * matching, not DOM ancestry -- see that method's comment for why).
   *
   * `target` of `null` means "there's only one unambiguous button right
   * now" (used right after creating the FE step) -- that case alone uses
   * the last visible "Add Next Step" button with no matching.
   *
   * When `target` IS given, this deliberately does NOT fall back to "just
   * click whatever Add Next Step button is last on screen" if the specific
   * row can't be found. That fallback used to exist here, and it's exactly
   * what caused a real, confirmed bug: while wiring "DS1 -> Say no to", the
   * row-match missed, the code fell back to the last visible button, and
   * that button turned out to belong to DS2's still-unattached "Say no to"
   * branch -- silently wiring DS2's decline to OTO2 (wrong) while leaving
   * DS1's decline unwired (also wrong). A wrong click on a live account is
   * worse than stopping, so this retries via scrollIncrementallyUntilFound()
   * (see its comment for why straight-to-bottom scrolling was itself the
   * deeper cause) and throws -- with a diagnostic screenshot -- instead of
   * guessing if the row genuinely can't be found.
   */
  private async clickAddNextStep(target: { sourceProductName: string; branch: 'upsell' | 'downsell' } | null, funnelName?: string): Promise<boolean> {
    const buttons = this.page.getByRole('button', { name: 'Add Next Step' });

    if (target) {
      let button: Locator | null = null;

      // Up to 3 full sweeps (top -> bottom, incrementally) since a single
      // sweep can still land on a slow-hydrating render.
      for (let sweep = 0; sweep < 3 && !button; sweep++) {
        const result = await this.scrollIncrementallyUntilFound(target.sourceProductName, target.branch, funnelName);
        if (result.button) {
          button = result.button;
          break;
        }
        if (result.nextStepText) {
          // Row exists and is already wired to something -- not a "can't
          // find it" case at all, just nothing to click. Let the caller's
          // own verification step catch whether that existing wire is
          // correct rather than treating this as a failure here. (By this
          // point locateBranchRow has already ruled out that this text is
          // leftover from a different funnel, when funnelName was given.)
          Logger.info(
            'FUNNEL_BUILDER',
            `Branch "${target.branch}" off "${target.sourceProductName}" is already wired to "${result.nextStepText}" — nothing to click.`
          );
          return false;
        }
        await this.page.waitForTimeout(600);
      }

      if (button) {
        await button.scrollIntoViewIfNeeded().catch(() => {});
        await button.click();
        return true;
      }

      await Helpers.captureDiagnosticScreenshot(
        this.page,
        `add-next-step-not-found-${target.sourceProductName}-${target.branch}`
      );
      throw new Error(
        `Could not find the "Add Next Step" row for product "${target.sourceProductName}" / branch "${target.branch}" ` +
        `after multiple incremental scroll sweeps. Refusing to fall back to "last visible button" -- that fallback is what ` +
        `previously caused a wire to attach to the wrong product's branch. A diagnostic screenshot was saved to test-results/. ` +
        `Stopping instead of guessing.`
      );
    }

    const count = await buttons.count();
    for (let i = count - 1; i >= 0; i--) {
      const btn = buttons.nth(i);
      if (await btn.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false)) {
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await btn.click();
        return true;
      }
    }
    return false;
  }

  private async addFunnelStep(
    stepLabel: string,
    productName: string,
    branchTarget: { sourceProductName: string; branch: 'upsell' | 'downsell' } | null,
    funnelName?: string
  ): Promise<void> {
    Logger.info('FUNNEL_BUILDER', `Adding step: ${stepLabel} ("${productName}")`);
    await PopupHandler.dismissKnownPopups(this.page);

    const opened = await this.clickAddNextStep(branchTarget, funnelName);
    if (!opened) {
      throw new Error(`"Add Next Step" button not found/visible -- step "${stepLabel}" could not be attached.`);
    }
    await Helpers.stepDelay(this.page);

    const stepProductTrigger = this.page.locator('div').filter({ hasText: /^Search and select a product\.\.\.$/ }).nth(1);

    // Some steps (confirmed via recording -- seen right after an OTO node)
    // need one extra "unlock" click on the step's small round icon before
    // "Add Next Step" actually opens the product picker. Only fire this
    // fallback when the picker didn't show up on its own, so steps that
    // don't need it aren't slowed down or knocked off track.
    if (!(await stepProductTrigger.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false))) {
      const unlockIcon = this.page.locator('.w-8.h-8.flex.items-center.justify-center.rounded-md').first();
      if (await unlockIcon.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false)) {
        await unlockIcon.click();
        await Helpers.stepDelay(this.page);
        await this.clickAddNextStep(branchTarget, funnelName);
        await Helpers.stepDelay(this.page);
      }
    }

    await Helpers.selectProductFromDropdown(this.page, stepProductTrigger, productName);
    await Helpers.stepDelay(this.page);

    // Confirmed via recording: this action's button is labelled "Add to
    // Funnel" (older code assumed "Continue to Add") -- accept either so a
    // step-type variation doesn't stall the whole build.
    const addToFunnelBtn = this.page.getByRole('button', { name: 'Add to Funnel' })
      .or(this.page.getByRole('button', { name: 'Continue to Add' }));
    await expect(addToFunnelBtn.first()).toBeVisible({ timeout: 10000 });
    await addToFunnelBtn.first().click();
    await Helpers.stepDelay(this.page);
    Logger.info('FUNNEL_BUILDER', `Step "${stepLabel}" attached with product "${productName}".`);
  }

  /**
   * Wires the CTA of every product's sales page (FE, OTO1, DS1, OTO2, DS2)
   * to its "Go To Next Step" target, then publishes it -- reusing
   * wireSalesPageToFunnel() for each one, since that method was already
   * written generically (takes salesPageName as a param) but was previously
   * only ever called once, for the FE sales page. The other 4 sales pages
   * were being published with a template but their CTA was never wired to
   * point anywhere.
   *
   * Also wires a secondary "No thanks" decline link on the two OTO (upsell)
   * sales pages straight to their downsell -- OTO1 -> DS1, OTO2 -> DS2 --
   * so a visitor who declines the upsell skips checkout and lands on the
   * downsell offer directly, instead of only having the main "buy" CTA wired.
   */
  public async wireAllSalesPages(products: ProductConfig[], funnelName: string): Promise<void> {
    // Recorded flow (same steps for every sales page, only the product changes):
    //   open "<X> Sales" -> select a spot -> Components -> Elements -> Button -> select new CTA
    //   -> Components -> No Thanks Button -> CTA -> settings -> Go To Next Step In Product
    //   -> "--select a one--" -> "<X> product" -> Publish -> Publish as Sales Page -> Close
    // The product's funnel ("${funnelName}") then routes the buyer to the next step.
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      Logger.info('FUNNEL_BUILDER', `[${i + 1}/${products.length}] Wiring "${product.salesPageName}" -> product "${product.productName}"`);
      await this.wireAndPublishSalesPage(product, {
        funnelName,
        withNoThanks: product.key !== 'FE', // funnel flow: every page except FE gets a wired "No thanks"
        blank: process.env.PAGE_MODE !== 'template', // blank pages by default
      });
    }
    Logger.info('FUNNEL_BUILDER', `✅ Wired and published all ${products.length} sales pages.`);
  }

  /**
   * One sales page, as recorded. Stops with a clear error if anything can't be done.
   *   blank=false (template page): select a spot -> Components -> Elements -> Button
   *   blank=true  (Blank Template): +Add New Section -> Section -> +Add Row -> 2 Columns
   *               -> +Add Element -> Headline "Sales FE" -> +Add Element -> Button
   * then: [No Thanks Button under the CTA]  -> CTA: funnel flow -> Go To Next Step In Funnel -> funnel -> own product
   *                                                single product -> Go To Next Step In Product -> own product
   *       -> [No thanks: Go To Next Step In Funnel -> funnel -> own product -> Upsell / Downsell]
   *       -> Publish -> Publish as Sales Page -> Close
   */
  public async wireAndPublishSalesPage(
    product: ProductConfig,
    opts: { funnelName?: string; withNoThanks?: boolean; blank?: boolean; headline?: string } = {}
  ): Promise<void> {
    const pageName = product.salesPageName;
    this.context.recordStep(`Wire Sales Page (Product): ${pageName}`);

    if (!(await this.openPageInProjectEditor(pageName))) {
      throw new Error(`Could not open "${pageName}" in the editor.`);
    }
    const frame = this.page.locator('iframe:not([name="fc_widget"])').first().contentFrame();
    const CTA = /click here to get access|warning\s*-\s*button action/i;
    const NO_THANKS = /^\s*no,?\s*thanks\s*$/i;

    // Wait for the canvas to load (a blank page shows "+Add New Section")
    const canvasReady = await frame
      .locator('section, h1, h2, h3, p')
      .or(frame.getByText('+Add New Section'))
      .first()
      .waitFor({ state: 'visible', timeout: 45000 })
      .then(() => true)
      .catch(() => false);
    if (!canvasReady) {
      await Helpers.captureDiagnosticScreenshot(this.page, `canvas-not-loaded-${pageName}`);
      throw new Error(`"${pageName}": the editor canvas did not load.`);
    }
    await this.page.waitForTimeout(2000);

    // Mark what is already on the page, so NEW elements can be told apart
    await frame.locator('a, button').evaluateAll((els) => els.forEach((e) => e.setAttribute('data-ff-old', '1'))).catch(() => {});
    const newCta = frame.getByRole('link', { name: CTA }).and(frame.locator(':not([data-ff-old])'));
    const newNoThanks = frame.getByRole('link', { name: NO_THANKS }).and(frame.locator(':not([data-ff-old])'));

    if (opts.blank) {
      await this.buildBlankSalesContent(frame, product, opts.headline);
      await this.clickFrameText(frame, '+Add Element', pageName);
      await this.clickTitle('Button', pageName);
    } else {
      // Select a spot in the first section, then Components -> Elements -> Button
      await frame.locator('section').first().locator('h1, h2, h3, p').first().click({ timeout: 15000 }).catch(() => {});
      await this.page.waitForTimeout(1000);
      await this.clickPanel('Components', pageName);
      await this.clickPanel('Elements', pageName, true);
      await this.clickTitle('Button', pageName);
    }
    if (!(await newCta.first().waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false))) {
      await Helpers.captureDiagnosticScreenshot(this.page, `cta-not-added-${pageName}`);
      const anyCta = frame.getByRole('link', { name: CTA });
      const done = await waitForManualStep(this.page, `Add the CTA button on "${pageName}"`,
        'In the editor: Components -> Elements -> Button (drop it on the page).',
        async () => (await anyCta.count()) > 0);
      if (!done) throw new Error(`"${pageName}": the new button did not appear on the page.`);
    }
    Logger.info('FUNNEL_BUILDER', `"${pageName}": CTA button added`);

    // Tag every CTA now (its label changes once wired, so the tag keeps track of it)
    const ctaCount = await frame.getByRole('link', { name: CTA }).evaluateAll((els) => {
      els.forEach((e, i) => e.setAttribute('data-ff-cta', String(i)));
      return els.length;
    });

    // No Thanks Button (funnel flow, not on FE). The editor refuses to drop it onto the button itself
    // ("Invalid target position"), so a valid spot under the CTA is selected first.
    if (opts.withNoThanks) {
      await this.addNoThanksUnderCta(frame, newCta, newNoThanks, pageName, !!opts.blank);
    }

    // Wire every CTA:
    //   funnel flow    -> Go To Next Step In Funnel -> funnel -> own product -> Link To
    //                     (FE: "Checkout" when offered, else "Upsell / Downsell"; other pages: "Upsell / Downsell")
    //   single product -> Go To Next Step In Product -> own product
    const inFunnel = !!opts.funnelName;
    // FE's funnel popup has only funnel + product (no "Link To"); OTO1..DS2 also have "Link To"
    const ctaLinkTo = product.key === 'FE' ? [] : [/upsell\s*\/\s*downsell/i];
    const WARN = /warning\s*-\s*button action/i;
    for (let i = 0; i < ctaCount; i++) {
      const el = frame.locator(`[data-ff-cta="${i}"]`);
      const label = `"${pageName}" CTA ${i + 1}/${ctaCount}`;
      const hadWarning = WARN.test((await el.innerText().catch(() => '')) || '');
      let ok = false;
      for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
        await el.scrollIntoViewIfNeeded().catch(() => {});
        await el.click({ timeout: 10000 }).catch(() => {});
        await this.page.waitForTimeout(1500);
        const l = attempt === 1 ? label : `${label} (retry)`;
        ok = inFunnel
          ? await this.wireSelectedElementToNextStep(opts.funnelName, product.productName, l, ctaLinkTo)
          : await this.wireSelectedToProduct(product.productName, l);
      }
      if (!ok) {
        await Helpers.captureDiagnosticScreenshot(this.page, `cta-not-wired-${pageName}-${i + 1}`);
        const how = inFunnel
          ? `Select the button -> Style Settings -> Go To Next Step In Funnel -> "${opts.funnelName}" -> "${product.productName}"${product.key === 'FE' ? '' : ' -> Link To: Upsell / Downsell'}`
          : `Select the button -> Style Settings -> Go To Next Step In Product -> "${product.productName}"`;
        const done = await waitForManualStep(this.page, `Wire ${label}`, how,
          hadWarning ? async () => !WARN.test((await el.innerText().catch(() => '')) || '') : undefined);
        if (!done) throw new Error(`${label} could not be wired (${inFunnel ? `funnel "${opts.funnelName}", ` : ''}product "${product.productName}"). Screenshot saved in test-results/.`);
      }
    }

    // Wire every "No thanks" -> Go To Next Step In Funnel -> funnel -> own product -> Upsell / Downsell
    if (opts.withNoThanks) {
      const nt = frame.getByRole('link', { name: NO_THANKS });
      const ntCount = await nt.evaluateAll((els) => {
        els.forEach((e, i) => e.setAttribute('data-ff-nt', String(i)));
        return els.length;
      });
      for (let i = 0; i < ntCount; i++) {
        const el = frame.locator(`[data-ff-nt="${i}"]`);
        const label = `"${pageName}" No thanks ${i + 1}/${ntCount}`;
        let ok = false;
        for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
          await el.scrollIntoViewIfNeeded().catch(() => {});
          await el.click({ timeout: 10000 }).catch(() => {});
          await this.page.waitForTimeout(1500);
          ok = await this.wireSelectedElementToNextStep(opts.funnelName, product.productName, attempt === 1 ? label : `${label} (retry)`);
        }
        if (!ok) {
          await Helpers.captureDiagnosticScreenshot(this.page, `no-thanks-not-wired-${pageName}-${i + 1}`);
          const done = await waitForManualStep(this.page, `Wire ${label}`,
            `Select "No thanks" -> Style Settings -> Go To Next Step In Funnel -> "${opts.funnelName}" -> "${product.productName}" -> Link To: Upsell / Downsell`);
          if (!done) throw new Error(`${label} could not be wired (funnel "${opts.funnelName}", product "${product.productName}"). Screenshot saved in test-results/.`);
        }
      }
    }

    // Publish -> Publish as Sales Page -> Close (bounded: cannot hang)
    await saveEditorPage(this.page, pageName); // Save first (keeps buttons / wiring / forms), then Publish
    await this.publishCurrentPage(pageName);
    Logger.info('FUNNEL_BUILDER', `✅ "${pageName}": CTA -> ${inFunnel ? 'funnel' : 'product'} "${product.productName}"${opts.withNoThanks ? ', No thanks -> funnel' : ''}, published`);
  }

  /**
   * Adds the "No Thanks Button" under the new CTA. Tries, in order, until one works:
   *   1. blank page: the column's "+Add Element" (same spot the Button came from)
   *   2. select the CTA, then the toolbar's first icon (select parent = its container)
   *   3. click the CTA's container directly
   * Each try is checked: the new "No thanks" must appear and no "Invalid target position" toast.
   */
  private async addNoThanksUnderCta(
    frame: import('@playwright/test').FrameLocator,
    newCta: import('@playwright/test').Locator,
    newNoThanks: import('@playwright/test').Locator,
    pageName: string,
    blank: boolean
  ): Promise<void> {
    const invalidToast = this.page.getByText(/invalid target position/i).first();
    const strategies: { name: string; select: () => Promise<boolean> }[] = [];

    if (blank) {
      strategies.push({
        name: 'column "+Add Element"',
        select: async () => {
          const ph = frame.getByText('+Add Element', { exact: true }).first();
          if (!(await ph.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false))) return false;
          await ph.click();
          return true;
        },
      });
    }
    strategies.push({
      name: 'CTA -> toolbar "select parent"',
      select: async () => {
        await newCta.first().click({ timeout: 10000 }).catch(() => {});
        await this.page.waitForTimeout(1200);
        const gear = this.page.locator('div:nth-child(5) > svg').first();
        if (!(await gear.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false))) return false;
        const parentIcon = gear.locator('xpath=../../div[1]');
        if (!(await parentIcon.isVisible().catch(() => false))) return false;
        await parentIcon.click();
        return true;
      },
    });
    strategies.push({
      name: "CTA's container",
      select: async () => {
        const container = newCta.first().locator('xpath=..');
        const box = await container.boundingBox().catch(() => null);
        if (!box) return false;
        // click the container's edge, not the button inside it
        await container.click({ position: { x: 3, y: Math.max(2, box.height - 3) }, timeout: 8000 }).catch(() => {});
        return true;
      },
    });

    for (const strat of strategies) {
      if (!(await strat.select())) continue;
      await this.page.waitForTimeout(1200);
      await this.clickPanel('Components', pageName);
      await this.clickTitle('No Thanks Button', pageName);

      const end = Date.now() + 12000;
      let added = false;
      let invalid = false;
      while (Date.now() < end) {
        if (await newNoThanks.first().isVisible().catch(() => false)) { added = true; break; }
        if (await invalidToast.isVisible().catch(() => false)) { invalid = true; break; }
        await this.page.waitForTimeout(400);
      }
      if (added) {
        Logger.info('FUNNEL_BUILDER', `"${pageName}": No Thanks button added (via ${strat.name})`);
        return;
      }
      Logger.warn('FUNNEL_BUILDER', `"${pageName}": No Thanks via ${strat.name} ${invalid ? 'was rejected ("Invalid target position")' : 'did not appear'} - trying the next spot`);
      // close the toast so it doesn't count against the next try
      await this.page.locator('button', { has: this.page.locator('svg') }).filter({ hasText: /^\s*$/ })
        .and(this.page.locator(':near(:text("Invalid target position"))')).first().click({ timeout: 2000 }).catch(() => {});
      await invalidToast.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    }

    await Helpers.captureDiagnosticScreenshot(this.page, `no-thanks-not-added-${pageName}`);
    const done = await waitForManualStep(this.page, `Add the "No thanks" button on "${pageName}"`,
      'In the editor: click under the CTA button, then Components -> No Thanks Button.',
      async () => (await frame.getByRole('link', { name: /^\s*no,?\s*thanks\s*$/i }).count()) > 0);
    if (!done) throw new Error(`"${pageName}": could not add the No Thanks button under the CTA (every spot was rejected).`);
  }

  /**
   * Blank page (recorded): +Add New Section -> Section -> +Add Row -> 2 Columns
   * -> +Add Element -> Headline -> "Sales FE" / "Sales OTO1" ...
   */
  private async buildBlankSalesContent(frame: import('@playwright/test').FrameLocator, product: ProductConfig, headline?: string) {
    const pageName = product.salesPageName;
    const headingText = headline || `Sales ${product.key}`;
    await this.clickFrameText(frame, '+Add New Section', pageName);
    await this.clickTitle('Section', pageName);
    await this.clickFrameText(frame, '+Add Row', pageName);
    await this.clickTitle('2 Columns', pageName);

    // Headline into the first column
    await this.clickFrameText(frame, '+Add Element', pageName);
    await this.clickTitle('Headline', pageName);
    const heading = frame.getByRole('heading').last();
    await heading.waitFor({ state: 'visible', timeout: 15000 });
    await heading.dblclick();
    await this.page.waitForTimeout(500);
    await heading.press('ControlOrMeta+a');
    await heading.pressSequentially(headingText, { delay: 40 });
    await this.page.waitForTimeout(800);
    // click away so the text edit is committed
    await frame.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
    await this.page.waitForTimeout(800);
    Logger.info('FUNNEL_BUILDER', `"${pageName}": section + 2 columns + headline "${headingText}" added`);
  }

  /** Clicks a "+Add ..." placeholder on the canvas (waits for it). */
  private async clickFrameText(frame: import('@playwright/test').FrameLocator, text: string, pageName: string) {
    const el = frame.getByText(text, { exact: true }).first();
    if (!(await el.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false))) {
      await Helpers.captureDiagnosticScreenshot(this.page, `canvas-${text}-${pageName}`);
      throw new Error(`"${pageName}": "${text}" not found on the canvas.`);
    }
    await el.click();
    await this.page.waitForTimeout(1500);
  }

  /** Clicks a left-panel button like "Components" / "Elements" (optional ones may already be open). */
  private async clickPanel(name: string, pageName: string, optional = false) {
    const btn = this.page.getByRole('button', { name, exact: true }).first();
    if (!(await btn.waitFor({ state: 'visible', timeout: optional ? 5000 : 15000 }).then(() => true).catch(() => false))) {
      if (optional) return;
      await Helpers.captureDiagnosticScreenshot(this.page, `panel-${name}-${pageName}`);
      throw new Error(`"${pageName}": "${name}" panel button not found.`);
    }
    await btn.click();
    await this.page.waitForTimeout(1000);
  }

  /** Clicks a block in the Components list by its title ("Button", "No Thanks Button"). */
  private async clickTitle(title: string, pageName: string) {
    const el = this.page.getByTitle(title, { exact: true }).first();
    if (!(await el.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false))) {
      await Helpers.captureDiagnosticScreenshot(this.page, `block-${title}-${pageName}`);
      throw new Error(`"${pageName}": "${title}" block not found in Components.`);
    }
    await el.click();
    await this.page.waitForTimeout(3000); // let the new element render on the canvas
  }

  /**
   * With a button selected: [settings gear] -> Go To Next Step In Product -> "--select a one--"
   * -> the product -> confirms the picker now shows that product.
   */
  private async wireSelectedToProduct(productName: string, label: string): Promise<boolean> {
    const inProduct = this.page.getByRole('button', { name: 'Go To Next Step In Product' }).first();
    // The action panel may already be open from the previous button; otherwise open it via the gear
    if (!(await inProduct.waitFor({ state: 'visible', timeout: 2500 }).then(() => true).catch(() => false))) {
      await this.openElementActionPanel();
      if (!(await inProduct.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false))) {
        Logger.warn('FUNNEL_BUILDER', `${label}: "Go To Next Step In Product" not found.`);
        return false;
      }
    }
    await inProduct.click();
    await this.page.waitForTimeout(1500);

    const esc = productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const trigger = this.page
      .getByRole('button', { name: /--\s*select a one\s*--/i })
      .or(this.page.getByRole('button', { name: new RegExp(`^\\s*${esc}\\s*$`, 'i') }))
      .first();
    if (!(await trigger.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false))) {
      Logger.warn('FUNNEL_BUILDER', `${label}: product picker ("--select a one--") not found.`);
      return false;
    }
    if (new RegExp(`^\\s*${esc}\\s*$`, 'i').test((await trigger.innerText().catch(() => '')).trim())) {
      Logger.info('FUNNEL_BUILDER', `${label}: already wired to "${productName}"`);
      return true;
    }
    await trigger.click();
    await this.page.waitForTimeout(800);

    const option = this.page.getByRole('option', { name: productName, exact: true });
    if (!(await option.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false))) {
      const search = this.page.getByRole('textbox', { name: /search/i }).last();
      if (await search.isVisible().catch(() => false)) {
        await search.fill(productName);
        await this.page.waitForTimeout(1200);
      }
    }
    if (!(await option.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false))) {
      Logger.warn('FUNNEL_BUILDER', `${label}: product "${productName}" is not in the product list.`);
      await this.page.keyboard.press('Escape').catch(() => {});
      return false;
    }
    await option.click();
    await this.page.waitForTimeout(1500);

    const shown = this.page.getByRole('button', { name: new RegExp(`^\\s*${esc}\\s*$`, 'i') }).first();
    if (!(await shown.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false))) {
      Logger.warn('FUNNEL_BUILDER', `${label}: picked "${productName}" but the picker does not show it.`);
      return false;
    }
    Logger.info('FUNNEL_BUILDER', `✅ ${label}: Go To Next Step In Product -> "${productName}"`);
    return true;
  }

  /** Recorded: open "<page>" -> Edit Page -> Actions -> "Published URL" (new tab). */
  /** Opens a page of the current project in the editor (used by the email opt-in flow). */
  public async openPageInEditor(pageName: string): Promise<boolean> {
    return this.openPageInProjectEditor(pageName);
  }

  public async openPublishedUrl(pageName: string = 'FE Sales'): Promise<Page> {
    if (!(await this.openPageInProjectEditor(pageName))) {
      throw new Error(`Could not open "${pageName}" to get its Published URL.`);
    }
    const actions = this.page.getByRole('button', { name: 'Actions', exact: true }).first();
    await actions.waitFor({ state: 'visible', timeout: 20000 });
    await actions.click();
    const published = this.page.getByRole('link', { name: 'Published URL' }).first();
    await published.waitFor({ state: 'visible', timeout: 10000 });
    const popup = this.page.waitForEvent('popup', { timeout: 30000 });
    await published.click();
    const live = await popup;
    await live.waitForLoadState('domcontentloaded');
    Logger.info('FUNNEL_BUILDER', `Live "${pageName}" opened: ${live.url()}`);
    return live;
  }

  /**
   * Reads a "Go To Next Step" popup's native <select> and picks the option
   * whose visible text matches `matchText` (case-insensitive substring),
   * instead of blindly taking the first non-placeholder option. Falls back
   * to that old first-non-placeholder behavior only when no match text is
   * given or nothing matches, so a naming mismatch degrades instead of
   * silently wiring the wrong target. Returns the label actually selected,
   * for logging.
   */
  private async selectComboboxOptionByText(box: import('@playwright/test').Locator, matchText?: string | null): Promise<string | null> {
    const optionValues = await box.locator('option').evaluateAll((opts) =>
      opts.map((o) => ({ value: (o as HTMLOptionElement).value, label: (o.textContent || '').trim() }))
    );

    let chosen: { value: string; label: string } | undefined;
    if (matchText) {
      chosen = optionValues.find((o) => o.value && o.label.toLowerCase().includes(matchText.toLowerCase()));
    }
    if (!chosen) {
      chosen = optionValues.find((o) => o.value && o.value !== '') || optionValues[0];
    }
    if (!chosen) return null;

    let selectFailed = false;
    await box.selectOption(chosen.value).catch(() => { selectFailed = true; });

    // FIX: previously the selectOption() failure was silently swallowed --
    // the caller went straight on to log "selected X" and publish, even if
    // the dropdown never actually registered the choice (this is the
    // "settings dropdown isn't opening/selecting" symptom). Re-read the
    // <select>'s own current value right after selecting and confirm it's
    // really the option we asked for before reporting success.
    const actualValue = await box.inputValue().catch(() => null);
    if (selectFailed || actualValue !== chosen.value) {
      Logger.warn(
        'FUNNEL_BUILDER',
        `Selecting "${chosen.label}" in the dropdown did not take (current value: "${actualValue ?? '(unreadable)'}", expected "${chosen.value}") -- retrying once.`
      );
      await box.selectOption(chosen.value).catch(() => {});
      await this.page.waitForTimeout(500);
      const retryValue = await box.inputValue().catch(() => null);
      if (retryValue !== chosen.value) {
        Logger.warn('FUNNEL_BUILDER', `Retry also failed to select "${chosen.label}" -- wiring for this dropdown is unconfirmed.`);
        return null;
      }
    }

    return chosen.label || null;
  }

  /**
   * Opens the action panel (the popup that has "Go To Next Step...") for
   * whatever element is currently selected in the editor. Confirmed via a
   * live recording: after selecting a freshly-inserted element with one
   * click, the actual trigger is a small toolbar icon that appears next to
   * it -- `getByRole('img').filter({ hasText: /^$/ }).nth(5)` -- not the
   * "Style Settings" gear this used to look for. That nth(5) index is
   * position-dependent (it can shift if a different element type renders a
   * different number of toolbar icons), so it's tried first as the
   * confirmed case, falling back to the previous settings-icon guesses for
   * elements/templates where the toolbar differs.
   */
  private async openElementActionPanel(): Promise<void> {
    // Confirmed via screenshot: the selected element's toolbar shows exactly
    // 5 icons (move-up, drag, duplicate, delete, settings-gear) in that
    // order, so the gear is reliably the 5th -- `div:nth-child(5) > svg >
    // path` -- tried first now instead of as a fallback.
    const settingsBtn = this.page.locator('div:nth-child(5) > svg > path')
      .or(this.page.locator('#ff-tools').getByTitle('Style Settings'))
      .or(this.page.getByTitle('Style Settings')).first();
    if (await settingsBtn.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)) {
      await settingsBtn.click();
      await this.dismissAdvancedSettingsTooltip();
      return;
    }

    const toolbarIcon = this.page.getByRole('img').filter({ hasText: /^$/ }).nth(5);
    if (await toolbarIcon.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)) {
      await toolbarIcon.click();
      await this.dismissAdvancedSettingsTooltip();
    }
  }

  /**
   * Confirmed via recording: clicking the settings/toolbar icon
   * (`div:nth-child(5) > svg > path`) to open an element's action panel can
   * pop a small "Advanced Settings×" tooltip/label on top of that panel.
   * Until it's dismissed, the "Go To Next Step" button sitting underneath
   * isn't reliably clickable -- this was previously unhandled, which could
   * silently no-op the very next click. No-ops quietly if the tooltip never
   * appears (it isn't shown on every element/template).
   */
  private async dismissAdvancedSettingsTooltip(): Promise<void> {
    const tooltip = this.page.getByText('Advanced Settings×', { exact: false })
      .or(this.page.getByText(/^Advanced Settings/i));
    if (await tooltip.first().waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false)) {
      await tooltip.first().click().catch(() => {});
      await this.page.waitForTimeout(500);
    }
  }

  /**
   * Clicks the "Go To Next Step In Funnel/In Product" action and confirms it
   * actually opened its popup (via `isOpenSignal`) before moving on, instead
   * of assuming one click was enough.
   *
   * FIX: this button renders its own label text PLUS a small arrow/chevron
   * icon next to it -- on some renders a single click only registers on the
   * label span, not the arrow, and it's the arrow that actually triggers the
   * popup to expand. Previously a single un-verified click here was "using
   * the CTA element's popup" in name only: the click could silently miss,
   * the code would plow ahead to read dropdowns that were never opened, and
   * the run would go straight to Publish with nothing actually wired. Now:
   * click, check the open-signal, and if it didn't open, click the arrow
   * icon specifically, then retry the full button click -- up to 3 rounds --
   * before giving up.
   */
  private async clickGoToNextStepAndConfirm(
    nextStepAction: Locator,
    isOpenSignal: () => Promise<boolean>
  ): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt++) {
      await nextStepAction.click({ timeout: 5000 }).catch(() => {});
      await this.page.waitForTimeout(attempt === 0 ? 3000 : 2000);
      if (await isOpenSignal()) return true;

      const arrowIcon = nextStepAction.locator('svg, [class*="arrow" i], [class*="chevron" i]').first();
      if (await arrowIcon.waitFor({ state: 'visible', timeout: 1500 }).then(() => true).catch(() => false)) {
        await arrowIcon.click({ timeout: 3000 }).catch(() => {});
        await this.page.waitForTimeout(2000);
        if (await isOpenSignal()) return true;
      }
    }
    return false;
  }

  /**
   * Clicks "Go To Next Step In Funnel"/"...In Product" for whatever element
   * is currently selected in the editor, waits for the popup to fully
   * render, then searches the funnel dropdown by `funnelName` and the
   * target-step dropdown by `expectedNextPageName` (the correct page for
   * THIS source page, not just whatever sits first in the list) before
   * closing it. No-ops with a warning if the action isn't available.
   */
  private async wireSelectedElementToNextStep(
    funnelName: string | undefined,
    targetProductName: string | undefined,
    contextLabel: string,
    /** "Link To" choices in order of preference (first one the dropdown offers is used) */
    linkTo: RegExp[] = [/upsell\s*\/\s*downsell/i]
  ): Promise<boolean> {
    // Recorded popup ("Edit Button Action" in Advanced Settings):
    //   Go To Next Step In Funnel -> Select Your Sales Funnel (custom picker) -> funnel
    //   -> Select your Product (native select, product NAMES) -> Link To: "Upsell / Downsell"
    const inFunnel = this.page.getByRole('button', { name: 'Go To Next Step In Funnel' }).first();
    // The action panel may already be open from the previous button; otherwise open it (Style Settings)
    if (!(await inFunnel.waitFor({ state: 'visible', timeout: 2500 }).then(() => true).catch(() => false))) {
      await this.openElementActionPanel();
    }
    if (!(await inFunnel.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false))) {
      Logger.warn('FUNNEL_BUILDER', `"Go To Next Step In Funnel" not found for ${contextLabel} - element was selected but not wired.`);
      return false;
    }

    const funnelLabel = this.page.getByText('Select Your Sales Funnel', { exact: true }).first();
    const opened = await this.clickGoToNextStepAndConfirm(inFunnel, async () => funnelLabel.isVisible().catch(() => false));
    if (!opened) {
      Logger.warn('FUNNEL_BUILDER', `${contextLabel}: "Go To Next Step In Funnel" section never opened - nothing was wired.`);
      return false;
    }

    // a) Funnel - custom picker ("--Select a funnel--" or the currently selected funnel)
    if (funnelName) {
      const picked = await this.pickFunnelInActionPanel(funnelName, contextLabel);
      if (!picked) return false;
    }

    // b) Product - native <select> listing the funnel's products by name (loads after the funnel)
    const productBox = this.page.getByRole('combobox').nth(0);
    const productLabel = await this.selectNativeOptionStrict(productBox, targetProductName, contextLabel, 'product', 20000);
    if (targetProductName && !productLabel) return false;

    // c) Link To - first preferred option the dropdown offers.
    //    Empty linkTo = this page has no "Link To" (FE): funnel + product is all it needs.
    const linkBox = this.page.getByRole('combobox').nth(1);
    let linkLabel: string | null = null;
    if (!linkTo.length) {
      linkLabel = '(not used on this page)';
    } else if (await linkBox.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)) {
      for (let i = 0; i < linkTo.length && !linkLabel; i++) {
        const last = i === linkTo.length - 1;
        linkLabel = await this.selectNativeOptionStrict(linkBox, linkTo[i], contextLabel, 'Link To', last ? 8000 : 2500, last ? 'upsell' : undefined);
      }
      if (!linkLabel) return false;
    } else {
      Logger.warn('FUNNEL_BUILDER', `${contextLabel}: "Link To" dropdown did not appear.`);
      return false;
    }

    Logger.info('FUNNEL_BUILDER', `✅ ${contextLabel}: Go To Next Step In Funnel -> "${funnelName}" -> "${productLabel ?? '(default)'}"${linkTo.length ? ` -> Link To "${linkLabel}"` : ''}`);

    // Recorded: click the "Advanced Settings" header to finish (commits the selection)
    await this.page.getByText('Advanced Settings', { exact: true }).first().click({ timeout: 5000 }).catch(() => {});
    await this.page.waitForTimeout(1500);
    return true;
  }

  /** Opens the "Select Your Sales Funnel" picker and chooses the funnel by name. */
  private async pickFunnelInActionPanel(funnelName: string, contextLabel: string): Promise<boolean> {
    const esc = funnelName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const trigger = this.page
      .getByRole('button', { name: /--\s*select a funnel\s*--/i })
      .or(this.page.getByRole('button', { name: new RegExp(`^\\s*${esc}\\s*$`, 'i') }))
      .first();
    if (!(await trigger.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false))) {
      Logger.warn('FUNNEL_BUILDER', `${contextLabel}: funnel picker ("--Select a funnel--") not found.`);
      return false;
    }
    await trigger.click();
    await this.page.waitForTimeout(800);

    const option = this.page.getByRole('option', { name: funnelName, exact: true });
    if (!(await option.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false))) {
      const search = this.page.getByRole('textbox', { name: /search/i }).last();
      if (await search.isVisible().catch(() => false)) {
        await search.fill(funnelName);
        await this.page.waitForTimeout(1000);
      }
    }
    if (!(await option.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false))) {
      Logger.warn('FUNNEL_BUILDER', `${contextLabel}: funnel "${funnelName}" is not in the funnel picker.`);
      return false;
    }
    await option.click();
    await this.page.waitForTimeout(2000); // product list loads for the chosen funnel
    return true;
  }

  /**
   * Selects an option in a native <select> by its visible text - STRICT: never falls back to
   * "first option" (that silently wired buttons to the wrong product). Waits for the option to load.
   */
  private async selectNativeOptionStrict(
    box: Locator,
    match: string | RegExp | undefined,
    contextLabel: string,
    what: string,
    waitMs: number,
    valueFallback?: string
  ): Promise<string | null> {
    if (!(await box.waitFor({ state: 'visible', timeout: waitMs }).then(() => true).catch(() => false))) {
      Logger.warn('FUNNEL_BUILDER', `${contextLabel}: "${what}" dropdown did not appear.`);
      return null;
    }
    const read = () =>
      box.locator('option').evaluateAll((opts) =>
        opts.map((o) => ({ value: (o as HTMLOptionElement).value, label: (o.textContent || '').replace(/\s+/g, ' ').trim() }))
      ).catch(() => [] as { value: string; label: string }[]);

    const find = (opts: { value: string; label: string }[]) => {
      if (!match) return undefined;
      if (typeof match === 'string') {
        const m = match.toLowerCase();
        return opts.find((o) => o.label.toLowerCase() === m) ?? opts.find((o) => o.label.toLowerCase().includes(m));
      }
      return opts.find((o) => match.test(o.label)) ?? (valueFallback ? opts.find((o) => o.value === valueFallback) : undefined);
    };

    let opts = await read();
    let chosen = find(opts);
    const end = Date.now() + waitMs;
    while (!chosen && match && Date.now() < end) {
      await this.page.waitForTimeout(500);
      opts = await read();
      chosen = find(opts);
    }
    if (!match) return null;
    if (!chosen) {
      Logger.warn('FUNNEL_BUILDER', `${contextLabel}: no "${what}" option matching "${String(match)}". Options: ${opts.map((o) => o.label).join(' | ') || '(none)'}`);
      return null;
    }
    await box.selectOption(chosen.value).catch(() => {});
    await this.page.waitForTimeout(600);
    if ((await box.inputValue().catch(() => null)) !== chosen.value) {
      await box.selectOption(chosen.value).catch(() => {});
      await this.page.waitForTimeout(600);
      if ((await box.inputValue().catch(() => null)) !== chosen.value) {
        Logger.warn('FUNNEL_BUILDER', `${contextLabel}: selecting "${chosen.label}" in "${what}" did not take.`);
        return null;
      }
    }
    return chosen.label;
  }

  /**
   * Product-wiring counterpart to wireSelectedElementToNextStep(), for the
   * no-funnel case. Clicks "Go To Next Step In Product" for whatever element
   * is currently selected, then wires the target page.
   *
   * Confirmed via a live recording that this popup's target picker is NOT a
   * native <select> (unlike the funnel-wiring popup) -- it's the same
   * custom search-and-select trigger used elsewhere in this project (e.g.
   * "Search and select a product..." in FunnelBuilderPage.createFunnel /
   * ProductsPage's page pickers): a button reading "--select a one--" that,
   * once clicked, focuses a "Search…" textbox to type the target name into.
   * Reuses Helpers.selectProductFromDropdown(), the same helper already
   * proven reliable for that exact pattern, rather than a combobox read.
   */
  private async wireSelectedElementToProductNextStep(
    expectedNextPageName: string | undefined,
    contextLabel: string
  ): Promise<boolean> {
    await this.openElementActionPanel();

    // Deliberately NO fallback to "Go To Next Step In Funnel" here (unlike
    // the funnel-wiring version of this method) -- this path is only ever
    // used for the no-funnel product flow, and falling back to the funnel
    // action was silently re-triggering funnel selection when "In Product"
    // wasn't found, instead of failing loudly.
    const nextStepAction = this.page.getByRole('button', { name: 'Go To Next Step In Product' });
    if (!(await nextStepAction.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false))) {
      Logger.warn('FUNNEL_BUILDER', `"Go To Next Step In Product" action not found for ${contextLabel} — element was selected but not wired.`);
      return false;
    }

    // "--select a one--" is the literal placeholder confirmed via recording;
    // the regex fallback covers any similarly-worded placeholder in case it
    // varies by page/template.
    const dropdownTrigger = this.page.getByRole('button', { name: '--select a one--' })
      .or(this.page.getByRole('button', { name: /^--\s*select a .*--$/i })).first();

    // Confirmed via recording: the popup can render an "Add Product"
    // step-type selector (a plain div, not a <button>) that has to be
    // clicked before "--select a one--" becomes the active picker. This
    // only showed up the FIRST time the popup was used on a given page in
    // the recording (a second "Go To Next Step In Product" use later on the
    // same page skipped straight to "--select a one--") -- so this is
    // treated as optional/best-effort here, matching that: click it if
    // present, proceed either way if it isn't.
    const addProductDiv = this.page.locator('div').filter({ hasText: /^Add Product$/ }).first();

    // FIX ("clicks settings but doesn't actually use the popup to wire the
    // button"): this button has its own arrow/chevron next to the label --
    // one un-verified click isn't always enough to actually expand the
    // popup. Click, check the dropdown trigger (or the "Add Product"
    // step-selector) rendered, retry (incl. the arrow icon) before giving
    // up -- rather than plowing ahead to "--select a one--" that was never
    // actually shown.
    const opened = await this.clickGoToNextStepAndConfirm(nextStepAction, async () => {
      return (
        (await dropdownTrigger.waitFor({ state: 'visible', timeout: 1000 }).then(() => true).catch(() => false)) ||
        (await addProductDiv.waitFor({ state: 'visible', timeout: 1000 }).then(() => true).catch(() => false))
      );
    });
    if (!opened) {
      Logger.warn('FUNNEL_BUILDER', `${contextLabel}: "Go To Next Step In Product" popup never opened after retries (including the arrow icon) — nothing was wired.`);
      return false;
    }

    if (await addProductDiv.waitFor({ state: 'visible', timeout: 2500 }).then(() => true).catch(() => false)) {
      Logger.info('FUNNEL_BUILDER', `${contextLabel}: clicking "Add Product" step-selector before the product picker...`);
      await addProductDiv.click().catch(() => {});
      await this.page.waitForTimeout(800);
    }

    if (!(await dropdownTrigger.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false))) {
      Logger.warn('FUNNEL_BUILDER', `No target dropdown trigger found for ${contextLabel} — nothing to wire.`);
      return false;
    }

    if (!expectedNextPageName) {
      Logger.warn('FUNNEL_BUILDER', `${contextLabel}: no target page name provided — leaving dropdown unset.`);
      return false;
    }

    // FIX ("dropdown until the proper product is wired should wait there"):
    // don't trust a single selectProductFromDropdown() call and move on
    // regardless. After selecting, re-read what the trigger button now
    // displays and only accept it once it visibly shows the target product
    // (not still the "--select a one--" placeholder) -- retrying the whole
    // search-and-select a few times if it doesn't.
    let wired = false;
    for (let attempt = 0; attempt < 3 && !wired; attempt++) {
      await Helpers.selectProductFromDropdown(this.page, dropdownTrigger, expectedNextPageName).catch((err: unknown) => {
        Logger.warn(
          'FUNNEL_BUILDER',
          `${contextLabel}: attempt ${attempt + 1}/3 to select "${expectedNextPageName}" failed (${err instanceof Error ? err.message : String(err)}).`
        );
      });
      await this.page.waitForTimeout(800);
      const currentLabel = (await dropdownTrigger.innerText().catch(() => '')).trim();
      const stillPlaceholder = /^--\s*select a .*--$/i.test(currentLabel) || currentLabel.length === 0;
      wired = !stillPlaceholder && (
        currentLabel.toLowerCase().includes(expectedNextPageName.toLowerCase()) ||
        expectedNextPageName.toLowerCase().includes(currentLabel.toLowerCase())
      );
      if (!wired) {
        Logger.warn(
          'FUNNEL_BUILDER',
          `${contextLabel}: dropdown shows "${currentLabel || '(placeholder)'}" after attempt ${attempt + 1}/3 — waiting and retrying until "${expectedNextPageName}" is actually wired.`
        );
        await this.page.waitForTimeout(1200);
      }
    }
    if (wired) {
      Logger.info('FUNNEL_BUILDER', `${contextLabel}: confirmed next-step target wired to "${expectedNextPageName}".`);
    } else {
      Logger.warn('FUNNEL_BUILDER', `${contextLabel}: could NOT confirm "${expectedNextPageName}" was selected after 3 attempts — wiring is unconfirmed, check manually.`);
    }
    await this.page.waitForTimeout(3000);

    const closeBtn = this.page.getByRole('button', { name: 'Close', exact: true });
    if (await closeBtn.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) {
      await closeBtn.click();
      await this.page.waitForTimeout(3000);
    }
    return wired;
  }

  /**
   * Finds a decline-style "No thanks" link on the currently open sales page
   * (patterns vary by template: "No thanks", "No, I don't want this", "Skip
   * this offer", etc.), selects it, and wires it to `targetPageName` via the
   * same "Go To Next Step" popup used for the main CTA. If the template
   * doesn't render one of these, this logs a warning and skips rather than
   * trying to fabricate a brand-new page element, which isn't something this
   * framework can do reliably across arbitrary templates.
   */
  private async wireNoThanksLink(
    ctaScope: import('@playwright/test').Locator,
    editorFrame: import('@playwright/test').FrameLocator,
    salesPageName: string,
    funnelName: string | undefined,
    targetProductName: string
  ): Promise<void> {
    Logger.info('FUNNEL_BUILDER', `Wiring "No thanks" on "${salesPageName}" -> "${targetProductName}"...`);
    const noThanks = ctaScope.getByRole('link', {
      name: /No,?\s*thanks|No,?\s*thank\s*you|Skip this offer|I don'?t want|No,?\s*I'?ll pass|No,?\s*I don'?t/i,
    });

    if ((await noThanks.count().catch(() => 0)) === 0) {
      Logger.info('FUNNEL_BUILDER', `No "No thanks" link on "${salesPageName}" - adding the "No Thanks Button" block.`);
      let added = await this.addNoThanksBlock(editorFrame, `"${salesPageName}" No-thanks button`);
      if (!added) added = await this.addNewCTAButton(editorFrame, `"${salesPageName}" No-thanks button`);
      if (!added) {
        throw new Error(`Could not add a "No thanks" button on "${salesPageName}".`);
      }
    }

    await this.wireAllMatching(noThanks, funnelName, targetProductName, `"${salesPageName}" No thanks`, 1);
  }

  /**
   * Selects each matching element in the editor (one by one) and wires it:
   * Go To Next Step In Funnel -> funnel -> product -> Link To "Upsell / Downsell".
   * Retries each element once; stops with a clear error if one can't be wired.
   */
  private async wireAllMatching(
    elements: import('@playwright/test').Locator,
    funnelName: string | undefined,
    targetProductName: string | undefined,
    contextLabel: string,
    minCount: number
  ): Promise<void> {
    await elements.first().waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
    const count = await elements.count().catch(() => 0);
    if (count < minCount) {
      await Helpers.captureDiagnosticScreenshot(this.page, `nothing-to-wire-${contextLabel}`);
      throw new Error(`${contextLabel}: expected at least ${minCount} button(s) to wire, found ${count}.`);
    }
    Logger.info('FUNNEL_BUILDER', `${contextLabel}: wiring ${count} button(s) -> "${targetProductName ?? '(default)'}"`);

    for (let i = 0; i < count; i++) {
      const el = elements.nth(i);
      const label = `${contextLabel} #${i + 1}/${count}`;
      let wired = false;
      for (let attempt = 1; attempt <= 2 && !wired; attempt++) {
        await el.scrollIntoViewIfNeeded().catch(() => {});
        await el.click({ timeout: 10000 }).catch(() => {}); // select the element
        await this.page.waitForTimeout(1500);
        wired = await this.wireSelectedElementToNextStep(funnelName, targetProductName, attempt === 1 ? label : `${label} (retry)`);
        if (!wired) await this.page.waitForTimeout(1500);
      }
      if (!wired) {
        await Helpers.captureDiagnosticScreenshot(this.page, `cta-not-wired-${label}`);
        throw new Error(`${label} could not be wired to "${targetProductName ?? '(default)'}". Screenshot saved in test-results/.`);
      }
    }
    Logger.info('FUNNEL_BUILDER', `✅ ${contextLabel}: all ${count} button(s) wired.`);
  }

  /**
   * Inserts a brand-new Button element into the currently-open page editor
   * (Components -> Elements -> Button -> insert onto canvas), instead of
   * reusing whatever CTA link/button ships baked into the template. This is
   * the fix for the "selecting the template's inbuilt button causes wiring
   * issues" problem -- we leave the template's own button alone and wire a
   * fresh one instead.
   *
   * Returns a Locator for the newly-inserted button so the caller can
   * select/wire it, or null if the insert sequence didn't render as
   * expected (caller falls back to the old find-the-template-CTA path).
   */
  private async addNewCTAButton(
    editorFrame: import('@playwright/test').FrameLocator,
    contextLabel: string
  ): Promise<import('@playwright/test').Locator | null> {
    Logger.info('FUNNEL_BUILDER', `Adding a new CTA button for ${contextLabel}...`);

    // FIXED FLOW (explicit instruction, confirmed against the editor's own
    // layout in a screenshot): Edit Page -> click the page's paragraph
    // element -> Components -> Elements -> Button. NOT Blocks at all, and
    // NOT the inline "+" icon / existing-CTA-double-click branching that
    // used to live here -- that branching is exactly what was producing the
    // erratic "Components -> Blocks -> Components again" sequence, because
    // one path's failure silently fell into a completely different path.
    // One deterministic sequence now, no hunting.
    const firstSection = editorFrame.locator('section').first();
    const sectionScope = (await firstSection.count().catch(() => 0)) > 0 ? firstSection : editorFrame.locator('body');
    const paragraph = sectionScope.locator('p').first();

    const paragraphReady = await paragraph.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
    if (paragraphReady) {
      await paragraph.click().catch(() => {});
      await this.page.waitForTimeout(1000);
    } else {
      Logger.warn('FUNNEL_BUILDER', `Could not find a paragraph in the first section to select for ${contextLabel} — new button may land wherever the editor defaults to.`);
    }

    const componentsBtn = this.page.getByRole('button', { name: 'Components' });
    if (!(await componentsBtn.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false))) {
      Logger.warn('FUNNEL_BUILDER', `"Components" panel not found for ${contextLabel}.`);
      return null;
    }
    await componentsBtn.click();
    await this.page.waitForTimeout(800);

    const elementsBtn = this.page.getByRole('button', { name: 'Elements' });
    if (!(await elementsBtn.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false))) {
      Logger.warn('FUNNEL_BUILDER', `"Elements" panel not found for ${contextLabel}.`);
      return null;
    }
    await elementsBtn.click();
    await this.page.waitForTimeout(800);

    const buttonElementOption = this.page.getByTitle('Button', { exact: true });
    if (!(await buttonElementOption.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false))) {
      Logger.warn('FUNNEL_BUILDER', `"Button" element option not found for ${contextLabel}.`);
      return null;
    }

    // FIX ("randomly selects any button" bug): count how many button/link-
    // like elements exist BEFORE inserting, so the fallback below can prove
    // a genuinely new element landed instead of just grabbing whatever was
    // already last in the DOM.
    const candidateSelector = 'a[class*="btn"], button, [data-gjs-type="link"]';
    const countBefore = await editorFrame.locator(candidateSelector).count().catch(() => 0);

    await buttonElementOption.click();
    // Longer wait for the new button element to actually finish rendering
    // on the canvas before we try to select/wire it -- this was the main
    // gap letting the wiring step run against a not-yet-loaded button.
    await this.page.waitForTimeout(3000);

    // Confirmed via the second recording: the newly inserted button has a
    // real, stable default accessible name -- "Click Here to Get Access" --
    // so it can be targeted directly instead of guessing "whatever is last
    // on the canvas".
    const namedInserted = editorFrame.getByRole('link', { name: 'Click Here to Get Access' }).last();
    if (await namedInserted.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false)) {
      return namedInserted;
    }

    // FIX: this used to fall back to `.last()` of every button/link-like
    // element on the page UNCONDITIONALLY. If the insert above silently
    // failed (template quirk, panel didn't render, slow load, etc.), that
    // still returned SOME pre-existing element on the page -- and the
    // caller would go on to select and wire that random existing button,
    // which is exactly the "opens a popup for a random button" bug you saw.
    // Only trust this fallback if the candidate count actually grew,
    // proving a new element really landed; otherwise report failure so the
    // caller uses its own template-CTA fallback instead of guessing.
    const countAfter = await editorFrame.locator(candidateSelector).count().catch(() => countBefore);
    if (countAfter > countBefore) {
      const inserted = editorFrame.locator(candidateSelector).last();
      if (await inserted.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)) {
        return inserted;
      }
    }

    Logger.warn(
      'FUNNEL_BUILDER',
      `New CTA button did not appear on canvas for ${contextLabel} (element count unchanged: ${countBefore}) -- refusing to guess at an existing element.`
    );
    return null;
  }

  /**
   * Inserts FlexiFunnels' dedicated "No Thanks Button" block (Blocks ->
   * Components -> getByTitle('No Thanks Button')), confirmed via a live
   * recording to be a genuinely separate component from the generic
   * "Button" element that addNewCTAButton() inserts -- not the same block
   * relabeled. It ships with its own default link text ("No thanks"), so no
   * rename step is needed and the caller can target it by that text.
   *
   * This is tried FIRST by wireNoThanksLink() when a template has no
   * built-in decline link; addNewCTAButton() remains the fallback for
   * templates/panels where this specific block doesn't render.
   */
  private async addNoThanksBlock(
    editorFrame: import('@playwright/test').FrameLocator,
    contextLabel: string
  ): Promise<import('@playwright/test').Locator | null> {
    Logger.info('FUNNEL_BUILDER', `Adding the dedicated "No Thanks Button" block for ${contextLabel}...`);

    const blocksBtn = this.page.getByRole('button', { name: 'Blocks' });
    if (await blocksBtn.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)) {
      await blocksBtn.click();
      await this.page.waitForTimeout(800);
    }

    const componentsBtn = this.page.getByRole('button', { name: 'Components' });
    if (!(await componentsBtn.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false))) {
      Logger.warn('FUNNEL_BUILDER', `"Components" panel not found for ${contextLabel} (No Thanks block) -- falling back to generic button.`);
      return null;
    }
    await componentsBtn.click();
    await this.page.waitForTimeout(800);

    const noThanksBlockOption = this.page.getByTitle('No Thanks Button');
    if (!(await noThanksBlockOption.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false))) {
      Logger.warn('FUNNEL_BUILDER', `"No Thanks Button" block option not found for ${contextLabel} -- this template may not ship it.`);
      return null;
    }

    const candidateSelector = 'a[class*="btn"], button, [data-gjs-type="link"]';
    const countBefore = await editorFrame.locator(candidateSelector).count().catch(() => 0);

    await noThanksBlockOption.click();
    // Same settle window as addNewCTAButton() -- give the new element real
    // time to finish rendering before selecting/wiring it.
    await this.page.waitForTimeout(3000);

    // Confirmed via recording: this block's own default accessible name is
    // "No thanks" (distinct from the generic Button's "Click Here to Get
    // Access"), so it can be targeted directly.
    const namedInserted = editorFrame.getByRole('link', { name: /No,?\s*thanks/i }).last();
    if (await namedInserted.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false)) {
      return namedInserted;
    }

    // Same guard as addNewCTAButton(): only trust the "last element on the
    // canvas" fallback if the element count actually grew, so a silently
    // failed insert never returns some pre-existing element to wire instead.
    const countAfter = await editorFrame.locator(candidateSelector).count().catch(() => countBefore);
    if (countAfter > countBefore) {
      const inserted = editorFrame.locator(candidateSelector).last();
      if (await inserted.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)) {
        return inserted;
      }
    }

    Logger.warn(
      'FUNNEL_BUILDER',
      `"No Thanks Button" block did not appear on canvas for ${contextLabel} (element count unchanged: ${countBefore}).`
    );
    return null;
  }

  /**
   * No-funnel counterpart to wireSalesPageToFunnel(). Opens the given sales
   * page, adds a brand-new CTA button (same addNewCTAButton() used by the
   * funnel path), wires it via the product-level "Go To Next Step In
   * Product" popup instead of the funnel one, and publishes. Use this when
   * a product's pages aren't part of a funnel at all (e.g. a standalone
   * FE Sales -> FE Checkout -> Thank You flow).
   */
  /**
   * Opens a page from the project's page list into its editor. Confirmed via
   * a live recording: clicking the "Search pages…" box before looking for
   * the page row is part of getting the list to reliably show/find the
   * target -- same lazily-rendered-list pattern already fixed elsewhere
   * (Thank You page dropdown, Funnel Steps panel). Prefers navigating
   * directly to `this.context.projectUrl` when already known (also
   * confirmed via recording, e.g. `/projects/5j4z6Yer`), skipping the
   * generic `/projects` -> "Open Project" hop.
   *
   * Also confirmed: the Thank You page sometimes needs "Edit Page" clicked
   * TWICE (the first opens a template/preview panel that itself contains
   * another "Edit Page" link) -- handled generically here for every page,
   * not just Thank You, since it's harmless to check even when not needed.
   */
  private async openPageInProjectEditor(pageName: string): Promise<boolean> {
    if (this.context.projectUrl) {
      await this.page.goto(this.context.projectUrl, { waitUntil: 'domcontentloaded' });
    } else {
      await this.page.goto('https://app.flexifunnels.com/projects', { waitUntil: 'domcontentloaded' });
      await PopupHandler.dismissKnownPopups(this.page);
      await this.page.getByRole('button', { name: 'Open Project' }).first().click();
    }
    await PopupHandler.dismissKnownPopups(this.page);
    await this.page.waitForTimeout(3000);

    const searchBox = this.page.getByRole('textbox', { name: 'Search pages…' });
    if (await searchBox.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
      await searchBox.click();
      await this.page.waitForTimeout(500);
    }

    // Prefer the row whose text is EXACTLY the page name ("FE Sales" must never open "FE Sales Variant");
    // fall back to "contains" only if there is no exact row.
    let pageRow = this.page.getByText(pageName, { exact: true }).first();
    if (!(await pageRow.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false))) {
      pageRow = this.page.getByText(pageName, { exact: false }).first();
    }
    if (!(await pageRow.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false))) {
      // Plain click on the search box wasn't enough to surface this page --
      // actually filter the list by typing into it before giving up.
      if (await searchBox.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false)) {
        await searchBox.fill(pageName).catch(() => {});
        await this.page.waitForTimeout(800);
        pageRow = this.page.getByText(pageName, { exact: false }).first();
      }
    }

    if (!(await pageRow.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false))) {
      Logger.warn('FUNNEL_BUILDER', `Could not find "${pageName}" in the page list.`);
      return false;
    }
    await pageRow.click();
    await this.page.waitForTimeout(3000);

    const editPageLink = this.page.getByRole('link', { name: 'Edit Page' }).first();
    if (!(await editPageLink.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false))) {
      Logger.warn('FUNNEL_BUILDER', `No "Edit Page" link visible for "${pageName}".`);
      return false;
    }
    await editPageLink.click();
    await this.page.waitForTimeout(1000);

    // Second "Edit Page" click -- confirmed needed for at least the Thank
    // You page; harmless no-op elsewhere if it's not present.
    const secondEditLink = this.page.getByRole('link', { name: 'Edit Page' }).first();
    if (await secondEditLink.waitFor({ state: 'visible', timeout: 2500 }).then(() => true).catch(() => false)) {
      await secondEditLink.click().catch(() => {});
    }

    await this.page.waitForLoadState('domcontentloaded');
    await PopupHandler.dismissKnownPopups(this.page);
    // domcontentloaded doesn't guarantee the visual page-builder (iframe
    // canvas, toolbars) has actually finished hydrating -- give it real time
    // before the caller starts clicking into it.
    await this.page.waitForTimeout(5000);
    return true;
  }

  public async wireSalesPageToProduct(
    salesPageName: string,
    expectedNextPageName: string,
    noThanksTargetPageName?: string
  ): Promise<void> {
    this.context.recordStep(`Wire Sales Page CTA (Product): ${salesPageName}`);
    Logger.info('FUNNEL_BUILDER', `Wiring "${salesPageName}" CTA button to Next Step in Product...`);

    const opened = await this.openPageInProjectEditor(salesPageName);
    if (!opened) {
      throw new Error(`Could not open "${salesPageName}" in the editor -- aborting CTA wiring.`);
    }

    const editorFrame = this.page.locator('iframe:not([name="fc_widget"])').first().contentFrame();
    const contentRoot = editorFrame.locator('#iffi');
    const ctaScope = (await contentRoot.count()) > 0 ? contentRoot : editorFrame.locator('body');

    const clickTwiceToOpenEditor = async (el: import('@playwright/test').Locator) => {
      await el.click();
      await this.page.waitForTimeout(600);
      await el.click();
    };

    // Confirmed via recording: BOTH elements get inserted back-to-back
    // (main CTA via Components -> Elements -> Button, then the decline
    // button via Blocks -> Components -> "No Thanks Button") before either
    // one is selected and wired -- not insert-wire-insert-wire. Matches that
    // order here so the panel state (Blocks/Components already open, etc.)
    // matches what was actually exercised.
    const newCta = await this.addNewCTAButton(editorFrame, `"${salesPageName}" main CTA`);

    let newNoThanks: import('@playwright/test').Locator | null = null;
    if (noThanksTargetPageName) {
      newNoThanks = await this.addNoThanksBlock(editorFrame, `"${salesPageName}" No-thanks button`);
      if (!newNoThanks) {
        Logger.warn('FUNNEL_BUILDER', `"No Thanks Button" block unavailable for "${salesPageName}" — falling back to a generic button for the decline path.`);
        newNoThanks = await this.addNewCTAButton(editorFrame, `"${salesPageName}" No-thanks button (fallback)`);
      }
    }

    // Now select and wire the main CTA.
    if (newCta) {
      // Confirmed via recording: a single click selects the freshly-inserted
      // element; the toolbar icon (see openElementActionPanel()) is what
      // actually opens its action panel, not a second click on the element.
      await newCta.click().catch(() => {});
      await this.page.waitForTimeout(2000);
    } else {
      // Per explicit instruction: never fall back to wiring a pre-existing
      // template button (it's not the button we actually control/verified,
      // and silently wiring the wrong element is worse than failing loudly
      // here so the real problem -- addNewCTAButton() not finding the
      // heading/add-icon -- gets fixed instead of masked).
      throw new Error(
        `Could not add a new CTA button on "${salesPageName}" — refusing to fall back to a pre-existing template button. ` +
        `Check that the first section's heading and the inline "+" add-element icon are rendering as expected.`
      );
    }
    await this.page.waitForTimeout(3000);

    // FIX ("publishing the page before wiring the button"): the return
    // value here used to be discarded entirely -- Publish fired regardless
    // of whether the popup was ever actually used to wire the CTA. Now the
    // result is checked, and if it's not confirmed, we retry the wiring
    // once more (the button is still selected in the editor) before
    // publishing rather than racing straight to Publish.
    let wired = await this.wireSelectedElementToProductNextStep(expectedNextPageName, `"${salesPageName}" main CTA`);
    if (!wired) {
      Logger.warn('FUNNEL_BUILDER', `"${salesPageName}" main CTA was not confirmed wired — retrying once before publishing.`);
      await this.page.waitForTimeout(1500);
      wired = await this.wireSelectedElementToProductNextStep(expectedNextPageName, `"${salesPageName}" main CTA (retry)`);
    }
    if (!wired) {
      Logger.warn('FUNNEL_BUILDER', `"${salesPageName}" main CTA still not confirmed wired after retry — publishing anyway, but check this page manually.`);
    }

    // Now select and wire the "No thanks" decline path, if requested.
    // Confirmed via recording: this step is selected fresh straight from the
    // iframe by its default accessible name ("No thanks") with a SINGLE
    // click -- no double-click, no pre-emptive toolbar-icon click needed
    // before "Go To Next Step In Product" appears (unlike the main CTA,
    // where the settings-icon + "Advanced Settings×" dismissal was needed).
    // wireSelectedElementToProductNextStep() still tries the toolbar icon
    // first (openElementActionPanel()) as a harmless no-op if it's not
    // actually there.
    if (noThanksTargetPageName) {
      const noThanksLink = newNoThanks ?? editorFrame.getByRole('link', { name: /No,?\s*thanks/i }).first();
      if (await noThanksLink.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false)) {
        await noThanksLink.click().catch(() => {});
        await this.page.waitForTimeout(1500);

        let noThanksWired = await this.wireSelectedElementToProductNextStep(noThanksTargetPageName, `"${salesPageName}" No-thanks button`);
        if (!noThanksWired) {
          Logger.warn('FUNNEL_BUILDER', `"${salesPageName}" No-thanks button was not confirmed wired — retrying once before publishing.`);
          await this.page.waitForTimeout(1500);
          noThanksWired = await this.wireSelectedElementToProductNextStep(noThanksTargetPageName, `"${salesPageName}" No-thanks button (retry)`);
        }
        if (!noThanksWired) {
          Logger.warn('FUNNEL_BUILDER', `"${salesPageName}" No-thanks button still not confirmed wired after retry — publishing anyway, but check this page manually.`);
        }
      } else {
        Logger.warn('FUNNEL_BUILDER', `Could not locate the "No thanks" button to wire on "${salesPageName}" — skipping its decline path.`);
      }
    }

    // Extra settle time between finishing the product-connection step and
    // hitting Publish -- publishing was firing before the connection had
    // actually registered.
    await this.page.waitForTimeout(3000);

    await saveEditorPage(this.page); // Save first (keeps buttons / wiring / forms), then Publish
    await this.page.getByRole('button', { name: 'Publish Publish the page live.' }).click();
    // Minimum 3-4s settle after Publish so the page actually finishes
    // publishing before anything else touches it.
    await this.page.waitForTimeout(4000);

    const publishAsSales = this.page.getByRole('button', { name: 'Publish as Sales Page' });
    if (await publishAsSales.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false)) {
      await publishAsSales.click();
      await this.page.waitForTimeout(3000);
    }

    // Confirmed via recording: a "Close" button appears after publishing
    // and needs to be dismissed explicitly.
    const closeBtn = this.page.getByRole('button', { name: 'Close' });
    if (await closeBtn.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
      await closeBtn.click();
      await this.page.waitForTimeout(1000);
    }

    Logger.info('FUNNEL_BUILDER', `"${salesPageName}" wired to Product & Published!`);
  }

  public async wireSalesPageToFunnel(
    salesPageName: string = 'FE Sales',
    funnelName?: string,
    expectedNextPageName?: string,
    noThanksTargetPageName?: string
  ): Promise<void> {
    this.context.recordStep(`Wire Sales Page CTA: ${salesPageName}`);
    Logger.info('FUNNEL_BUILDER', `Wiring "${salesPageName}" CTA button to Next Step in Funnel...`);

    const opened = await this.openPageInProjectEditor(salesPageName);
    if (!opened) {
      throw new Error(`Could not open "${salesPageName}" in the editor -- aborting CTA wiring.`);
    }

    // Scope kept for the "No thanks" link wiring further below (unchanged).
    const editorFrame = this.page.locator('iframe:not([name="fc_widget"])').first().contentFrame();
    const contentRoot = editorFrame.locator('#iffi');
    const ctaScope = (await contentRoot.count()) > 0 ? contentRoot : editorFrame.locator('body');

    // Selecting an element in this editor is a two-click sequence, not one:
    // the first click just selects the element (shows its selection outline
    // / toolbar); the SAME element has to be clicked again for the editor to
    // actually pop the link/next-step panel open. A single click here left
    // wireSelectedElementToNextStep() looking for a "Go To Next Step" action
    // that hadn't rendered yet, which is why CTA wiring was unreliable.
    const clickTwiceToOpenEditor = async (el: import('@playwright/test').Locator) => {
      await el.click();
      await this.page.waitForTimeout(600);
      await el.click();
    };

    // FIX: this used to grab the template's own inbuilt CTA link/button by
    // text match and wire that directly. Wiring the template's built-in
    // button turned out to be unreliable (it's baked into the template and
    // fighting it caused wiring to misfire) -- so instead we add a brand
    // new Button element to the page and wire THAT, leaving the template's
    // original button untouched.
    const newCta = await this.addNewCTAButton(editorFrame, `"${salesPageName}" main CTA`);

    if (newCta) {
      // Confirmed via recording: only ONE click on the freshly-inserted
      // element is needed to select it before the toolbar icon opens its
      // action panel.
      await newCta.click().catch(() => {});
      await this.page.waitForTimeout(2000);
    } else {
      // Per explicit instruction: never fall back to wiring a pre-existing
      // template button -- fail loudly here instead of silently wiring the
      // wrong element, so the real problem gets fixed rather than masked.
      throw new Error(
        `Could not add a new CTA button on "${salesPageName}" — refusing to fall back to a pre-existing template button. ` +
        `Check that the first section's heading and the inline "+" add-element icon are rendering as expected.`
      );
    }
    await this.page.waitForTimeout(3000);

    // Same publish-gating fix as wireSalesPageToProduct: don't discard the
    // wiring result and publish blind. Retry once if unconfirmed.
    // Wire EVERY main CTA button on the page (the template's own + the one just added),
    // so whichever one a buyer clicks goes to the right funnel step.
    await this.wireAllMatching(
      ctaScope.getByRole('link', { name: /click here to get access/i }),
      funnelName,
      expectedNextPageName,
      `"${salesPageName}" main CTA`,
      1
    );

    if (noThanksTargetPageName) {
      await this.wireNoThanksLink(ctaScope, editorFrame, salesPageName, funnelName, noThanksTargetPageName);
    }

    // Extra settle time between finishing the connection step(s) and hitting
    // Publish -- publishing was firing before the connection had actually
    // registered.
    await this.page.waitForTimeout(3000);

    await saveEditorPage(this.page); // Save first (keeps buttons / wiring / forms), then Publish
    await this.page.getByRole('button', { name: 'Publish Publish the page live.' }).click();
    // Minimum 3-4s settle after Publish so the page actually finishes
    // publishing before anything else touches it.
    await this.page.waitForTimeout(4000);

    const publishAsSales = this.page.getByRole('button', { name: 'Publish as Sales Page' });
    if (await publishAsSales.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false)) {
      await publishAsSales.click();
      await this.page.waitForTimeout(3000);
    }

    const closeBtn = this.page.getByRole('button', { name: 'Close' });
    if (await closeBtn.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
      await closeBtn.click();
      await this.page.waitForTimeout(1000);
    }

    Logger.info('FUNNEL_BUILDER', `"${salesPageName}" wired to Funnel & Published!`);
  }

  /**
   * Clicks Publish in the editor and drives whatever follows, with a hard time limit so it can never
   * hang: any "Publish as ..." confirmation (Sales Page / Checkout Page / Thank You ...) is clicked,
   * then "Close" if offered. Returns when the dialog is gone or after `maxMs`. Throws (with a
   * screenshot) only if the Publish button itself is missing.
   */
  private async publishCurrentPage(label: string, maxMs = 30000): Promise<void> {
    const publish = this.page.getByRole('button', { name: 'Publish Publish the page live.' })
      .or(this.page.getByRole('button', { name: /^\s*Publish\s*$/ })).first();
    if (!(await publish.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false))) {
      await Helpers.captureDiagnosticScreenshot(this.page, `no-publish-button-${label}`);
      throw new Error(`"${label}": the Publish button was not found in the editor.`);
    }
    await publish.click();
    const confirm = this.page.getByRole('button', { name: /^\s*Publish as /i }).first();
    const close = this.page.getByRole('button', { name: 'Close', exact: true }).first();
    const end = Date.now() + maxMs;
    let confirmed = false;
    while (Date.now() < end) {
      if (!confirmed && (await confirm.isVisible().catch(() => false))) {
        await confirm.click().catch(() => {});
        confirmed = true;
        await this.page.waitForTimeout(2500);
        continue;
      }
      if (await close.isVisible().catch(() => false)) {
        await close.click().catch(() => {});
        break;
      }
      // dialog gone after we confirmed -> done
      if (confirmed && !(await confirm.isVisible().catch(() => false))) { await this.page.waitForTimeout(1500); if (!(await close.isVisible().catch(() => false))) break; }
      await this.page.waitForTimeout(500);
    }
    await this.page.waitForTimeout(1500);
    Logger.info('FUNNEL_BUILDER', `📤 "${label}" publish step finished (${confirmed ? 'confirmed' : 'no confirmation needed'}).`);
  }

  /**
   * Final publish pass for a single already-existing page: opens it from the
   * project's page list and clicks Publish (with an optional "Publish as
   * ..." confirmation, e.g. for the Thank You page). Used for the pages that
   * don't need CTA wiring -- Checkout pages and the single Thank You page --
   * so they get the same "open -> publish" pass that wireSalesPageToFunnel
   * already gives every sales page, instead of being left on whatever state
   * the earlier page-creation pass left them in.
   */
  private async publishExistingPage(pageName: string, _publishAsButtonPattern?: string): Promise<void> {
    this.context.recordStep(`Publish Page: ${pageName}`);
    Logger.info('FUNNEL_BUILDER', `Publishing "${pageName}"...`);

    const opened = await this.openPageInProjectEditor(pageName);
    if (!opened) {
      Logger.warn('FUNNEL_BUILDER', `Could not open "${pageName}" — skipping publish.`);
      return;
    }

    await saveEditorPage(this.page, pageName); // Save first (keeps buttons / wiring / forms), then Publish
    await this.publishCurrentPage(pageName);
    Logger.info('FUNNEL_BUILDER', `✅ "${pageName}" published.`);
  }

  /**
   * Publishes every product's Checkout page -- previously only Sales pages
   * and the Thank You page got this final republish pass (via
   * wireSalesPageToFunnel / publishThankYouPage); Checkout pages need the
   * same treatment now that all product/funnel wiring is done.
   */
  public async publishAllCheckoutPages(products: ProductConfig[]): Promise<void> {
    for (const product of products) {
      await this.publishExistingPage(product.checkoutPageName);
    }
    Logger.info('FUNNEL_BUILDER', `✅ Published all ${products.length} checkout pages.`);
  }

  /**
   * Publishes the single shared Thank You page (there's only ever one per
   * project, unlike Sales/Checkout which are per-product).
   */
  public async publishThankYouPage(thankYouPageName: string = 'Thank You'): Promise<void> {
    await this.publishExistingPage(thankYouPageName, 'Publish as Thank You (');
  }
}