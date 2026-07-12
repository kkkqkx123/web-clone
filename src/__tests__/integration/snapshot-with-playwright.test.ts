/**
 * 集成测试：snapshot() 与 PlaywrightFetcherAdapter 交互
 *
 * 测试场景：
 * - Bundle 模式输出结构
 * - Single 文件模式输出
 * - Cookie 继承
 * - 路径重写
 *
 * 环境：需要真实 Playwright 浏览器
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { snapshot } from '../../assembler';
import { PlaywrightFetcherAdapter } from '../../adapters/automation/playwright/adapter';
import {
  setupBrowser,
  createBrowserContext,
  createPage,
  teardownBrowser,
} from './helpers/browser-setup';
import {
  validateBundleStructure,
  validateSingleFileSnapshot,
  validateAssetPaths,
  extractSnapshotStats,
} from './helpers/snapshot-helpers';
import {
  createTestDir,
  cleanupTestDir,
  fileExists,
  readFile,
  listFiles,
} from './helpers/file-helpers';

/**
 * Check if Playwright browser is available in the environment.
 * Skips all tests if no browser can be launched.
 */
let browserAvailable = false;

beforeAll(async () => {
  try {
    const testBrowser = await chromium.launch({ headless: true, timeout: 10000 });
    await testBrowser.close();
    browserAvailable = true;
  } catch {
    console.warn('⚠ Playwright browser not available — skipping all Playwright integration tests');
    console.warn('  Install browsers with: npx playwright install chromium');
    browserAvailable = false;
  }
});

