/**
 * SPA 抓取能力 E2E 测试
 *
 * 验证 web-clone 对真实 SPA/SSR 框架应用的抓取和检测能力。
 * 使用预构建的 fixture 产物，无需安装框架构建工具。
 *
 * 框架检测使用信号层级（Signal Tier）替代连续置信度：
 *   definitive > strong > moderate > weak > none
 *
 * 运行方式：
 *   pnpm test:e2e
 *   或
 *   npx vitest run --config tests/e2e/vitest.config.ts
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { chromium } from 'playwright';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFixtureServer, type FixtureServer } from './helpers/fixture-server.js';
import { runCrawl, type CrawlResult } from './helpers/spider-runner.js';
import {
  assertBundleStructure,
  assertSingleFileMode,
  assertValidHtml,
  assertContentCaptured,
  assertFrameworkDetection,
  assertSpaHydrationDetected,
  assertSubResourcesDownloaded,
  assertAllCrawlsSuccessful,
  generateResultsSummary,
} from './helpers/assertion-utils.js';
import type { Browser, BrowserContext, Page } from 'playwright';

// ============================================================
// 全局测试环境
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// __dirname = tests/e2e/ (测试文件所在目录)
const BUILDS_DIR = join(__dirname, 'builds');
// 所有测试临时输出统一收敛到仓库根目录的 __tests__/outputs/
// （tests/e2e/ → 上 2 层为仓库根）
const OUTPUTS_DIR = join(__dirname, '../../__tests__/outputs');

let server: FixtureServer;
let browser: Browser;
let allResults: CrawlResult[] = [];

/**
 * 所有已构建的框架 fixture 列表。
 * 新添加的框架需要在此注册。
 * `minTier` 是该框架在 E2E 测试中预期达到的最低信号层级。
 */
const FIXTURES = [
  {
    name: 'vue3-spa',
    expectedFramework: 'vue3',
    minTier: 'strong',
    description: 'Vue 3 SPA (Vite)',
  },
  {
    name: 'react18-spa',
    expectedFramework: 'react18',
    // Phase 3 upgrades DOM heuristic ('weak') to 'moderate' when React fiber nodes are found.
    // Production builds lack __REACT_DEVTOOLS_GLOBAL_HOOK__, so 'weak' is the Phase 1 tier.
    minTier: 'moderate',
    description: 'React 18 SPA (Vite)',
  },
  {
    name: 'angular-spa',
    expectedFramework: 'angular',
    // Production builds have _nghost-* / _ngcontent-* attributes → moderate tier.
    minTier: 'moderate',
    description: 'Angular SPA',
  },
  {
    name: 'sveltekit-ssr',
    expectedFramework: 'sveltekit',
    minTier: 'definitive',
    description: 'SvelteKit SSR',
  },
  {
    name: 'nextjs-ssr',
    expectedFramework: 'nextjs',
    minTier: 'definitive',
    description: 'Next.js SSR',
  },
  {
    name: 'nuxt3-ssr',
    expectedFramework: 'nuxt3',
    minTier: 'definitive',
    description: 'Nuxt 3 SSR',
  },
  {
    name: 'vitepress-ssr',
    expectedFramework: 'vitepress',
    minTier: 'strong',
    description: 'VitePress SSR',
  },
  {
    name: 'vue2-spa',
    expectedFramework: 'vue2',
    minTier: 'moderate',
    description: 'Vue 2 SPA',
  },
  {
    name: 'astro-ssr',
    expectedFramework: 'astro',
    minTier: 'moderate',
    description: 'Astro SSR',
  },
];

// ============================================================
// 测试生命周期
// ============================================================

beforeAll(async () => {
  // 启动 fixture HTTP 服务器
  console.log(`BUILDS_DIR resolved to: ${BUILDS_DIR}`);
  console.log(`BUILDS_DIR exists: ${existsSync(BUILDS_DIR)}`);
  server = await startFixtureServer(BUILDS_DIR);
  console.log(`Fixture server started on port ${server.port}`);
  console.log(`vue3-spa URL: ${server.getFixtureUrl('vue3-spa')}`);

  // 启动 Playwright 浏览器
  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  // 创建输出目录
  mkdirSync(OUTPUTS_DIR, { recursive: true });
}, 90000);

afterAll(async () => {
  // 保存汇总报告
  const resultsPath = join(OUTPUTS_DIR, 'results.json');
  writeFileSync(resultsPath, JSON.stringify(allResults, null, 2), 'utf-8');
  console.log(`Results written to ${resultsPath}`);

  // 打印汇总
  if (allResults.length > 0) {
    generateResultsSummary(allResults);
  }

  // 清理
  if (server) await server.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
}, 30000);

