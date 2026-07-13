/**
 * Library Entry Exports (Phase 1)
 *
 * Verifies that the public API surface of the library (`src/index.ts`) exports
 * all symbols correctly for consumers who import from 'web-clone'.
 *
 * Scenarios covered:
 * 1.1  Core snapshot function is exported and callable
 * 1.2  convertLocalSnapshot is exported
 * 1.3  HttpFetcherAdapter class is exported
 * 1.4  TypeScript types are accessible (runtime existence check)
 * 1.5  Utility function parseHtml is exported
 */

import { describe, it, expect } from 'vitest';

describe('Library Entry Exports (src/index.ts) — Phase 1', () => {
  it('should export snapshot function', async () => {
    const mod = await import('../index.js');
    expect(mod.snapshot).toBeDefined();
    expect(typeof mod.snapshot).toBe('function');
  });

  it('should export convertLocalSnapshot function', async () => {
    const mod = await import('../index.js');
    expect(mod.convertLocalSnapshot).toBeDefined();
    expect(typeof mod.convertLocalSnapshot).toBe('function');
  });

  it('should export HttpFetcherAdapter class', async () => {
    const mod = await import('../index.js');
    expect(mod.HttpFetcherAdapter).toBeDefined();
    expect(mod.HttpFetcherAdapter.name).toBe('HttpFetcherAdapter');
  });

  it('should export parseHtml utility function', async () => {
    const mod = await import('../index.js');
    expect(mod.parseHtml).toBeDefined();
    expect(typeof mod.parseHtml).toBe('function');
  });

  it('should export SnapshotResult type (runtime check on SnapshotResult is not possible, but the module loads without error)', async () => {
    // Type-only exports can't be verified at runtime.
    // This test ensures the module parses and loads cleanly.
    await expect(import('../index.js')).resolves.toBeDefined();
  });
});
