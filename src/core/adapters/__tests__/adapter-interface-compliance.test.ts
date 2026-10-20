/**
 * FetcherAdapter Interface Compliance (Phase 1)
 *
 * Verifies that all adapter implementations conform to the FetcherAdapter
 * interface contract:
 * - fetch() returns FetchResult with required fields
 * - canAccess() works correctly
 * - getAuthContext() returns AuthContext
 * - dispose() does not throw
 *
 * Scenarios covered:
 * - Developer uses HttpFetcherAdapter directly
 * - Developer creates a custom adapter implementing FetcherAdapter
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HttpFetcherAdapter } from '../http-fetcher-adapter.js';
import { startTestServer, stopTestServer, type TestServer } from '../../__tests__/integration/helpers/test-server.js';

describe('FetcherAdapter Interface Compliance — Phase 1', () => {
  const implementations = [
    { name: 'HttpFetcherAdapter', create: () => new HttpFetcherAdapter() },
  ];

  let testServer: TestServer;
  let TEST_URL: string;

  beforeAll(async () => {
    testServer = await startTestServer();
    TEST_URL = testServer.url;
  }, 30000);

  afterAll(async () => {
    await stopTestServer(testServer);
  });

  for (const { name, create } of implementations) {
    describe(`${name} — Interface Compliance`, () => {
      it('should implement fetch() method', () => {
        const adapter = create();
        expect(adapter.fetch).toBeDefined();
        expect(typeof adapter.fetch).toBe('function');
      });

      it('fetch() should return FetchResult with required fields', async () => {
        const adapter = create();
        const result = await adapter.fetch(TEST_URL, {
          timeout: 15000,
          referer: TEST_URL,
        });

        expect(result).toHaveProperty('buffer');
        expect(result).toHaveProperty('mime');
        expect(result).toHaveProperty('status');
        expect(result).toHaveProperty('ok');
        expect(result).toHaveProperty('isHtmlLike');
        expect(result.buffer).toBeInstanceOf(Buffer);
        expect(typeof result.mime).toBe('string');
        expect(typeof result.status).toBe('number');
        expect(typeof result.ok).toBe('boolean');
      });

      it('should handle timeout option', async () => {
        const adapter = create();
        await expect(
          adapter.fetch(TEST_URL, { timeout: 5000 })
        ).resolves.toBeDefined();
      });

      it('should implement canAccess() method', async () => {
        const adapter = create();
        expect(adapter.canAccess).toBeDefined();
        expect(typeof adapter.canAccess).toBe('function');

        const accessible = await adapter.canAccess(TEST_URL);
        expect(typeof accessible).toBe('boolean');
      });

      it('should implement getAuthContext() method', async () => {
        const adapter = create();
        expect(adapter.getAuthContext).toBeDefined();
        expect(typeof adapter.getAuthContext).toBe('function');

        const authCtx = await adapter.getAuthContext();
        expect(authCtx).toHaveProperty('cookies');
        expect(authCtx).toHaveProperty('headers');
      });

      it('should implement dispose() method without throwing', async () => {
        const adapter = create();
        expect(adapter.dispose).toBeDefined();
        expect(typeof adapter.dispose).toBe('function');

        await expect(adapter.dispose()).resolves.toBeUndefined();
      });

      it('fetch() should throw on unreachable URL (per FetcherAdapter interface contract)', async () => {
        const adapter = create();
        // Port 1 has no listener, so the connection is refused immediately.
        await expect(
          adapter.fetch('http://127.0.0.1:1/nonexistent', {
            timeout: 2000,
          })
        ).rejects.toThrow();
      });
    });
  }
});
