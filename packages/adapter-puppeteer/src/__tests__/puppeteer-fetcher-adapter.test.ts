/**
 * Puppeteer Adapter Unit Tests
 *
 * Tests all methods and boundary cases of the PuppeteerFetcherAdapter.
 * Uses mocked Puppeteer Page objects to avoid requiring a real browser.
 *
 * Test coverage mirrors the Playwright adapter tests for parity.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Page } from 'puppeteer';
import { PuppeteerFetcherAdapter } from '../adapter.js';

// Store original NODE_TLS_REJECT_UNAUTHORIZED
const origRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;

/**
 * Helper: create a properly-sized ArrayBuffer from a string.
 * Avoids Node.js Buffer pooling issues (Buffer.from(str).buffer may be oversized).
 */
function stringToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(str).buffer;
}

/**
 * Create a simulated Puppeteer page object
 */
function createMockPage(): Page {
  return {
    goto: vi.fn(),
    content: vi.fn(),
    screenshot: vi.fn(),
    close: vi.fn(),
    isClosed: vi.fn(() => false),
    url: vi.fn(() => 'https://example.com'),
    cookies: vi.fn().mockResolvedValue([
      { name: 'session', value: 'abc123', domain: '.example.com', path: '/' },
      { name: 'tracking', value: 'xyz789', domain: '.example.com', path: '/' },
    ]),
    evaluate: vi.fn(),
    waitForFunction: vi.fn(),
    waitForTimeout: vi.fn(),
  } as unknown as Page;
}

