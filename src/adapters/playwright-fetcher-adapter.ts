/**
 * Playwright Browser Adapter
 * 
 * Resource fetching using the Playwright browser context is supported:
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
 * Reason: need to execute JavaScript, wait for dynamic content to load
 * - Sub-resources (CSS/JS/images): use context.request.fetch()
 * Reason: automatically inherits cookies, authentication information
 */

import type { Page, BrowserContext } from 'playwright';
import {
  type FetcherAdapter,
  type FetchOptions,
  type FetchResult,
  type AuthContext,
} from './fetcher-adapter.js';

/**
 * Configuration options for Playwright adapters
 */
export interface PlaywrightAdapterOptions {
  /**
   * Whether to wait for page navigation to complete
   * @default true
   */
  waitForNavigation?: boolean;

  /**
   * Whether or not to execute the page JavaScript
   * @default true
   */
  executeJs?: boolean;

  /**
   * Waiting for the load state
   * - 'load': waiting for load event
   * - 'domcontentloaded': wait for DOMContentLoaded event
   * - 'networkidle': wait for network idle (recommended)
   * @default 'networkidle'
   */
  waitForLoadState?: 'load' | 'domcontentloaded' | 'networkidle';

  /**
   * Customized Request Headers
   * These headers are included in all requests and are sent with the cookie
   * For API authentication: Authorization: Bearer token
   */
  customHeaders?: Record<string, string>;

  /**
   * Debug Mode: Save Page Screenshot
   * If set, screenshots will be saved to this path after navigation
   */
  debugScreenshot?: string;

  /**
   * Whether to validate the SSL certificate
   * @default true
   */
  validateSSL?: boolean;
}

/**
 * Playwright Browser Adapter
 *
 * Integrates Playwright browser context to implement the FetcherAdapter interface.
 * Supports advanced features such as authentication, cookie inheritance, and JavaScript execution.
 *
 * Lifecycle Management:
 * - The page is created and managed by the adapter; dispose() will close the page
 * - The browser context is managed by the caller; the adapter does not close it
 * - The browser itself is managed by the caller
 *
 * Usage example:
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
export class PlaywrightFetcherAdapter implements FetcherAdapter {
  constructor(
    private page: Page,
    private context: BrowserContext,
    private options: PlaywrightAdapterOptions = {}
  ) {}

  /**
   * Access to resources
   * 
   * Choose a different fetch strategy depending on the type of resource:
   * - Main HTML document: use fetchWithPage()
   * - Sub-resources: use fetchWithContext()
   * 
   * @param url The full URL of the resource
   * @param options Fetch options
   * @returns FetchResult with resource content, MIME type, status code, etc.
   * @throws Throws exceptions on network errors, timeouts, etc.
   */
  async fetch(url: string, options: FetchOptions): Promise<FetchResult> {
    const mergedOptions: PlaywrightAdapterOptions = {
      waitForNavigation: this.options.waitForNavigation ?? true,
      executeJs: this.options.executeJs ?? true,
      waitForLoadState: this.options.waitForLoadState ?? 'networkidle',
      validateSSL: options.validateSSL ?? true,
      ...this.options,
    };

    try {
      // Determine if the request is for a master document
      // If the current page hasn't been loaded yet or the master page is being requested, use page.goto()
      const currentUrl = (this.page as any).url || '';
      const isMainDocument =
        !currentUrl ||
        currentUrl === 'about:blank' ||
        new URL(url).origin === new URL(currentUrl).origin;

      if (isMainDocument) {
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
   * Use page.goto() to get the main HTML document.
   * 
   * Strategy:
   * 1. navigate to the URL and wait for loading to complete
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
    // Navigate to page
    const response = await this.page.goto(url, {
      timeout: options.timeout ?? 30000,
      waitUntil: pwOptions.waitForLoadState,
    });

    if (!response) {
      throw new Error(`Failed to navigate to ${url}`);
    }

    // Wait for loading to complete (if enabled)
    if (pwOptions.waitForNavigation && pwOptions.waitForLoadState) {
      await this.page.waitForLoadState(pwOptions.waitForLoadState);
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
      status: (response as any).status,
      ok: (response as any).ok,
      isHtmlLike: true,
      headers: Object.fromEntries(Object.entries(allHeaders)),
      url: (this.page as any).url || '',
    };
  }

  /**
   * Use context.request.fetch() to get the child resources
   * 
   * strategy:
   * 1. use the browser context's API for the request
   * 2. automatically inherit cookies and authentication information
   * 3. merge custom request headers
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
    const response = await (this.context.request!).fetch(url, {
      timeout: options.timeout ?? 15000,
      headers: {
        ...options.headers,
        ...pwOptions.customHeaders,
      },
    });

    // Read response body as Buffer
    const buffer = await (response as any).body();

    // Get Content-Type
    const contentType =
      (response as any).headers()['content-type'] ||
      'application/octet-stream';

    // Constructing the return value
    return {
      buffer,
      mime: contentType,
      status: (response as any).status,
      ok: (response as any).ok,
      isHtmlLike: contentType.includes('text/html'),
      headers: (response as any).headers(),
      url: (response as any).url || '',
    };
  }

  /**
   * Checking if a resource is accessible
   * 
   * Use HEAD requests for a quick check without having to download the full content.
   * 
   * @param url The full URL of the resource
   * @returns true means the resource is accessible (2xx), false means it is not accessible
   */
  async canAccess(url: string): Promise<boolean> {
    try {
      const response = await (this.context.request!).head(url, {
        timeout: 5000,
      });
      return (response as any).ok;
    } catch {
      return false;
    }
  }

  /**
   * Get Authentication Context
   * 
   * Extracts authentication information from the current browser context, including:
   * - Cookies: extracted from the browser context
   * - Custom request headers: extracted from the adapter configuration
   * - Token: lookup from localStorage
   * 
   * This information can be used for:
   * - Authentication reuse for subsequent snapshot requests
   * - Authentication status export
   * - Logging
   * 
   * @returns AuthContext contains cookies, request headers, tokens, etc.
   */
  async getAuthContext(): Promise<AuthContext> {
    // Getting Browser Cookies
    const cookies = await this.context.cookies();

    // Get storage state (including localStorage, sessionStorage)
    const storageState = await this.context.storageState();

    // Try to find the token from the first source's localStorage
    let token: string | undefined;
    if (storageState?.origins && storageState.origins.length > 0) {
      const localStorage = storageState.origins[0].localStorage;
      if (localStorage) {
        // Common Token Names
        for (const item of localStorage) {
          if (
            item.name.toLowerCase().includes('token') ||
            item.name.toLowerCase().includes('auth')
          ) {
            token = item.value;
            break;
          }
        }
      }
    }

    return {
      cookies: cookies.map((c: any) => ({
        name: c.name,
        value: c.value,
      })),
      headers: this.options.customHeaders,
      token,
    };
  }

  /**
   * Liquidation of resources
   * 
   * Closes the pages managed by this adapter.
   * Browser contexts and browser instances are managed by the caller and are not released here.
   * 
   * Description:
   * - Page object: created and managed by the adapter, dispose() closes the
   * - Browser context: managed by the caller, adapter only used
   * - Browser instances: caller-managed, adapter not involved
   */
  async dispose(): Promise<void> {
    try {
      // Close the page, but keep the browser context and browser
      // Closed by the caller when no longer needed
      if (!this.page.isClosed()) {
        await this.page.close();
      }
    } catch (err) {
      // Ignore closed page errors
      console.warn(`Error closing page in dispose: ${err}`);
    }
  }
}
