/**
 * E2E Spider Runner
 *
 * Wraps the web-clone snapshot() call, providing a unified crawl interface and result format.
 *
 * Usage:
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
import { snapshot } from '@kkkqkx123/web-clone';
import { PlaywrightFetcherAdapter } from '@kkkqkx123/web-clone/adapters/playwright';
import type { SignalTier } from '@kkkqkx123/web-clone/adapters/common';

/**
 * Input options for a single crawl
 */
export interface CrawlOptions {
  /** Target URL */
  url: string;
  /** Output directory */
  outputDir: string;
  /** Expected framework type (for validation); null disables framework validation */
  expectedFramework?: string | null;
  /** Timeout in ms, default 60000 */
  timeout?: number;
  /** Output mode, default 'bundle' */
  mode?: 'bundle' | 'single';
}

/**
 * Output result of a single crawl
 */
export interface CrawlResult {
  /** Target framework name */
  framework: string;
  /** Target URL */
  url: string;
  /** Whether the crawl succeeded */
  success: boolean;
  /** SPA detection result */
  spaDetection: {
    framework: string;
    appElement: string | null;
    isHydrated: boolean;
    markers: string[];
    tier: SignalTier;
  } | null;
  /** Framework detection match info */
  frameworkMatch: {
    detected: string;
    expected: string | null;
    match: boolean;
    tier: SignalTier;
  } | null;
  /** Output directory */
  outputDir: string;
  /** Snapshot statistics */
  stats: {
    totalAssets: number;
    fetchedAssets: number;
    failedAssets: number;
    skippedAssets: number;
    totalBytes: number;
    htmlBytes: number;
  } | null;
  /** Error message */
  error: string | null;
  /** Duration in ms */
  duration: number;
}

/**
 * Extract a summary of the browser-side framework detection.
 * Prefers browserFramework (from runtime detection), falls back to frameworkDetection.
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
 * Extract the framework detection match info.
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

  // Fall back to the SPA detection result
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
 * Execute one full SPA crawl run.
 *
 * @param page Playwright Page instance
 * @param context Playwright BrowserContext instance
 * @param options crawl options
 * @returns structured crawl result
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

  // Extract the framework name for result identification
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

    // Navigate to the target URL first and check the HTTP status code
    const response = await page.goto(url, {
      waitUntil: 'load',
      timeout,
    });

    if (!response || !response.ok()) {
      const statusCode = response ? response.status() : 0;
      throw new Error(`HTTP ${statusCode}: ${url} returned status ${statusCode}`);
    }

    // Create the adapter and run the snapshot
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
 * Run crawls for multiple frameworks in batch.
 *
 * @param browser shared Playwright Browser instance
 * @param tasks list of crawl configurations
 * @returns crawl results for all frameworks
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
