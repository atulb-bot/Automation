import { Page, expect } from '@playwright/test';
import { Logger } from '../utils/logger';
import { PopupHandler } from '../utils/popup-handler';
import { TestContext } from '../utils/test-context';
import { waitForManualStep } from '../utils/manual-assist';
import { saveEditorPage } from '../utils/editor-save';

export interface PageSpec {
  name: string;
  /** Always start this page from "Blank Template" (e.g. the split-test Variant opt-in page). */
  blankTemplate?: boolean;
  /** Exact visible text of the page-type option inside #page-type-menu (confirmed via recording). Kept for logging/back-compat. */
  typeTextMatch: string;
  /**
   * Broader pattern for matching the option, since the live menu renders a
   * title plus a description line under it (e.g. "Sales Page" / "Used to
   * pitch or sell your product...") and which of those two strings is the
   * one actually returned by getByText depends on the DOM structure on the
   * day it's read. Matching on title OR description means a copy tweak to
   * either one doesn't silently break selection.
   */
  typeMatchPattern: RegExp;
  /** Category tab label in the template gallery (only applies to types that show a gallery inline). */
  tabLabel: string;
  /** Whether this page type shows "Choose a Template" immediately after Add Page, or needs a later pass. */
  hasInlineTemplateGallery: boolean;
  /** Which "Publish as ..." confirmation button (if any) this page type needs after the main Publish click. */
  publishAsButtonName?: string;
}

export class FunnelPage {
  constructor(private page: Page, private context: TestContext) {}

  // Confirmed via live codegen recording:
  // - Sales Page & Thank You (Purchase) show the template gallery immediately after "Add Page".
  // - Checkout Page does NOT — it must be reopened from the project's page list afterward
  //   to assign a template (see assignTemplateToExistingPage()).
  public static readonly FUNNEL_PAGES: PageSpec[] = [
    { name: 'FE Sales', typeTextMatch: 'Sales Page', typeMatchPattern: /Sales Page|Used to pitch or sell/i, tabLabel: 'Sales Page', hasInlineTemplateGallery: true, publishAsButtonName: 'Publish as Sales Page' },
    { name: 'FE Checkout', typeTextMatch: 'Checkout Page', typeMatchPattern: /Checkout Page/i, tabLabel: 'Checkout', hasInlineTemplateGallery: false },
    { name: 'OTO1 Sales', typeTextMatch: 'Sales Page', typeMatchPattern: /Sales Page|Used to pitch or sell/i, tabLabel: 'Sales Page', hasInlineTemplateGallery: true, publishAsButtonName: 'Publish as Sales Page' },
    { name: 'OTO1 Checkout', typeTextMatch: 'Checkout Page', typeMatchPattern: /Checkout Page/i, tabLabel: 'Checkout', hasInlineTemplateGallery: false },
    { name: 'DS1 Sales', typeTextMatch: 'Sales Page', typeMatchPattern: /Sales Page|Used to pitch or sell/i, tabLabel: 'Sales Page', hasInlineTemplateGallery: true, publishAsButtonName: 'Publish as Sales Page' },
    { name: 'DS1 Checkout', typeTextMatch: 'Checkout Page', typeMatchPattern: /Checkout Page/i, tabLabel: 'Checkout', hasInlineTemplateGallery: false },
    { name: 'OTO2 Sales', typeTextMatch: 'Sales Page', typeMatchPattern: /Sales Page|Used to pitch or sell/i, tabLabel: 'Sales Page', hasInlineTemplateGallery: true, publishAsButtonName: 'Publish as Sales Page' },
    { name: 'OTO2 Checkout', typeTextMatch: 'Checkout Page', typeMatchPattern: /Checkout Page/i, tabLabel: 'Checkout', hasInlineTemplateGallery: false },
    { name: 'DS2 Sales', typeTextMatch: 'Sales Page', typeMatchPattern: /Sales Page|Used to pitch or sell/i, tabLabel: 'Sales Page', hasInlineTemplateGallery: true, publishAsButtonName: 'Publish as Sales Page' },
    { name: 'DS2 Checkout', typeTextMatch: 'Checkout Page', typeMatchPattern: /Checkout Page/i, tabLabel: 'Checkout', hasInlineTemplateGallery: false },
    { name: 'Thank You', typeTextMatch: 'Thank You (Purchase)', typeMatchPattern: /Thank You|Shown after successful/i, tabLabel: 'Thank You', hasInlineTemplateGallery: true, publishAsButtonName: 'Publish as Thank You (' },
  ];

