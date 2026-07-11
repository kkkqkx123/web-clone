/**
 * HTTP Adapter Unit Tests
 * 
 * Tests all methods and boundaries of the HttpFetcherAdapter.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpFetcherAdapter } from '../http-fetcher-adapter.js';
import * as fetcherModule from '../../fetcher.js';

// Mock fetchWithTimeout function
vi.mock('../../fetcher.js', () => ({
  fetchWithTimeout: vi.fn(),
}));

describe('HttpFetcherAdapter', () => {
  let adapter: HttpFetcherAdapter;

  beforeEach(() => {
    adapter = new HttpFetcherAdapter();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('fetch()', () => {
    it('should fetch a successful HTML response', async () => {
      const htmlContent = '<html><body>Test</body></html>';
      const buffer = Buffer.from(htmlContent);

      vi.mocked(fetcherModule.fetchWithTimeout).mockResolvedValueOnce({
        buffer,
        mime: 'text/html; charset=utf-8',
        status: 200,
        ok: true,
        isHtmlLike: true,
      });

      const result = await adapter.fetch('https://example.com', { timeout: 5000 });

      expect(result.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.mime).toBe('text/html; charset=utf-8');
      expect(result.isHtmlLike).toBe(true);
      expect(result.buffer).toEqual(buffer);
      expect(result.url).toBe('https://example.com');
    });

    it('should fetch CSS with correct MIME type', async () => {
      const cssContent = 'body { color: red; }';
      const buffer = Buffer.from(cssContent);

      vi.mocked(fetcherModule.fetchWithTimeout).mockResolvedValueOnce({
        buffer,
        mime: 'text/css',
        status: 200,
        ok: true,
        isHtmlLike: false,
      });

      const result = await adapter.fetch('https://example.com/style.css', {});

      expect(result.mime).toBe('text/css');
      expect(result.isHtmlLike).toBe(false);
    });

    it('should fetch JS with correct MIME type', async () => {
      const jsContent = 'console.log("hello");';
      const buffer = Buffer.from(jsContent);

      vi.mocked(fetcherModule.fetchWithTimeout).mockResolvedValueOnce({
        buffer,
        mime: 'application/javascript',
        status: 200,
        ok: true,
        isHtmlLike: false,
      });

      const result = await adapter.fetch('https://example.com/script.js', {});

      expect(result.mime).toBe('application/javascript');
    });

    it('should handle 404 responses', async () => {
      const buffer = Buffer.from('Not Found');

      vi.mocked(fetcherModule.fetchWithTimeout).mockResolvedValueOnce({
        buffer,
        mime: 'text/html',
        status: 404,
        ok: false,
        isHtmlLike: false,
      });

      const result = await adapter.fetch('https://example.com/missing', {});

      expect(result.status).toBe(404);
      expect(result.ok).toBe(false);
    });

    it('should pass timeout option to fetchWithTimeout', async () => {
      vi.mocked(fetcherModule.fetchWithTimeout).mockResolvedValueOnce({
        buffer: Buffer.from(''),
        mime: 'text/plain',
        status: 200,
        ok: true,
        isHtmlLike: false,
      });

      await adapter.fetch('https://example.com', { timeout: 30000 });

      expect(fetcherModule.fetchWithTimeout).toHaveBeenCalledWith(
        'https://example.com',
        30000,
        undefined,
        undefined
      );
    });

    it('should use default timeout when not provided', async () => {
      vi.mocked(fetcherModule.fetchWithTimeout).mockResolvedValueOnce({
        buffer: Buffer.from(''),
        mime: 'text/plain',
        status: 200,
        ok: true,
        isHtmlLike: false,
      });

      await adapter.fetch('https://example.com', {});

      expect(fetcherModule.fetchWithTimeout).toHaveBeenCalledWith(
        'https://example.com',
        15000,
        undefined,
        undefined
      );
    });

    it('should pass referer to fetchWithTimeout', async () => {
      vi.mocked(fetcherModule.fetchWithTimeout).mockResolvedValueOnce({
        buffer: Buffer.from(''),
        mime: 'text/plain',
        status: 200,
        ok: true,
        isHtmlLike: false,
      });

      await adapter.fetch('https://example.com/page', {
        referer: 'https://google.com',
      });

      expect(fetcherModule.fetchWithTimeout).toHaveBeenCalledWith(
        'https://example.com/page',
        15000,
        'https://google.com',
        undefined
      );
    });

    it('should pass maxSize to fetchWithTimeout', async () => {
      vi.mocked(fetcherModule.fetchWithTimeout).mockResolvedValueOnce({
        buffer: Buffer.from(''),
        mime: 'text/plain',
        status: 200,
        ok: true,
        isHtmlLike: false,
      });

      await adapter.fetch('https://example.com', { maxSize: 50 * 1024 * 1024 });

      expect(fetcherModule.fetchWithTimeout).toHaveBeenCalledWith(
        'https://example.com',
        15000,
        undefined,
        50 * 1024 * 1024
      );
    });

    it('should throw error from fetchWithTimeout', async () => {
      const error = new Error('Network timeout');
      vi.mocked(fetcherModule.fetchWithTimeout).mockRejectedValueOnce(error);

      await expect(adapter.fetch('https://example.com', {})).rejects.toThrow(
        'Network timeout'
      );
    });

    it('should fetch binary content (images)', async () => {
      const imageBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header

      vi.mocked(fetcherModule.fetchWithTimeout).mockResolvedValueOnce({
        buffer: imageBuffer,
        mime: 'image/png',
        status: 200,
        ok: true,
        isHtmlLike: false,
      });

      const result = await adapter.fetch('https://example.com/image.png', {});

      expect(result.mime).toBe('image/png');
      expect(result.buffer).toEqual(imageBuffer);
    });
  });

  describe('canAccess()', () => {
    it('should return true for accessible resource', async () => {
      vi.mocked(fetcherModule.fetchWithTimeout).mockResolvedValueOnce({
        buffer: Buffer.from(''),
        mime: 'text/html',
        status: 200,
        ok: true,
        isHtmlLike: false,
      });

      const accessible = await adapter.canAccess('https://example.com');

      expect(accessible).toBe(true);
      expect(fetcherModule.fetchWithTimeout).toHaveBeenCalledWith(
        'https://example.com',
        5000,
        undefined,
        undefined
      );
    });

    it('should return false for inaccessible resource', async () => {
      vi.mocked(fetcherModule.fetchWithTimeout).mockResolvedValueOnce({
        buffer: Buffer.from(''),
        mime: 'text/html',
        status: 404,
        ok: false,
        isHtmlLike: false,
      });

      const accessible = await adapter.canAccess('https://example.com/missing');

      expect(accessible).toBe(false);
    });

    it('should return false on network error', async () => {
      vi.mocked(fetcherModule.fetchWithTimeout).mockRejectedValueOnce(
        new Error('Network error')
      );

      const accessible = await adapter.canAccess('https://example.com');

      expect(accessible).toBe(false);
    });

    it('should use 5 second timeout for canAccess', async () => {
      vi.mocked(fetcherModule.fetchWithTimeout).mockResolvedValueOnce({
        buffer: Buffer.from(''),
        mime: 'text/html',
        status: 200,
        ok: true,
        isHtmlLike: false,
      });

      await adapter.canAccess('https://example.com');

      expect(fetcherModule.fetchWithTimeout).toHaveBeenCalledWith(
        'https://example.com',
        5000,
        undefined,
        undefined
      );
    });

    it('should return false for server errors', async () => {
      vi.mocked(fetcherModule.fetchWithTimeout).mockResolvedValueOnce({
        buffer: Buffer.from(''),
        mime: 'text/html',
        status: 500,
        ok: false,
        isHtmlLike: false,
      });

      const accessible = await adapter.canAccess('https://example.com');

      expect(accessible).toBe(false);
    });
  });

  describe('getAuthContext()', () => {
    it('should return empty auth context', async () => {
      const authContext = await adapter.getAuthContext();

      expect(authContext.cookies).toEqual([]);
      expect(authContext.headers).toEqual({});
      expect(authContext.token).toBeUndefined();
    });

    it('should always return same empty context', async () => {
      const ctx1 = await adapter.getAuthContext();
      const ctx2 = await adapter.getAuthContext();

      expect(ctx1).toEqual(ctx2);
    });
  });

  describe('dispose()', () => {
    it('should complete without errors', async () => {
      await expect(adapter.dispose()).resolves.toBeUndefined();
    });

    it('should be idempotent', async () => {
      await adapter.dispose();
      await adapter.dispose();
      await adapter.dispose();
      // No errors thrown
    });
  });

  describe('integration', () => {
    it('should handle complete workflow: fetch -> check access -> cleanup', async () => {
      vi.mocked(fetcherModule.fetchWithTimeout).mockResolvedValue({
        buffer: Buffer.from('<html></html>'),
        mime: 'text/html',
        status: 200,
        ok: true,
        isHtmlLike: true,
      });

      // Fetch resource
      const result = await adapter.fetch('https://example.com', { timeout: 10000 });
      expect(result.ok).toBe(true);

      // Check access
      const accessible = await adapter.canAccess('https://example.com');
      expect(accessible).toBe(true);

      // Get auth context
      const authCtx = await adapter.getAuthContext();
      expect(authCtx).toBeDefined();

      // Cleanup
      await adapter.dispose();
    });
  });
});
