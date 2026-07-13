/**
 * Playwright-Specific Adapter Options
 *
 * These options control how PlaywrightFetcherAdapter fetches resources
 * using Playwright's browser API. They are Playwright-specific and
 * do not apply to other automation tools.
 *
 * Note: Lifecycle management (creating/closing browser, context, page)
 * is the responsibility of the user's code, not the adapter.
 */

/**
 * Playwright-specific page load wait states
 */
export type PlaywrightWaitUntil = 'load' | 'domcontentloaded' | 'networkidle' | 'commit';

/**
 * Options for PlaywrightFetcherAdapter
 *
 * These are Playwright API features specific to resource fetching.
 * Browser and context lifecycle is managed by the user's code.
 *
 * @example
 * ```typescript
 * const adapter = new PlaywrightFetcherAdapter(page, context, {
 *   waitForLoadState: 'networkidle',
 *   executeJs: true,
 *   customHeaders: { 'Authorization': 'Bearer ...' },
 *   validateSSL: true
 * });
 * ```
 */
export interface PlaywrightAdapterOptions {
  /**
   * Wait state for page.goto()
   *
   * - 'load': Wait for load event
   * - 'domcontentloaded': Wait for DOMContentLoaded
   * - 'networkidle': Wait for network idle (recommended)
   * - 'commit': Wait for navigation commit (fastest)
   *
   * @default 'networkidle'
   */
  waitForLoadState?: PlaywrightWaitUntil;

  /**
   * Whether to execute JavaScript during fetch
   *
   * - true: Use page.goto() for main HTML (executes JS, waits for rendering)
   * - false: Use context.request.fetch() (raw HTML only)
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

  /**
   * Whether to wait for navigation to complete
   *
   * @default true
   */
  waitForNavigation?: boolean;
}