describe('PuppeteerFetcherAdapter', () => {
  let mockPage: Page;
  let adapter: PuppeteerFetcherAdapter;

  beforeEach(() => {
    mockPage = createMockPage();
    adapter = new PuppeteerFetcherAdapter(mockPage);
    vi.clearAllMocks();
    // Ensure SSL validation is reset
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = origRejectUnauthorized;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = origRejectUnauthorized;
  });

  describe('fetch() - main document', () => {
    it('should fetch HTML via page.goto when URL is main document', async () => {
      const htmlContent = '<html><body>Test Page</body></html>';

      vi.spyOn(mockPage, 'goto').mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        headers: () => ({ 'content-type': 'text/html; charset=utf-8' }),
        url: () => 'https://example.com',
        remoteAddress: () => ({ ip: '127.0.0.1', port: 443 }),
        request: () => ({}),
        securityDetails: () => null,
        fromCache: () => false,
        fromServiceWorker: () => false,
        frame: () => null,
        timing: () => null,
        json: () => Promise.resolve(null),
        text: () => Promise.resolve(''),
        buffer: () => Promise.resolve(Buffer.alloc(0)),
      } as any);

      vi.spyOn(mockPage, 'content').mockResolvedValueOnce(htmlContent);

      const result = await adapter.fetch('https://example.com', {
        isMainDocument: true,
        timeout: 5000,
      });

      expect(result.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.mime).toBe('text/html');
      expect(result.isHtmlLike).toBe(true);
      expect(result.buffer.toString('utf-8')).toBe(htmlContent);

      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', {
        timeout: 5000,
        waitUntil: 'networkidle2',
      });
    });

    it('should wait for load state after page.goto', async () => {
      vi.spyOn(mockPage, 'goto').mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        headers: () => ({}),
        url: () => 'https://example.com',
        remoteAddress: () => ({ ip: '127.0.0.1', port: 443 }),
        request: () => ({}),
        securityDetails: () => null,
        fromCache: () => false,
        fromServiceWorker: () => false,
        frame: () => null,
        timing: () => null,
        json: () => Promise.resolve(null),
        text: () => Promise.resolve(''),
        buffer: () => Promise.resolve(Buffer.alloc(0)),
      } as any);
      vi.spyOn(mockPage, 'content').mockResolvedValueOnce('<html></html>');

      await adapter.fetch('https://example.com', { isMainDocument: true });

      // Verify that page.goto() was called with networkidle2 (mapped from 'networkidle')
      expect(mockPage.goto).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ waitUntil: 'networkidle2' })
      );
    });

    it('should use custom waitForLoadState option', async () => {
      const adapter2 = new PuppeteerFetcherAdapter(mockPage, {
        waitForLoadState: 'load',
      });

      vi.spyOn(mockPage, 'goto').mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        headers: () => ({}),
        url: () => 'https://example.com',
        remoteAddress: () => ({ ip: '127.0.0.1', port: 443 }),
        request: () => ({}),
        securityDetails: () => null,
        fromCache: () => false,
        fromServiceWorker: () => false,
        frame: () => null,
        timing: () => null,
        json: () => Promise.resolve(null),
        text: () => Promise.resolve(''),
        buffer: () => Promise.resolve(Buffer.alloc(0)),
      } as any);
      vi.spyOn(mockPage, 'content').mockResolvedValueOnce('<html></html>');

      await adapter2.fetch('https://example.com', { isMainDocument: true });

      expect(mockPage.goto).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ waitUntil: 'load' })
      );
    });

    it('should handle custom timeout for page.goto', async () => {
      vi.spyOn(mockPage, 'goto').mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        headers: () => ({}),
        url: () => 'https://example.com',
        remoteAddress: () => ({ ip: '127.0.0.1', port: 443 }),
        request: () => ({}),
        securityDetails: () => null,
        fromCache: () => false,
        fromServiceWorker: () => false,
        frame: () => null,
        timing: () => null,
        json: () => Promise.resolve(null),
        text: () => Promise.resolve(''),
        buffer: () => Promise.resolve(Buffer.alloc(0)),
      } as any);
      vi.spyOn(mockPage, 'content').mockResolvedValueOnce('<html></html>');

      await adapter.fetch('https://example.com', { isMainDocument: true, timeout: 60000 });

      expect(mockPage.goto).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 60000 })
      );
    });

    it('should save debug screenshot if configured', async () => {
      const adapter2 = new PuppeteerFetcherAdapter(mockPage, {
        debugScreenshot: '/tmp/debug.png',
      });

      vi.spyOn(mockPage, 'goto').mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        headers: () => ({}),
        url: () => 'https://example.com',
        remoteAddress: () => ({ ip: '127.0.0.1', port: 443 }),
        request: () => ({}),
        securityDetails: () => null,
        fromCache: () => false,
        fromServiceWorker: () => false,
        frame: () => null,
        timing: () => null,
        json: () => Promise.resolve(null),
        text: () => Promise.resolve(''),
        buffer: () => Promise.resolve(Buffer.alloc(0)),
      } as any);
      vi.spyOn(mockPage, 'content').mockResolvedValueOnce('<html></html>');

      await adapter2.fetch('https://example.com', { isMainDocument: true });

      expect(mockPage.screenshot).toHaveBeenCalledWith({
        path: '/tmp/debug.png',
      });
    });

    it('should throw error when page.goto fails', async () => {
      vi.spyOn(mockPage, 'goto').mockResolvedValueOnce(null);

      await expect(adapter.fetch('https://example.com', { isMainDocument: true })).rejects.toThrow(
        'Failed to navigate'
      );
    });

    it('should return correct URL from page.url()', async () => {
      vi.spyOn(mockPage, 'url').mockReturnValue('https://example.com/final');
      vi.spyOn(mockPage, 'goto').mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        headers: () => ({}),
        url: () => 'https://example.com/final',
        remoteAddress: () => ({ ip: '127.0.0.1', port: 443 }),
        request: () => ({}),
        securityDetails: () => null,
        fromCache: () => false,
        fromServiceWorker: () => false,
        frame: () => null,
        timing: () => null,
        json: () => Promise.resolve(null),
        text: () => Promise.resolve(''),
        buffer: () => Promise.resolve(Buffer.alloc(0)),
      } as any);
      vi.spyOn(mockPage, 'content').mockResolvedValueOnce('<html></html>');

      const result = await adapter.fetch('https://example.com', { isMainDocument: true });

      expect(result.url).toBe('https://example.com/final');
    });
  });

  describe('fetch() - sub-resource', () => {
    it('should fetch CSS via HTTP with cookie forwarding when not main document', async () => {
      const cssContent = 'body { color: red; }';

      // Mock fetch globally
      const mockFetch = vi.fn().mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Map(Object.entries({ 'content-type': 'text/css' })),
        get headers() {
          return new Map(Object.entries({ 'content-type': 'text/css' }));
        },
        arrayBuffer: () => Promise.resolve(stringToArrayBuffer(cssContent)),
        url: 'https://cdn.example.com/style.css',
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await adapter.fetch('https://cdn.example.com/style.css', {});

      expect(result.status).toBe(200);
      expect(result.mime).toContain('text/css');
      expect(result.buffer.toString()).toBe(cssContent);
      expect(mockFetch).toHaveBeenCalled();

      // Verify cookies were forwarded
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe('https://cdn.example.com/style.css');
      expect(callArgs[1].headers.Cookie).toContain('session=abc123');
    });

    it('should inherit custom headers in sub-resource fetch', async () => {
      const adapter2 = new PuppeteerFetcherAdapter(mockPage, {
        customHeaders: { 'Authorization': 'Bearer token123' },
      });

      const mockFetch = vi.fn().mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Map(),
        arrayBuffer: () => Promise.resolve(stringToArrayBuffer('')),
        url: 'https://api.example.com/data',
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter2.fetch('https://api.example.com/data', {});

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers).toMatchObject({
        Authorization: 'Bearer token123',
      });
    });

    it('should use raw HTTP when executeJs is false for main document', async () => {
      const adapter2 = new PuppeteerFetcherAdapter(mockPage, {
        executeJs: false,
      });

      const htmlContent = '<html><body>Raw</body></html>';
      const mockFetch = vi.fn().mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Map(Object.entries({ 'content-type': 'text/html' })),
        arrayBuffer: () => Promise.resolve(stringToArrayBuffer(htmlContent)),
        url: 'https://example.com',
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await adapter2.fetch('https://example.com', { isMainDocument: true });

      expect(result.status).toBe(200);
      expect(result.mime).toBe('text/html');
      expect(result.buffer.toString()).toBe(htmlContent);
      // Should NOT have called page.goto
      expect(mockPage.goto).not.toHaveBeenCalled();
    });

    it('should fetch images as binary', async () => {
      const rawBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header

      const mockFetch = vi.fn().mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Map(Object.entries({ 'content-type': 'image/png' })),
        arrayBuffer: () => Promise.resolve(rawBytes.buffer),
        url: 'https://example.com/image.png',
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await adapter.fetch('https://example.com/image.png', {});

      expect(result.mime).toBe('image/png');
      expect(result.buffer).toEqual(Buffer.from(rawBytes));
    });
  });

  describe('fetch() - error handling', () => {
    it('should throw error with descriptive message', async () => {
      vi.spyOn(mockPage, 'goto').mockRejectedValueOnce(
        new Error('Network timeout')
      );

      await expect(adapter.fetch('https://example.com', { isMainDocument: true })).rejects.toThrow(
        'Puppeteer fetch failed for https://example.com'
      );
    });

    it('should handle non-error objects thrown', async () => {
      vi.spyOn(mockPage, 'goto').mockRejectedValueOnce('String error');

      await expect(adapter.fetch('https://example.com', { isMainDocument: true })).rejects.toThrow(
        'Puppeteer fetch failed'
      );
    });
  });

  describe('canAccess()', () => {
    it('should return true for accessible resource', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
      vi.stubGlobal('fetch', mockFetch);

      const accessible = await adapter.canAccess('https://example.com/api');

      expect(accessible).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api',
        expect.objectContaining({ method: 'HEAD' })
      );

      vi.unstubAllGlobals();
    });

    it('should return false for inaccessible resource', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
      });
      vi.stubGlobal('fetch', mockFetch);

      const accessible = await adapter.canAccess('https://example.com/missing');

      expect(accessible).toBe(false);

      vi.unstubAllGlobals();
    });

    it('should return false on network error', async () => {
      const mockFetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      const accessible = await adapter.canAccess('https://example.com');

      expect(accessible).toBe(false);

      vi.unstubAllGlobals();
    });

    it('should return false for server errors', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
      });
      vi.stubGlobal('fetch', mockFetch);

      const accessible = await adapter.canAccess('https://example.com/500');

      expect(accessible).toBe(false);

      vi.unstubAllGlobals();
    });
  });

  describe('getAuthContext()', () => {
    it('should return cookies from page', async () => {
      const authContext = await adapter.getAuthContext();

      expect(authContext.cookies).toEqual([
        { name: 'session', value: 'abc123' },
        { name: 'tracking', value: 'xyz789' },
      ]);
    });

    it('should return custom headers', async () => {
      const adapter2 = new PuppeteerFetcherAdapter(mockPage, {
        customHeaders: { 'X-Custom': 'value' },
      });

      const authContext = await adapter2.getAuthContext();

      expect(authContext.headers).toEqual({ 'X-Custom': 'value' });
    });

    it('should extract auth token from localStorage', async () => {
      vi.spyOn(mockPage, 'evaluate').mockResolvedValueOnce([
        { name: 'auth_token', value: 'Bearer token123' },
        { name: 'user_id', value: '12345' },
      ]);

      const authContext = await adapter.getAuthContext();

      expect(authContext.token).toBe('Bearer token123');
    });

    it('should handle empty cookies', async () => {
      vi.spyOn(mockPage, 'cookies').mockResolvedValueOnce([]);

      const authContext = await adapter.getAuthContext();

      expect(authContext.cookies).toEqual([]);
    });

    it('should handle localStorage access failure gracefully', async () => {
      vi.spyOn(mockPage, 'evaluate').mockRejectedValueOnce(
        new Error('localStorage not available')
      );

      const authContext = await adapter.getAuthContext();

      expect(authContext.token).toBeUndefined();
      expect(authContext.cookies).toBeDefined();
    });

    it('should find token by various naming conventions', async () => {
      vi.spyOn(mockPage, 'evaluate').mockResolvedValueOnce([
        { name: 'AUTH_TOKEN', value: 'token123' },
      ]);

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
      vi.spyOn(mockPage, 'isClosed').mockReturnValueOnce(false);

      await adapter.dispose();

      expect(mockPage.close).toHaveBeenCalled();
    });

    it('should not close already closed page', async () => {
      vi.spyOn(mockPage, 'isClosed').mockReturnValueOnce(true);

      await adapter.dispose();

      expect(mockPage.close).not.toHaveBeenCalled();
    });

    it('should handle errors silently', async () => {
      vi.spyOn(mockPage, 'close').mockRejectedValueOnce(
        new Error('Already closed')
      );

      // Should not throw
      await expect(adapter.dispose()).resolves.toBeUndefined();
    });

    it('should be idempotent', async () => {
      vi.spyOn(mockPage, 'isClosed').mockReturnValue(false);

      await adapter.dispose();
      // Second call
      vi.spyOn(mockPage, 'isClosed').mockReturnValue(true);
      await adapter.dispose();

      // close() should only be called once
      expect(mockPage.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete authenticated workflow', async () => {
      // Step 1: Get main document
      vi.spyOn(mockPage, 'goto').mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        headers: () => ({}),
        url: () => 'https://example.com',
        remoteAddress: () => ({ ip: '127.0.0.1', port: 443 }),
        request: () => ({}),
        securityDetails: () => null,
        fromCache: () => false,
        fromServiceWorker: () => false,
        frame: () => null,
        timing: () => null,
        json: () => Promise.resolve(null),
        text: () => Promise.resolve(''),
        buffer: () => Promise.resolve(Buffer.alloc(0)),
      } as any);
      vi.spyOn(mockPage, 'content').mockResolvedValueOnce('<html><body>Logged In</body></html>');

      const pageResult = await adapter.fetch('https://example.com', { isMainDocument: true });
      expect(pageResult.ok).toBe(true);

      // Step 2: Get sub-resource (CSS)
      const mockFetch = vi.fn().mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Map(Object.entries({ 'content-type': 'text/css' })),
        arrayBuffer: () => Buffer.from('body {}').buffer,
        url: 'https://example.com/style.css',
      });
      vi.stubGlobal('fetch', mockFetch);

      const cssResult = await adapter.fetch('https://example.com/style.css', {});
      expect(cssResult.ok).toBe(true);

      // Step 3: Check resource access
      const mockHeadFetch = vi.fn().mockResolvedValueOnce({ ok: true });
      vi.stubGlobal('fetch', mockHeadFetch);

      const accessible = await adapter.canAccess('https://example.com/api');
      expect(accessible).toBe(true);

      // Step 4: Get auth context
      vi.spyOn(mockPage, 'evaluate').mockResolvedValueOnce([
        { name: 'auth_token', value: 'Bearer valid' },
      ]);

      const authCtx = await adapter.getAuthContext();
      expect(authCtx.cookies).toBeDefined();
      expect(authCtx.token).toBe('Bearer valid');

      // Step 5: Cleanup
      vi.spyOn(mockPage, 'isClosed').mockReturnValue(false);
      await adapter.dispose();
      expect(mockPage.close).toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it('should work with Puppeteer adapter options', async () => {
      const adapter2 = new PuppeteerFetcherAdapter(mockPage, {
        waitForLoadState: 'load',
        executeJs: true,
        customHeaders: { 'Authorization': 'Bearer token' },
        debugScreenshot: '/tmp/screenshot.png',
        validateSSL: false,
      });

      vi.spyOn(mockPage, 'goto').mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        headers: () => ({}),
        url: () => 'https://example.com',
        remoteAddress: () => ({ ip: '127.0.0.1', port: 443 }),
        request: () => ({}),
        securityDetails: () => null,
        fromCache: () => false,
        fromServiceWorker: () => false,
        frame: () => null,
        timing: () => null,
        json: () => Promise.resolve(null),
        text: () => Promise.resolve(''),
        buffer: () => Promise.resolve(Buffer.alloc(0)),
      } as any);
      vi.spyOn(mockPage, 'content').mockResolvedValueOnce('<html></html>');

      await adapter2.fetch('https://example.com', { isMainDocument: true });

      // Verify options are used correctly
      expect(mockPage.goto).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ waitUntil: 'load' })
      );
      expect(mockPage.screenshot).toHaveBeenCalledWith({
        path: '/tmp/screenshot.png',
      });
    });
  });

  describe('edge cases', () => {
    it('should handle responses with missing content-type', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Map(),
        get headers() { return new Map(); },
        arrayBuffer: () => Buffer.from('data').buffer,
        url: 'https://example.com/unknown',
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await adapter.fetch('https://example.com/unknown', {});

      expect(result.mime).toBe('application/octet-stream');
      expect(result.isHtmlLike).toBe(false);

      vi.unstubAllGlobals();
    });

    it('should handle multiple adapter instances independently', async () => {
      const mockPage2 = createMockPage();
      const adapter2 = new PuppeteerFetcherAdapter(mockPage2);

      vi.spyOn(mockPage, 'goto').mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        headers: () => ({}),
        url: () => 'https://example.com',
        remoteAddress: () => ({ ip: '127.0.0.1', port: 443 }),
        request: () => ({}),
        securityDetails: () => null,
        fromCache: () => false,
        fromServiceWorker: () => false,
        frame: () => null,
        timing: () => null,
        json: () => Promise.resolve(null),
        text: () => Promise.resolve(''),
        buffer: () => Promise.resolve(Buffer.alloc(0)),
      } as any);
      vi.spyOn(mockPage, 'content').mockResolvedValueOnce('<html>1</html>');

      vi.spyOn(mockPage2, 'goto').mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        headers: () => ({}),
        url: () => 'https://example.com',
        remoteAddress: () => ({ ip: '127.0.0.1', port: 443 }),
        request: () => ({}),
        securityDetails: () => null,
        fromCache: () => false,
        fromServiceWorker: () => false,
        frame: () => null,
        timing: () => null,
        json: () => Promise.resolve(null),
        text: () => Promise.resolve(''),
        buffer: () => Promise.resolve(Buffer.alloc(0)),
      } as any);
      vi.spyOn(mockPage2, 'content').mockResolvedValueOnce('<html>2</html>');

      const result1 = await adapter.fetch('https://example.com', { isMainDocument: true });
      const result2 = await adapter2.fetch('https://example.com', { isMainDocument: true });

      expect(result1.buffer.toString()).toBe('<html>1</html>');
      expect(result2.buffer.toString()).toBe('<html>2</html>');
    });

    it('should handle HTTP fetch timeout', async () => {
      vi.spyOn(mockPage, 'cookies').mockResolvedValueOnce([]);

      const mockFetch = vi.fn().mockImplementationOnce(async () => {
        await new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AbortError')), 50)
        );
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        adapter.fetch('https://example.com/slow', { timeout: 10 })
      ).rejects.toThrow('Puppeteer fetch failed');

      vi.unstubAllGlobals();
    });

    it('should handle redirects in sub-resource fetch', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Map(Object.entries({ 'content-type': 'text/css' })),
        arrayBuffer: () => Buffer.from('body { color: red; }').buffer,
        url: 'https://cdn.example.com/style.final.css',
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await adapter.fetch('https://example.com/style.css', {});

      expect(result.url).toBe('https://cdn.example.com/style.final.css');
      expect(result.ok).toBe(true);

      vi.unstubAllGlobals();
    });

    it('should handle HTTP errors in sub-resource fetch', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        status: 404,
        ok: false,
        headers: new Map(Object.entries({ 'content-type': 'text/plain' })),
        arrayBuffer: () => Buffer.from('Not Found').buffer,
        url: 'https://example.com/missing.css',
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await adapter.fetch('https://example.com/missing.css', {});

      expect(result.ok).toBe(false);
      expect(result.status).toBe(404);

      vi.unstubAllGlobals();
    });
  });
});
