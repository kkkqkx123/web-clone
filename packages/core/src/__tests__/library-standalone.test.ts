/**
 * Library Standalone Usage (Phase 3)
 *
 * Verifies that the library's `snapshot()` function can be used independently
 * of the CLI — both with the default HTTP adapter and with a custom adapter.
 *
 * Scenarios covered:
 * 3.3  Use snapshot() with default HTTP adapter (no adapter argument)
 * 3.4  Use snapshot() with custom HttpFetcherAdapter
 * 3.5  Use snapshot() with URL string overload (CLI style)
 *
 * Note: The URL string overload (snapshot(url, opts)) does NOT accept a custom
 * adapter — use snapshot(options, adapter) instead when passing a custom adapter.
 *
 * These tests connect to real network (https://example.com).
 * Since example.com has no sub-resources, we validate result STRUCTURE, not asset counts.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, rmSync } from 'node:fs';

describe('Library Standalone Usage (Phase 3)', () => {
  const testDir = './test-standalone-output';

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should work with HTTP adapter by default (no adapter argument)', async () => {
    const { snapshot } = await import('../index.js');

    const result = await snapshot({
      url: 'https://example.com',
      output: testDir,
      mode: 'bundle',
      maxAssets: 10,
    });

    expect(result).toHaveProperty('sourceUrl', 'https://example.com');
    expect(result).toHaveProperty('html');
    expect(result).toHaveProperty('stats');
    expect(result).toHaveProperty('timestamp');
  });

  it('should accept custom HttpFetcherAdapter via options+adapter overload', async () => {
    const { snapshot } = await import('../index.js');
    const { HttpFetcherAdapter } = await import('../adapters/index.js');

    const adapter = new HttpFetcherAdapter();
    const result = await snapshot({
      url: 'https://example.com',
      output: testDir,
      mode: 'bundle',
      maxAssets: 10,
    }, adapter);

    expect(result).toHaveProperty('sourceUrl', 'https://example.com');
    expect(result).toHaveProperty('html');
    expect(result).toHaveProperty('timestamp');
  });

  it('should work with URL string overload (CLI style: snapshot(url, opts))', async () => {
    const { snapshot } = await import('../index.js');

    const result = await snapshot('https://example.com', {
      output: testDir,
      mode: 'bundle',
      maxAssets: 10,
    });

    expect(result).toHaveProperty('sourceUrl', 'https://example.com');
    expect(result).toHaveProperty('html');
    expect(result).toHaveProperty('timestamp');
  });
});