// ============================================================
// 辅助函数
// ============================================================

/**
 * 为指定 fixture 执行一次完整的爬取测试。
 */
async function crawlFixture(
  fixtureName: string,
  expectedFramework: string
): Promise<CrawlResult> {
  const url = server.getFixtureUrl(fixtureName);
  const outputDir = join(OUTPUTS_DIR, fixtureName);

  // 每个测试使用独立的 context 和 page，避免 cookie/状态残留
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    page = await context.newPage();

    const result = await runCrawl(page, context, {
      url,
      outputDir,
      expectedFramework,
      timeout: 60000,
      mode: 'bundle',
    });

    if (result.success) {
      console.log(`[OK] ${fixtureName}: detected ${result.spaDetection?.framework} (tier: ${result.spaDetection?.tier})`);
    } else {
      console.log(`[FAIL] ${fixtureName}: ${result.error}`);
    }

    return result;
  } finally {
    if (page && !page.isClosed()) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
  }
}

/**
 * 为指定 fixture 执行 single-file 模式的爬取测试。
 * single-file 模式将所有资源内联到单个 HTML 文件中。
 */
async function crawlFixtureSingle(
  fixtureName: string
): Promise<CrawlResult> {
  const url = server.getFixtureUrl(fixtureName);
  // single-file 模式的 output 必须是文件路径
  const outputFile = join(OUTPUTS_DIR, `${fixtureName}-single.html`);
  const outputDir = join(OUTPUTS_DIR, fixtureName);

  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    page = await context.newPage();

    const result = await runCrawl(page, context, {
      url,
      outputDir: outputFile,  // single-file: output 是文件路径
      expectedFramework: null,
      timeout: 60000,
      mode: 'single',
    });

    if (result.success) {
      console.log(`[OK] ${fixtureName} (single): ${result.stats?.totalBytes} bytes`);
    } else {
      console.log(`[FAIL] ${fixtureName} (single): ${result.error}`);
    }

    return result;
  } finally {
    if (page && !page.isClosed()) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
  }
}

// ============================================================
// 测试组：各框架 E2E
// ============================================================

