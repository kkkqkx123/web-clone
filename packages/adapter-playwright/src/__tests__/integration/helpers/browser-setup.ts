/**
 * 浏览器设置和生命周期管理
 * 用于集成测试中启动、配置和关闭浏览器
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

/**
 * 浏览器配置选项
 */
export interface BrowserSetupOptions {
  headless?: boolean;
  timeout?: number;
  slowMo?: number;
  args?: string[];
}

/**
 * 启动 Playwright 浏览器
 */
export async function setupBrowser(
  options: BrowserSetupOptions = {}
): Promise<Browser> {
  const {
    headless = true,
    timeout = 30000,
    slowMo = 0,
    args = [],
  } = options;

  return await chromium.launch({
    headless,
    timeout,
    slowMo,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      ...args,
    ],
  });
}

/**
 * 创建浏览器上下文
 */
export async function createBrowserContext(
  browser: Browser,
  options: Record<string, unknown> = {}
): Promise<BrowserContext> {
  return await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ...options,
  });
}

/**
 * 创建页面
 */
export async function createPage(context: BrowserContext): Promise<Page> {
  return await context.newPage();
}

/**
 * 关闭浏览器
 */
export async function teardownBrowser(browser: Browser): Promise<void> {
  try {
    await browser.close();
  } catch (error) {
    console.warn('Error closing browser:', error);
  }
}

/**
 * 关闭浏览器上下文
 */
export async function closeContext(context: BrowserContext): Promise<void> {
  try {
    await context.close();
  } catch (error) {
    console.warn('Error closing context:', error);
  }
}

/**
 * 关闭页面
 */
export async function closePage(page: Page): Promise<void> {
  try {
    if (!page.isClosed()) {
      await page.close();
    }
  } catch (error) {
    console.warn('Error closing page:', error);
  }
}

/**
 * 导航到 URL 并等待加载
 */
export async function navigateToUrl(
  page: Page,
  url: string,
  options: Record<string, unknown> = {}
): Promise<void> {
  await page.goto(url, {
    waitUntil: 'networkidle',
    timeout: 30000,
    ...options,
  });
}

/**
 * 等待页面加载完成
 */
export async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}

/**
 * 获取页面内容
 */
export async function getPageContent(page: Page): Promise<string> {
  return await page.content();
}

/**
 * 在页面上设置 Cookie
 */
export async function setCookies(
  context: BrowserContext,
  cookies: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
  }>,
  baseUrl: string = 'https://example.com'
): Promise<void> {
  const cookiesWithDefaults = cookies.map((cookie) => ({
    ...cookie,
    domain: cookie.domain || new URL(baseUrl).hostname,
    path: cookie.path || '/',
    url: baseUrl,
  }));

  await context.addCookies(cookiesWithDefaults);
}

/**
 * 获取浏览器上下文中的 Cookie
 */
export async function getCookies(context: BrowserContext): Promise<Array<{ name: string; value: string }>> {
  return await context.cookies();
}

/**
 * 获取存储状态（Cookie、localStorage、sessionStorage）
 */
export async function getStorageState(context: BrowserContext): Promise<{ cookies: Array<{ name: string; value: string }>; origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }> }> {
  return await context.storageState();
}

/**
 * 保存存储状态到文件
 */
export async function saveStorageState(
  context: BrowserContext,
  filePath: string
): Promise<void> {
  const state = await context.storageState();
  const fs = await import('fs/promises');
  const { dirname } = await import('path');

  const dir = dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(state, null, 2));
}

/**
 * 从文件加载存储状态
 */
export async function loadStorageState(filePath: string): Promise<Record<string, unknown>> {
  const fs = await import('fs/promises');
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * 页面性能信息
 */
export async function getPageMetrics(page: Page): Promise<Record<string, unknown>> {
  return await page.evaluate(() => ({
    url: window.location.href,
    title: document.title,
    resourceCount: document.querySelectorAll('[src], [href]').length,
    loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart,
  }));
}

/**
 * 获取页面中的所有资源 URL
 */
export async function getPageResources(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const resources: string[] = [];

    // 收集所有 href
    document.querySelectorAll('[href]').forEach((el) => {
      const href = el.getAttribute('href');
      if (href && !href.startsWith('#')) {
        resources.push(href);
      }
    });

    // 收集所有 src
    document.querySelectorAll('[src]').forEach((el) => {
      const src = el.getAttribute('src');
      if (src) {
        resources.push(src);
      }
    });

    return resources;
  });
}

/**
 * 等待特定选择器元素出现
 */
export async function waitForSelector(
  page: Page,
  selector: string,
  timeout: number = 5000
): Promise<void> {
  await page.waitForSelector(selector, { timeout });
}

/**
 * 截图保存到文件
 */
export async function takeScreenshot(
  page: Page,
  filePath: string
): Promise<void> {
  await page.screenshot({ path: filePath, fullPage: true });
}

/**
 * 清除浏览器数据（Cookie、Cache 等）
 */
export async function clearBrowserData(context: BrowserContext): Promise<void> {
  try {
    // 清除 Cookie
    await context.clearCookies();

    // 清除所有存储
    const pages = context.pages();
    for (const page of pages) {
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
    }
  } catch (error) {
    console.warn('Error clearing browser data:', error);
  }
}