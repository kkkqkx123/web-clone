/**
 * CLI Helper Functions for Playwright Integration
 * Handles option parsing, script loading, and state management
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BrowserContextOptions, LaunchOptions, Page, BrowserContext } from 'playwright';

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
    opts.authScript ||
    opts.loadState ||
    opts.headless !== undefined ||
    opts.proxy ||
    opts.userAgent ||
    opts.viewport
  );
}
