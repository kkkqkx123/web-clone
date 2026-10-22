/**
 * SPA crawling E2E test suite
 *
 * Verifies web-clone's ability to crawl and detect real SPA/SSR framework apps.
 * Uses prebuilt fixture artifacts, so no framework build tooling needs to be installed.
 *
 * Framework detection uses signal tiers instead of a continuous confidence score:
 *   definitive > strong > moderate > weak > none
 *
 * How to run:
 *   npm run test:e2e
 *   or
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
// Global test environment
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// __dirname = tests/e2e/ (the directory containing this test file)
const BUILDS_DIR = join(__dirname, 'builds');
// All temporary test outputs are collected under __tests__/outputs/ at the
// repo root (tests/e2e/ -> two levels up is the repo root)
const OUTPUTS_DIR = join(__dirname, '../../__tests__/outputs');

let server: FixtureServer;
let browser: Browser;
let allResults: CrawlResult[] = [];

/**
 * List of all built framework fixtures.
 * Newly added frameworks must be registered here.
 * `minTier` is the minimum signal tier this framework is expected to reach in E2E tests.
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
// Test lifecycle
// ============================================================

beforeAll(async () => {
  // Start the fixture HTTP server
  console.log(`BUILDS_DIR resolved to: ${BUILDS_DIR}`);
  console.log(`BUILDS_DIR exists: ${existsSync(BUILDS_DIR)}`);
  server = await startFixtureServer(BUILDS_DIR);
  console.log(`Fixture server started on port ${server.port}`);
  console.log(`vue3-spa URL: ${server.getFixtureUrl('vue3-spa')}`);

  // Launch the Playwright browser
  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  // Create the output directory
  mkdirSync(OUTPUTS_DIR, { recursive: true });
}, 90000);

afterAll(async () => {
  // Save the summary report (if beforeAll failed the directory may not exist, so ensure it first)
  mkdirSync(OUTPUTS_DIR, { recursive: true });
  const resultsPath = join(OUTPUTS_DIR, 'results.json');
  writeFileSync(resultsPath, JSON.stringify(allResults, null, 2), 'utf-8');
  console.log(`Results written to ${resultsPath}`);

  // Print the summary
  if (allResults.length > 0) {
    generateResultsSummary(allResults);
  }

  // Cleanup
  if (server) await server.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
}, 30000);

// ============================================================
// Helper functions
// ============================================================

/**
 * Run one full crawl test for the given fixture.
 */