describe('SPA 抓取 E2E', () => {
  // ---- Vue 3 SPA ----
  describe('Vue 3 SPA', () => {
    let result: CrawlResult;

    beforeAll(async () => {
      result = await crawlFixture('vue3-spa', 'vue3');
      allResults.push(result);
    }, 90000);

    it('应正确检测框架为 vue3 (tier >= strong)', () => {
      assertFrameworkDetection(result, 'vue3', 'strong');
    });

    it('应捕获完整的 hydrated DOM 内容', () => {
      const htmlPath = join(result.outputDir, 'index.html');
      assertValidHtml(htmlPath);
      assertContentCaptured(htmlPath);
    });

    it('应有 SPA 水合检测结果', () => {
      assertSpaHydrationDetected(result);
    });

    it('应输出有效的 bundle 结构', () => {
      assertBundleStructure(result.outputDir);
      assertSubResourcesDownloaded(result.outputDir);
    });
  });

  // ---- React 18 SPA ----
  describe('React 18 SPA', () => {
    let result: CrawlResult;

    beforeAll(async () => {
      result = await crawlFixture('react18-spa', 'react18');
      allResults.push(result);
    }, 90000);

    it('应正确检测框架为 react18 (tier >= moderate)', () => {
      // Production builds lack __REACT_DEVTOOLS_GLOBAL_HOOK__, so Phase 1 is 'weak'.
      // Phase 3 finds React fiber nodes (__reactFiber$) and upgrades to 'moderate'.
      assertFrameworkDetection(result, 'react18', 'moderate');
    });

    it('应捕获完整的 hydrated DOM 内容', () => {
      const htmlPath = join(result.outputDir, 'index.html');
      assertValidHtml(htmlPath);
      assertContentCaptured(htmlPath);
    });

    it('应有 SPA 水合检测结果', () => {
      assertSpaHydrationDetected(result);
    });

    it('应输出有效的 bundle 结构', () => {
      assertBundleStructure(result.outputDir);
      assertSubResourcesDownloaded(result.outputDir);
    });
  });

  // ---- Angular SPA ----
  describe('Angular SPA', () => {
    let result: CrawlResult;

    beforeAll(async () => {
      result = await crawlFixture('angular-spa', 'angular');
      allResults.push(result);
    }, 90000);

    it('应正确检测框架为 angular (tier >= moderate)', () => {
      // Production build: _nghost-* / _ngcontent-* attributes → moderate tier
      assertFrameworkDetection(result, 'angular', 'moderate');
    });

    it('应捕获完整的 hydrated DOM 内容', () => {
      const htmlPath = join(result.outputDir, 'index.html');
      assertValidHtml(htmlPath);
      assertContentCaptured(htmlPath);
    });

    it('应有 SPA 水合检测结果', () => {
      assertSpaHydrationDetected(result);
    });

    it('应输出有效的 bundle 结构', () => {
      assertBundleStructure(result.outputDir);
      assertSubResourcesDownloaded(result.outputDir);
    });
  });

  // ---- SvelteKit SSR ----
  describe('SvelteKit SSR', () => {
    let result: CrawlResult;

    beforeAll(async () => {
      result = await crawlFixture('sveltekit-ssr', 'sveltekit');
      allResults.push(result);
    }, 90000);

    it('应正确检测框架为 sveltekit (tier >= definitive)', () => {
      assertFrameworkDetection(result, 'sveltekit', 'definitive');
    });

    it('应捕获完整的 hydrated DOM 内容', () => {
      const htmlPath = join(result.outputDir, 'index.html');
      assertValidHtml(htmlPath);
      assertContentCaptured(htmlPath);
    });

    it('应有 SPA 水合检测结果', () => {
      assertSpaHydrationDetected(result);
    });

    it('应输出有效的 bundle 结构', () => {
      assertBundleStructure(result.outputDir);
      assertSubResourcesDownloaded(result.outputDir);
    });
  });

  // ---- Next.js SSR ----
  describe('Next.js SSR', () => {
    let result: CrawlResult;

    beforeAll(async () => {
      result = await crawlFixture('nextjs-ssr', 'nextjs');
      allResults.push(result);
    }, 90000);

    it('应正确检测框架为 nextjs (tier >= definitive)', () => {
      assertFrameworkDetection(result, 'nextjs', 'definitive');
    });

    it('应捕获完整的 hydrated DOM 内容', () => {
      const htmlPath = join(result.outputDir, 'index.html');
      assertValidHtml(htmlPath);
      assertContentCaptured(htmlPath);
    });

    it('应有 SPA 水合检测结果', () => {
      assertSpaHydrationDetected(result);
    });

    it('应输出有效的 bundle 结构', () => {
      assertBundleStructure(result.outputDir);
      assertSubResourcesDownloaded(result.outputDir);
    });
  });

  // ---- Nuxt 3 SSR ----
  describe('Nuxt 3 SSR', () => {
    let result: CrawlResult;

    beforeAll(async () => {
      result = await crawlFixture('nuxt3-ssr', 'nuxt3');
      allResults.push(result);
    }, 90000);

    it('应正确检测框架为 nuxt3 (tier >= definitive)', () => {
      assertFrameworkDetection(result, 'nuxt3', 'definitive');
    });

    it('应捕获完整的 hydrated DOM 内容', () => {
      const htmlPath = join(result.outputDir, 'index.html');
      assertValidHtml(htmlPath);
      assertContentCaptured(htmlPath);
    });

    it('应有 SPA 水合检测结果', () => {
      assertSpaHydrationDetected(result);
    });

    it('应输出有效的 bundle 结构', () => {
      assertBundleStructure(result.outputDir);
      assertSubResourcesDownloaded(result.outputDir);
    });
  });

  // ---- VitePress SSR ----
  describe('VitePress SSR', () => {
    let result: CrawlResult;

    beforeAll(async () => {
      result = await crawlFixture('vitepress-ssr', 'vitepress');
      allResults.push(result);
    }, 90000);

    it('应正确检测框架为 vitepress (tier >= strong)', () => {
      assertFrameworkDetection(result, 'vitepress', 'strong');
    });

    it('应捕获完整的 hydrated DOM 内容', () => {
      const htmlPath = join(result.outputDir, 'index.html');
      assertValidHtml(htmlPath);
      assertContentCaptured(htmlPath);
    });

    it('应有 SPA 水合检测结果', () => {
      assertSpaHydrationDetected(result);
    });

    it('应输出有效的 bundle 结构', () => {
      assertBundleStructure(result.outputDir);
      assertSubResourcesDownloaded(result.outputDir);
    });
  });

  // ---- Vue 2 SPA ----
  describe('Vue 2 SPA', () => {
    let result: CrawlResult;

    beforeAll(async () => {
      result = await crawlFixture('vue2-spa', 'vue2');
      allResults.push(result);
    }, 90000);

    it('应正确检测框架为 vue2 (tier >= moderate)', () => {
      assertFrameworkDetection(result, 'vue2', 'moderate');
    });

    it('应捕获完整的 hydrated DOM 内容', () => {
      const htmlPath = join(result.outputDir, 'index.html');
      assertValidHtml(htmlPath);
      assertContentCaptured(htmlPath);
    });

    it('应有 SPA 水合检测结果', () => {
      assertSpaHydrationDetected(result);
    });

    it('应输出有效的 bundle 结构', () => {
      assertBundleStructure(result.outputDir);
      assertSubResourcesDownloaded(result.outputDir);
    });
  });

  // ---- Astro SSR ----
  describe('Astro SSR', () => {
    let result: CrawlResult;

    beforeAll(async () => {
      result = await crawlFixture('astro-ssr', 'astro');
      allResults.push(result);
    }, 90000);

    it('应正确检测框架为 astro (tier >= moderate)', () => {
      assertFrameworkDetection(result, 'astro', 'moderate');
    });

    it('应捕获完整的 hydrated DOM 内容', () => {
      const htmlPath = join(result.outputDir, 'index.html');
      assertValidHtml(htmlPath);
      assertContentCaptured(htmlPath);
    });

    it('应有 SPA 水合检测结果', () => {
      assertSpaHydrationDetected(result);
    });

    it('应输出有效的 bundle 结构', () => {
      assertBundleStructure(result.outputDir);
      assertSubResourcesDownloaded(result.outputDir);
    });
  });

  // ---- 汇总报告 ----
  describe('汇总报告', () => {
    it('所有框架抓取应成功', () => {
      expect(allResults.length, '应有全部 9 个框架的测试结果').toBe(9);
      assertAllCrawlsSuccessful(allResults);
    });

    it('结果摘要应生成到控制台', () => {
      const summary = generateResultsSummary(allResults);
      expect(summary, '应生成汇总文本').toBeTruthy();
    });
  });
});

