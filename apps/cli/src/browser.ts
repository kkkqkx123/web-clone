/**
 * Browser lifecycle management for CLI.
 *
 * Handles launching, configuring, and cleaning up browser instances
 * for Playwright and Puppeteer adapters.
 *
 * Both adapter packages are optional dependencies — they are imported
 * dynamically at runtime only when the user passes --browser.
 */

import type { FetcherAdapter } from '@web-clone/core';

export type BrowserType = 'playwright' | 'puppeteer';

export interface BrowserAdapterHandle {
  adapter: FetcherAdapter;
  /** Close the page, context, and browser. Safe to call multiple times. */
  cleanup: () => Promise<void>;
}

export interface BrowserAdapterOptions {
  /** Navigation timeout in ms (default: 30000) */
  timeout?: number;
  /** Page load wait state (default: 'networkidle') */
  waitForLoadState?: string;
  /** Whether to validate SSL certificates (default: true) */
  validateSSL?: boolean;
  /** Custom HTTP headers for all requests */
  customHeaders?: Record<string, string>;
  /** Debug screenshot path */
  debugScreenshot?: string;
}

/**
 * Create a browser adapter by type.
 *
 * Launches a headless browser, creates a context and page,
 * then wraps them in the appropriate FetcherAdapter.
 *
 * @returns handle containing the adapter and a cleanup function
 * @throws if the browser package or its dependencies are not installed
 */
export async function createBrowserAdapter(
  type: BrowserType,
  options: BrowserAdapterOptions = {}
): Promise<BrowserAdapterHandle> {
  if (type === 'playwright') {
    return createPlaywrightAdapter(options);
  }
  return createPuppeteerAdapter(options);
}

/**
 * Verify that a browser type's dependencies are available.
 * Throws a user-friendly error message if not.
 */
export async function ensureBrowserDeps(type: BrowserType): Promise<void> {
  try {
    if (type === 'playwright') {
      // @ts-expect-error — optional dep, checked at runtime
      await import('playwright');
      await import('@web-clone/adapter-playwright');
    } else {
      // @ts-expect-error — optional dep, checked at runtime
      await import('puppeteer');
      await import('@web-clone/adapter-puppeteer');
    }
  } catch {
    const pkg = type === 'playwright' ? '@web-clone/adapter-playwright' : '@web-clone/adapter-puppeteer';
    const runtime = type === 'playwright' ? 'playwright' : 'puppeteer';
    console.error(`  Required package not installed: ${pkg}`);
    console.error(`  Install with: pnpm add ${pkg}`);
    if (type === 'playwright') {
      console.error(`  Then install browser binaries: npx playwright install chromium`);
    }
    throw new Error(
      `Browser type "${type}" requires optional dependencies. ` +
      `Run: pnpm add ${pkg}`
    );
  }
}

// ─── Playwright ─────────────────────────────────────────────

async function createPlaywrightAdapter(
  options: BrowserAdapterOptions
): Promise<BrowserAdapterHandle> {
  // Dynamic import — runtime only when --browser playwright is used.
  // @ts-expect-error — playwright is an optional dependency, not in the CLI's direct deps
  const { chromium } = await import('playwright');
  const { PlaywrightFetcherAdapter } = await import('@web-clone/adapter-playwright');

  const browser = await chromium.launch({
    headless: true,
    timeout: options.timeout ?? 30000,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  const adapter = new PlaywrightFetcherAdapter(page, context, {
    waitForLoadState: (options.waitForLoadState ?? 'networkidle') as
      | 'load'
      | 'domcontentloaded'
      | 'networkidle',
    validateSSL: options.validateSSL ?? true,
    customHeaders: options.customHeaders,
    debugScreenshot: options.debugScreenshot,
  });

  return {
    adapter,
    cleanup: async () => {
      try {
        if (!page.isClosed()) await page.close();
      } catch { /* best effort */ }
      try {
        await context.close();
      } catch { /* best effort */ }
      try {
        await browser.close();
      } catch { /* best effort */ }
    },
  };
}

// ─── Puppeteer ──────────────────────────────────────────────

async function createPuppeteerAdapter(
  options: BrowserAdapterOptions
): Promise<BrowserAdapterHandle> {
  // Dynamic import — runtime only when --browser puppeteer is used.
  // @ts-expect-error — puppeteer is an optional dependency, not in the CLI's direct deps
  const puppeteer = await import('puppeteer');
  const { PuppeteerFetcherAdapter } = await import('@web-clone/adapter-puppeteer');

  const browser = await puppeteer.launch({
    headless: true,
    timeout: options.timeout ?? 30000,
  });

  const page = await browser.newPage();

  const adapter = new PuppeteerFetcherAdapter(page, {
    waitForLoadState: (options.waitForLoadState ?? 'networkidle') as
      | 'load'
      | 'domcontentloaded'
      | 'networkidle',
    validateSSL: options.validateSSL ?? true,
    customHeaders: options.customHeaders,
    debugScreenshot: options.debugScreenshot,
  });

  return {
    adapter,
    cleanup: async () => {
      try {
        if (!page.isClosed()) await page.close();
      } catch { /* best effort */ }
      try {
        await browser.close();
      } catch { /* best effort */ }
    },
  };
}