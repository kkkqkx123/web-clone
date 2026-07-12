/**
 * CLI Helper Functions for Playwright Integration
 * Handles option parsing, script loading, and state management
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  BrowserContextOptions,
  LaunchOptions,
  Page,
  BrowserContext,
} from 'playwright';
import type { PlaywrightFetcherAdapter } from '../adapters/playwright-fetcher-adapter.js';

/**
 * Parse CLI options into Playwright launch configuration
 */
export function parseLaunchOptions(opts: Record<string, any>): LaunchOptions {
  return {
    headless: opts.headless !== 'false',
    proxy: opts.proxy ? { server: opts.proxy } : undefined,
  };
}

/**
 * Parse CLI options into Playwright context configuration
 */
export function parseContextOptions(opts: Record<string, any>): BrowserContextOptions {
  return {
    userAgent: opts.userAgent,
    viewport: opts.viewport,
  };
}

/**
 * Parse viewport string "1920x1080" → {width: 1920, height: 1080}
 */
export function parseViewport(
  viewportStr: string
): { width: number; height: number } {
  const [w, h] = viewportStr.split('x').map(Number);
  if (!w || !h || w <= 0 || h <= 0) {
    throw new Error('Invalid viewport format, expected "widthxheight" (e.g., "1920x1080")');
  }
  return { width: w, height: h };
}

/**
 * Load and parse authentication script from file
 * The script receives 'page' and 'context' as parameters
 */
export async function loadAuthScript(
  scriptPath: string,
  timeoutMs: number
): Promise<(page: Page, context: BrowserContext) => Promise<void>> {
  const content = await readFile(resolve(scriptPath), 'utf-8');

  return async (page: Page, context: BrowserContext) => {
    // Wrap execution with timeout
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => {
        reject(new Error(`Authentication timeout after ${timeoutMs}ms`));
      }, timeoutMs)
    );

    // Execute script in isolated scope
    const execution = (async () => {
      // Create function with page and context parameters
      // eslint-disable-next-line no-new-func
      const fn = new Function('page', 'context', content);
      return fn(page, context);
    })();

    await Promise.race([execution, timeout]);
  };
}

/**
 * Determine whether Playwright should be used based on CLI options
 */
export function shouldUsePlaywright(opts: Record<string, any>): boolean {
  return (
    opts.usePlaywright === true ||
    Boolean(opts.authScript) ||
    Boolean(opts.loadState) ||
    Boolean(opts.proxy) ||
    Boolean(opts.userAgent) ||
    Boolean(opts.viewport)
  );
}

/**
 * Save authentication state from adapter to file
 *
 * Saves cookies and localStorage to a JSON file for later reuse.
 * Prints summary of saved state to console.
 *
 * @param statePath - File path to save state to
 * @param adapter - PlaywrightFetcherAdapter instance with state to save
 */
export async function saveAuthState(
  statePath: string,
  adapter: PlaywrightFetcherAdapter
): Promise<void> {
  try {
    await adapter.saveState(statePath);
    console.log(`✓ State saved to: ${statePath}`);

    // Print state summary
    const summary = await adapter.getStateSummary();
    console.log(`  Cookies: ${summary.cookieCount}`);
    console.log(`  LocalStorage items: ${summary.localStorageCount}`);
    if (summary.origins.length > 0) {
      console.log(`  Origins: ${summary.origins.join(', ')}`);
    }
  } catch (error) {
    console.warn(`✗ Failed to save state: ${error}`);
  }
}

/**
 * Load authentication state from file into adapter
 *
 * Restores cookies and localStorage from a previously saved state file.
 *
 * @param statePath - File path to load state from
 * @param adapter - PlaywrightFetcherAdapter instance to load state into
 * @throws Error if state file cannot be loaded
 */
export async function loadAuthState(
  statePath: string,
  adapter: PlaywrightFetcherAdapter
): Promise<void> {
  try {
    await adapter.loadState(statePath);
    console.log(`✓ State loaded from: ${statePath}`);

    // Print loaded state summary
    const summary = await adapter.getStateSummary();
    console.log(`  Cookies: ${summary.cookieCount}`);
    console.log(`  LocalStorage items: ${summary.localStorageCount}`);
  } catch (error) {
    console.warn(`✗ Failed to load state: ${error}`);
    throw error; // Fail if loading state, it's critical
  }
}
