import { FrameLocator, Locator, Page, expect } from '@playwright/test';
import { Logger } from '../utils/logger';
import { PopupHandler } from '../utils/popup-handler';
import { TestContext } from '../utils/test-context';
import { Helpers } from '../utils/helpers';
import { waitForManualStep } from '../utils/manual-assist';
import { FunnelBuilderPage } from './FunnelBuilderPage';
import { FunnelPage } from './FunnelPage';
import { saveEditorPage } from '../utils/editor-save';
import { ME } from '../utils/my-details';

/**
 * Email opt-in flow (from the recording):
 *   project (default type: comes with "Email Optin Page" + "Thank You Page")
 *   -> Email Optin Page: Blank Template      -> Thank You Page: a "Thank You" template
 *   -> Thank You Page: Edit -> Publish as Thank You (Opt-in) -> copy its Published URL
 *   -> Email Optin Page: Section -> 2 Columns -> Headline "Email Optin" -> Form
 *      -> form fields (Last Name, Address, Phone, City) -> Form Submit Action = Thank You URL -> Publish
 *   -> live page: fill the form -> SUBMIT -> Thank You page
 */
export const OPTIN_PAGE = 'Email Optin Page';
export const THANKYOU_PAGE = 'Thank You Page';
// Name (First Name) and Email are on the form by default; these are added: -> Name, Email, Phone, Address, City
const EXTRA_FIELDS = ['phone', 'address', 'city'];
const FIELD_LABEL: Record<string, string> = { phone: 'Phone', address: 'Address', city: 'City', last_name: 'Last Name' };

export class OptinPage {
  private builder: FunnelBuilderPage;
  constructor(private page: Page, private context: TestContext) {
    this.builder = new FunnelBuilderPage(page, context);
  }