  /** A page with exactly this name already in the project's page list? */
  private async pageExists(name: string, waitMs = 1500): Promise<boolean> {
    const row = this.page.getByText(name, { exact: true }).first();
    return row.waitFor({ state: 'visible', timeout: waitMs }).then(() => true).catch(() => false);
  }

  /**
   * Creates one page. Skips it if it already exists (e.g. you made it by hand); if creating it fails,
   * asks you to make it by hand and continues once it shows up in the page list.
   */
  public async createSinglePage(spec: PageSpec, index: number): Promise<void> {
    if (await this.pageExists(spec.name)) {
      Logger.info('FUNNEL', `[${index + 1}/${FunnelPage.FUNNEL_PAGES.length}] "${spec.name}" already exists - skipping.`);
      return;
    }
    try {
      await this.createSinglePageSteps(spec, index);
    } catch (err) {
      const reason = String(err instanceof Error ? err.message : err).split('\n')[0];
      Logger.warn('FUNNEL', `Creating "${spec.name}" failed: ${reason}`);
      await this.page.keyboard.press('Escape').catch(() => {});
      const kind = /Sales Page/i.test(spec.typeTextMatch) ? 'Sales Page, Blank Template' : /Checkout/i.test(spec.typeTextMatch) ? 'Checkout Page' : 'Thank You (Purchase), any template, then Publish';
      const done = await waitForManualStep(this.page, `Create the page "${spec.name}"`,
        `In the project: Add New Page -> name "${spec.name}" -> type ${kind}. Then come back to the page list.`,
        async () => {
          if (this.context.projectUrl && !this.page.url().startsWith(this.context.projectUrl)) return false;
          return this.pageExists(spec.name, 500);
        });
      if (!done) throw err;
      if (this.context.projectUrl) await this.page.goto(this.context.projectUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    }
  }

  private async createSinglePageSteps(spec: PageSpec, index: number): Promise<void> {
    this.context.recordStep(`Create Page: ${spec.name}`);
    Logger.info('FUNNEL', `[${index + 1}/${FunnelPage.FUNNEL_PAGES.length}] Creating page: "${spec.name}"...`);

    await this.page.waitForLoadState('domcontentloaded');
    await PopupHandler.dismissKnownPopups(this.page);

    // 1. Click "+ Add New Page"
    const addBtn = this.page.getByRole('button', { name: 'Add New Page' }).first();
    if (!(await addBtn.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false))) {
      // e.g. the app stayed inside the page just created - go back to the project's page list
      Logger.warn('FUNNEL', `"Add New Page" not showing before "${spec.name}" - going back to the project page list.`);
      if (this.context.projectUrl) await this.page.goto(this.context.projectUrl, { waitUntil: 'domcontentloaded' });
      await PopupHandler.dismissKnownPopups(this.page);
    }
    await expect(addBtn, `"Add New Page" button (before creating "${spec.name}")`).toBeVisible({ timeout: 30000 });
    await addBtn.click();

    // 2. Fill Page Name (confirmed: role textbox, accessible name "Enter Page name")
    const nameInput = this.page.getByRole('textbox', { name: 'Enter Page name' });
    await expect(nameInput, `page name box for "${spec.name}"`).toBeVisible({ timeout: 15000 });
    await nameInput.click();
    await nameInput.fill(spec.name);

    // 3-4. Open the page-type dropdown and pick the option matching this
    // page's type (Sales / Checkout / Thank You). Retries the whole
    // open-dropdown -> click-option cycle, and reads the dropdown's own
    // label back afterward, because a click landing before the menu is
    // fully wired closes the menu without actually registering a selection
    // — that silent no-op (not an exception) is what made page creation get
    // stuck here with no type ever applied.
    await this.selectPageType(spec);

    // 5. Click "Add Page" — guard on enabled state, since the button stays
    // disabled until a page type is actually selected.
    const addPageBtn = this.page.getByRole('button', { name: 'Add Page', exact: true });
    await expect(addPageBtn).toBeVisible({ timeout: 10000 });
    await expect(addPageBtn).toBeEnabled({ timeout: 8000 });
    await addPageBtn.click();
    await expect(addPageBtn).toBeHidden({ timeout: 15000 }).catch(() => {});
    Logger.info('FUNNEL', `Page "${spec.name}" registered.`);

    // Default (blank pages): sales pages start from "Blank Template"; their content (section, 2-column row,
    // "Sales FE" headline, button, No thanks) is built later in the wiring step.
    if (spec.blankTemplate || (process.env.PAGE_MODE !== 'template' && /Sales Page/i.test(spec.typeTextMatch))) {
      await this.selectBlankTemplate(spec.name);
      return;
    }

    if (spec.hasInlineTemplateGallery) {
      // 6. Template gallery appears immediately for Sales / Thank You pages.
      const galleryVisible = await this.page.getByText('Choose a Template').waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
      if (galleryVisible) {
        await this.selectRandomTemplate(spec.name, spec.tabLabel);
      } else {
        Logger.warn('FUNNEL', `Expected a template gallery for "${spec.name}" but none appeared — skipping template step.`);
      }
      await this.publishCurrentPage(spec);
    } else {
      // Checkout pages don't show a gallery inline — they need a later pass
      // (see assignTemplateAndPublish()) once all pages exist.
      Logger.info('FUNNEL', `"${spec.name}" is a Checkout-type page — template & publish will be assigned in a later pass.`);
    }
  }

