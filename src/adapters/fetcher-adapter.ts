/**
 * Unified resource acquisition adapter interface
 * Support for multiple backends: HTTP, Playwright, caching, etc.
 *
 * Design Principle:
 * - Abstract resource fetching logic, decouple the snapshot core from the specific HTTP implementation
 * - Supports multiple authentication and resource sources (HTTP, browser context, cache, etc.)
 * - Allow integration with different automation tools (HTTP, Playwright, Puppeteer, etc.)
 */

/**
 * Options when fetching resources
 *
 * These are universal options that apply to all FetcherAdapter implementations.
 */
export interface FetchOptions {
  /**
   * Request timeout (milliseconds)
   * @default 15000
   */
  timeout?: number;

  /**
   * Referer request header
   */
  referer?: string;

  /**
   * Customized request headers
   */
  headers?: Record<string, string>;

  /**
   * Maximum file size (bytes)
   * @default 0 (unlimited)
   */
  maxSize?: number;

  /**
   * Whether to validate the SSL certificate
   * @default true
   */
  validateSSL?: boolean;

  /**
   * Whether to follow redirects
   * @default true
   */
  followRedirects?: boolean;

  /**
   * Mark this request as the main document (HTML page).
   * - true: main document (may require full page rendering/JS execution)
   * - false/undefined: sub-resource (CSS, JS, images, fonts, etc.)
   *
   * Usage:
   * - HTTP adapter: treats all requests the same way
   * - Playwright adapter: main doc uses page.goto(), sub-resources use context.request.fetch()
   *
   * Set by the caller (snapshotInternal) based on context.
   */
  isMainDocument?: boolean;
}

/**
 * Results of resource acquisition
 *
 * These fields are universal across all adapter implementations.
 */
export interface FetchResult {
  /**
   * Resource content binary data
   */
  buffer: Buffer;

  /**
   * MIME Type
   */
  mime: string;

  /**
   * HTTP Status Code
   */
  status: number;

  /**
   * Success or failure (2xx)
   */
  ok: boolean;

  /**
   * Whether the text content is HTML-like (text/html, application/xhtml+xml, etc.)
   */
  isHtmlLike: boolean;

  /**
   * Response headers (optional, for adapter implementations that have access)
   */
  headers?: Record<string, string>;

  /**
   * Final URL (after redirection)
   */
  url?: string;
}

/**
 * Authentication Context
 *
 * Represents authentication state captured from an adapter.
 * This is adapter-specific but follows a common schema to enable portability.
 *
 * Usage:
 * - Save authentication state after snapshotting an authenticated page
 * - Share state between snapshots or export for reuse in other tools
 *
 * Example (Playwright adapter):
 * ```typescript
 * const context = await adapter.getAuthContext();
 * // { cookies: [...], headers: {...}, token: '...' }
 * ```
 *
 * Example (HTTP adapter):
 * ```typescript
 * const context = await adapter.getAuthContext();
 * // { cookies: [], headers: {...} }  (HTTP doesn't auto-capture cookies)
 * ```
 */
export interface AuthContext {
  /**
   * Browser/HTTP Cookies
   */
  cookies?: Array<{ name: string; value: string }>;

  /**
   * Custom request headers (e.g., Authorization)
   */
  headers?: Record<string, string>;

  /**
   * Authentication tokens (JWT, OAuth, Bearer, etc.)
   * Found in localStorage or extracted from headers
   */
  token?: string;
}

/**
 * Unified Fetcher Adapter Interface
 *
 * Implementations:
 * - HttpFetcherAdapter: Node.js HTTP requests (default)
 * - PlaywrightFetcherAdapter: Playwright browser context (requires 'playwright' package)
 *
 * Future implementations could include:
 * - PuppeteerFetcherAdapter: Puppeteer automation
 * - CacheFetcherAdapter: Local file cache
 * - HybridFetcherAdapter: Composite of multiple adapters
 *
 * Usage:
 * ```typescript
 * // Use with snapshot() library API
 * const adapter = new PlaywrightFetcherAdapter(page, context, {
 *   timeout: 30000,
 *   validateSSL: true
 * });
 *
 * const result = await snapshot(options, adapter);
 * ```
 */
export interface FetcherAdapter {
  /**
   * Fetch a resource (HTML, CSS, JS, image, etc.)
   *
   * @param url The full URL of the resource
   * @param options Fetch options (timeout, headers, SSL validation, etc.)
   * @returns FetchResult with buffer, MIME type, status code, headers, etc.
   * @throws Throws on network errors, timeouts, etc.
   *
   * Implementation notes:
   * - Must handle the `isMainDocument` flag appropriately
   *   - For browser adapters: main doc may trigger full rendering
   *   - For HTTP adapters: treat all requests uniformly
   * - Must apply custom headers and timeout settings
   * - Should set `isHtmlLike` based on Content-Type or content analysis
   */
  fetch(url: string, options: FetchOptions): Promise<FetchResult>;

  /**
   * Check if a resource is accessible (optional)
   *
   * Used for pre-filtering inaccessible resources to avoid wasting time.
   * Implementations should use efficient methods (HEAD requests, quick checks).
   *
   * @param url The full URL of the resource
   * @returns true if accessible (2xx), false if not accessible
   *
   * Implementation notes:
   * - Default behavior (if not implemented): assume all resources are accessible
   * - HTTP adapter: performs quick HEAD request
   * - Playwright adapter: uses context.request.head()
   */
  canAccess?(url: string): Promise<boolean>;

  /**
   * Extract current authentication context (optional)
   *
   * Useful for:
   * - Capturing auth state after snapshotting authenticated pages
   * - Sharing authentication between multiple snapshots
   * - Debugging authentication setup
   *
   * @returns AuthContext with cookies, headers, tokens
   *
   * Implementation notes:
   * - HTTP adapter: returns empty context (no auto cookie capture)
   * - Playwright adapter: extracts browser cookies and localStorage
   * - Should not throw; return empty context if auth info unavailable
   */
  getAuthContext?(): Promise<AuthContext>;

  /**
   * Clean up adapter resources (optional)
   *
   * Called when the adapter is no longer needed.
   * Allows implementation-specific cleanup.
   *
   * Implementation notes:
   * - HTTP adapter: usually no cleanup needed
   * - Playwright adapter: closes managed page (but NOT browser/context)
   * - Should not throw; best effort cleanup
   */
  dispose?(): Promise<void>;
}
