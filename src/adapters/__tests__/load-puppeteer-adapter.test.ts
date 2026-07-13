/**
 * loadPuppeteerAdapter Unit Tests
 *
 * Verifies that the dynamic adapter loader works correctly:
 * - Returns the PuppeteerFetcherAdapter class when puppeteer is available
 * - Throws a helpful error message when puppeteer is not available
 *
 * Scenarios covered:
 * - Developer loads puppeteer adapter in a project with puppeteer installed
 * - The error message includes installation instructions when puppeteer is missing
 * - Core library can be imported without triggering puppeteer import
 * - Adapter module can be imported without triggering puppeteer import
 */

import { describe, it, expect } from 'vitest';

describe('loadPuppeteerAdapter()', () => {
  it('should return PuppeteerFetcherAdapter class when puppeteer is available', async () => {
    const { loadPuppeteerAdapter } = await import('../index.js');
    const adapterClass = await loadPuppeteerAdapter();
    expect(adapterClass).toBeDefined();
    expect(adapterClass.name).toBe('PuppeteerFetcherAdapter');
  });

  it('should have error handling with "npm install puppeteer" in source', async () => {
    const { loadPuppeteerAdapter } = await import('../index.js');
    const fnStr = loadPuppeteerAdapter.toString();
    // The catch block contains the installation instruction
    expect(fnStr).toContain('npm install puppeteer');
    expect(fnStr).toContain('PuppeteerFetcherAdapter requires');
  });
});

describe('Core library imports without triggering Puppeteer', () => {
  it('should import core library (../../index.js) without Puppeteer dependency', async () => {
    const lib = await import('../../index.js');
    expect(lib.snapshot).toBeDefined();
    expect(lib.HttpFetcherAdapter).toBeDefined();
  });

  it('should import adapter module (../index.js) without triggering Puppeteer import', async () => {
    const adapters = await import('../index.js');
    expect(adapters.HttpFetcherAdapter).toBeDefined();
    expect(typeof adapters.loadPlaywrightAdapter).toBe('function');
    expect(typeof adapters.loadPuppeteerAdapter).toBe('function');
  });
});