  private frame(): FrameLocator {
    return this.page.locator('iframe:not([name="fc_widget"])').first().contentFrame();
  }
  private async visible(l: Locator, ms: number) {
    return l.waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false);
  }

  // ------------------------------------------------------------------ 1. project
  /** Create Project WITHOUT picking a project type (the default creates the two opt-in pages). */
  async createOptinProject(projectName: string): Promise<string> {
    this.context.projectName = projectName;
    await PopupHandler.dismissKnownPopups(this.page);
    const projects = this.page.getByRole('link', { name: 'Projects' });
    if (await this.visible(projects, 8000)) await projects.click();
    else await this.page.goto('https://app.flexifunnels.com/projects', { waitUntil: 'domcontentloaded' });
    await PopupHandler.dismissKnownPopups(this.page);

    const createBtn = this.page.getByRole('button', { name: 'Create Project' }).first();
    await expect(createBtn).toBeVisible({ timeout: 30000 });
    await createBtn.click();
    await PopupHandler.closeFreshChatNotifications(this.page);

    // If a project-type picker is shown, prefer an email opt-in type; otherwise keep the default.
    const optinType = this.page.getByRole('button', { name: /e-?mail\s*opt-?in/i }).first();
    if (await this.visible(optinType, 2500)) await optinType.click();

    const name = this.page.getByRole('textbox', { name: 'Project Name' }).first();
    await expect(name).toBeVisible({ timeout: 15000 });
    await name.fill(projectName);
    await PopupHandler.closeFreshChatNotifications(this.page);
    const create = this.page.getByRole('button', { name: 'Create', exact: true });
    await expect(create).toBeEnabled({ timeout: 10000 });
    await create.click();
    await this.page.waitForURL((u) => u.pathname.includes('/projects/') && !u.pathname.endsWith('/projects'), { timeout: 40000 });
    this.context.projectUrl = this.page.url();
    Logger.info('OPTIN', `✅ Project "${projectName}" created: ${this.context.projectUrl}`);
    await PopupHandler.dismissKnownPopups(this.page);
    await this.page.waitForTimeout(2500);
    return this.context.projectUrl;
  }

  // ------------------------------------------------------------------ 2. templates
  private async backToProject() {
    if (this.context.projectUrl) await this.page.goto(this.context.projectUrl, { waitUntil: 'domcontentloaded' });
    await PopupHandler.dismissKnownPopups(this.page);
    await this.page.waitForTimeout(2500);
  }

  /** Email Optin Page -> Blank Template -> Select */
  async chooseBlankForOptin() {
    await this.backToProject();
    await this.page.getByText(OPTIN_PAGE, { exact: false }).first().click();
    const blank = this.page.getByText(/^\s*Blank Template/i).first();
    if (await this.visible(blank, 15000)) await blank.click();
    const select = this.page.getByRole('button', { name: 'Select', exact: true });
    if (await this.visible(select, 15000)) {
      await select.click();
      Logger.info('OPTIN', `✅ "${OPTIN_PAGE}": Blank Template chosen`);
    } else {
      const ok = await waitForManualStep(this.page, `Choose Blank Template for "${OPTIN_PAGE}"`,
        `Open "${OPTIN_PAGE}" in the project, pick Blank Template and press Select.`,
        async () => this.visible(this.page.getByRole('link', { name: 'Edit Page' }).first(), 500));
      if (!ok) throw new Error(`Could not choose Blank Template for "${OPTIN_PAGE}".`);
    }
    await this.page.waitForTimeout(2500);
  }

  /** Thank You Page -> "Thank You" category -> Use This Template */
  async chooseThankYouTemplate() {
    await this.backToProject();
    await this.page.getByText(THANKYOU_PAGE, { exact: false }).first().click();
    const cat = this.page.getByRole('button', { name: 'Thank You', exact: true }).first();
    if (await this.visible(cat, 15000)) { await cat.click(); await this.page.waitForTimeout(1500); }
    const use = this.page.getByRole('button', { name: 'Use This Template' });
    if (await this.visible(use.first(), 20000)) {
      const n = await use.count();
      const pick = use.nth(Math.min(3, n - 1)); // the recording used the 4th template
      await pick.scrollIntoViewIfNeeded().catch(() => {});
      await pick.click();
      Logger.info('OPTIN', `✅ "${THANKYOU_PAGE}": template chosen`);
    } else {
      const ok = await waitForManualStep(this.page, `Choose a template for "${THANKYOU_PAGE}"`,
        `Open "${THANKYOU_PAGE}", pick any Thank You template (Use This Template).`,
        async () => this.visible(this.page.getByRole('link', { name: 'Edit Page' }).first(), 500));
      if (!ok) throw new Error(`Could not choose a template for "${THANKYOU_PAGE}".`);
    }
    await this.page.waitForTimeout(3000);
  }

  // ------------------------------------------------------------------ 3. publish thank you + copy URL
  private async publish(asPattern?: RegExp) {
    await saveEditorPage(this.page); // Save first (keeps buttons / wiring / forms), then Publish
    const publish = this.page.getByRole('button', { name: 'Publish Publish the page live.' });
    await expect(publish).toBeVisible({ timeout: 20000 });
    await publish.click();
    const asBtn = asPattern ? this.page.getByRole('button', { name: asPattern }).first() : this.page.getByRole('button', { name: /^Publish as/i }).first();
    if (await this.visible(asBtn, 8000)) await asBtn.click();
    await this.page.waitForTimeout(4000);
    const close = this.page.getByRole('button', { name: 'Close', exact: true });
    if (await this.visible(close, 4000)) await close.click().catch(() => {});
  }

  /** Thank You Page: Edit -> Publish as Thank You (Opt-in) -> Actions -> Published URL (returns it). */
  async publishThankYouAndGetUrl(): Promise<string> {
    if (!(await this.builder.openPageInEditor(THANKYOU_PAGE))) throw new Error(`Could not open "${THANKYOU_PAGE}" in the editor.`);
    await this.publish(/Publish as Thank You \(Opt-?in\)/i);
    Logger.info('OPTIN', `✅ "${THANKYOU_PAGE}" published as Thank You (Opt-in)`);
    const live = await this.builder.openPublishedUrl(THANKYOU_PAGE);
    const url = live.url();
    await live.close().catch(() => {});
    Logger.info('OPTIN', `Thank You page URL: ${url}`);
    return url;
  }

  // ------------------------------------------------------------------ 4. build the opt-in page
  private async clickCanvas(text: string) {
    const el = this.frame().getByText(text, { exact: true }).first();
    if (!(await this.visible(el, 20000))) throw new Error(`"${text}" not found on the canvas.`);
    await el.click();
    await this.page.waitForTimeout(1500);
  }
  private async clickBlock(title: string) {
    const el = this.page.getByTitle(title, { exact: true }).first();
    if (!(await this.visible(el, 15000))) throw new Error(`"${title}" not found in Components.`);
    await el.click();
    await this.page.waitForTimeout(2500);
  }

  /** Section -> 2 Columns -> Headline "Email Optin" -> Form */
  async buildOptinPage(pageName: string = OPTIN_PAGE, headline: string = 'Email Optin') {
    if (!(await this.builder.openPageInEditor(pageName))) throw new Error(`Could not open "${pageName}" in the editor.`);
    const f = this.frame();
    await this.visible(f.getByText('+Add New Section').first(), 45000);
    await this.clickCanvas('+Add New Section');
    await this.clickBlock('Section');
    await this.clickCanvas('+Add Row');
    await this.clickBlock('2 Columns');

    await this.clickCanvas('+Add Element');
    await this.clickBlock('Headline');
    const heading = f.getByRole('heading').last();
    await heading.waitFor({ state: 'visible', timeout: 15000 });
    await heading.dblclick();
    await this.page.waitForTimeout(400);
    await heading.press('ControlOrMeta+a');
    await heading.pressSequentially(headline, { delay: 40 });
    await f.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
    await this.page.waitForTimeout(800);
    Logger.info('OPTIN', `"${pageName}": section + 2 columns + headline "${headline}" added`);

    await this.clickCanvas('+Add Element');
    const forms = this.page.getByRole('button', { name: 'Forms', exact: true });
    if (await this.visible(forms, 8000)) { await forms.click(); await this.page.waitForTimeout(800); }
    await this.clickBlock('Form');
    const form = this.formOnCanvas();
    if (!(await this.visible(form, 20000))) {
      const ok = await waitForManualStep(this.page, 'Add the Form element', 'In the editor: +Add Element -> Forms -> Form.', async () => (await form.count()) > 0);
      if (!ok) throw new Error('The Form element did not appear on the page.');
    }
    Logger.info('OPTIN', 'Form element added');
  }

  private formOnCanvas(): Locator {
    return this.frame().locator('[id^="flexiForm_"]').first();
  }

  /** The form settings' "Add" button (next to the Input Type dropdown). */
  private addButton(): Locator {
    return this.page.getByRole('button', { name: 'Add', exact: true }).first();
  }

  /**
   * The Input Type dropdown = the dropdown RIGHT BEFORE the "Add" button.
   * (The panel has other dropdowns too, e.g. Auto Responder; and options vanish once a field is added.)
   */
  private fieldSelect(): Locator {
    return this.addButton().locator('xpath=preceding::select[1]');
  }

  /** The form settings panel is open when its Input Type dropdown + Add button show. */
  private async formSettingsOpen(): Promise<boolean> {
    if (!(await this.addButton().isVisible().catch(() => false))) return false;
    return (await this.fieldSelect().count().catch(() => 0)) > 0 ||
      (await this.page.getByText(/^\s*Input Type\s*$/i).first().isVisible().catch(() => false));
  }

  /**
   * Is the field on the form? Yes if it shows in the panel's "Form fields" list, OR on the form on the
   * page itself (its box / tag, e.g. "Phone" + PHONE) - so a field you add by hand is noticed even
   * when the settings panel has closed.
   */
  private async fieldListed(field: string): Promise<boolean> {
    if (await this.fieldInPanelList(field)) return true;
    return this.fieldOnCanvas(field);
  }

  private async fieldOnCanvas(field: string): Promise<boolean> {
    const label = FIELD_LABEL[field] || field;
    const form = this.formOnCanvas();
    if (!(await form.count().catch(() => 0))) return false;
    const tag = form.getByText(new RegExp(`^\\s*(${field.toUpperCase()}|${label.toUpperCase().replace(/\s+/g, '_')})(_[A-Z]+)?\\s*$`)).first();
    const box = form.locator(`input[placeholder="${label}" i], input[name*="${field}" i], textarea[placeholder="${label}" i]`).first();
    return (await tag.count().catch(() => 0)) > 0 || (await box.count().catch(() => 0)) > 0;
  }

  private async fieldInPanelList(field: string): Promise<boolean> {
    const label = (FIELD_LABEL[field] || field).toUpperCase().replace(/\s+/g, '_');
    return this.page.getByText(new RegExp(`^\\s*(${field.toUpperCase()}|${label})(_[A-Z]+)?\\s*$`)).first().isVisible().catch(() => false);
  }

  /**
   * Adds one field: choose it in the dropdown next to "Add" BY ITS VISIBLE NAME, press Add,
   * and confirm it shows in "Form fields". If choosing doesn't take, uses the keyboard
   * (focus the dropdown, type the name, Enter) like a person would.
   */
  private async addField(field: string): Promise<boolean> {
    if (await this.fieldListed(field)) return true;
    const label = FIELD_LABEL[field] || field;
    const want = new RegExp(`^\\s*${label}\\s*$`, 'i');
    for (let attempt = 1; attempt <= 3; attempt++) {
      const sel = this.fieldSelect();
      if ((await sel.count().catch(() => 0)) > 0) {
        const opts = await sel.locator('option').evaluateAll((os) => os.map((o) => ({ v: (o as HTMLOptionElement).value, t: (o.textContent || '').trim() }))).catch(() => [] as { v: string; t: string }[]);
        const opt = opts.find((o) => want.test(o.t)) || opts.find((o) => o.v.toLowerCase() === field) || opts.find((o) => new RegExp(label, 'i').test(o.t));
        if (!opt) {
          Logger.warn('OPTIN', `"${label}" is not in the Input Type list (options: ${opts.map((o) => o.t).join(', ') || 'none'})`);
          return false;
        }
        const idx = opts.findIndex((o) => o.v === opt.v);
        if (attempt < 3) {
          // real key presses, like choosing by hand: focus, Home, Arrow Down to the field, Enter, leave the box
          await sel.click().catch(() => {});
          await this.page.keyboard.press('Escape').catch(() => {}); // close the native list if it opened
          await sel.focus().catch(() => {});
          await this.page.keyboard.press('Home');
          for (let k = 0; k < idx; k++) await this.page.keyboard.press('ArrowDown');
          await this.page.keyboard.press('Enter').catch(() => {});
          await sel.blur().catch(() => {});
          if ((await sel.inputValue().catch(() => '')) !== opt.v) {
            // last resort: set it directly and announce the change the way the browser does
            await sel.selectOption(opt.v).catch(() => {});
            await sel.dispatchEvent('input').catch(() => {});
            await sel.dispatchEvent('change').catch(() => {});
          }
        } else {
          await sel.focus().catch(() => {});
          await this.page.keyboard.type(label.slice(0, 4), { delay: 120 });
          await this.page.keyboard.press('Enter');
          await sel.blur().catch(() => {});
        }
        await this.page.waitForTimeout(500);
        const now = await sel.inputValue().catch(() => '');
        if (now !== opt.v) Logger.warn('OPTIN', `Input Type shows "${now}" instead of "${opt.v}" (attempt ${attempt})`);
      } else {
        // the app's own dropdown: "Select input type" -> click the name
        const trigger = this.page.getByRole('button', { name: /select input type/i }).or(this.page.getByText(/^\s*select input type\s*$/i)).first();
        if (!(await trigger.isVisible().catch(() => false))) return false;
        await trigger.click().catch(() => {});
        await this.page.waitForTimeout(500);
        await this.page.getByRole('option', { name: want }).or(this.page.getByText(want)).last().click({ timeout: 5000 }).catch(() => {});
      }
      await this.addButton().click({ timeout: 8000 }).catch(() => {});
      await this.page.waitForTimeout(1500);
      if (await this.fieldListed(field)) {
        Logger.info('OPTIN', `Form field added: ${label}`);
        return true;
      }
      Logger.warn('OPTIN', `"${label}" did not show in Form fields yet (attempt ${attempt}/3)`);
    }
    return false;
  }

  private async openFormSettings(): Promise<boolean> {
    const form = this.formOnCanvas();
    await form.click({ position: { x: 10, y: 10 } }).catch(() => {});
    await this.page.waitForTimeout(1200);
    if (await this.formSettingsOpen()) return true;
    const tries: Locator[] = [
      this.page.locator('div:nth-child(5) > svg').first(),                  // toolbar settings (recording)
      this.page.getByRole('img').filter({ hasText: /^$/ }).nth(5),           // the icon the recording used for fields
      this.page.getByText('Advanced Settings', { exact: true }).first(),
    ];
    for (const t of tries) {
      if (!(await t.isVisible().catch(() => false))) continue;
      await t.click().catch(() => {});
      await this.page.waitForTimeout(1200);
      await this.page.waitForTimeout(1500);
      if (await this.formSettingsOpen()) return true;
    }
    return false;
  }

  /** Form settings -> add Last Name, Address, Phone, City -> Form Submit Action = Thank You URL */
  async setUpForm(thankYouUrl: string) {
    if (!(await this.openFormSettings())) {
      const ok = await waitForManualStep(this.page, 'Open the form settings', 'Click the form on the page, then its settings (gear) icon so the field list shows.',
        async () => this.formSettingsOpen());
      if (!ok) throw new Error('Could not open the form settings.');
    }
    for (const field of EXTRA_FIELDS) {
      if (await this.addField(field)) continue;
      const label = FIELD_LABEL[field] || field;
      const ok = await waitForManualStep(this.page, `Add the "${label}" field to the form`,
        `In the form settings: Input Type -> "${label}" -> Add.`, async () => this.fieldListed(field));
      if (!ok) throw new Error(`Could not add the "${label}" field to the form.`);
    }

    // Form Submit Action -> "Submit" option -> website URL = the Thank You page -> Add Action
    const done = await this.setSubmitAction(thankYouUrl);
    if (!done) {
      const ok = await waitForManualStep(this.page, 'Set the Form Submit Action',
        `Form settings -> Form Submit Action -> Submit -> website URL: ${thankYouUrl} -> Add Action.`);
      if (!ok) throw new Error('Could not set the Form Submit Action.');
    }
  }

  private async setSubmitAction(thankYouUrl: string): Promise<boolean> {
    let action = this.page.getByRole('button', { name: /form submit action/i }).first();
    if (!(await this.visible(action, 5000))) {
      await this.openFormSettings();
      action = this.page.getByRole('button', { name: /form submit action/i }).first();
    }
    if (!(await this.visible(action, 8000))) return false;
    await action.scrollIntoViewIfNeeded().catch(() => {});
    await action.click();
    await this.page.waitForTimeout(1000);

    const urlBox = this.page.getByRole('textbox', { name: /enter a website url|website url|url/i }).first();
    if (!(await this.visible(urlBox, 3000))) {
      // the "Submit" option (an action type) has to be chosen first
      const submitOpt = this.page.getByRole('button', { name: /^\s*submit\s*$/i })
        .or(this.page.getByRole('option', { name: /^\s*submit\s*$/i }))
        .or(this.page.getByRole('radio', { name: /submit/i }))
        .or(this.page.getByText(/^\s*submit\s*$/i)).first();
      if (await this.visible(submitOpt, 5000)) {
        await submitOpt.click().catch(() => {});
        Logger.info('OPTIN', 'Form Submit Action: chose "Submit"');
      } else {
        // or an action-type dropdown that offers Submit / Redirect / URL
        const typeSel = this.page.locator('select:has(option)').filter({ hasText: /submit|redirect|url/i }).last();
        if (await typeSel.isVisible().catch(() => false)) {
          const opts = await typeSel.locator('option').evaluateAll((os) => os.map((o) => ({ v: (o as HTMLOptionElement).value, t: (o.textContent || '').trim() })));
          const o = opts.find((x) => /^submit$/i.test(x.t)) || opts.find((x) => /submit|redirect|url/i.test(x.t));
          if (o) await typeSel.selectOption(o.v).catch(() => {});
        }
      }
      await this.page.waitForTimeout(1000);
    }
    if (!(await this.visible(urlBox, 10000))) return false;
    await urlBox.click();
    await urlBox.fill(thankYouUrl);
    await this.page.waitForTimeout(400);
    const addAction = this.page.getByRole('button', { name: /add action|save action|^\s*save\s*$/i }).first();
    if (!(await this.visible(addAction, 6000))) return false;
    await addAction.click();
    await this.page.waitForTimeout(1500);
    Logger.info('OPTIN', `✅ Form Submit Action -> Submit -> ${thankYouUrl}`);
    return true;
  }

  /** Save + publish the opt-in page that is open in the editor (no visit). */
  async publishOptinPage(pageName: string = OPTIN_PAGE) {
    await this.publish();
    Logger.info('OPTIN', `✅ "${pageName}" published`);
  }

  /**
   * Split test: the Variant opt-in page, made with Add New Page (opt-in page type, Blank Template).
   * If the page type can't be picked automatically, you are asked to create it by hand.
   */
  async createVariantPage(name: string) {
    await this.backToProject();
    const pages = new FunnelPage(this.page, this.context);
    await pages.createSinglePage({ name, typeTextMatch: 'Opt-in Page', typeMatchPattern: /opt-?\s*in|optin|lead|squeeze/i, tabLabel: 'Opt-in', hasInlineTemplateGallery: true, blankTemplate: true }, 0);
    Logger.info('OPTIN', `✅ Variant page "${name}" created`);
  }

  async publishOptinAndOpenLive(): Promise<Page> {
    await this.publish();
    Logger.info('OPTIN', `✅ "${OPTIN_PAGE}" published`);
    const actions = this.page.getByRole('button', { name: 'Actions', exact: true }).first();
    await actions.waitFor({ state: 'visible', timeout: 20000 });
    await actions.click();
    const pub = this.page.getByRole('link', { name: 'Published URL' }).first();
    await pub.waitFor({ state: 'visible', timeout: 10000 });
    const popup = this.page.waitForEvent('popup', { timeout: 30000 });
    await pub.click();
    const live = await popup;
    await live.waitForLoadState('domcontentloaded');
    Logger.info('OPTIN', `Live opt-in page: ${live.url()}`);
    return live;
  }

  // ------------------------------------------------------------------ 5. sign up on the live page
  /** Fills the form, presses SUBMIT and waits for the Thank You page. Returns its URL. */
  async submitLiveForm(live: Page, lead: { first: string; last: string; email: string }, thankYouUrl: string): Promise<string> {
    const fill = async (names: string[], value: string, wait: number, optional = false) => {
      for (const name of names) {
        const box = live.getByRole('textbox', { name, exact: true });
        if (await this.visible(box, wait)) { await box.fill(value); return; }
        wait = 1500;
      }
      if (!optional) Logger.warn('OPTIN', `Field "${names[0]}" is not on the live form.`);
    };
    await fill(['First Name', 'Name', 'Full Name'], lead.first, 30000);
    await fill(['Email ID', 'Email', 'Email Address'], lead.email, 5000);
    await fill(['Last Name'], lead.last, 1500, true);
    await fill(['Phone', 'Phone Number'], ME.phone, 5000);
    await fill(['Address'], 'Dehradun', 5000);
    await fill(['City'], 'Doon', 5000);
    Logger.info('OPTIN', `Form filled for ${lead.email}`);

    const submit = live.getByRole('link', { name: /^\s*submit\s*$/i }).or(live.getByRole('button', { name: /^\s*submit\s*$/i })).first();
    await submit.click();
    Logger.info('OPTIN', 'Pressed SUBMIT - waiting for the Thank You page...');

    const target = (() => { try { const u = new URL(thankYouUrl); return u.host + u.pathname.replace(/\/$/, ''); } catch { return thankYouUrl; } })();
    const reached = await live.waitForURL((u) => (u.host + u.pathname.replace(/\/$/, '')) === target, { timeout: 45000 }).then(() => true).catch(() => false);
    if (!reached) {
      const savedOnly = await live.getByText(/your data successfully saved/i).isVisible().catch(() => false);
      await Helpers.captureDiagnosticScreenshot(live, 'optin-no-thank-you');
      throw new Error(savedOnly
        ? 'The form saved the lead but did not go to the Thank You page: check the Form Submit Action URL.'
        : `Did not reach the Thank You page after SUBMIT. Current page: ${live.url()}`);
    }
    await live.waitForLoadState('domcontentloaded').catch(() => {});
    await live.bringToFront().catch(() => {});
    Logger.info('OPTIN', `🎉 Thank You page reached: ${live.url()}`);
    return live.url();
  }
}
