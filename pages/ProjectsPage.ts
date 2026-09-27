import { Page, expect } from '@playwright/test';
import { Logger } from '../utils/logger';
import { PopupHandler } from '../utils/popup-handler';
import { TestContext } from '../utils/test-context';
import { Helpers } from '../utils/helpers';

export class ProjectsPage {
  constructor(private page: Page, private context: TestContext) {}

  public async openProjects(): Promise<void> {
    this.context.recordStep('Open Projects');
    Logger.info('PROJECT', 'Navigating to Projects...');
    await PopupHandler.dismissKnownPopups(this.page);

    const projectsLink = this.page.getByRole('link', { name: 'Projects' });
    if (await projectsLink.isVisible({ timeout: 4000 }).catch(() => false)) {
      await projectsLink.click();
    } else {
      await this.page.goto('https://app.flexifunnels.com/projects', { waitUntil: 'domcontentloaded' });
    }

    await this.page.waitForLoadState('domcontentloaded');
    await PopupHandler.killRightHandPopups(this.page);
    await this.page.waitForTimeout(2000); // Allow project list hydration
  }

  public async createProject(projectName: string): Promise<string> {
    this.context.recordStep('Create Custom Funnel Project');
    this.context.projectName = projectName;
    Logger.info('PROJECT', `Creating project: "${projectName}"`);

    await PopupHandler.dismissKnownPopups(this.page);

    // 1. Click "Create Project" button on dashboard
    const createProjectBtn = this.page.getByRole('button', { name: 'Create Project' })
      .or(this.page.locator('button:has-text("Create Project")')).first();
    await expect(createProjectBtn).toBeVisible({ timeout: 30000 });
    await createProjectBtn.click();

    // A FreshChat notification tends to pop up right after this click — clear it
    // before it blocks the modal.
    await PopupHandler.closeFreshChatNotifications(this.page);
    // The project-type modal fetches/renders after the click above — wait for
    // it to actually settle instead of assuming it's ready the instant the
    // click resolves (this was firing the next click before the modal existed).
    await Helpers.waitForAppReady(this.page);

    // 2. Select "Custom Funnel" project type (confirmed accessible name)
    const customFunnelBtn = this.page.getByRole('button', { name: 'Custom Funnel A personalized' })
      .or(this.page.getByRole('button', { name: /^Custom Funnel/i })).first();
    await expect(customFunnelBtn).toBeVisible({ timeout: 15000 });
    await customFunnelBtn.click();
    Logger.info('PROJECT', 'Selected Custom Funnel project type');
    await Helpers.waitForAppReady(this.page);

    // 3. Fill Project Name (confirmed: textbox with accessible name "Project Name")
    const nameInput = this.page.getByRole('textbox', { name: 'Project Name' })
      .or(this.page.getByPlaceholder('Enter project name')).first();
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.click();
    await nameInput.fill(projectName);
    Logger.info('PROJECT', `Typed project name: "${projectName}"`);

    // 4. Click the "Create" button (exact match — avoids matching "Create Project")
    const submitBtn = this.page.getByRole('button', { name: 'Create', exact: true });
    await expect(submitBtn).toBeVisible({ timeout: 10000 });
    await expect(submitBtn).toBeEnabled({ timeout: 8000 });
    await submitBtn.click();
    Logger.info('PROJECT', 'Clicked Create button, waiting for project redirect...');

    // 5. Wait for redirect into project details
    await this.page.waitForURL((url) => url.pathname.includes('/projects/') && !url.pathname.endsWith('/projects'), {
      timeout: 35000,
    }).catch(() => this.page.waitForTimeout(5000));

    this.context.projectUrl = this.page.url();
    Logger.info('PROJECT', `✅ Project successfully created -> URL: ${this.context.projectUrl}`);
    await PopupHandler.dismissKnownPopups(this.page);
    return this.context.projectUrl;
  }
}