async function crawlFixture(
  fixtureName: string,
  expectedFramework: string
): Promise<CrawlResult> {
  const url = server.getFixtureUrl(fixtureName);
  const outputDir = join(OUTPUTS_DIR, fixtureName);

  // Use an isolated context and page per test to avoid cookie/state leakage
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
 * Run a single-file mode crawl test for the given fixture.
 * Single-file mode inlines all resources into one HTML file.
 */
async function crawlFixtureSingle(
  fixtureName: string
): Promise<CrawlResult> {
  const url = server.getFixtureUrl(fixtureName);
  // In single-file mode the output must be a file path
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
      outputDir: outputFile,  // single-file: output is a file path
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
// Test groups: per-framework E2E
// ============================================================

describe('SPA crawl E2E', () => {
  // ---- Vue 3 SPA ----
  describe('Vue 3 SPA', () => {
    let result: CrawlResult;

    beforeAll(async () => {
      result = await crawlFixture('vue3-spa', 'vue3');
      allResults.push(result);
    }, 90000);

    it('should correctly detect the framework as vue3 (tier >= strong)', () => {
      assertFrameworkDetection(result, 'vue3', 'strong');
    });

    it('should capture the full hydrated DOM content', () => {
      const htmlPath = join(result.outputDir, 'index.html');
      assertValidHtml(htmlPath);
      assertContentCaptured(htmlPath);
    });

    it('should have SPA hydration detection results', () => {
      assertSpaHydrationDetected(result);
    });

    it('should output a valid bundle structure', () => {
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

    it('should correctly detect the framework as react18 (tier >= moderate)', () => {
      // Production builds lack __REACT_DEVTOOLS_GLOBAL_HOOK__, so Phase 1 is 'weak'.
      // Phase 3 finds React fiber nodes (__reactFiber$) and upgrades to 'moderate'.
      assertFrameworkDetection(result, 'react18', 'moderate');
    });

    it('should capture the full hydrated DOM content', () => {
      const htmlPath = join(result.outputDir, 'index.html');
      assertValidHtml(htmlPath);
      assertContentCaptured(htmlPath);
    });

    it('should have SPA hydration detection results', () => {
      assertSpaHydrationDetected(result);
    });

    it('should output a valid bundle structure', () => {
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

    it('should correctly detect the framework as angular (tier >= moderate)', () => {
      // Production build: _nghost-* / _ngcontent-* attributes → moderate tier
      assertFrameworkDetection(result, 'angular', 'moderate');
    });

    it('should capture the full hydrated DOM content', () => {
      const htmlPath = join(result.outputDir, 'index.html');
      assertValidHtml(htmlPath);
      assertContentCaptured(htmlPath);
    });

    it('should have SPA hydration detection results', () => {
      assertSpaHydrationDetected(result);
    });

    it('should output a valid bundle structure', () => {
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

    it('should correctly detect the framework as sveltekit (tier >= definitive)', () => {
      assertFrameworkDetection(result, 'sveltekit', 'definitive');
    });

    it('should capture the full hydrated DOM content', () => {
      const htmlPath = join(result.outputDir, 'index.html');
      assertValidHtml(htmlPath);
      assertContentCaptured(htmlPath);
    });

    it('should have SPA hydration detection results', () => {
      assertSpaHydrationDetected(result);
    });

    it('should output a valid bundle structure', () => {
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

    it('should correctly detect the framework as nextjs (tier >= definitive)', () => {
      assertFrameworkDetection(result, 'nextjs', 'definitive');
    });

    it('should capture the full hydrated DOM content', () => {
      const htmlPath = join(result.outputDir, 'index.html');
      assertValidHtml(htmlPath);
      assertContentCaptured(htmlPath);
    });

    it('should have SPA hydration detection results', () => {
      assertSpaHydrationDetected(result);
    });

    it('should output a valid bundle structure', () => {
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

    it('should correctly detect the framework as nuxt3 (tier >= definitive)', () => {
      assertFrameworkDetection(result, 'nuxt3', 'definitive');
    });

    it('should capture the full hydrated DOM content', () => {
      const htmlPath = join(result.outputDir, 'index.html');
      assertValidHtml(htmlPath);
      assertContentCaptured(htmlPath);
    });

    it('should have SPA hydration detection results', () => {
      assertSpaHydrationDetected(result);
    });

    it('should output a valid bundle structure', () => {
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

    it('should correctly detect the framework as vitepress (tier >= strong)', () => {
      assertFrameworkDetection(result, 'vitepress', 'strong');
    });

    it('should capture the full hydrated DOM content', () => {
      const htmlPath = join(result.outputDir, 'index.html');
      assertValidHtml(htmlPath);
      assertContentCaptured(htmlPath);
    });

    it('should have SPA hydration detection results', () => {
      assertSpaHydrationDetected(result);
    });

    it('should output a valid bundle structure', () => {
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

    it('should correctly detect the framework as vue2 (tier >= moderate)', () => {
      assertFrameworkDetection(result, 'vue2', 'moderate');
    });

    it('should capture the full hydrated DOM content', () => {
      const htmlPath = join(result.outputDir, 'index.html');
      assertValidHtml(htmlPath);
      assertContentCaptured(htmlPath);
    });

    it('should have SPA hydration detection results', () => {
      assertSpaHydrationDetected(result);
    });

    it('should output a valid bundle structure', () => {
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

    it('should correctly detect the framework as astro (tier >= moderate)', () => {
      assertFrameworkDetection(result, 'astro', 'moderate');
    });

    it('should capture the full hydrated DOM content', () => {
      const htmlPath = join(result.outputDir, 'index.html');
      assertValidHtml(htmlPath);
      assertContentCaptured(htmlPath);
    });

    it('should have SPA hydration detection results', () => {
      assertSpaHydrationDetected(result);
    });

    it('should output a valid bundle structure', () => {
      assertBundleStructure(result.outputDir);
      assertSubResourcesDownloaded(result.outputDir);
    });
  });

  // ---- Summary report ----
  describe('Summary report', () => {
    it('all framework crawls should succeed', () => {
      expect(allResults.length, 'should have test results for all 9 frameworks').toBe(9);
      assertAllCrawlsSuccessful(allResults);
    });

    it('the results summary should be generated to the console', () => {
      const summary = generateResultsSummary(allResults);
      expect(summary, 'summary text should be generated').toBeTruthy();
    });
  });
});

// ============================================================
// Test groups: Single-file mode
// ============================================================

describe('Single-file mode E2E', () => {
  // Covers all frameworks: SSR frameworks (Nuxt/Next/SvelteKit) have more inline
  // content, while pure SPA frameworks (Vue3/React18/Angular) verify how
  // JS-driven pages handle resources in inlined mode
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

      it('should successfully generate a single-file snapshot', () => {
        expect(result.success, `single-file crawl should succeed: ${result.error}`).toBe(true);
      });

      it('should output valid single-file HTML', () => {
        const htmlPath = result.outputDir;
        assertValidHtml(htmlPath);
      });

      it('CSS/JS should be inlined into a single HTML', () => {
        assertSingleFileMode(result.outputDir);
      });

      it('should have SPA hydration detection results', () => {
        if (result.success) {
          assertSpaHydrationDetected(result);
        }
      });
    });
  }
});

// ============================================================
// Test groups: error handling
// ============================================================

describe('Error handling E2E', () => {
  it('should return success=false when accessing a nonexistent URL (404)', async () => {
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

      expect(result.success, 'a 404 page should return failure').toBe(false);
      expect(result.error, 'the error message should contain the HTTP status code').toMatch(/HTTP\s+404/i);
    } finally {
      if (page && !page.isClosed()) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
    }
  }, 60000);

  it('should return success=false when accessing an empty URL', async () => {
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

      // The root path returns 404 (there is no index page)
      expect(result.success, 'the root-path request should return failure').toBe(false);
      expect(result.error, 'the error message should contain the HTTP status code').toMatch(/HTTP\s+404/i);
    } finally {
      if (page && !page.isClosed()) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
    }
  }, 60000);
});

// ============================================================
// Test groups: sub-resource download verification
// ============================================================

describe('Sub-resource download verification', () => {
  const RESOURCE_FIXTURES = [
    { name: 'vue3-spa', expectedFramework: 'vue3' },
    { name: 'react18-spa', expectedFramework: 'react18' },
    { name: 'sveltekit-ssr', expectedFramework: 'sveltekit' },
  ];

  for (const { name, expectedFramework } of RESOURCE_FIXTURES) {
    describe(`${name} sub-resources`, () => {
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

      it('should crawl successfully', () => {
        expect(result.success, `crawl should succeed: ${result.error}`).toBe(true);
      });

      it('should have sub-resource download statistics', () => {
        expect(result.stats, 'the crawl result should contain stats').not.toBeNull();
        if (result.stats) {
          expect(result.stats.fetchedAssets, 'at least 1 asset should be downloaded').toBeGreaterThanOrEqual(1);
          expect(result.stats.totalBytes, 'total bytes should be > 0').toBeGreaterThan(0);
        }
      });

      it('the assets/ directory should contain downloaded sub-resource files', () => {
        assertSubResourcesDownloaded(result.outputDir);
      });

      it('the HTML file should contain the captured text content', () => {
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
// Test groups: advanced scenarios
// ============================================================

describe('Advanced scenarios E2E', () => {
  it('batch crawling across all frameworks should fully succeed', async () => {
    // Run batch crawl validation using every registered framework
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
    expect(failures, `all batch crawls should succeed, failures: ${failures.map((f) => `${f.name}: ${f.error}`).join(', ')}`).toHaveLength(0);
  }, 300000);

  it('each framework should be detected with a unique framework id', async () => {
    // Verify that each framework's detection result differs, so the detection
    // logic does not degrade into a single default value
    const detectedFrameworks = new Set<string>();

    for (const result of allResults) {
      if (result.success && result.frameworkMatch) {
        detectedFrameworks.add(result.frameworkMatch.detected);
      }
    }

    // Expect at least 3 distinct framework ids detected (e.g. vue3, react18, angular)
    expect(detectedFrameworks.size, `multiple distinct framework ids should be detected, actual: ${Array.from(detectedFrameworks).join(', ')}`).toBeGreaterThanOrEqual(3);
  });

  it('each framework bundle should contain a complete HTML skeleton', async () => {
    // Verify every successful crawl's output bundle contains a complete HTML document structure
    for (const result of allResults) {
      if (!result.success) continue;

      const htmlPath = join(result.outputDir, 'index.html');
      assertValidHtml(htmlPath);
      assertBundleStructure(result.outputDir);
    }
  });
});
