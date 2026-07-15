/**
 * CLI Hydration Injection (Phase 3)
 *
 * Verifies that the unified framework hydration injection works correctly:
 * - Only injects when framework markers are present
 * - Does nothing for plain HTML pages
 * - Handles missing files gracefully
 *
 * Scenarios covered:
 * 3.2a  Nuxt 2 page (#__nuxt marker) → hydration script injected
 * 3.2b  Nuxt 3 page (window.__NUXT__) → hydration script injected
 * 3.2c  Vue 3 page (createSSRApp in JS) → hydration script injected
 * 3.2d  Plain HTML page (no framework markers) → no hydration script injected
 * 3.2e  Output file doesn't exist → silently skipped (no crash)
 * 3.2f  Script injected before </body> tag
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { injectHydrationScript } from '@web-clone/core';

describe('CLI Hydration Injection (Phase 3)', () => {
  const testDir = './test-hydration-output';

  beforeEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('should inject hydration script for Nuxt 2 page (#__nuxt marker)', () => {
    // Nuxt 2: has #__nuxt but no window.__NUXT__, so detector returns nuxt2
    const htmlContent = `<!DOCTYPE html>
<html>
<head></head>
<body>
  <div id="__nuxt">App content</div>
</body>
</html>`;

    const htmlPath = join(testDir, 'index.html');
    writeFileSync(htmlPath, htmlContent, 'utf-8');

    injectHydrationScript({ htmlPath });

    const modifiedHtml = readFileSync(htmlPath, 'utf-8');
    expect(modifiedHtml).toContain('[Hydration]');
    expect(modifiedHtml).toContain('window.$nuxt');
  });

  it('should inject hydration script for Nuxt 3 page (window.__NUXT__)', () => {
    // Nuxt 3: has window.__NUXT__ in HTML
    const htmlContent = `<!DOCTYPE html>
<html>
<head></head>
<body>
  <div id="__nuxt">App content</div>
  <script>window.__NUXT__ = {}</script>
</body>
</html>`;

    const htmlPath = join(testDir, 'index.html');
    writeFileSync(htmlPath, htmlContent, 'utf-8');

    injectHydrationScript({ htmlPath });

    const modifiedHtml = readFileSync(htmlPath, 'utf-8');
    expect(modifiedHtml).toContain('[Hydration]');
    expect(modifiedHtml).toContain('Nuxt 3');
  });

  it('should inject hydration script for Vue 3 page (createSSRApp in JS)', () => {
    // Vue 3: #app + createSSRApp in JS contents
    const htmlContent = `<!DOCTYPE html>
<html>
<head></head>
<body>
  <div id="app">App content</div>
</body>
</html>`;

    const htmlPath = join(testDir, 'index.html');
    writeFileSync(htmlPath, htmlContent, 'utf-8');

    // Pass JS contents that include createSSRApp to trigger vue3 detection
    injectHydrationScript({
      htmlPath,
      jsContents: ['function createSSRApp() { /* Vue 3 SSR */ }'],
    });

    const modifiedHtml = readFileSync(htmlPath, 'utf-8');
    expect(modifiedHtml).toContain('[Hydration]');
    expect(modifiedHtml).toContain('Vue 3');
  });

  it('should NOT inject when no framework markers present', () => {
    const plainHtml = `<!DOCTYPE html>
<html><head></head><body><p>Hello</p></body></html>`;

    const htmlPath = join(testDir, 'index.html');
    writeFileSync(htmlPath, plainHtml, 'utf-8');

    injectHydrationScript({ htmlPath });

    const modifiedHtml = readFileSync(htmlPath, 'utf-8');
    expect(modifiedHtml).not.toContain('[Hydration]');
    // Content should be unchanged
    expect(modifiedHtml.trim()).toBe(plainHtml.trim());
  });

  it('should silently skip when HTML file does not exist', () => {
    // Should not throw
    expect(() => {
      injectHydrationScript({ htmlPath: './nonexistent-dir/index.html' });
    }).not.toThrow();
  });

  it('should inject hydration script before </body> tag', () => {
    const htmlContent = `<!DOCTYPE html>
<html>
<head></head>
<body>
  <div id="__nuxt">App content</div>
</body>
</html>`;

    const htmlPath = join(testDir, 'index.html');
    writeFileSync(htmlPath, htmlContent, 'utf-8');

    injectHydrationScript({ htmlPath });

    const modifiedHtml = readFileSync(htmlPath, 'utf-8');
    // The hydration script should appear before </body>
    const bodyCloseIndex = modifiedHtml.lastIndexOf('</body>');
    const scriptIndex = modifiedHtml.lastIndexOf('<script');
    expect(scriptIndex).toBeGreaterThan(0);
    expect(scriptIndex).toBeLessThan(bodyCloseIndex);
  });
});