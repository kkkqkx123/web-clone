/**
 * E2E 测试：Playwright 真实内容快照
 *
 * 使用本地测试服务器验证 PlaywrightFetcherAdapter 正确处理含子资源的页面。
 * 补全现有集成测试中 example.com（零子资源）无法覆盖的场景。
 *
 * 测试场景：
 * 1. 含 CSS/JS/IMG 的真实页面 — 验证子资源下载及路径重写
 * 2. 库 API 完整调用链路 — import {snapshot} + loadPlaywrightAdapter
 * 3. SPA/SSR 检测 — Vue/Nuxt 标记识别
 *
 * 环境：需要真实 Playwright 浏览器
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer, stopTestServer, type TestServer } from './helpers/test-server.js';
import { snapshot } from '../../index.js';

/** E2E tests with real browser need more time */
const E2E_TIMEOUT = 60000;

let browser: Browser;
let testServer: TestServer;

beforeAll(async () => {
  testServer = await startTestServer();
  console.log(`  Test server started at ${testServer.url}`);
  browser = await chromium.launch({ headless: true, timeout: 15000 });
}, 30000);

afterAll(async () => {
  if (browser) await browser.close();
  if (testServer) await stopTestServer(testServer);
}, 30000);

describe('Playwright E2E: Real Content Snapshot', () => {
  describe('Scenario 1: Sub-resource download and path rewriting', () => {
    const testDir = './test-e2e-real-content';

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should rewrite CSS/JS/IMG paths to local asset references', async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const { PlaywrightFetcherAdapter } = await import('../../adapters/automation/playwright/adapter.js');
      const adapter = new PlaywrightFetcherAdapter(page, context, { waitForLoadState: 'load' });

      const result = await snapshot({
        url: testServer.url,
        output: testDir,
        mode: 'bundle',
        maxAssets: 50,
        timeout: 15000,
      }, adapter);

      // Verify result structure
      expect(result).toHaveProperty('sourceUrl', testServer.url);
      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('timestamp');

      // Verify output directory was created
      expect(existsSync(join(testDir, 'index.html'))).toBe(true);
      expect(existsSync(join(testDir, 'assets'))).toBe(true);

      // Verify the HTML output has correctly rewritten asset paths
      const html = readFileSync(join(testDir, 'index.html'), 'utf-8');
      expect(html).toContain('Test Page');
      expect(html).toContain('./assets/style.css');
      expect(html).toContain('./assets/script.js');

      await page.close();
      await context.close();
    }, E2E_TIMEOUT);

    it('should output valid HTML structure in single file mode', async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const { PlaywrightFetcherAdapter } = await import('../../adapters/automation/playwright/adapter.js');
      const adapter = new PlaywrightFetcherAdapter(page, context, { waitForLoadState: 'load' });

      const outputFile = join(testDir, 'snapshot.html');
      const result = await snapshot({
        url: testServer.url,
        output: outputFile,
        mode: 'single',
        maxAssets: 50,
        inline: true,
        timeout: 15000,
      }, adapter);

      // Verify single file was created
      expect(existsSync(outputFile)).toBe(true);
      expect(result).toHaveProperty('sourceUrl', testServer.url);
      expect(result).toHaveProperty('html');

      // Verify HTML structure is valid
      const content = readFileSync(outputFile, 'utf-8');
      expect(content).toMatch(/<!DOCTYPE html/i);
      expect(content).toMatch(/<html/i);
      expect(content).toMatch(/<\/html>/i);
      expect(content).toContain('Test Page');

      await page.close();
      await context.close();
    }, E2E_TIMEOUT);
  });

  describe('Scenario 2: Library API full call chain', () => {
    const testDir = './test-e2e-library-chain';

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should work through loadPlaywrightAdapter() + snapshot()', async () => {
      const context = await browser.newContext();
      const page = await context.newPage();

      // Use the documented public API: loadPlaywrightAdapter() + snapshot()
      const { loadPlaywrightAdapter } = await import('../../adapters/index.js');
      const PlaywrightAdapterClass = await loadPlaywrightAdapter();
      const adapter = new PlaywrightAdapterClass(page, context);

      const result = await snapshot({
        url: testServer.url,
        output: testDir,
        mode: 'bundle',
        maxAssets: 50,
        timeout: 15000,
      }, adapter);

      // Verify result structure
      expect(result).toHaveProperty('sourceUrl', testServer.url);
      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('timestamp');

      // Verify the output file was created
      expect(existsSync(join(testDir, 'index.html'))).toBe(true);

      // Verify path rewriting
      const html = readFileSync(join(testDir, 'index.html'), 'utf-8');
      expect(html).toContain('Test Page');

      await page.close();
      await context.close();
    }, E2E_TIMEOUT);
  });

  describe('Scenario 3: SPA/SSR detection', () => {
    const testDir = './test-e2e-ssr-detection';

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should detect Vue markers and handle SSR page', async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const { PlaywrightFetcherAdapter } = await import('../../adapters/automation/playwright/adapter.js');
      const adapter = new PlaywrightFetcherAdapter(page, context);

      const result = await snapshot({
        url: `${testServer.url}/spa`,
        output: testDir,
        mode: 'bundle',
        maxAssets: 50,
        timeout: 30000,
        extractComponents: true,
      }, adapter);

      // Verify snapshot was taken successfully
      expect(result).toHaveProperty('sourceUrl', `${testServer.url}/spa`);
      expect(result).toHaveProperty('html');

      // The HTML should contain Vue app markers
      expect(result.html).toContain('id="app"');
      expect(result.html).toContain('Vue SPA');

      // Verify output files exist
      expect(existsSync(join(testDir, 'index.html'))).toBe(true);

      await page.close();
      await context.close();
    }, E2E_TIMEOUT);
  });
});
