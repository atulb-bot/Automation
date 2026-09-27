import { Page, Locator } from '@playwright/test';
import { Logger } from './logger';

export class PopupHandler {
  /**
   * The actual FreshChat popup: a "Close Notifications" button rendered
   * *inside* the fc_widget iframe's own content (confirmed via a live
   * codegen recording). CSS-hiding or removing the outer iframe node does
   * NOT reliably clear this — FreshChat can leave a blocking overlay behind
   * or simply re-inject the iframe, so this must be the primary strategy,
   * not a fallback.
   */
  public static async closeFreshChatNotifications(page: Page): Promise<void> {
    try {
      const fcFrame = page.frameLocator('iframe[name="fc_widget"]');
      const closeBtn = fcFrame.getByRole('button', { name: 'Close Notifications' });
      if (await closeBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await closeBtn.click({ timeout: 2000 }).catch(() => {});
        Logger.info('POPUP', 'Closed FreshChat notifications popup.');
        await page.waitForTimeout(300);
      }
    } catch {
      // iframe not present / not yet mounted — nothing to close.
    }
  }

  /**
   * Permanently blocks and destroys FreshChat and right-hand overlay drawers.
   * This is a secondary defense (keeps the widget from grabbing focus/space)
   * — closeFreshChatNotifications() above handles the actual blocking popup.
   */
  public static async killRightHandPopups(page: Page): Promise<void> {
    try {
      // 1. Inject CSS to hide all FreshChat and right-hand floating widgets permanently
      await page.addStyleTag({
        content: `
          .fc-widget-normal, #fc_widget,
          div[class*="freshchat"]:not(:has(iframe)), div[id*="freshchat"]:not(:has(iframe)),
          .crisp-client, div[class*="slide-over"], div[class*="announcement"] {
            display: none !important;
            visibility: hidden !important;
            pointer-events: none !important;
            z-index: -99999 !important;
          }
        `,
      }).catch(() => {});
    } catch {}
  }

  public static async dismissKnownPopups(page: Page): Promise<void> {
    // Order matters: close the FreshChat notification FIRST (it can sit on
    // top of and block everything else), then sweep other known popups.
    await this.closeFreshChatNotifications(page);
    await this.killRightHandPopups(page);

    try {
      // Accept Cookie Banner if present
      const acceptBtn = page.getByRole('button', { name: /Accept All|Accept/i }).first();
      if (await acceptBtn.isVisible({ timeout: 600 }).catch(() => false)) {
        await acceptBtn.click({ timeout: 1000 }).catch(() => {});
        Logger.info('POPUP', 'Dismissed cookie banner');
      }

      // Close toast notifications
      const toastClose = page.locator('.notification button.close, .toast-close, button[aria-label="Close"]').first();
      if (await toastClose.isVisible({ timeout: 400 }).catch(() => false)) {
        await toastClose.click({ timeout: 800 }).catch(() => {});
      }
    } catch {}
  }

  public static async clearBlockingOverlays(page: Page): Promise<void> {
    await this.killRightHandPopups(page);
    try {
      await page.evaluate(() => {
        const backdrops = document.querySelectorAll('.modal-backdrop, .overlay, [class*="backdrop"]');
        backdrops.forEach((el) => {
          if (el && el.parentNode) {
            el.parentNode.removeChild(el);
          }
        });
      });
    } catch {}
  }

  /**
   * Combined popup cleanup + tab focus. Used right after switching to /
   * opening a page so we don't fight FreshChat, cookie banners, or a
   * background tab before interacting with it.
   */
  public static async cleanAllPopupsAndFocus(page: Page): Promise<void> {
    await this.dismissKnownPopups(page);
    await page.bringToFront().catch(() => {});
    await page.mouse.move(1, 1).catch(() => {});
  }

  /**
   * Closes an open dropdown/toggle-panel/accordion using several fallback
   * strategies, since we don't yet know exactly which pattern the FlexiFunnels
   * "Payment Providers" panel uses. Tries, in order:
   *  1. An explicit Close/Done button inside the panel (if a locator is given)
   *  2. Clicking the same trigger again (accordion-style collapse)
   *  3. Escape key
   *  4. Clicking a neutral point outside the panel
   * Every step is best-effort; failures are swallowed since "already closed"
   * is a valid outcome too.
   */
  public static async closeOpenPanel(page: Page, panel?: Locator, trigger?: Locator): Promise<void> {
    try {
      if (panel) {
        const explicitClose = panel
          .locator('button:has-text("Close"), button:has-text("Done"), button:has-text("Save"), button[aria-label="Close"], [class*="close"]')
          .first();
        if (await explicitClose.isVisible({ timeout: 1000 }).catch(() => false)) {
          await explicitClose.click({ force: true }).catch(() => {});
          if (panel && !(await panel.isVisible({ timeout: 1000 }).catch(() => true))) return;
        }
      }

      if (trigger && await trigger.isVisible({ timeout: 800 }).catch(() => false)) {
        await trigger.click({ force: true }).catch(() => {});
        if (panel && !(await panel.isVisible({ timeout: 1000 }).catch(() => true))) return;
      }

      await page.keyboard.press('Escape').catch(() => {});
      if (panel && !(await panel.isVisible({ timeout: 1000 }).catch(() => true))) return;

      await page.mouse.click(5, 5).catch(() => {});
    } catch {
      // Best-effort only — an already-closed panel is not an error.
    }
  }
}