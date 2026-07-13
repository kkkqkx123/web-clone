/**
 * CLI Hydration Injection (Phase 3)
 *
 * Verifies that the CLI-level Vue/Nuxt hydration injection works correctly:
 * - Only injects when Vue/Nuxt markers are present
 * - Does nothing for plain HTML pages
 * - Handles missing files gracefully
 *
 * Scenarios covered:
 * 3.2a  Vue/Nuxt page (has __nuxt or #app marker) → hydration script injected
 * 3.2b  Plain HTML page (no Vue markers) → no hydration script injected
 * 3.2c  Output file doesn't exist → silently skipped (no crash)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { SnapshotOptions } from '../types.js';

// Import the function directly from cli (now exported for testing)
import { injectVueHydrationForCli } from '../cli.js';

describe('CLI Hydration Injection (Phase 3)', () => {
  const testDir = './test-hydration-output';

  function makeOptions(mode: 'single' | 'bundle', outputPath: string): SnapshotOptions {
    return {
      url: 'https://example.com',
      output: outputPath,
      mode,
      maxAssets: 10,
      concurrency: 4,
      timeout: 15000,
      retryCount: 0,
      inline: true,
      pretty: false,
    };
  }

  beforeEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('should inject hydration script when __nuxt marker exists (bundle mode)', () => {
    const htmlContent = `<!DOCTYPE html>
<html>
<head></head>
<body>
  <div id="__nuxt">App content</div>
</body>
</html>`;

    const htmlPath = join(testDir, 'index.html');
    writeFileSync(htmlPath, htmlContent, 'utf-8');

    injectVueHydrationForCli(makeOptions('bundle', testDir));

    const modifiedHtml = readFileSync(htmlPath, 'utf-8');
    expect(modifiedHtml).toContain('Snapshot Hydration');
    expect(modifiedHtml).toContain('window.$nuxt');
  });

  it('should inject hydration script when #app marker exists (single mode)', () => {
    const htmlContent = `<!DOCTYPE html>
<html>
<head></head>
<body>
  <div id="app">App content</div>
</body>
</html>`;

    const htmlPath = join(testDir, 'snapshot.html');
    writeFileSync(htmlPath, htmlContent, 'utf-8');

    injectVueHydrationForCli(makeOptions('single', htmlPath));

    const modifiedHtml = readFileSync(htmlPath, 'utf-8');
    expect(modifiedHtml).toContain('Snapshot Hydration');
  });

  it('should NOT inject when no Vue/Nuxt markers present', () => {
    const plainHtml = `<!DOCTYPE html>
<html><head></head><body><p>Hello</p></body></html>`;

    const htmlPath = join(testDir, 'index.html');
    writeFileSync(htmlPath, plainHtml, 'utf-8');

    injectVueHydrationForCli(makeOptions('bundle', testDir));

    const modifiedHtml = readFileSync(htmlPath, 'utf-8');
    expect(modifiedHtml).not.toContain('Snapshot Hydration');
    // Content should be unchanged
    expect(modifiedHtml.trim()).toBe(plainHtml.trim());
  });

  it('should silently skip when HTML file does not exist', () => {
    // Should not throw
    expect(() => {
      injectVueHydrationForCli(makeOptions('bundle', './nonexistent-dir'));
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

    injectVueHydrationForCli(makeOptions('bundle', testDir));

    const modifiedHtml = readFileSync(htmlPath, 'utf-8');
    // The hydration script should appear before </body>
    const bodyCloseIndex = modifiedHtml.lastIndexOf('</body>');
    const scriptIndex = modifiedHtml.lastIndexOf('<script');
    expect(scriptIndex).toBeGreaterThan(0);
    expect(scriptIndex).toBeLessThan(bodyCloseIndex);
  });
});
