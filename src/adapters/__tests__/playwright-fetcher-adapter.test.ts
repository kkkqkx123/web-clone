/**
 * Playwright 适配器单元测试
 *
 * 测试 PlaywrightFetcherAdapter 的所有方法和边界情况
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Page, BrowserContext } from 'playwright';
import { PlaywrightFetcherAdapter } from '../playwright-fetcher-adapter.js';

/**
 * 创建模拟的 Playwright 页面对象
 */
function createMockPage(): Page {
  return {
    goto: vi.fn(),
    content: vi.fn(),
    waitForLoadState: vi.fn(),
    screenshot: vi.fn(),
    close: vi.fn(),
    isClosed: vi.fn(() => false),
    url: vi.fn(() => 'https://example.com'),
  } as unknown as Page;
}

/**
 * 创建模拟的 Playwright 浏览器上下文
 */
function createMockContext(): BrowserContext {
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
  } as unknown as BrowserContext;
}

describe('PlaywrightFetcherAdapter', () => {
  let mockPage: Page;
  let mockContext: BrowserContext;
  let adapter: PlaywrightFetcherAdapter;

  beforeEach(() => {
    mockPage = createMockPage();
    mockContext = createMockContext();
    adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('fetch() - 主文档获取', () => {
    it('should fetch HTML via page.goto when URL is main document', async () => {
      const htmlContent = '<html><body>Test Page</body></html>';

      vi.mocked(mockPage.goto as any).mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        allHeaders: async () => ({ 'content-type': 'text/html; charset=utf-8' }),
      });

      vi.mocked(mockPage.content as any).mockResolvedValueOnce(htmlContent);

      const result = await adapter.fetch('https://example.com', {
        timeout: 5000,
      });

      expect(result.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.mime).toBe('text/html');
      expect(result.isHtmlLike).toBe(true);
      expect(result.buffer.toString('utf-8')).toBe(htmlContent);

      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', {
        timeout: 5000,
        waitUntil: 'networkidle',
      });
    });

    it('should wait for load state after page.goto', async () => {
      vi.mocked(mockPage.goto as any).mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        allHeaders: async () => ({}),
      });
      vi.mocked(mockPage.content as any).mockResolvedValueOnce('<html></html>');

      await adapter.fetch('https://example.com', {});

      expect(mockPage.waitForLoadState).toHaveBeenCalledWith('networkidle');
    });

    it('should use custom waitForLoadState option', async () => {
      const adapter2 = new PlaywrightFetcherAdapter(mockPage, mockContext, {
        waitForLoadState: 'load',
      });

      vi.mocked(mockPage.goto as any).mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        allHeaders: async () => ({}),
      });
      vi.mocked(mockPage.content as any).mockResolvedValueOnce('<html></html>');

      await adapter2.fetch('https://example.com', {});

      expect(mockPage.goto).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ waitUntil: 'load' })
      );
    });

    it('should handle custom timeout for page.goto', async () => {
      vi.mocked(mockPage.goto as any).mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        allHeaders: async () => ({}),
      });
      vi.mocked(mockPage.content as any).mockResolvedValueOnce('<html></html>');

      await adapter.fetch('https://example.com', { timeout: 60000 });

      expect(mockPage.goto).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 60000 })
      );
    });

    it('should save debug screenshot if configured', async () => {
      const adapter2 = new PlaywrightFetcherAdapter(mockPage, mockContext, {
        debugScreenshot: '/tmp/debug.png',
      });

      vi.mocked(mockPage.goto as any).mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        allHeaders: async () => ({}),
      });
      vi.mocked(mockPage.content as any).mockResolvedValueOnce('<html></html>');

      await adapter2.fetch('https://example.com', {});

      expect(mockPage.screenshot).toHaveBeenCalledWith({
        path: '/tmp/debug.png',
      });
    });

    it('should throw error when page.goto fails', async () => {
      vi.mocked(mockPage.goto as any).mockResolvedValueOnce(null);

      await expect(adapter.fetch('https://example.com', {})).rejects.toThrow(
        'Failed to navigate'
      );
    });

    it('should return correct URL from page.url()', async () => {
      vi.mocked(mockPage.url as any).mockReturnValue('https://example.com/final');
      vi.mocked(mockPage.goto as any).mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        allHeaders: async () => ({}),
      });
      vi.mocked(mockPage.content as any).mockResolvedValueOnce('<html></html>');

      const result = await adapter.fetch('https://example.com', {});

      expect(result.url).toBe('https://example.com/final');
    });
  });

  describe('fetch() - 子资源获取', () => {
    it('should fetch CSS via context.request when not main document', async () => {
      // 设置页面已加载
      vi.mocked(mockPage.url as any).mockReturnValue('https://example.com/page');

      const cssContent = 'body { color: red; }';
      const buffer = Buffer.from(cssContent);

      vi.mocked(
        (mockContext.request as any).fetch
      ).mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        headers: () => ({ 'content-type': 'text/css' }),
        body: async () => buffer,
        url: () => 'https://example.com/style.css',
      });

      const result = await adapter.fetch('https://cdn.example.com/style.css', {});

      expect(result.status).toBe(200);
      expect(result.mime).toContain('text/css');
      expect(result.buffer).toEqual(buffer);
    });

    it('should inherit custom headers in sub-resource fetch', async () => {
      vi.mocked(mockPage.url as any).mockReturnValue('https://example.com/page');

      const adapter2 = new PlaywrightFetcherAdapter(mockPage, mockContext, {
        customHeaders: { 'Authorization': 'Bearer token123' },
      });

      vi.mocked(
        (mockContext.request as any).fetch
      ).mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        headers: () => ({}),
        body: async () => Buffer.from(''),
        url: () => 'https://api.example.com/data',
      });

      await adapter2.fetch('https://api.example.com/data', {});

      expect((mockContext.request as any).fetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer token123',
          }),
        })
      );
    });

    it('should merge fetch options headers with custom headers', async () => {
      vi.mocked(mockPage.url as any).mockReturnValue('https://example.com/page');

      const adapter2 = new PlaywrightFetcherAdapter(mockPage, mockContext, {
        customHeaders: { 'Authorization': 'Bearer token' },
      });

      vi.mocked(
        (mockContext.request as any).fetch
      ).mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        headers: () => ({}),
        body: async () => Buffer.from(''),
        url: () => 'https://example.com/api',
      });

      await adapter2.fetch('https://example.com/api', {
        headers: { 'Accept': 'application/json' },
      });

      expect((mockContext.request as any).fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer token',
            'Accept': 'application/json',
          }),
        })
      );
    });

    it('should fetch images as binary', async () => {
      vi.mocked(mockPage.url as any).mockReturnValue('https://example.com/page');

      const imageBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header

      vi.mocked(
        (mockContext.request as any).fetch
      ).mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        headers: () => ({ 'content-type': 'image/png' }),
        body: async () => imageBuffer,
        url: () => 'https://example.com/image.png',
      });

      const result = await adapter.fetch('https://example.com/image.png', {});

      expect(result.mime).toBe('image/png');
      expect(result.buffer).toEqual(imageBuffer);
    });
  });

  describe('fetch() - 错误处理', () => {
    it('should throw error with descriptive message', async () => {
      vi.mocked(mockPage.goto as any).mockRejectedValueOnce(
        new Error('Network timeout')
      );

      await expect(adapter.fetch('https://example.com', {})).rejects.toThrow(
        'Playwright fetch failed for https://example.com'
      );
    });

    it('should handle non-error objects thrown', async () => {
      vi.mocked(mockPage.goto as any).mockRejectedValueOnce('String error');

      await expect(adapter.fetch('https://example.com', {})).rejects.toThrow(
        'Playwright fetch failed'
      );
    });
  });

  describe('canAccess()', () => {
    it('should return true for accessible resource', async () => {
      vi.mocked(
        (mockContext.request as any).head
      ).mockResolvedValueOnce({
        ok: () => true,
      });

      const accessible = await adapter.canAccess('https://example.com/api');

      expect(accessible).toBe(true);
      expect((mockContext.request as any).head).toHaveBeenCalledWith(
        'https://example.com/api',
        { timeout: 5000 }
      );
    });

    it('should return false for inaccessible resource', async () => {
      vi.mocked(
        (mockContext.request as any).head
      ).mockResolvedValueOnce({
        ok: () => false,
      });

      const accessible = await adapter.canAccess('https://example.com/missing');

      expect(accessible).toBe(false);
    });

    it('should return false on network error', async () => {
      vi.mocked(
        (mockContext.request as any).head
      ).mockRejectedValueOnce(
        new Error('Network error')
      );

      const accessible = await adapter.canAccess('https://example.com');

      expect(accessible).toBe(false);
    });

    it('should return false for server errors', async () => {
      vi.mocked(
        (mockContext.request as any).head
      ).mockResolvedValueOnce({
        ok: () => false,
      });

      const accessible = await adapter.canAccess('https://example.com/500');

      expect(accessible).toBe(false);
    });
  });

  describe('getAuthContext()', () => {
    it('should return cookies from context', async () => {
      const authContext = await adapter.getAuthContext();

      expect(authContext.cookies).toEqual([
        { name: 'session', value: 'abc123' },
        { name: 'tracking', value: 'xyz789' },
      ]);
    });

    it('should return custom headers', async () => {
      const adapter2 = new PlaywrightFetcherAdapter(mockPage, mockContext, {
        customHeaders: { 'X-Custom': 'value' },
      });

      const authContext = await adapter2.getAuthContext();

      expect(authContext.headers).toEqual({ 'X-Custom': 'value' });
    });

    it('should extract auth token from localStorage', async () => {
      const authContext = await adapter.getAuthContext();

      expect(authContext.token).toBe('Bearer token123');
    });

    it('should handle empty cookies', async () => {
      vi.mocked(mockContext.cookies as any).mockResolvedValueOnce([]);

      const authContext = await adapter.getAuthContext();

      expect(authContext.cookies).toEqual([]);
    });

    it('should handle missing storageState', async () => {
      vi.mocked(mockContext.storageState as any).mockResolvedValueOnce(null);

      const authContext = await adapter.getAuthContext();

      expect(authContext.token).toBeUndefined();
    });

    it('should handle empty origins in storageState', async () => {
      vi.mocked(mockContext.storageState as any).mockResolvedValueOnce({
        origins: [],
      });

      const authContext = await adapter.getAuthContext();

      expect(authContext.token).toBeUndefined();
    });

    it('should find token by various naming conventions', async () => {
      vi.mocked(mockContext.storageState as any).mockResolvedValueOnce({
        origins: [
          {
            origin: 'https://example.com',
            localStorage: [
              { name: 'AUTH_TOKEN', value: 'token123' },
            ],
          },
        ],
      });

      const authContext = await adapter.getAuthContext();

      expect(authContext.token).toBe('token123');
    });
  });

  describe('dispose()', () => {
    it('should close page', async () => {
      await adapter.dispose();

      expect(mockPage.close).toHaveBeenCalled();
    });

    it('should check if page is closed before closing', async () => {
      vi.mocked(mockPage.isClosed as any).mockReturnValueOnce(false);

      await adapter.dispose();

      expect(mockPage.close).toHaveBeenCalled();
    });

    it('should not close already closed page', async () => {
      vi.mocked(mockPage.isClosed as any).mockReturnValueOnce(true);

      await adapter.dispose();

      expect(mockPage.close).not.toHaveBeenCalled();
    });

    it('should handle errors silently', async () => {
      vi.mocked(mockPage.close as any).mockRejectedValueOnce(
        new Error('Already closed')
      );

      // Should not throw
      await expect(adapter.dispose()).resolves.toBeUndefined();
    });

    it('should be idempotent', async () => {
      vi.mocked(mockPage.isClosed as any).mockReturnValue(false);

      await adapter.dispose();
      // Second call
      vi.mocked(mockPage.isClosed as any).mockReturnValue(true);
      await adapter.dispose();

      // close() should only be called once
      expect(mockPage.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete authenticated workflow', async () => {
      // Step 1: 页面已登录，获取主文档
      vi.mocked(mockPage.goto as any).mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        allHeaders: async () => ({}),
      });
      vi.mocked(mockPage.content as any).mockResolvedValueOnce('<html></html>');

      const pageResult = await adapter.fetch('https://example.com', {});
      expect(pageResult.ok).toBe(true);

      // Step 2: 获取子资源（CSS）
      vi.mocked(mockPage.url as any).mockReturnValue('https://example.com/page');
      vi.mocked(
        (mockContext.request as any).fetch
      ).mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        headers: () => ({ 'content-type': 'text/css' }),
        body: async () => Buffer.from('body {}'),
        url: () => 'https://example.com/style.css',
      });

      const cssResult = await adapter.fetch('https://example.com/style.css', {});
      expect(cssResult.ok).toBe(true);

      // Step 3: 检查资源访问
      vi.mocked(
        (mockContext.request as any).head
      ).mockResolvedValueOnce({
        ok: () => true,
      });

      const accessible = await adapter.canAccess('https://example.com/api');
      expect(accessible).toBe(true);

      // Step 4: 获取认证上下文
      const authCtx = await adapter.getAuthContext();
      expect(authCtx.cookies).toBeDefined();
      expect(authCtx.token).toBeDefined();

      // Step 5: 清理
      vi.mocked(mockPage.isClosed as any).mockReturnValue(false);
      await adapter.dispose();
      expect(mockPage.close).toHaveBeenCalled();
    });

    it('should work with Playwright adapter options', async () => {
      const adapter2 = new PlaywrightFetcherAdapter(mockPage, mockContext, {
        waitForLoadState: 'load',
        waitForNavigation: true,
        executeJs: true,
        customHeaders: { 'Authorization': 'Bearer token' },
        debugScreenshot: '/tmp/screenshot.png',
        validateSSL: false,
      });

      vi.mocked(mockPage.goto as any).mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        allHeaders: async () => ({}),
      });
      vi.mocked(mockPage.content as any).mockResolvedValueOnce('<html></html>');

      await adapter2.fetch('https://example.com', {});

      // 验证所有选项都被正确使用
      expect(mockPage.goto).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ waitUntil: 'load' })
      );
      expect(mockPage.waitForLoadState).toHaveBeenCalledWith('load');
      expect(mockPage.screenshot).toHaveBeenCalledWith({
        path: '/tmp/screenshot.png',
      });
    });
  });

  describe('edge cases', () => {
    it('should handle very large response bodies', async () => {
      vi.mocked(mockPage.url as any).mockReturnValue('https://example.com/page');

      const largeBuffer = Buffer.alloc(100 * 1024 * 1024); // 100 MB

      vi.mocked(
        (mockContext.request as any).fetch
      ).mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        headers: () => ({ 'content-type': 'application/octet-stream' }),
        body: async () => largeBuffer,
        url: () => 'https://example.com/large-file',
      });

      const result = await adapter.fetch('https://example.com/large-file', {});

      expect(result.buffer.length).toBe(100 * 1024 * 1024);
    });

    it('should handle responses with missing content-type', async () => {
      vi.mocked(mockPage.url as any).mockReturnValue('https://example.com/page');

      vi.mocked(
        (mockContext.request as any).fetch
      ).mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        headers: () => ({}), // 无 content-type
        body: async () => Buffer.from('data'),
        url: () => 'https://example.com/unknown',
      });

      const result = await adapter.fetch('https://example.com/unknown', {});

      expect(result.mime).toBe('application/octet-stream');
      expect(result.isHtmlLike).toBe(false);
    });

    it('should handle multiple adapter instances independently', async () => {
      const mockPage2 = createMockPage();
      const mockContext2 = createMockContext();
      const adapter2 = new PlaywrightFetcherAdapter(mockPage2, mockContext2);

      vi.mocked(mockPage.goto as any).mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        allHeaders: async () => ({}),
      });
      vi.mocked(mockPage.content as any).mockResolvedValueOnce('<html>1</html>');

      vi.mocked(mockPage2.goto as any).mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        allHeaders: async () => ({}),
      });
      vi.mocked(mockPage2.content as any).mockResolvedValueOnce('<html>2</html>');

      const result1 = await adapter.fetch('https://example.com', {});
      const result2 = await adapter2.fetch('https://example.com', {});

      expect(result1.buffer.toString()).toBe('<html>1</html>');
      expect(result2.buffer.toString()).toBe('<html>2</html>');
    });
  });
});
