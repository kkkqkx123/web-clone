/**
 * Puppeteer Browser Adapter
 *
 * Resource fetching using Puppeteer browser automation:
 * - Cookie auto-inheritance (via manual cookie forwarding)
 * - Authentication token management
 * - JavaScript dynamic execution
 * - Page load state control
 *
 * Usage Scenarios:
 * - Snapshots of websites that require login
 * - SPA snapshots that require JavaScript execution
 * - API integrations that require custom request headers
 *
 * Architecture:
 * - Main document (HTML): use page.goto() + page.content()
 *   Reason: need to execute JavaScript, wait for dynamic content to load
 * - Sub-resources (CSS/JS/images): use raw HTTP with cookie forwarding
 *   Reason: Puppeteer has no context.request.fetch(); cookies extracted
 *   from the page are forwarded in the HTTP request header
 *
 * Design Note — Missing context.request.fetch():
 * Unlike Playwright, Puppeteer does not have a built-in API to make
 * standalone HTTP requests through the browser context. Instead, this
 * adapter extracts cookies from the page and forwards them via normal
 * HTTP requests. This achieves the same result: authenticated sub-resource
 * fetching with proper cookie inheritance.
 *
 * Example:
 * ```typescript
 * import puppeteer from 'puppeteer';
 * import { snapshot } from 'web-clone';
 * import { PuppeteerFetcherAdapter } from 'web-clone/adapters/automation/puppeteer';
 *
 * const browser = await puppeteer.launch();
 * const page = await browser.newPage();
 *
 * // Login flow (user's code)
 * await page.goto('https://example.com/login');
 * await page.type('input[name="email"]', 'user@example.com');
 * await page.type('input[name="password"]', 'password');
 * await page.click('button[type="submit"]');
 * await page.waitForNavigation();
 *
 * // Create adapter
 * const adapter = new PuppeteerFetcherAdapter(page, {
 *   waitForLoadState: 'networkidle',
 *   customHeaders: { 'Authorization': 'Bearer token' }
 * });
 *
 * // Snapshot
 * const result = await snapshot(options, adapter);
 *
 * // Cleanup (user's code)
 * await adapter.dispose();
 * await browser.close();
 * ```
 */

/**
 * Minimal type declarations for Puppeteer.
 *
 * Puppeteer is an optional dependency — users install it in their own project.
 * These inline types provide type safety without requiring puppeteer to be
 * installed in web-clone's node_modules. Both `puppeteer` and `puppeteer-core`
 * satisfy these types at runtime.
 */

/** Minimal representation of a Puppeteer HTTP response */
interface PuppeteerResponse {
  status(): number;
  ok(): boolean;
  headers(): Record<string, string>;
  url(): string;
}

/** Minimal representation of a Puppeteer cookie */
interface PuppeteerCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
}

/** Minimal representation of a Puppeteer Page (only methods used by this adapter) */
interface PuppeteerPage {
  goto(url: string, options?: {
    timeout?: number;
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle2';
  }): Promise<PuppeteerResponse | null>;
  content(): Promise<string>;
  screenshot(options?: { path?: string }): Promise<Buffer | string>;
  close(): Promise<void>;
  isClosed(): boolean;
  url(): string;
  cookies(url?: string): Promise<PuppeteerCookie[]>;
  evaluate<T>(pageFunction: ((...args: any[]) => T) | string, ...args: any[]): Promise<T>;
  waitForFunction(
    pageFunction: ((...args: any[]) => boolean) | string,
    options?: { timeout?: number; polling?: number | 'raf' | 'mutation' },
    ...args: unknown[]
  ): Promise<unknown>;
  waitForTimeout(timeout: number): Promise<void>;
}

import {
  type FetcherAdapter,
  type FetchOptions,
  type FetchResult,
  type AuthContext,
} from '@web-clone/core';
import type { PuppeteerAdapterOptions, PuppeteerWaitUntil } from './options.js';
import { waitForSpaHydration, type SpaPageLike } from '@web-clone/adapter-common';

/**
 * Map our simplified waitUntil to Puppeteer's native waitUntil values.
 * 'networkidle' maps to 'networkidle2' which is the closest equivalent
 * to Playwright's 'networkidle' (waits for network to be mostly idle).
 */
function mapWaitUntil(waitUntil: PuppeteerWaitUntil): 'load' | 'domcontentloaded' | 'networkidle2' {
  if (waitUntil === 'networkidle') return 'networkidle2';
  return waitUntil;
}

/**
 * Puppeteer Fetcher Adapter
 *
 * Implements FetcherAdapter using Puppeteer's browser automation capabilities.
 * For sub-resource fetching, uses raw HTTP with cookie forwarding since
 * Puppeteer lacks a standalone context.request.fetch() API.
 */
