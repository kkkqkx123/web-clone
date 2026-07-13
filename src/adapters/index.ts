/**
 * Adapter layer export (public API)
 *
 * Export all adapter implementations and interfaces for library users.
 *
 * Architecture:
 * - FetcherAdapter: Universal interface for resource fetching
 * - HttpFetcherAdapter: Default HTTP implementation
 * - PlaywrightFetcherAdapter: Browser automation implementation (optional, requires 'playwright')
 *   Use loadPlaywrightAdapter() to dynamically load it with helpful error handling
 */

// Universal interfaces
export type { FetcherAdapter, FetchOptions, FetchResult, AuthContext } from './fetcher-adapter.js';

// HTTP adapter (default)
export { HttpFetcherAdapter } from './http-fetcher-adapter.js';

/**
 * Dynamically load PlaywrightFetcherAdapter on demand.
 *
 * This avoids a hard dependency on the 'playwright' package at import time.
 * Users only need 'playwright' installed in their own project when they
 * actually want to use browser-automated snapshots.
 *
 * @returns The PlaywrightFetcherAdapter class constructor
 * @throws Error with installation instructions if 'playwright' is not installed
 *
 * @example
 * ```typescript
 * const PlaywrightAdapter = await loadPlaywrightAdapter();
 * const adapter = new PlaywrightAdapter(page, context);
 * ```
 */
export async function loadPlaywrightAdapter() {
  try {
    const module = await import('./automation/playwright/adapter.js');
    return module.PlaywrightFetcherAdapter;
  } catch (err) {
    throw new Error(
      'PlaywrightFetcherAdapter requires "playwright" package. ' +
      'Install it in your project with: npm install playwright'
    );
  }
}

/**
 * Dynamically load PuppeteerFetcherAdapter on demand.
 *
 * This avoids a hard dependency on the 'puppeteer' package at import time.
 * Users only need 'puppeteer' installed in their own project when they
 * actually want to use Puppeteer-automated snapshots.
 *
 * @returns The PuppeteerFetcherAdapter class constructor
 * @throws Error with installation instructions if 'puppeteer' is not installed
 *
 * @example
 * ```typescript
 * const PuppeteerAdapter = await loadPuppeteerAdapter();
 * const adapter = new PuppeteerAdapter(page);
 * ```
 */
export async function loadPuppeteerAdapter() {
  try {
    const module = await import('./automation/puppeteer/adapter.js');
    return module.PuppeteerFetcherAdapter;
  } catch (err) {
    throw new Error(
      'PuppeteerFetcherAdapter requires "puppeteer" package. ' +
      'Install it in your project with: npm install puppeteer'
    );
  }
}