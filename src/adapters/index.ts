/**
 * 适配器层导出（公开API）
 *
 * 注意：FetcherAdapter和HttpFetcherAdapter是内部实现细节，
 * 不在这里导出。只导出PlaywrightFetcherAdapter给高级用户。
 *
 * 内部模块会直接import FetcherAdapter等接口。
 */

// 仅导出Playwright适配器给公开API使用
export { PlaywrightFetcherAdapter } from './playwright-fetcher-adapter.js';
export type { PlaywrightAdapterOptions } from './playwright-fetcher-adapter.js';