  /**
   * Opens the "Select a page type" dropdown and picks the option matching
   * spec.typeMatchPattern, then confirms the dropdown's own label actually
   * changed to reflect that pick before moving on. Retries the full
   * open -> click -> verify cycle up to 3 times.
   *
   * Two things this deliberately avoids, both confirmed as real failure
   * modes from a live run at page 11/11 ("Thank You"):
   * - The trigger is matched by #page-type-button ONLY (plus, only while
   *   still unselected, the literal "Select a page type" label). It used to
   *   also fall back to any button whose name matched Sales/Checkout/Thank
   *   You — but by the last page, the sidebar page list already has ~10 rows
   *   showing those same type badges, so that fallback could grab an
   *   unrelated sidebar row instead of the real dropdown (seen as "menu did
   *   not open" even though a menu — just not this one — may have been fine).
   * - Options are matched among actual row-level elements (li /
   *   [role="option"] / cursor-pointer div / button) filtered by text,
   *   never via a bare getByText on the whole menu container — the menu's
   *   own combined text spans all three option labels, so a bare getByText
   *   can resolve to that outer wrapper and click whichever option happens
   *   to sit at its visual center (seen live: selecting "Thank You" instead
   *   selected "Sales Page").
   */
  private async selectPageType(spec: PageSpec): Promise<void> {
    const typeDropdown = this.page.locator('#page-type-button')
      .or(this.page.getByRole('button', { name: /^Select a page type$/i })).first();
    const typeMenu = this.page.locator('#page-type-menu');

    for (let attempt = 1; attempt <= 3; attempt++) {
      await expect(typeDropdown).toBeVisible({ timeout: 10000 });

      // Already showing the right type from a previous attempt? Done.
      const currentLabel = (await typeDropdown.innerText().catch(() => '')) || '';
      if (spec.typeMatchPattern.test(currentLabel) && !/Select a page type/i.test(currentLabel)) {
        Logger.info('FUNNEL', `Page type already set to "${currentLabel.trim()}" for "${spec.name}".`);
        return;
      }

      await typeDropdown.click();
      const menuOpened = await typeMenu.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
      if (!menuOpened) {
        Logger.warn('FUNNEL', `Page-type menu did not open (attempt ${attempt}/3) for "${spec.name}" — retrying.`);
        continue;
      }

      // Row-level elements only — never the bare menu container.
      const typeOption = typeMenu
        .locator('li, [role="option"], div[class*="cursor-pointer" i], button')
        .filter({ hasText: spec.typeMatchPattern })
        .first();
      const optionVisible = await typeOption.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
      if (!optionVisible) {
        Logger.warn('FUNNEL', `No option matching "${spec.typeTextMatch}" found in the page-type menu (attempt ${attempt}/3) for "${spec.name}" — retrying.`);
        await this.page.keyboard.press('Escape').catch(() => {});
        continue;
      }

      await typeOption.click();
      await expect(typeMenu).toBeHidden({ timeout: 5000 }).catch(() => {});
      await this.page.waitForTimeout(400); // let the trigger's own label update commit before re-reading it

      const updatedLabel = (await typeDropdown.innerText().catch(() => '')) || '';
      if (spec.typeMatchPattern.test(updatedLabel)) {
        Logger.info('FUNNEL', `Selected page type "${spec.typeTextMatch}" for "${spec.name}" (attempt ${attempt}).`);
        return;
      }
      Logger.warn('FUNNEL', `Page type selection didn't register for "${spec.name}" (attempt ${attempt}/3, trigger reads "${updatedLabel.trim()}") — retrying.`);
    }

    Logger.warn('FUNNEL', `Could not confirm page type "${spec.typeTextMatch}" was applied for "${spec.name}" after 3 attempts — "Add Page" may stay disabled or create the wrong type.`);
  }

