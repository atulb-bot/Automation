import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';
import { TestContext } from './test-context';
import { generateAlphaNumericId, generateProjectName } from './test-data';
import { ProjectsPage } from '../pages/ProjectsPage';
import { ProductsPage, ProductConfig } from '../pages/ProductsPage';
import { FunnelPage } from '../pages/FunnelPage';
import { FunnelBuilderPage } from '../pages/FunnelBuilderPage';

export type FunnelType = 'oneclick' | 'regular';

export interface BuiltFunnel {
  type: FunnelType;
  projectName: string;
  funnelName: string;
  feUrl: string;
  builtAt: string;
}

const stateFile = (type: FunnelType) => path.resolve(process.cwd(), 'state', `funnel-${type}.json`);

export function saveBuiltFunnel(f: BuiltFunnel) {
  fs.mkdirSync(path.dirname(stateFile(f.type)), { recursive: true });
  fs.writeFileSync(stateFile(f.type), JSON.stringify(f, null, 2));
}

/** The last funnel built for this type (lets you re-run one buyer path without rebuilding). */
export function loadBuiltFunnel(type: FunnelType): BuiltFunnel | null {
  try {
    return JSON.parse(fs.readFileSync(stateFile(type), 'utf8')) as BuiltFunnel;
  } catch {
    return null;
  }
}

/**
 * Project -> blank sales pages + checkout/thank-you -> FE, OTO1, DS1, OTO2, DS2 products
 * -> funnel tree (One-Click or Regular, ending OTO2 -> Say no to -> DS2)
 * -> every sales page wired (CTA -> own product; No thanks -> funnel, not on FE) -> publish
 * -> FE Published URL. Assumes the page is already logged in.
 */
export async function buildFunnelProject(page: Page, context: TestContext, type: FunnelType): Promise<BuiltFunnel> {
  const base = generateAlphaNumericId(6);
  const label = type === 'oneclick' ? 'OneClick' : 'Regular';
  const projectName = generateProjectName('QA') + ` ${base} ${label} Project`;
  const funnelName = `QA ${base} ${label} Funnel`;

  const projects = new ProjectsPage(page, context);
  const productsPage = new ProductsPage(page, context);
  const funnelPage = new FunnelPage(page, context);
  const builder = new FunnelBuilderPage(page, context);

  Logger.info('BUILD', `${label} funnel | Project "${projectName}" | Funnel "${funnelName}"`);
  await projects.openProjects();
  await projects.createProject(projectName);
  await funnelPage.createAllFunnelPages();

  const products: ProductConfig[] = (['FE', 'OTO1', 'DS1', 'OTO2', 'DS2'] as const).map((key) => ({
    key,
    productName: `QA ${base} ${key}`,
    salesPageName: `${key} Sales`,
    checkoutPageName: `${key} Checkout`,
    price: '100',
  }));
  await productsPage.openProducts();
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    Logger.info('BUILD', `[${i + 1}/${products.length}] Product "${p.productName}"`);
    await productsPage.createProduct(p.productName, p.price);
    await productsPage.connectProductPages(p.productName, projectName, p.salesPageName, p.checkoutPageName);
    await productsPage.openProducts();
  }

  await builder.createFunnel(funnelName, type === 'oneclick', products);
  await builder.wireAllSalesPages(products, funnelName);
  await builder.publishAllCheckoutPages(products);
  await builder.publishThankYouPage();

  const live = await builder.openPublishedUrl('FE Sales');
  const feUrl = live.url();
  await live.close().catch(() => {});

  const built: BuiltFunnel = { type, projectName, funnelName, feUrl, builtAt: new Date().toISOString() };
  saveBuiltFunnel(built);
  Logger.info('BUILD', `✅ ${label} funnel ready. FE live URL: ${feUrl}`);
  return built;
}
