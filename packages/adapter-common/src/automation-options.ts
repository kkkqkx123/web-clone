/**
 * Universal Automation Adapter Options
 *
 * Common configuration for browser automation and remote resource fetching.
 * Allows multiple automation tools (Playwright, Puppeteer, Nightmare, etc.)
 * to share a common configuration interface.
 *
 * This is a base interface. Specific automation tools may extend this
 * with tool-specific options in their own options interfaces.
 */

/**
 * Common page load wait strategies across automation tools
 */
export type PageLoadWaitStrategy = 'load' | 'interactive' | 'networkidle';

/**
 * Universal options that apply to all automation adapters
 *
 * These options represent concepts that span multiple automation tools:
 * - Playwright: "waitUntil" option
 * - Puppeteer: "waitUntil" option
 * - Nightmare: "goto" wait handling
 *
 * Tool-specific extensions should create interfaces that extend this.
 */
export interface AutomationAdapterOptions {
  /**
   * Wait strategy for page navigation
   *
   * - 'load': Wait for the load event (resources finished loading)
   * - 'interactive': Wait for DOM to be interactive (DOMContentLoaded)
   * - 'networkidle': Wait for network to become idle (no pending requests)
   *
   * @default 'networkidle'
   */
  waitStrategy?: PageLoadWaitStrategy;

  /**
   * Request timeout in milliseconds
   * Applied to individual requests within the automation context
   *
   * @default 30000
   */
  requestTimeout?: number;

  /**
   * Debug mode settings
   * Allows capturing screenshots, logs, or other debug info during automation
   */
  debug?: {
    /**
     * Path to save debug screenshot after navigation
     */
    screenshot?: string;

    /**
     * Path to save debug logs
     */
    logs?: string;
  };

  /**
   * SSL certificate validation
   * Some sites may have self-signed certs; set to false to skip validation
   *
   * @default true
   */
  validateSSL?: boolean;

  /**
   * Custom request headers applied to all requests made by the automation context
   *
   * Example:
   * ```
   * customHeaders: {
   *   'Authorization': 'Bearer token123',
   *   'X-Custom-Header': 'value'
   * }
   * ```
   */
  customHeaders?: Record<string, string>;
}

/**
 * Universal options for authentication during automation
 */
export interface AutomationAuthOptions {
  /**
   * Custom HTTP headers for authentication (Bearer tokens, API keys, etc.)
   */
  headers?: Record<string, string>;

  /**
   * Cookies to inject before automation starts
   */
  cookies?: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    secure?: boolean;
    httpOnly?: boolean;
  }>;

  /**
   * Storage state (cookies + localStorage + sessionStorage)
   * Can be saved from a previous automation session and restored
   */
  storageState?: Record<string, unknown>;
}