// ============================================================
// 测试组：Single-file 模式
// ============================================================

describe('Single-file 模式 E2E', () => {
  // 覆盖所有框架：SSR 框架（Nuxt/Next/SvelteKit）有更多内联内容，
  // 纯 SPA 框架（Vue3/React18/Angular）验证 JS 驱动的页面在内联模式下的资源处理
  const SINGLE_FIXTURES = [
    'vue3-spa',
    'react18-spa',
    'angular-spa',
    'sveltekit-ssr',
    'nextjs-ssr',
    'nuxt3-ssr',
    'vitepress-ssr',
    'vue2-spa',
    'astro-ssr',
  ];

  for (const fixtureName of SINGLE_FIXTURES) {
    describe(`${fixtureName} (single-file)`, () => {
      let result: CrawlResult;

      beforeAll(async () => {
        result = await crawlFixtureSingle(fixtureName);
      }, 90000);

      it('应成功生成 single-file 快照', () => {
        expect(result.success, `single-file 爬取应成功: ${result.error}`).toBe(true);
      });

      it('应输出有效的 single-file HTML', () => {
        const htmlPath = result.outputDir;
        assertValidHtml(htmlPath);
      });

      it('CSS/JS 应被内联到单一 HTML', () => {
        assertSingleFileMode(result.outputDir);
      });

      it('应有 SPA 水合检测结果', () => {
        if (result.success) {
          assertSpaHydrationDetected(result);
        }
      });
    });
  }
});

// ============================================================
// 测试组：错误处理
// ============================================================

describe('错误处理 E2E', () => {
  it('访问不存在的 URL（404）应返回 success=false', async () => {
    const invalidUrl = `http://127.0.0.1:${server.port}/nonexistent-fixture/`;
    const outputDir = join(OUTPUTS_DIR, 'error-404');

    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      page = await context.newPage();

      const result = await runCrawl(page, context, {
        url: invalidUrl,
        outputDir,
        expectedFramework: null,
        timeout: 30000,
        mode: 'bundle',
      });

      expect(result.success, '404 页面应返回失败').toBe(false);
      expect(result.error, '错误信息应包含 HTTP 状态码').toMatch(/HTTP\s+404/i);
    } finally {
      if (page && !page.isClosed()) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
    }
  }, 60000);

  it('访问空 URL 应返回 success=false', async () => {
    const outputDir = join(OUTPUTS_DIR, 'error-empty');

    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      page = await context.newPage();

      const result = await runCrawl(page, context, {
        url: `http://127.0.0.1:${server.port}/`,
        outputDir,
        expectedFramework: null,
        timeout: 30000,
        mode: 'bundle',
      });

      // 根路径返回 404（没有索引页）
      expect(result.success, '根路径请求应返回失败').toBe(false);
      expect(result.error, '错误信息应包含 HTTP 状态码').toMatch(/HTTP\s+404/i);
    } finally {
      if (page && !page.isClosed()) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
    }
  }, 60000);
});

