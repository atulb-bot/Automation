import { Page, Locator, FrameLocator, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from './logger';
import { PopupHandler } from './popup-handler';
import { TestContext } from './test-context';

export class Helpers {
  /**
   * Resilient click helper with retries, popup clearance, scroll, and diagnostics.
   */
  public static async retryClick(
    page: Page,
    locator: Locator,
    description: string,
    context: TestContext,
    maxRetries: number = 3
  ): Promise<void> {
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      try {
        await PopupHandler.dismissKnownPopups(page);
        await locator.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
        await expect(locator).toBeVisible({ timeout: 5000 });
        await expect(locator).toBeEnabled({ timeout: 5000 });
        await locator.click({ timeout: 5000 });
        return;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        Logger.warn('RETRY', `Attempt ${attempt}/${maxRetries} failed on "${description}". Reason: ${errorMsg}`);
        await PopupHandler.clearBlockingOverlays(page);
        if (attempt >= maxRetries) {
          await this.captureDiagnosticScreenshot(page, `${context.funnelKind}-${description.replace(/\s+/g, '_')}-failed`);
          Logger.diagnosticBlock({
            funnel: context.funnelKind,
            step: context.currentStep,
            action: `Clicking: ${description}`,
            url: page.url(),
            project: context.projectName,
            product: context.productName,
            error: errorMsg,
          });
          throw new Error(`Failed to click "${description}" after ${maxRetries} attempts: ${errorMsg}`);
        }
      }
    }
  }

  /**
   * Opens a dropdown/select-style trigger and waits for its menu AND at least
   * `minOptions` option-like children to actually be rendered, instead of
   * guessing with a fixed waitForTimeout. Polls with expect().toPass so it
   * adapts to slow renders without over-waiting on fast ones.
   *
   * Returns the menu Locator so the caller can pick an option from it.
   */
  public static async openDropdownAndGetOptions(
    page: Page,
    trigger: Locator,
    menuSelector: string,
    minOptions: number = 1,
    timeout: number = 10000
  ): Promise<Locator> {
    await trigger.scrollIntoViewIfNeeded().catch(() => {});
    await expect(trigger).toBeVisible({ timeout: 8000 });
    await trigger.click({ force: true });

    const menu = page.locator(menuSelector).first();
    await expect(menu).toBeVisible({ timeout });

    const optionLocator = menu.locator('li, [role="option"], div[class*="cursor-pointer"], p');
    await expect(async () => {
      const count = await optionLocator.count();
      if (count < minOptions) {
        throw new Error(`Dropdown menu rendered only ${count}/${minOptions} options so far`);
      }
    }).toPass({ timeout, intervals: [150, 250, 400, 600] });

    return menu;
  }

  /**
   * Opens a search-and-select style dropdown ("Search and select a
   * product...", etc.), types `productName` into it, and returns the
   * ALREADY-RESOLVED option Locator for that exact product -- never a blind
   * positional/class-based element.
   *
   * Why this replaced the old menu-selector approach: CSS classes like
   * `.absolute.z-10` are shared by every floating panel on the page (menus,
   * tooltips, other still-open dropdowns), so clicking `.first()` on that
   * class with no text/name check could silently land on the wrong panel or
   * the wrong option -- which is what was causing "not able to select
   * element in dropdown". The fix is the same pattern your own recording
   * already proved reliable: `getByRole('option', { name: productName })`.
   *
   * After typing, the focused element (not a guessed <input> candidate)
   * receives the search text -- clicking the trigger reliably focuses the
   * live-search input FlexiFunnels swaps in, so reading `:focus` avoids
   * accidentally typing into an unrelated input elsewhere on the page.
   *
   * Throws a clear, descriptive error if the product truly never appears,
   * instead of silently falling back to "click whatever is first" (which is
   * what let wrong selections pass silently before).
   */
  public static async selectProductFromDropdown(
    page: Page,
    trigger: Locator,
    productName: string,
    timeout: number = 12000
  ): Promise<void> {
    await trigger.scrollIntoViewIfNeeded().catch(() => {});
    await expect(trigger).toBeVisible({ timeout: 8000 });
    await trigger.click({ force: true });

    // Whatever the SPA just focused (its live-search input) gets the text --
    // far more reliable than guessing among several candidate <input>s.
    const focused = page.locator(':focus');
    if (await focused.count().catch(() => 0)) {
      await focused.fill('').catch(() => {});
      await focused.pressSequentially(productName, { delay: 60 }).catch(() => {});
    } else {
      await page.keyboard.type(productName, { delay: 60 }).catch(() => {});
    }

    await page.waitForTimeout(700); // debounced search -- let the filtered list re-render

    // Primary: proper accessible option role (confirmed working pattern from
    // the recorded script -- e.g. getByRole('option', { name: 'QA vLOWEh FE -' })).
    const roleOption = page.getByRole('option', { name: productName, exact: false }).first();
    // Fallback: some pickers render plain divs/li/p instead of role="option".
    const genericOption = page
      .locator('li, div[class*="cursor-pointer"], p')
      .filter({ hasText: productName })
      .first();

    let option = roleOption;
    const roleVisible = await roleOption.isVisible({ timeout }).catch(() => false);
    if (!roleVisible) {
      const genericVisible = await genericOption.isVisible({ timeout: 4000 }).catch(() => false);
      if (!genericVisible) {
        await this.captureDiagnosticScreenshot(page, `product-not-found-${productName.replace(/\s+/g, '_')}`);
        throw new Error(
          `Could not find "${productName}" in the product dropdown after searching. ` +
          `Check the product name matches exactly what was created, or the dropdown/search UI has changed.`
        );
      }
      option = genericOption;
    }

    await option.scrollIntoViewIfNeeded().catch(() => {});
    await option.click({ force: true });
  }

  /**
   * Finds the nearest scrollable ancestor of `elementInsideContainer` (an
   * element with overflow-y auto/scroll and actual overflow content) and
   * scrolls it to the bottom, repeating until the scroll position stops
   * changing (i.e. it has genuinely reached the end, including lazily
   * rendered/virtualized lists that mount more rows as you approach the
   * bottom). Confirmed necessary for the "Funnel Steps" panel: newly added
   * step rows and their "Add Next Step" buttons can land below the current
   * scroll position and simply aren't interactable/matchable yet until
   * scrolled into view -- the same class of issue as the Thank You page
   * dropdown. No-ops quietly if no scrollable ancestor is found.
   */
  public static async scrollContainerToBottom(
    page: Page,
    elementInsideContainer: Locator,
    maxAttempts: number = 15
  ): Promise<void> {
    const handle = await elementInsideContainer.elementHandle().catch(() => null);
    if (!handle) return;

    let previousScrollTop = -1;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const result = await page.evaluate((el) => {
        function isScrollable(node: HTMLElement): boolean {
          const style = window.getComputedStyle(node);
          return /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 4;
        }
        let node = (el as HTMLElement).parentElement;
        while (node && node !== document.body) {
          if (isScrollable(node)) {
            node.scrollTop = node.scrollHeight;
            return { scrollTop: node.scrollTop, scrollHeight: node.scrollHeight };
          }
          node = node.parentElement;
        }
        return null;
      }, handle);

      if (!result) return; // no scrollable ancestor -- nothing to do
      if (result.scrollTop === previousScrollTop) return; // reached bottom / stabilized
      previousScrollTop = result.scrollTop;
      await page.waitForTimeout(400); // give lazily rendered rows a moment to mount
    }
  }

  /**
   * Waits for the FlexiFunnels SPA to actually be ready for interaction,
   * instead of a blind waitForTimeout(). FlexiFunnels shows a spinner/loader
   * element during route transitions and async data fetches (project create,
   * product wizard steps, payment-provider list, dropdown hydration); firing
   * a click/fill while it's still visible is what causes actions to land on
   * stale or not-yet-wired elements. This waits for any such spinner to be
   * gone, then gives the DOM a brief settle window for post-spinner writes.
   * Never throws — screens with no spinner element at all are a valid case.
   */
  public static async waitForAppReady(page: Page, timeout: number = 12000): Promise<void> {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout });
    } catch {}
    try {
      await page.waitForFunction(
        () => {
          const spinners = document.querySelectorAll(
            '[class*="spinner" i], [class*="loader" i], [class*="loading" i], .animate-spin'
          );
          return (
            spinners.length === 0 ||
            Array.from(spinners).every((el) => (el as HTMLElement).offsetParent === null)
          );
        },
        { timeout }
      );
    } catch {
      // No spinner ever appeared, or it never cleared in time — fall through
      // rather than failing the whole step over a missing/odd loader.
    }
    await page.waitForTimeout(250); // brief settle for writes that land just after the spinner clears
  }

  /**
   * Fixed settle delay (default 4-5s, randomized) inserted after each wizard
   * step in the Products flow. waitForAppReady() only waits out a spinner
   * element, but some FlexiFunnels steps (e.g. the Thank You page picker)
   * finish their spinner before the underlying template has actually
   * finished loading, which is what caused that step to appear "stuck" even
   * though clicking through worked once given a moment. This is a blunter,
   * belt-and-suspenders wait layered on top of waitForAppReady for exactly
   * that class of step.
   */
  public static async stepDelay(page: Page, minMs: number = 4000, maxMs: number = 5000): Promise<void> {
    const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await page.waitForTimeout(ms);
  }

  /**
   * Safely acquires the primary editor frame without targeting the FreshChat iframe.
   */
  public static async getEditorFrame(page: Page, timeout: number = 25000): Promise<FrameLocator> {
    const selector = 'iframe:not([name="fc_widget"]):not([id^="fc_"])';
    const editorFrameLocator = page.frameLocator(selector).first();
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        await PopupHandler.dismissKnownPopups(page);
        const body = editorFrameLocator.locator('body');
        if (await body.isVisible({ timeout: 2000 })) {
          Logger.info('EDITOR', 'Editor inner iframe located and ready');
          return editorFrameLocator;
        }
      } catch {
        // Frame might still be mounting
      }
    }
    throw new Error(`Timeout after ${timeout}ms waiting for editor iframe content.`);
  }

  /**
   * Takes diagnostic screenshots saved in test-results directory.
   */
  public static async captureDiagnosticScreenshot(page: Page, filenamePrefix: string): Promise<string> {
    const dir = path.resolve(process.cwd(), 'test-results');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const sanitizedName = filenamePrefix.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(dir, `${sanitizedName}_${Date.now()}.png`);
    await page.screenshot({ path: filePath, fullPage: true }).catch(() => {});
    Logger.info('DIAGNOSTIC', `Diagnostic screenshot captured: ${filePath}`);
    return filePath;
  }
}