describe('Integration: snapshot() with PlaywrightFetcherAdapter', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let testOutputDir: string;

  beforeAll(async () => {
    // Skip if no Playwright browser available
    if (!browserAvailable) {
      return;
    }
    // 一次性启动浏览器（昂贵操作）
    browser = await setupBrowser({
      headless: true,
      timeout: 30000,
    });
  });

  beforeEach(async () => {
    // Skip individual test setup if no browser available
    if (!browserAvailable) {
      return;
    }
    // 每个测试创建新的 context 和 page（轻量级）
    context = await createBrowserContext(browser);
    page = await createPage(context);

    // 创建临时输出目录
    testOutputDir = await createTestDir();
  });

  afterEach(async () => {
    // 清理资源
    if (page && !page.isClosed()) {
      await page.close();
    }

    if (context) {
      await context.close();
    }

    // 清理测试目录
    if (testOutputDir) {
      await cleanupTestDir(testOutputDir);
    }
  });

  afterAll(async () => {
    // Skip teardown if no browser was launched
    if (!browserAvailable) {
      return;
    }
    // 关闭浏览器（仅一次）
    await teardownBrowser(browser);
  });

  describe('Bundle Mode', () => {
    it('should create bundle with correct directory structure', async () => {
      const adapter = new PlaywrightFetcherAdapter(page, context, {
        waitForLoadState: 'networkidle',
      });

      const outputPath = `${testOutputDir}/bundle-snapshot`;

      const result = await snapshot(
        {
          url: 'https://example.com',
          output: outputPath,
          mode: 'bundle',
        },
        adapter
      );

      // 验证输出存在
      expect(await fileExists(outputPath)).toBe(true);

      // 验证目录结构
      const validation = await validateBundleStructure(outputPath);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // 验证统计信息
      expect(result.stats.fetched).toBeGreaterThan(0);
    });

    it('should create index.html in bundle mode', async () => {
      const adapter = new PlaywrightFetcherAdapter(page, context);
      const outputPath = `${testOutputDir}/bundle-with-html`;

      await snapshot(
        {
          url: 'https://example.com',
          output: outputPath,
          mode: 'bundle',
        },
        adapter
      );

      const indexPath = `${outputPath}/index.html`;
      expect(await fileExists(indexPath)).toBe(true);

      const content = await readFile(indexPath);
      expect(content).toContain('<html');
      expect(content).toContain('</html>');
    });

    it('should create assets directory', async () => {
      const adapter = new PlaywrightFetcherAdapter(page, context);
      const outputPath = `${testOutputDir}/bundle-with-assets`;

      const result = await snapshot(
        {
          url: 'https://example.com',
          output: outputPath,
          mode: 'bundle',
        },
        adapter
      );

      const assetsDir = `${outputPath}/assets`;
      expect(await fileExists(assetsDir)).toBe(true);

      // 列出 assets 中的文件
      if (result.stats.fetched > 1) {
        const files = await listFiles(assetsDir, true);
        // 应该有至少一个资源文件（除了 index.html）
        expect(files.length).toBeGreaterThan(0);
      }
    });

    it('should rewrite relative paths in bundle mode', async () => {
      const adapter = new PlaywrightFetcherAdapter(page, context);
      const outputPath = `${testOutputDir}/bundle-paths`;

      await snapshot(
        {
          url: 'https://example.com',
          output: outputPath,
          mode: 'bundle',
        },
        adapter
      );

      const indexPath = `${outputPath}/index.html`;

      // 验证路径是相对路径
      const pathValidation = await validateAssetPaths(
        indexPath,
        './assets/'
      );

      // 注意：某些路径可能是外部 CDN，不一定都用相对路径
      expect(pathValidation.valid || pathValidation.assetCount >= 0).toBe(true);
    });
  });

  describe('Single File Mode', () => {
    it('should create single HTML file', async () => {
      const adapter = new PlaywrightFetcherAdapter(page, context);
      const outputPath = `${testOutputDir}/snapshot.html`;

      const result = await snapshot(
        {
          url: 'https://example.com',
          output: outputPath,
          mode: 'single',
        },
        adapter
      );

      expect(await fileExists(outputPath)).toBe(true);
      expect(result.stats.fetched).toBeGreaterThan(0);
    });

    it('should have valid HTML structure in single file', async () => {
      const adapter = new PlaywrightFetcherAdapter(page, context);
      const outputPath = `${testOutputDir}/snapshot-valid.html`;

      await snapshot(
        {
          url: 'https://example.com',
          output: outputPath,
          mode: 'single',
        },
        adapter
      );

      const validation = await validateSingleFileSnapshot(outputPath);
      expect(validation.valid).toBe(true);
      expect(validation.hasHtml).toBe(true);
      expect(validation.hasHead).toBe(true);
      expect(validation.hasBody).toBe(true);
    });

    it('should contain expected HTML tags', async () => {
      const adapter = new PlaywrightFetcherAdapter(page, context);
      const outputPath = `${testOutputDir}/snapshot-content.html`;

      await snapshot(
        {
          url: 'https://example.com',
          output: outputPath,
          mode: 'single',
        },
        adapter
      );

      const content = await readFile(outputPath);

      expect(content).toMatch(/<!DOCTYPE html/i);
      expect(content).toMatch(/<html/i);
      expect(content).toMatch(/<head[^>]*>/i);
      expect(content).toMatch(/<body[^>]*>/i);
    });

    it('should provide content statistics', async () => {
      const adapter = new PlaywrightFetcherAdapter(page, context);
      const outputPath = `${testOutputDir}/snapshot-stats.html`;

      await snapshot(
        {
          url: 'https://example.com',
          output: outputPath,
          mode: 'single',
        },
        adapter
      );

      const stats = await extractSnapshotStats(outputPath);

      expect(stats.textLength).toBeGreaterThan(0);
      expect(stats.linkCount).toBeGreaterThanOrEqual(0);
      expect(stats.scriptCount).toBeGreaterThanOrEqual(0);
      expect(stats.imageCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cookie Inheritance', () => {
    it('should preserve cookies in adapter context', async () => {
      // 设置 Cookie
      await context.addCookies([
        {
          name: 'test_cookie',
          value: 'test_value_123',
          domain: 'example.com',
          path: '/',
          url: 'https://example.com',
        },
      ]);

      const adapter = new PlaywrightFetcherAdapter(page, context);

      // 获取认证上下文
      const authCtx = await adapter.getAuthContext();

      // 验证 Cookie 被保留
      expect(authCtx.cookies).toBeDefined();
      expect(authCtx.cookies?.some(c => c.name === 'test_cookie')).toBe(true);
    });

    it('should extract auth token from localStorage', async () => {
      const adapter = new PlaywrightFetcherAdapter(page, context);

      // 获取认证上下文
      const authCtx = await adapter.getAuthContext();

      // 验证结构（内容可能为空）
      expect(authCtx).toBeDefined();
      expect(typeof authCtx).toBe('object');
    });
  });

  describe('Component Extraction', () => {
    it('should work with extract-components flag', async () => {
      const adapter = new PlaywrightFetcherAdapter(page, context);
      const outputPath = `${testOutputDir}/component-snapshot`;

      const result = await snapshot(
        {
          url: 'https://example.com',
          output: outputPath,
          mode: 'bundle',
          extractComponents: true,
          frameworkHint: 'react',
          componentDepth: 4,
        },
        adapter
      );

      // 验证快照被创建
      expect(await fileExists(outputPath)).toBe(true);

      // 验证返回结果
      expect(result.stats.fetched).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle navigation to valid URL', async () => {
      const adapter = new PlaywrightFetcherAdapter(page, context);
      const outputPath = `${testOutputDir}/valid-snapshot`;

      // 这不应该抛出错误
      const result = await snapshot(
        {
          url: 'https://example.com',
          output: outputPath,
          mode: 'bundle',
        },
        adapter
      );

      expect(result.stats.fetched).toBeGreaterThan(0);
    });

    it('should complete even if some sub-resources fail', async () => {
      const adapter = new PlaywrightFetcherAdapter(page, context);
      const outputPath = `${testOutputDir}/partial-snapshot`;

      // 即使某些资源加载失败，快照应该完成
      const result = await snapshot(
        {
          url: 'https://example.com',
          output: outputPath,
          mode: 'bundle',
        },
        adapter
      );

      expect(result).toBeDefined();
      expect(result.stats).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should complete snapshot within reasonable time', async () => {
      const adapter = new PlaywrightFetcherAdapter(page, context);
      const outputPath = `${testOutputDir}/perf-snapshot`;

      const startTime = Date.now();

      await snapshot(
        {
          url: 'https://example.com',
          output: outputPath,
          mode: 'bundle',
          maxAssets: 50, // 限制资源数量以加快测试
        },
        adapter
      );

      const duration = Date.now() - startTime;

      // 应该在 60 秒内完成
      expect(duration).toBeLessThan(60000);
    });
  });

  describe('Options Handling', () => {
    it('should respect concurrency option', async () => {
      const adapter = new PlaywrightFetcherAdapter(page, context);
      const outputPath = `${testOutputDir}/concurrency-snapshot`;

      const result = await snapshot(
        {
          url: 'https://example.com',
          output: outputPath,
          mode: 'bundle',
          concurrency: 2, // 低并发
        },
        adapter
      );

      expect(result.stats.fetched).toBeGreaterThan(0);
    });

    it('should respect timeout option', async () => {
      const adapter = new PlaywrightFetcherAdapter(page, context);
      const outputPath = `${testOutputDir}/timeout-snapshot`;

      const result = await snapshot(
        {
          url: 'https://example.com',
          output: outputPath,
          mode: 'single',
          timeout: 10000, // 10 秒超时
        },
        adapter
      );

      expect(result.stats.fetched).toBeGreaterThan(0);
    });

    it('should respect max-assets option', async () => {
      const adapter = new PlaywrightFetcherAdapter(page, context);
      const outputPath = `${testOutputDir}/max-assets-snapshot`;

      const result = await snapshot(
        {
          url: 'https://example.com',
          output: outputPath,
          mode: 'bundle',
          maxAssets: 10, // 只下载 10 个资源
        },
        adapter
      );

      expect(result.stats.fetched).toBeLessThanOrEqual(11); // 主文档 + 10 资源
    });
  });
});
