/**
 * Puppeteer-Specific Adapter Options
 *
 * These options control how PuppeteerFetcherAdapter fetches resources
 * using Puppeteer's browser API. They are Puppeteer-specific and
 * do not apply to other automation tools.
 *
 * Note: Lifecycle management (creating/closing browser, page)
 * is the responsibility of the user's code, not the adapter.
 */

/**
 * Puppeteer-specific page load wait states.
 *
 * Maps to Puppeteer's waitUntil option in page.goto():
 * - 'load': Wait for load event
 * - 'domcontentloaded': Wait for DOMContentLoaded
 * - 'networkidle': Mapped to 'networkidle2' internally (closest to Playwright's networkidle)
 */
export type PuppeteerWaitUntil = 'load' | 'domcontentloaded' | 'networkidle';

/**
 * Options for PuppeteerFetcherAdapter
 *
 * These are Puppeteer API features specific to resource fetching.
 * Browser and page lifecycle is managed by the user's code.
 *
 * @example
 * ```typescript
 * const adapter = new PuppeteerFetcherAdapter(page, {
 *   waitForLoadState: 'networkidle',
 *   executeJs: true,
 *   customHeaders: { 'Authorization': 'Bearer ...' },
 *   validateSSL: true
 * });
 * ```
 */
export interface PuppeteerAdapterOptions {
  /**
   * Wait state for page.goto()
   *
   * - 'load': Wait for load event
   * - 'domcontentloaded': Wait for DOMContentLoaded
   * - 'networkidle': Wait for network idle (recommended, mapped to networkidle2)
   *
   * @default 'networkidle'
   */
  waitForLoadState?: PuppeteerWaitUntil;

  /**
   * Whether to execute JavaScript during fetch
   *
   * - true: Use page.goto() for main HTML (executes JS, waits for rendering)
   * - false: Use raw HTTP fetch with cookies (raw HTML only)
   *
   * @default true
   */
  executeJs?: boolean;

  /**
   * Custom HTTP headers for all requests
   *
   * @example
   * ```
   * { 'Authorization': 'Bearer token', 'X-Custom': 'value' }
   * ```
   */
  customHeaders?: Record<string, string>;

  /**
   * Whether to validate SSL certificates
   *
   * @default true
   */
  validateSSL?: boolean;

  /**
   * Optional debug screenshot path
   *
   * If set, saves a screenshot after page navigation
   */
  debugScreenshot?: string;
}
