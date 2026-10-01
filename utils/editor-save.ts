import { Page } from '@playwright/test';
import { Logger } from './logger';

/**
 * Clicks the editor's "Save" button (next to Publish) and waits for the save to finish.
 * Called before every Publish, so all customisation (buttons, wiring, forms) is stored first.
 */
export async function saveEditorPage(page: Page, label = 'page'): Promise<void> {
  const save = page.getByRole('button', { name: /^\s*Save\s*$/ }).first();
  if (!(await save.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false))) {
    Logger.warn('EDITOR', `No "Save" button found on ${label} - publishing without a separate save.`);
    return;
  }
  // wait until it can be clicked (it can be greyed out while the editor is still busy)
  const end = Date.now() + 10000;
  while (!(await save.isEnabled().catch(() => true)) && Date.now() < end) await page.waitForTimeout(400);
  await save.click();
  Logger.info('EDITOR', `💾 Saved ${label}`);
  // let the save finish: a "saved" message, the button busy -> ready again, or a short pause
  const toast = page.getByText(/saved|changes saved|successfully/i).first();
  await Promise.race([
    toast.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {}),
    page.waitForTimeout(6000),
  ]);
  const ready = Date.now() + 8000;
  while (!(await save.isEnabled().catch(() => true)) && Date.now() < ready) await page.waitForTimeout(400);
  await page.waitForTimeout(1500);
}
