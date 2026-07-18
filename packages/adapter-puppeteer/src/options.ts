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

  /**
   * Proxy server URL for browser requests
   *
   * If set, passes --proxy-server to Chromium. Falls back to
   * HTTPS_PROXY / HTTP_PROXY environment variables if not set.
   *
   * @example 'http://127.0.0.1:7890'
   */
  proxy?: string;

  /**
   * Whether to launch browser in headless mode
   *
   * - true: Headless mode (default, no visible browser window)
   * - false: Headed mode (shows browser window, useful for debugging
   *   and bypassing anti-bot detection that targets headless browsers)
   *
   * Note: This option only applies when using createPuppeteerAdapter()
   * which manages the full browser lifecycle. When using
   * PuppeteerFetcherAdapter directly, the browser is managed by the caller.
   *
   * @default true
   */
  headless?: boolean;

  /**
   * Browser User-Agent string.
   *
   * If not set, Puppeteer's default is used (which includes "HeadlessChrome").
   * Set to a normal Chrome UA to reduce anti-bot detection probability.
   *
   * Note: This option only applies when using createPuppeteerAdapter().
   * When using PuppeteerFetcherAdapter directly, set the userAgent
   * on the page created by your own code.
   *
   * @example 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
   */
  userAgent?: string;

  /**
   * Browser viewport size.
   *
   * If not set, Puppeteer's default 800x600 is used.
   * Setting to 1920x1080 helps avoid headless browser detection.
   *
   * Note: This option only applies when using createPuppeteerAdapter().
   * When using PuppeteerFetcherAdapter directly, set the viewport
   * on the page created by your own code.
   *
   * @default { width: 800, height: 600 }
   */
  viewport?: { width: number; height: number };

  /**
   * Browser locale (e.g. 'zh-CN', 'en-US').
   *
   * Sets the Accept-Language header and affects browser locale APIs.
   * For Chinese websites, setting to 'zh-CN' helps appear more natural.
   *
   * Note: This option only applies when using createPuppeteerAdapter().
   * When using PuppeteerFetcherAdapter directly, set the locale
   * on the page created by your own code.
   */
  locale?: string;

  /**
   * Geographic location override.
   *
   * Note: This option only applies when using createPuppeteerAdapter().
   * When using PuppeteerFetcherAdapter directly, set the geolocation
   * on the page created by your own code.
   */
  geolocation?: {
    latitude: number;
    longitude: number;
    /** Timezone ID, e.g. 'Asia/Shanghai' */
    timezoneId?: string;
  };

  /**
   * Extra Chromium launch arguments.
   *
   * These are appended to the default args in createPuppeteerAdapter().
   *
   * Note: This option only applies when using createPuppeteerAdapter().
   * When using PuppeteerFetcherAdapter directly, pass the args
   * to your own puppeteer.launch() call.
   *
   * @example ['--disable-gpu', '--disable-software-rasterizer']
   */
  launchArgs?: string[];
}