export class PuppeteerFetcherAdapter implements FetcherAdapter {
  constructor(
    private page: PuppeteerPage,
    private options: PuppeteerAdapterOptions = {}
  ) {}

  /**
   * Fetch a resource using appropriate strategy based on document type
   *
   * Merge priority: per-call options > constructor options > defaults
   *
   * @param url The full URL of the resource
   * @param options Fetch options
   * @returns FetchResult with resource content, MIME type, status code, etc.
   * @throws Throws exceptions on network errors, timeouts, etc.
   */
  async fetch(url: string, options: FetchOptions): Promise<FetchResult> {
    const mergedOptions: PuppeteerAdapterOptions = {
      // Defaults
      executeJs: true,
      waitForLoadState: 'networkidle',
      validateSSL: true,
      // Constructor options (medium priority)
      ...this.options,
      // Per-call options (highest priority) — only override when explicitly set
      ...(options.validateSSL !== undefined ? { validateSSL: options.validateSSL } : {}),
    };

    try {
      // Determine fetch strategy by the caller's intent, not URL heuristic
      if (options.isMainDocument) {
        return await this.fetchWithPage(url, options, mergedOptions);
      } else {
        return await this.fetchWithHttp(url, options, mergedOptions);
      }
    } catch (error) {
      throw new Error(
        `Puppeteer fetch failed for ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error }
      );
    }
  }

  /**
   * Use page.goto() to get the main HTML document
   *
   * Strategy:
   * 1. Navigate to the URL and wait for loading to complete
   * 2. Wait for the specified loading state
   * 3. Run SPA hydration detection (shared utility)
   * 4. Optional: perform debug screenshot
   * 5. Get the final page content
   *
   * Feature:
   * - Execute page JavaScript (if enabled)
   * - Automatically handles redirects
   * - Maintains cookies and session state
   * - Returns rendered HTML
   *
   * @private
   */
  private async fetchWithPage(
    url: string,
    options: FetchOptions,
    poOptions: PuppeteerAdapterOptions
  ): Promise<FetchResult> {
    // When JS execution is disabled, fetch raw HTML via HTTP with cookies
    if (poOptions.executeJs === false) {
      return this.fetchWithHttp(url, options, poOptions);
    }

    // Navigate to page (waits for load state via waitUntil)
    const response = await this.page.goto(url, {
      timeout: options.timeout ?? 30000,
      waitUntil: mapWaitUntil(poOptions.waitForLoadState ?? 'networkidle'),
    });

    if (!response) {
      throw new Error(`Failed to navigate to ${url}`);
    }

    // Additional wait for SPA frameworks (Vue/React/Angular) to initialize
    // This ensures event handlers and state management are properly set up
    if (poOptions.waitForLoadState === 'networkidle' || poOptions.waitForLoadState === 'load') {
      await waitForSpaHydration(this.page as unknown as SpaPageLike, {
        timeout: options.timeout ?? 30000,
        logPrefix: '[Puppeteer Adapter]',
      });
    }

    // Optional: debug screenshot
    if (poOptions.debugScreenshot) {
      try {
        await this.page.screenshot({
          path: poOptions.debugScreenshot,
        });
      } catch (err) {
        console.warn(`Failed to save debug screenshot: ${err}`);
      }
    }

    // Get the final HTML content (rendered)
    const html = await this.page.content();
    const buffer = Buffer.from(html, 'utf-8');

    // Constructing the return value
    const headers = response.headers();
    return {
      buffer,
      mime: 'text/html',
      status: response.status(),
      ok: response.ok(),
      isHtmlLike: true,
      headers: Object.fromEntries(Object.entries(headers || {})),
      url: this.page.url() || '',
    };
  }

  /**
   * Use raw HTTP fetch with cookie forwarding to get sub-resources
   *
   * Strategy:
   * 1. Extract cookies from the current page (for the target URL domain)
   * 2. Build a Cookie header from extracted cookies
   * 3. Make HTTP request with cookies + custom headers
   * 4. Read response body, headers, and status
   *
   * Why raw HTTP instead of page.evaluate(fetch):
   * - No CORS restrictions
   * - Works for binary data (fonts, images)
   * - Faster (no browser JS execution overhead)
   *
   * @private
   */
  private async fetchWithHttp(
    url: string,
    options: FetchOptions,
    poOptions: PuppeteerAdapterOptions
  ): Promise<FetchResult> {
    // Extract cookies from the browser page for the target URL
    const cookies = await this.page.cookies(url);
    const cookieHeader = cookies.map((c: PuppeteerCookie) => `${c.name}=${c.value}`).join('; ');

    // Build abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout ?? 15000);

    // Temporarily disable SSL validation if configured
    const origRejectUnauthorized: string | undefined =
      poOptions.validateSSL === false
        ? process.env.NODE_TLS_REJECT_UNAUTHORIZED
        : undefined;
    if (poOptions.validateSSL === false) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    try {
      const fetchOptions: RequestInit = {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
          ...options.headers,
          ...poOptions.customHeaders,
        },
      };

      const response = await fetch(url, fetchOptions);
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || 'application/octet-stream';

      // Convert Headers to plain object (forEach is more widely supported than entries())
      const headerRecord: Record<string, string> = {};
      response.headers.forEach((value: string, key: string) => {
        headerRecord[key] = value;
      });

      return {
        buffer,
        mime: contentType,
        status: response.status,
        ok: response.ok,
        isHtmlLike: contentType.includes('text/html'),
        headers: headerRecord,
        url: response.url,
      };
    } finally {
      clearTimeout(timeoutId);
      // Restore SSL validation setting
      if (poOptions.validateSSL === false) {
        if (origRejectUnauthorized !== undefined) {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = origRejectUnauthorized;
        } else {
          delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        }
      }
    }
  }

  /**
   * Check if a resource is accessible
   *
   * Uses HEAD requests for a quick check without downloading the full content.
   * Cookies from the current page are forwarded to maintain auth state.
   *
   * @param url The full URL of the resource
   * @returns true means the resource is accessible (2xx), false means it is not
   */
  async canAccess(url: string): Promise<boolean> {
    try {
      const cookies = await this.page.cookies(url);
      const cookieHeader = cookies.map((c: PuppeteerCookie) => `${c.name}=${c.value}`).join('; ');

      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get Authentication Context
   *
   * Extracts authentication information from the current page:
   * - Cookies: extracted from the browser page
   * - Custom request headers: extracted from the adapter configuration
   * - Token: lookup from localStorage
   *
   * Note: Unlike Playwright, Puppeteer doesn't have context-level cookie
   * management. Cookies are page-level and may vary across pages in the
   * same browser context. This method returns cookies from the current page.
   *
   * @returns AuthContext contains cookies, request headers, tokens, etc.
   */
  async getAuthContext(): Promise<AuthContext> {
    // Get cookies from the current page
    const cookies = await this.page.cookies();

    // Try to extract auth token from localStorage (current origin only)
    let token: string | undefined;
    try {
      const storage: Array<{ name: string; value: string }> =
        await this.page.evaluate(() => {
          const items: Array<{ name: string; value: string }> = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
              items.push({ name: key, value: localStorage.getItem(key) || '' });
            }
          }
          return items;
        });

      for (const item of storage) {
        if (
          item.name.toLowerCase().includes('token') ||
          item.name.toLowerCase().includes('auth')
        ) {
          token = item.value;
          break;
        }
      }
    } catch {
      // localStorage might not be available (e.g., local file:// origins); skip
    }

    return {
      cookies: cookies.map((c: { name: string; value: string }) => ({
        name: c.name,
        value: c.value,
      })),
      headers: this.options.customHeaders,
      token,
    };
  }

  /**
   * Clean up adapter resources
   */
  async dispose(): Promise<void> {
    try {
      if (!this.page.isClosed()) {
        await this.page.close();
      }
    } catch (err) {
      console.warn(`Error closing page in dispose: ${err}`);
    }
  }
}

/**
 * Options for creating a Puppeteer adapter with browser lifecycle.
 */
export interface CreatePuppeteerAdapterOptions extends PuppeteerAdapterOptions {
  /** Navigation / browser launch timeout in ms (default: 30000) */
  timeout?: number;
}

/**
 * Handle returned by createPuppeteerAdapter, containing the adapter
 * and a cleanup function that closes the browser.
 */
export interface PuppeteerAdapterHandle {
  adapter: PuppeteerFetcherAdapter;
  /** Close the page and browser. Safe to call multiple times. */
  cleanup: () => Promise<void>;
}

/**
 * Create a Puppeteer adapter with full browser lifecycle management.
 *
 * Launches a headless Chromium browser, creates a page, then wraps it
 * in a PuppeteerFetcherAdapter.
 *
 * Use this when you need a self-contained adapter that manages its own
 * browser instance. The returned `cleanup` function closes everything.
 *
 * @example
 * ```typescript
 * const { adapter, cleanup } = await createPuppeteerAdapter({ timeout: 15000 });
 * const result = await snapshot(options, adapter);
 * await cleanup();
 * ```
 */
export async function createPuppeteerAdapter(
  options: CreatePuppeteerAdapterOptions = {}
): Promise<PuppeteerAdapterHandle> {
  const puppeteer = await import('puppeteer');

  const browser = await puppeteer.launch({
    headless: true,
    timeout: options.timeout ?? 30000,
  });

  const page = await browser.newPage() as unknown as PuppeteerPage;

  const adapter = new PuppeteerFetcherAdapter(page, {
    waitForLoadState: options.waitForLoadState as 'load' | 'domcontentloaded' | 'networkidle' | undefined,
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
