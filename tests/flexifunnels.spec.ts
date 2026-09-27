import { test } from '@playwright/test';
import { TEST_CREDENTIALS } from '../config/test-credentials';
import { Logger } from '../utils/logger';
import { TestContext } from '../utils/test-context';
import { generateProjectName, generateCustomerEmail } from '../utils/test-data';
import { LoginPage } from '../pages/LoginPage';
import { ProjectsPage } from '../pages/ProjectsPage';
import { FunnelPage } from '../pages/FunnelPage';

test.describe('FlexiFunnels Working Pages Baseline', () => {
  test('verify project creation and 11 pages flow in one go', async ({ page }) => {
    const context = new TestContext('regular');
    const projectName = generateProjectName('QACustomProj');
    context.projectName = projectName;
    context.customerEmail = generateCustomerEmail();

    Logger.info('START', `========================================================`);
    Logger.info('START', `Starting Working Pages Flow on Project: ${projectName}`);
    Logger.info('START', `========================================================`);

    const loginPage = new LoginPage(page, context);
    const projectsPage = new ProjectsPage(page, context);
    const funnelPage = new FunnelPage(page, context);

    // 1. Authentication
    await loginPage.openLogin();
    await loginPage.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);

    // 2. Custom Funnel Project Creation
    await projectsPage.openProjects();
    await projectsPage.createProject(projectName);

    // 3. Working Pages Flow (Sequential 11 Pages with random templates)
    await funnelPage.createAllFunnelPages();

    Logger.info('FINISH', '🎉 Verified Working Pages Flow completed with 100% success!');
  });
});