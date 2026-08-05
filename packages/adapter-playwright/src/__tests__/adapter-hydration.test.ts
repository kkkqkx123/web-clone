/**
 * Playwright Adapter — SPA hydration call-chain tests.
 *
 * Verifies that PlaywrightFetcherAdapter.fetch() for the main document:
 * 1. Calls waitForSpaHydration with the page and the effective timeout
 * 2. Propagates the returned SpaDetectionResult into FetchResult.browserFramework
 * 3. Skips hydration detection when executeJs is disabled
 *
 * waitForSpaHydration itself is mocked here — its own behavior is covered
 * by the adapter-common unit tests (spa-detector.test.ts).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page, BrowserContext } from 'playwright';
import { PlaywrightFetcherAdapter } from '../adapter.js';
import { waitForSpaHydration } from '@web-clone/adapter-common';

vi.mock('@web-clone/adapter-common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@web-clone/adapter-common')>();
  return {
    ...actual,
    waitForSpaHydration: vi.fn(),
  };
});

const mockedWaitForSpaHydration = vi.mocked(waitForSpaHydration);

/**
 * Create a simulated Playwright page object.
 * Includes evaluate/waitForFunction/waitForTimeout so it satisfies SpaPageLike
 * (used only if waitForSpaHydration were actually invoked, which is mocked).
 */
function createMockPage(): Page {
  return {
    goto: vi.fn().mockResolvedValue({
      status: () => 200,
      ok: () => true,
      allHeaders: async () => ({ 'content-type': 'text/html; charset=utf-8' }),
    }),
    content: vi.fn().mockResolvedValue('<html><body>SPA</body></html>'),
    evaluate: vi.fn(),
    waitForFunction: vi.fn(),
    waitForTimeout: vi.fn(),
    waitForLoadState: vi.fn(),
    screenshot: vi.fn(),
    close: vi.fn(),
    isClosed: vi.fn(() => false),
    url: vi.fn(() => 'http://127.0.0.1:9000'),
  } as unknown as Page;
}

/** Create a simulated Playwright browser context. */
function createMockContext(): BrowserContext {
  return {
    request: {
      fetch: vi.fn(),
      head: vi.fn(),
    },
  } as unknown as BrowserContext;
}

describe('PlaywrightFetcherAdapter — SPA hydration call chain', () => {
  let mockPage: Page;
  let mockContext: BrowserContext;
  let adapter: PlaywrightFetcherAdapter;

  beforeEach(() => {
    mockPage = createMockPage();
    mockContext = createMockContext();
    adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
    vi.clearAllMocks();
  });

  it('should call waitForSpaHydration for the main document and propagate browserFramework', async () => {
    mockedWaitForSpaHydration.mockResolvedValue({
      framework: 'vue3',
      appElement: '#app',
      isHydrated: true,
      markers: ['__VUE__', 'hydration-confirmed'],
      tier: 'strong',
    });

    const result = await adapter.fetch('http://127.0.0.1:9000', {
      isMainDocument: true,
      timeout: 5000,
    });

    // waitForSpaHydration invoked with the page and effective timeout
    expect(mockedWaitForSpaHydration).toHaveBeenCalledTimes(1);
    expect(mockedWaitForSpaHydration).toHaveBeenCalledWith(
      expect.objectContaining({ evaluate: expect.any(Function) }),
      expect.objectContaining({ timeout: 5000 })
    );

    // SpaDetectionResult mapped into browserFramework
    expect(result.browserFramework).toEqual({
      framework: 'vue3',
      tier: 'strong',
      appElement: '#app',
      isHydrated: true,
    });
  });

  it('should use the constructor timeout when per-call timeout is not provided', async () => {
    mockedWaitForSpaHydration.mockResolvedValue({
      framework: 'unknown',
      appElement: null,
      isHydrated: false,
      markers: [],
      tier: 'none',
    });

    await adapter.fetch('http://127.0.0.1:9000', { isMainDocument: true });

    expect(mockedWaitForSpaHydration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ timeout: 30000 })
    );
  });

  it('should omit appElement when spa detection returns null', async () => {
    mockedWaitForSpaHydration.mockResolvedValue({
      framework: 'react18',
      appElement: null,
      isHydrated: false,
      markers: ['dom:#root'],
      tier: 'weak',
    });

    const result = await adapter.fetch('http://127.0.0.1:9000', {
      isMainDocument: true,
    });

    expect(result.browserFramework).toEqual({
      framework: 'react18',
      tier: 'weak',
      isHydrated: false,
    });
  });

  it('should skip hydration detection when executeJs is disabled', async () => {
    const noJsAdapter = new PlaywrightFetcherAdapter(mockPage, mockContext, {
      executeJs: false,
    });
    mockContext.request.fetch = vi.fn().mockResolvedValue({
      body: async () => Buffer.from('<html><body>raw</body></html>'),
      status: () => 200,
      ok: () => true,
      headers: () => ({ 'content-type': 'text/html' }),
      url: () => 'http://127.0.0.1:9000',
    });

    const result = await noJsAdapter.fetch('http://127.0.0.1:9000', {
      isMainDocument: true,
    });

    expect(mockedWaitForSpaHydration).not.toHaveBeenCalled();
    expect(result.browserFramework).toBeUndefined();
  });

  it('should not run hydration detection for sub-resources', async () => {
    mockContext.request.fetch = vi.fn().mockResolvedValue({
      body: async () => Buffer.from('body{}'),
      status: () => 200,
      ok: () => true,
      headers: () => ({ 'content-type': 'text/css' }),
      url: () => 'http://127.0.0.1:9000/style.css',
    });

    const result = await adapter.fetch('http://127.0.0.1:9000/style.css', {
      isMainDocument: false,
    });

    expect(mockedWaitForSpaHydration).not.toHaveBeenCalled();
    expect(result.browserFramework).toBeUndefined();
  });
});
