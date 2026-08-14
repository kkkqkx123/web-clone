/**
 * E2E Spider Runner
 *
 * 封装 web-clone snapshot() 调用，提供统一的爬取接口和结果格式。
 *
 * 使用方式：
 *   const browser = await chromium.launch({ headless: true });
 *   const context = await browser.newContext();
 *   const page = await context.newPage();
 *   const result = await runCrawl(page, context, {
 *     url: 'http://127.0.0.1:12345/vue3-spa/',
 *     outputDir: 'tests/e2e/outputs/vue3-spa',
 *     expectedFramework: 'vue3',
 *     timeout: 60000,
 *   });
 */

import { mkdirSync, existsSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { Page, BrowserContext, Browser } from 'playwright';
import { snapshot } from '@web-clone/core';
import { PlaywrightFetcherAdapter } from '@web-clone/adapter-playwright';
import type { SignalTier } from '@web-clone/adapter-common';

/**
 * 单次爬取的输入参数
 */
export interface CrawlOptions {
  /** 目标 URL */
  url: string;
  /** 输出目录 */
  outputDir: string;
  /** 期望的框架类型（用于验证），null 表示不做框架验证 */
  expectedFramework?: string | null;
  /** 超时时间 (ms)，默认 60000 */
  timeout?: number;
  /** 输出模式，默认 'bundle' */
  mode?: 'bundle' | 'single';
}

/**
 * 单次爬取的输出结果
 */
export interface CrawlResult {
  /** 目标框架名称 */
  framework: string;
  /** 目标 URL */
  url: string;
  /** 是否成功 */
  success: boolean;
  /** SPA 检测结果 */
  spaDetection: {
    framework: string;
    appElement: string | null;
    isHydrated: boolean;
    markers: string[];
    tier: SignalTier;
  } | null;
  /** 框架检测匹配信息 */
  frameworkMatch: {
    detected: string;
    expected: string | null;
    match: boolean;
    tier: SignalTier;
  } | null;
  /** 输出目录 */
  outputDir: string;
  /** 快照统计 */
  stats: {
    totalAssets: number;
    fetchedAssets: number;
    failedAssets: number;
    skippedAssets: number;
    totalBytes: number;
    htmlBytes: number;
  } | null;
  /** 错误信息 */
  error: string | null;
  /** 耗时 (ms) */
  duration: number;
}

/**
 * 获取浏览器框架检测的摘要信息。
 * 优先使用 browserFramework（来自运行时检测），回退到 frameworkDetection。
 */
function extractBrowserFramework(result: any): CrawlResult['spaDetection'] | null {
  const source = result.browserFramework || result.frameworkDetection;
  if (source) {
    return {
      framework: source.framework || 'unknown',
      appElement: source.appElement || null,
      isHydrated: source.markers?.includes('hydration-confirmed') || false,
      markers: source.markers || [source.framework],
      tier: source.tier || 'none',
    };
  }
  return null;
}

/**
 * 获取框架检测匹配信息。
 */
function extractFrameworkMatch(
  result: any,
  expected: string | null | undefined,
  spaDetection: CrawlResult['spaDetection']
): CrawlResult['frameworkMatch'] {
  if (result.frameworkDetection) {
    const detection = result.frameworkDetection;
    const detected = detection.framework || 'unknown';
    return {
      detected,
      expected: expected || null,
      match: expected ? detected === expected : false,
      tier: detection.tier || spaDetection?.tier || 'none',
    };
  }

  // 回退到 SPA 检测结果
  if (spaDetection) {
    return {
      detected: spaDetection.framework,
      expected: expected || null,
      match: expected ? spaDetection.framework === expected : false,
      tier: spaDetection.tier,
    };
  }

  return null;
}

/**
 * 执行一次完整的 SPA 爬取流程。
 *
 * @param page Playwright Page 实例
 * @param context Playwright BrowserContext 实例
 * @param options 爬取选项
 * @returns 结构化的爬取结果
 */
export async function runCrawl(
  page: Page,
  context: BrowserContext,
  options: CrawlOptions
): Promise<CrawlResult> {
  const startTime = Date.now();
  const {
    url,
    outputDir,
    expectedFramework = null,
    timeout = 60000,
    mode = 'bundle',
  } = options;

  // 提取框架名用于结果标识
  const frameworkName = outputDir.split('/').pop() || 'unknown';

  try {
    // Ensure output directory exists (skip for single-file mode — output is a file path)
    if (mode !== 'single') {
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }
    } else {
      // For single-file mode, remove any stale directory from a previous run
      try {
        const outputStat = statSync(outputDir);
        if (outputStat.isDirectory()) {
          rmSync(outputDir, { recursive: true, force: true });
        }
      } catch {
        // Path doesn't exist or can't be read — fine, proceed
      }
      const parentDir = dirname(outputDir);
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }
    }

    // 先导航到目标 URL 并检查 HTTP 状态码
    const response = await page.goto(url, {
      waitUntil: 'load',
      timeout,
    });

    if (!response || !response.ok()) {
      const statusCode = response ? response.status() : 0;
      throw new Error(`HTTP ${statusCode}: ${url} returned status ${statusCode}`);
    }

    // 创建适配器并执行快照
    const adapter = new PlaywrightFetcherAdapter(page, context, {
      waitForLoadState: 'networkidle',
    });

    const result = await snapshot(
      {
        url,
        output: outputDir,
        mode,
        maxAssets: 50,
        timeout,
      },
      adapter
    );

    const spaDetection = extractBrowserFramework(result);
    const duration = Date.now() - startTime;

    return {
      framework: frameworkName,
      url,
      success: true,
      spaDetection,
      frameworkMatch: extractFrameworkMatch(result, expectedFramework, spaDetection),
      outputDir,
      stats: {
        totalAssets: result.stats.total,
        fetchedAssets: result.stats.fetched,
        failedAssets: result.stats.failed,
        skippedAssets: result.stats.skipped,
        totalBytes: result.stats.totalBytes,
        htmlBytes: result.stats.htmlBytes,
      },
      error: null,
      duration,
    };
  } catch (err: unknown) {
    const duration = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);

    return {
      framework: frameworkName,
      url,
      success: false,
      spaDetection: null,
      frameworkMatch: null,
      outputDir,
      stats: null,
      error: message,
      duration,
    };
  }
}

/**
 * 批量运行多个框架的爬取。
 *
 * @param browser 共享的 Playwright Browser 实例
 * @param tasks 爬取配置列表
 * @returns 所有框架的爬取结果数组
 */
export async function runAllCrawls(
  browser: Browser,
  tasks: CrawlOptions[]
): Promise<CrawlResult[]> {
  const results: CrawlResult[] = [];

  for (const task of tasks) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    const result = await runCrawl(page, context, task);

    await page.close().catch(() => {});
    await context.close().catch(() => {});

    results.push(result);
  }

  return results;
}
