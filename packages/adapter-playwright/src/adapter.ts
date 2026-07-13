/**
 * Playwright Browser Adapter
 *
 * Resource fetching using the Playwright browser context:
 * - Cookie auto-inheritance
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
 * - Sub-resources (CSS/JS/images): use context.request.fetch()
 *   Reason: automatically inherits cookies, authentication information
 *
 * Example:
 * ```typescript
 * const browser = await chromium.launch();
 * const context = await browser.newContext();
 * const page = await context.newPage();
 *
 * // Login flow
 * await page.goto('https://example.com/login');
 * await page.fill('input[name="email"]', 'user@example.com');
 * await page.fill('input[name="password"]', 'password');
 * await page.click('button[type="submit"]');
 * await page.waitForNavigation();
 *
 * // Create adapter
 * const adapter = new PlaywrightFetcherAdapter(page, context, {
 *   waitForLoadState: 'networkidle',
 *   customHeaders: { 'Authorization': 'Bearer token' }
 * });
 *
 * // Snapshot
 * const result = await snapshot(options, adapter);
 *
 * // Cleanup
 * await adapter.dispose();
 * await context.close();
 * await browser.close();
 * ```
 */

import type { Page, BrowserContext, APIResponse } from 'playwright';
import {
  type FetcherAdapter,
  type FetchOptions,
  type FetchResult,
  type AuthContext,
} from '@web-clone/core';
import type { PlaywrightAdapterOptions } from './options.js';
import { waitForSpaHydration, type SpaPageLike } from '@web-clone/adapter-common';

/**
 * Playwright Fetcher Adapter
 *
 * Implements FetcherAdapter using Playwright's browser automation capabilities.
 */
export class PlaywrightFetcherAdapter implements FetcherAdapter {
  constructor(
    private page: Page,
    private context: BrowserContext,
    private options: PlaywrightAdapterOptions = {}
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
    const mergedOptions: PlaywrightAdapterOptions = {
      // Defaults
      waitForNavigation: true,
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
        return await this.fetchWithContext(url, options, mergedOptions);
      }
    } catch (error) {
      throw new Error(
        `Playwright fetch failed for ${url}: ${
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
   * 3. Optional: perform debug screenshot
   * 4. Get the final page content
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
    pwOptions: PlaywrightAdapterOptions
  ): Promise<FetchResult> {
    // When JS execution is disabled, fetch raw HTML via context.request
    if (pwOptions.executeJs === false) {
      const response: APIResponse = await this.context.request.fetch(url, {
        timeout: options.timeout ?? 30000,
        headers: {
          ...options.headers,
          ...pwOptions.customHeaders,
        },
      });

      const buffer = await response.body();
      const contentType =
        response.headers()['content-type'] ||
        'text/html';

      return {
        buffer,
        mime: contentType,
        status: response.status(),
        ok: response.ok(),
        isHtmlLike: contentType.includes('text/html'),
        headers: response.headers(),
        url: response.url() || '',
      };
    }

    // Navigate to page (waits for load state via waitUntil)
    const response = await this.page.goto(url, {
      timeout: options.timeout ?? 30000,
      waitUntil: pwOptions.waitForLoadState,
    });

    if (!response) {
      throw new Error(`Failed to navigate to ${url}`);
    }

    // Additional wait for SPA frameworks (Vue/React/Angular) to initialize
    // Uses the shared SPA hydration detector (framework-agnostic, works for
    // both Playwright and Puppeteer adapters).
    if (pwOptions.waitForLoadState === 'networkidle' || pwOptions.waitForLoadState === 'load') {
      await waitForSpaHydration(this.page as unknown as SpaPageLike, {
        timeout: options.timeout ?? 30000,
        logPrefix: '[Playwright Adapter]',
      });
    }

    // Optional: debug screenshot
    if (pwOptions.debugScreenshot) {
      try {
        await this.page.screenshot({
          path: pwOptions.debugScreenshot,
        });
      } catch (err) {
        console.warn(`Failed to save debug screenshot: ${err}`);
      }
    }

    // Get the final HTML content (rendered)
    const html = await this.page.content();
    const buffer = Buffer.from(html, 'utf-8');

    // Constructing the return value
    const allHeaders = await response.allHeaders();
    return {
      buffer,
      mime: 'text/html',
      status: response.status(),
      ok: response.ok(),
      isHtmlLike: true,
      headers: Object.fromEntries(Object.entries(allHeaders)),
      url: this.page.url() || '',
    };
  }

  /**
   * Use context.request.fetch() to get child resources
   *
   * Strategy:
   * 1. Use the browser context's API for the request
   * 2. Automatically inherit cookies and authentication information
   * 3. Merge custom request headers
   * 4. Read the body of the response
   *
   * Features:
   * - Inherit browser cookies automatically
   * - Supports customized request headers
   * - Does not execute JavaScript (faster)
   * - Direct access to the original response
   *
   * @private
   */
  private async fetchWithContext(
    url: string,
    options: FetchOptions,
    pwOptions: PlaywrightAdapterOptions
  ): Promise<FetchResult> {
    // Requests are made using the browser context, automatically inheriting cookies
    const response: APIResponse = await this.context.request.fetch(url, {
      timeout: options.timeout ?? 15000,
      headers: {
        ...options.headers,
        ...pwOptions.customHeaders,
      },
    });

    // Read response body as Buffer
    const buffer = await response.body();

    // Get Content-Type
    const contentType =
      response.headers()['content-type'] ||
      'application/octet-stream';

    // Constructing the return value
    return {
      buffer,
      mime: contentType,
      status: response.status(),
      ok: response.ok(),
      isHtmlLike: contentType.includes('text/html'),
      headers: response.headers(),
      url: response.url() || '',
    };
  }

  /**
   * Check if a resource is accessible
   *
   * Uses HEAD requests for a quick check without downloading the full content.
   *
   * @param url The full URL of the resource
   * @returns true means the resource is accessible (2xx), false means it is not
   */
  async canAccess(url: string): Promise<boolean> {
    try {
      const response = await this.context.request.head(url, {
        timeout: 5000,
      });
      return response.ok();
    } catch {
      return false;
    }
  }

  /**
   * Get Authentication Context
   *
   * Extracts authentication information from the current browser context:
   * - Cookies: extracted from the browser context
   * - Custom request headers: extracted from the adapter configuration
   * - Token: lookup from localStorage
   *
   * Usage:
   * ```typescript
   * const auth = await adapter.getAuthContext();
   * // Save or export authentication state
   * saveAuthState(auth);
   * ```
   *
   * @returns AuthContext contains cookies, request headers, tokens, etc.
   */
  async getAuthContext(): Promise<AuthContext> {
    // Getting Browser Cookies
    const cookies = await this.context.cookies();

    // Get storage state (including localStorage, sessionStorage)
    const storageState = await this.context.storageState();

    // Try to find the token from localStorage across all origins
    let token: string | undefined;
    if (storageState?.origins) {
      for (const origin of storageState.origins) {
        if (origin.localStorage) {
          for (const item of origin.localStorage) {
            if (
              item.name.toLowerCase().includes('token') ||
              item.name.toLowerCase().includes('auth')
            ) {
              token = item.value;
              break;
            }
          }
          if (token) break;
        }
      }
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
