/**
 * Mock 对象工厂
 * 用于创建可重用的 Playwright Mock 对象
 */

import { vi } from 'vitest';
import type { Page, BrowserContext, Response } from 'playwright';

/**
 * 创建模拟 Playwright Page 对象
 */
export function createMockPage(overrides?: Partial<Page>): Page {
  return {
    goto: vi.fn(),
    content: vi.fn(),
    waitForLoadState: vi.fn(),
    screenshot: vi.fn(),
    close: vi.fn(),
    isClosed: vi.fn(() => false),
    url: vi.fn(() => 'https://example.com'),
    evaluate: vi.fn(),
    ...overrides,
  } as unknown as Page;
}

/**
 * 创建模拟 BrowserContext 对象
 */
export function createMockContext(
  overrides?: Partial<BrowserContext>
): BrowserContext {
  return {
    cookies: vi.fn().mockResolvedValue([
      { name: 'session', value: 'abc123', url: '', domain: '', path: '' },
      { name: 'tracking', value: 'xyz789', url: '', domain: '', path: '' },
    ]),
    storageState: vi.fn().mockResolvedValue({
      origins: [
        {
          origin: 'https://example.com',
          localStorage: [
            { name: 'auth_token', value: 'Bearer token123' },
            { name: 'user_id', value: '12345' },
          ],
        },
      ],
    }),
    request: {
      fetch: vi.fn(),
      head: vi.fn(),
    },
    newPage: vi.fn(),
    close: vi.fn(),
    addCookies: vi.fn(),
    ...overrides,
  } as unknown as BrowserContext;
}

/**
 * 预设 FetchResult 模板
 */
export const MOCK_RESULTS = {
  /**
   * HTML 响应
   */
  html: (overrides?: Record<string, any>) => ({
    buffer: Buffer.from('<html><body>Test Page</body></html>'),
    mime: 'text/html; charset=utf-8',
    status: 200,
    ok: true,
    isHtmlLike: true,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    url: 'https://example.com',
    ...overrides,
  }),

  /**
   * CSS 响应
   */
  css: (overrides?: Record<string, any>) => ({
    buffer: Buffer.from('body { color: red; } .class { display: flex; }'),
    mime: 'text/css',
    status: 200,
    ok: true,
    isHtmlLike: false,
    headers: { 'content-type': 'text/css' },
    url: 'https://example.com/style.css',
    ...overrides,
  }),

  /**
   * JavaScript 响应
   */
  js: (overrides?: Record<string, any>) => ({
    buffer: Buffer.from('console.log("hello"); function test() { return 42; }'),
    mime: 'application/javascript',
    status: 200,
    ok: true,
    isHtmlLike: false,
    headers: { 'content-type': 'application/javascript' },
    url: 'https://example.com/script.js',
    ...overrides,
  }),

  /**
   * PNG 图片响应
   */
  image: (overrides?: Record<string, any>) => ({
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG header
    mime: 'image/png',
    status: 200,
    ok: true,
    isHtmlLike: false,
    headers: { 'content-type': 'image/png' },
    url: 'https://example.com/logo.png',
    ...overrides,
  }),

  /**
   * 404 错误响应
   */
  error404: (overrides?: Record<string, any>) => ({
    buffer: Buffer.from('Not Found'),
    mime: 'text/html',
    status: 404,
    ok: false,
    isHtmlLike: true,
    headers: { 'content-type': 'text/html' },
    url: 'https://example.com/missing',
    ...overrides,
  }),

  /**
   * 500 服务器错误响应
   */
  error500: (overrides?: Record<string, any>) => ({
    buffer: Buffer.from('Internal Server Error'),
    mime: 'text/html',
    status: 500,
    ok: false,
    isHtmlLike: true,
    headers: { 'content-type': 'text/html' },
    url: 'https://example.com/error',
    ...overrides,
  }),

  /**
   * 超时/网络错误
   */
  networkError: () => new Error('Network timeout'),

  /**
   * 自定义响应
   */
  custom: (options: Record<string, any> = {}) => ({
    buffer: Buffer.from(options.content || ''),
    mime: options.mime || 'application/octet-stream',
    status: options.status || 200,
    ok: (options.status || 200) >= 200 && (options.status || 200) < 300,
    isHtmlLike: options.mime?.includes('html') || false,
    headers: options.headers || {},
    url: options.url || 'https://example.com/custom',
    ...options,
  }),
};

/**
 * 创建模拟 Playwright Response 对象
 */
export function createMockResponse(overrides?: Partial<Response>): Response {
  return {
    status: vi.fn(() => 200),
    ok: vi.fn(() => true),
    headers: vi.fn(() => ({ 'content-type': 'text/html' })),
    allHeaders: vi.fn(async () => ({ 'content-type': 'text/html' })),
    body: vi.fn(async () => Buffer.from('<html></html>')),
    text: vi.fn(async () => '<html></html>'),
    json: vi.fn(async () => ({})),
    url: vi.fn(() => 'https://example.com'),
    ...overrides,
  } as unknown as Response;
}
