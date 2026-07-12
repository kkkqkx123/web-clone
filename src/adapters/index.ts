/**
 * Adapter layer export (public API)
 *
 * Export all adapter implementations and interfaces for library users.
 *
 * Architecture:
 * - FetcherAdapter: Universal interface for resource fetching
 * - HttpFetcherAdapter: Default HTTP implementation
 * - PlaywrightFetcherAdapter: Browser automation implementation (optional, requires 'playwright')
 */

// Universal interfaces
export type { FetcherAdapter, FetchOptions, FetchResult, AuthContext } from './fetcher-adapter.js';

// HTTP adapter (default)
export { HttpFetcherAdapter } from './http-fetcher-adapter.js';

// Playwright adapter (optional)
export { PlaywrightFetcherAdapter } from './automation/playwright/index.js';
export type { PlaywrightAdapterOptions } from './automation/playwright/index.js';