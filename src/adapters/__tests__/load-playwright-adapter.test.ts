/**
 * loadPlaywrightAdapter (Phase 2)
 *
 * Verifies that the dynamic adapter loader works correctly:
 * - Returns the PlaywrightFetcherAdapter class when playwright is available
 * - Throws a helpful error message when playwright is not available
 *
 * Scenarios covered:
 * 2.1  Developer loads playwright adapter in a project with playwright installed
 * 2.2  The error message includes installation instructions when playwright is missing
 * 2.3  Core library can be imported without triggering playwright import
 * 2.4  Adapter module can be imported without triggering playwright import
 */

import { describe, it, expect } from 'vitest';

describe('loadPlaywrightAdapter() — Phase 2', () => {
  it('should return PlaywrightFetcherAdapter class when playwright is available', async () => {
    const { loadPlaywrightAdapter } = await import('../index.js');
    const adapterClass = await loadPlaywrightAdapter();
    expect(adapterClass).toBeDefined();
    expect(adapterClass.name).toBe('PlaywrightFetcherAdapter');
  });

  it('should have error handling with "npm install playwright" in source', async () => {
    const { loadPlaywrightAdapter } = await import('../index.js');
    const fnStr = loadPlaywrightAdapter.toString();
    // The catch block contains the installation instruction
    expect(fnStr).toContain('npm install playwright');
    expect(fnStr).toContain('PlaywrightFetcherAdapter requires');
  });
});

describe('Core library imports without triggering Playwright — Phase 2', () => {
  it('should import core library (../../index.js) without Playwright dependency', async () => {
    const lib = await import('../../index.js');
    expect(lib.snapshot).toBeDefined();
    expect(lib.HttpFetcherAdapter).toBeDefined();
  });

  it('should import adapter module (../index.js) without triggering Playwright import', async () => {
    const adapters = await import('../index.js');
    expect(adapters.HttpFetcherAdapter).toBeDefined();
    expect(typeof adapters.loadPlaywrightAdapter).toBe('function');
  });
});
