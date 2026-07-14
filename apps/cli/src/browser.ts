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
  waitForLoadState?: 'load' | 'domcontentloaded' | 'networkidle';
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
    const { createPlaywrightAdapter } = await import('@web-clone/adapter-playwright');
    return createPlaywrightAdapter(options);
  }
  const { createPuppeteerAdapter } = await import('@web-clone/adapter-puppeteer');
  return createPuppeteerAdapter(options);
}

/**
 * Verify that a browser type's dependencies are available.
 * Throws a user-friendly error message if not.
 */
export async function ensureBrowserDeps(type: BrowserType): Promise<void> {
  try {
    if (type === 'playwright') {
      await import('@web-clone/adapter-playwright');
    } else {
      await import('@web-clone/adapter-puppeteer');
    }
  } catch {
    const pkg = type === 'playwright' ? '@web-clone/adapter-playwright' : '@web-clone/adapter-puppeteer';
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