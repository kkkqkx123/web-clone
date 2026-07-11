/**
 * Adapter layer export (public API)
 * 
 * Note: FetcherAdapter and HttpFetcherAdapter are internal implementation details that
 * Not exported here. Only export PlaywrightFetcherAdapter for advanced users.
 * 
 * Internal modules will directly import FetcherAdapter and other interfaces.
 */

// Only export Playwright adapters for use with the public API.
export { PlaywrightFetcherAdapter } from './playwright-fetcher-adapter.js';
export type { PlaywrightAdapterOptions } from './playwright-fetcher-adapter.js';