  /** Recorded: "Blank Template - Start from..." -> Select. */
  private async selectBlankTemplate(pageName: string): Promise<void> {
    await PopupHandler.dismissKnownPopups(this.page);
    const blank = this.page.getByText(/^\s*Blank Template/i).first();
    await blank.waitFor({ state: 'visible', timeout: 30000 });
    await blank.click();
    const select = this.page.getByRole('button', { name: 'Select', exact: true });
    await select.waitFor({ state: 'visible', timeout: 15000 });
    await select.click();
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForTimeout(2000);
    Logger.info('TEMPLATE', `✅ Blank template chosen for "${pageName}" (content is built in the wiring step)`);
  }

  /**
   * Gallery without "Use This Template" buttons: pick a template card, then "Select"
   * (the same style as the recorded Blank Template choice). Last resort: Blank Template.
   * Never stops the run over the template choice.
   */
  private async selectTemplateWithoutUseButton(pageName: string): Promise<void> {
    const select = this.page.getByRole('button', { name: 'Select', exact: true });
    const cards = this.page.locator('[class*="template" i], [class*="card" i]').filter({ hasNotText: /blank template/i }).filter({ has: this.page.locator('img') });
    const n = await cards.count().catch(() => 0);
    if (n > 0) {
      const pick = cards.nth(Math.floor(Math.random() * Math.min(n, 12)));
      await pick.scrollIntoViewIfNeeded().catch(() => {});
      await pick.click({ timeout: 8000 }).catch(() => {});
      if (await select.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)) {
        await select.click();
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(2000);
        Logger.info('TEMPLATE', `✅ Template chosen for "${pageName}" (card + Select)`);
        return;
      }
    }
    Logger.warn('TEMPLATE', `No "Use This Template" buttons for "${pageName}" - using Blank Template instead.`);
    await this.selectBlankTemplate(pageName);
  }

  private async selectRandomTemplate(pageName: string, tabLabel: string): Promise<void> {
    await PopupHandler.dismissKnownPopups(this.page);

    const categoryTab = this.page.getByRole('button', { name: tabLabel, exact: true })
      .or(this.page.locator('button, div').filter({ hasText: new RegExp(`^${tabLabel}$`, 'i') })).first();

    if (await categoryTab.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
      await categoryTab.click();
      Logger.info('TEMPLATE', `Switched category tab to "${tabLabel}"`);
    }

    const templateButtons = this.page.getByRole('button', { name: 'Use This Template' });
    if (!(await templateButtons.first().waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false))) {
      await this.selectTemplateWithoutUseButton(pageName);
      return;
    }

    const total = await templateButtons.count();
    const chosenIndex = total > 1 ? Math.floor(Math.random() * total) : 0;
    Logger.info('TEMPLATE', `Page "${pageName}" -> Found ${total} templates | Selected index: ${chosenIndex}`);

    const target = templateButtons.nth(chosenIndex);
    await target.scrollIntoViewIfNeeded().catch(() => {});
    await target.click({ timeout: 10000 });

    await this.page.waitForLoadState('domcontentloaded');
    await PopupHandler.dismissKnownPopups(this.page);
    Logger.info('TEMPLATE', `✅ Template applied for "${pageName}"`);
  }

  /**
   * Publishes the page currently open in the editor. Sales/Thank You pages
   * need an extra "Publish as ..." confirmation click after the main
   * Publish button (confirmed via recording); plain pages just need the
   * main Publish click.
   */
  private async publishCurrentPage(spec: PageSpec): Promise<void> {
    await PopupHandler.dismissKnownPopups(this.page);

    await saveEditorPage(this.page); // Save first (keeps buttons / wiring / forms), then Publish
    const publishBtn = this.page.getByRole('button', { name: 'Publish Publish the page live.' })
      .or(this.page.getByRole('button', { name: /^Publish$/ })).first();

    if (!(await publishBtn.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false))) {
      Logger.warn('FUNNEL', `No Publish button found for "${spec.name}" — page may still be on the editor canvas, not the publish screen.`);
      return;
    }

    await publishBtn.click();
    await this.page.waitForTimeout(1000);

    if (spec.publishAsButtonName) {
      const confirmBtn = this.page.getByRole('button', { name: new RegExp(spec.publishAsButtonName.replace(/[().]/g, '.'), 'i') }).first();
      if (await confirmBtn.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false)) {
        await confirmBtn.click();
      } else {
        Logger.warn('FUNNEL', `Expected a "${spec.publishAsButtonName}" confirmation for "${spec.name}" but it wasn't found.`);
      }
    }

    await this.page.waitForTimeout(2000);
    Logger.info('FUNNEL', `✅ "${spec.name}" published live.`);
  }

  /**
   * Second pass for pages that don't get an inline template gallery
   * (currently: Checkout pages). Reopens the page from the project's page
   * list, assigns a template, opens the editor, and publishes.
   * Must be called after all pages in FUNNEL_PAGES have been created and
   * while already on the project's page-list screen.
   */
  public async assignTemplateAndPublish(spec: PageSpec): Promise<void> {
    this.context.recordStep(`Assign Template & Publish: ${spec.name}`);
    Logger.info('FUNNEL', `Reopening "${spec.name}" to assign a template...`);

    // Each prior iteration of this loop ends on the editor/published view of
    // the PREVIOUS checkout page, not the page list — so without navigating
    // back here, every checkout page after the first can't find its row at
    // all (pageRow below just times out and the template gets silently
    // skipped). This is why templates only ever seemed to land on one
    // checkout page instead of all of them.
    if (this.context.projectUrl) {
      await this.page.goto(this.context.projectUrl, { waitUntil: 'domcontentloaded' });
      await this.page.waitForLoadState('domcontentloaded');
      await PopupHandler.dismissKnownPopups(this.page);
      await this.page.waitForTimeout(1500); // page-list hydration
    } else {
      Logger.warn('FUNNEL', 'No project URL captured on context — assuming we are already on the project page list.');
      await PopupHandler.dismissKnownPopups(this.page);
    }

    const pageRow = this.page.getByText(spec.name, { exact: false }).first();
    if (!(await pageRow.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false))) {
      Logger.warn('FUNNEL', `Could not find "${spec.name}" in the page list — skipping template assignment.`);
      return;
    }
    await pageRow.click();
    await this.page.waitForTimeout(800);

    const galleryVisible = await this.page.getByText('Choose a Template').waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
    if (galleryVisible) {
      await this.selectRandomTemplate(spec.name, spec.tabLabel);
    } else {
      // Gallery might require an explicit category tab click first (e.g. "Checkout")
      const categoryTab = this.page.getByRole('button', { name: spec.tabLabel, exact: true }).first();
      if (await categoryTab.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)) {
        await categoryTab.click();
        await this.selectRandomTemplate(spec.name, spec.tabLabel);
      } else {
        Logger.warn('FUNNEL', `No template gallery found for "${spec.name}" on reopen — it may already have a template.`);
      }
    }

    const editPageLink = this.page.getByRole('link', { name: 'Edit Page' }).first();
    if (await editPageLink.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false)) {
      await editPageLink.click();
      await this.page.waitForLoadState('domcontentloaded');
      await this.publishCurrentPage(spec);
    }
  }

  /**
   * Creates, templates, and publishes an arbitrary subset of FUNNEL_PAGES
   * (in the given order) -- e.g. just FE Sales / FE Checkout / Thank You for
   * a standalone single-product flow with no funnel. Same two-pass logic
   * createAllFunnelPages() always used (inline-gallery pages first, then a
   * second pass for Checkout-type pages that need to be reopened), just
   * scoped to whichever specs are passed in.
   */
  public async createPages(specs: PageSpec[]): Promise<void> {
    Logger.info('FUNNEL', `Creating ${specs.length} custom funnel page(s) sequentially...`);
    for (let i = 0; i < specs.length; i++) {
      await this.createSinglePage(specs[i], i);
    }

    Logger.info('FUNNEL', 'Second pass: assigning templates + publishing Checkout-type pages...');
    for (const spec of specs.filter((p) => !p.hasInlineTemplateGallery)) {
      await this.assignTemplateAndPublish(spec);
    }

    Logger.info('FUNNEL', `🎉 ${specs.length} page(s) created, templated, and published!`);
  }

  public async createAllFunnelPages(): Promise<void> {
    await this.createPages(FunnelPage.FUNNEL_PAGES);
  }
}