// ============================================================
// 测试组：子资源下载验证
// ============================================================

describe('子资源下载验证', () => {
  const RESOURCE_FIXTURES = [
    { name: 'vue3-spa', expectedFramework: 'vue3' },
    { name: 'react18-spa', expectedFramework: 'react18' },
    { name: 'sveltekit-ssr', expectedFramework: 'sveltekit' },
  ];

  for (const { name, expectedFramework } of RESOURCE_FIXTURES) {
    describe(`${name} 子资源`, () => {
      let result: CrawlResult;

      beforeAll(async () => {
        const url = server.getFixtureUrl(name);
        const outputDir = join(OUTPUTS_DIR, `subresources-${name}`);

        let context: BrowserContext | null = null;
        let page: Page | null = null;

        try {
          context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
          });
          page = await context.newPage();

          result = await runCrawl(page, context, {
            url,
            outputDir,
            expectedFramework,
            timeout: 60000,
            mode: 'bundle',
          });
        } finally {
          if (page && !page.isClosed()) await page.close().catch(() => {});
          if (context) await context.close().catch(() => {});
        }
      }, 90000);

      it('应成功爬取', () => {
        expect(result.success, `爬取应成功: ${result.error}`).toBe(true);
      });

      it('应有子资源下载统计', () => {
        expect(result.stats, '爬取结果应包含 stats').not.toBeNull();
        if (result.stats) {
          expect(result.stats.fetchedAssets, '应至少下载 1 个资源').toBeGreaterThanOrEqual(1);
          expect(result.stats.totalBytes, '总字节数应 > 0').toBeGreaterThan(0);
        }
      });

      it('assets/ 目录应包含下载的子资源文件', () => {
        assertSubResourcesDownloaded(result.outputDir);
      });

      it('HTML 文件中应包含捕获的文本内容', () => {
        if (result.success) {
          const htmlPath = join(result.outputDir, 'index.html');
          assertValidHtml(htmlPath);
          assertContentCaptured(htmlPath);
        }
      });
    });
  }
});

// ============================================================
// 测试组：高级场景
// ============================================================

describe('高级场景 E2E', () => {
  it('多框架批量爬取应全部成功', async () => {
    // 使用所有已注册的框架进行批量爬取验证
    const batchTasks = FIXTURES.map((f) => ({
      name: f.name,
      url: server.getFixtureUrl(f.name),
      expectedFramework: f.expectedFramework,
    }));

    let context: BrowserContext | null = null;
    let page: Page | null = null;

    const batchResults: { name: string; success: boolean; tier: string; error: string | null }[] = [];

    for (const task of batchTasks) {
      try {
        context = await browser.newContext({
          viewport: { width: 1280, height: 720 },
        });
        page = await context.newPage();

        const outputDir = join(OUTPUTS_DIR, `batch-${task.name}`);

        const result = await runCrawl(page, context, {
          url: task.url,
          outputDir,
          expectedFramework: task.expectedFramework,
          timeout: 60000,
          mode: 'bundle',
        });

        batchResults.push({
          name: task.name,
          success: result.success,
          tier: result.spaDetection?.tier || 'none',
          error: result.error,
        });
      } finally {
        if (page && !page.isClosed()) await page.close().catch(() => {});
        if (context) await context.close().catch(() => {});
      }
    }

    const failures = batchResults.filter((r) => !r.success);
    expect(failures, `批量爬取应全部成功，失败: ${failures.map((f) => `${f.name}: ${f.error}`).join(', ')}`).toHaveLength(0);
  }, 300000);

  it('各框架应检测到唯一的框架标识', async () => {
    // 验证每个框架的检测结果互不相同，避免检测逻辑退化为单一默认值
    const detectedFrameworks = new Set<string>();

    for (const result of allResults) {
      if (result.success && result.frameworkMatch) {
        detectedFrameworks.add(result.frameworkMatch.detected);
      }
    }

    // 预期至少检测到 3 种不同的框架标识（如 vue3, react18, angular 等）
    expect(detectedFrameworks.size, `应检测到多种不同的框架标识，实际: ${Array.from(detectedFrameworks).join(', ')}`).toBeGreaterThanOrEqual(3);
  });

  it('各框架的 bundle 结构应包含完整的 HTML 骨架', async () => {
    // 验证每个成功爬取的输出 bundle 都包含完整的 HTML 文档结构
    for (const result of allResults) {
      if (!result.success) continue;

      const htmlPath = join(result.outputDir, 'index.html');
      assertValidHtml(htmlPath);
      assertBundleStructure(result.outputDir);
    }
  });
});
