/**
 * Adapter layer export (public API)
 *
 * Export all adapter implementations and interfaces for library users.
 *
 * Architecture:
 * - FetcherAdapter: Universal interface for resource fetching
 * - HttpFetcherAdapter: Default HTTP implementation
 * - Playwright/Puppeteer adapters are now in separate packages:
 *   @web-clone/adapter-playwright and @web-clone/adapter-puppeteer
 */

// Universal interfaces
export type { FetcherAdapter, FetchOptions, FetchResult, AuthContext } from './fetcher-adapter.js';

// HTTP adapter (default)
export { HttpFetcherAdapter } from './http-fetcher-adapter.js';