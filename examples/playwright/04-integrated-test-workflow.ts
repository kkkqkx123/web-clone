/**
 * Playwright Integrated Test Workflow — inspect + snapshot + assertions
 *
 * Demonstrates a complete E2E test workflow that combines:
 *   1. Playwright — browser automation (interaction, JS rendering)
 *   2. inspect APIs (JSDOM) — page structure analysis & assertions
 *   3. snapshot — full asset download on failure for debugging
 *
 * Why this combination?
 *   - Playwright handles interaction and JS rendering
 *   - inspect APIs provide rich structural analysis (outline, locate, count)
 *   - snapshot provides a complete offline-readable archive for debugging
 *
 * Usage:
 *   pnpm tsx examples/playwright/04-integrated-test-workflow.ts
 *
 *   # Simulate a failure:
 *   ASSERT_FAIL=true pnpm tsx examples/playwright/04-integrated-test-workflow.ts
 *
 * Prerequisites:
 *   pnpm add @web-clone/core @web-clone/adapter-playwright playwright jsdom
 */

import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { snapshot } from '@web-clone/core';
import { PlaywrightFetcherAdapter } from '@web-clone/adapter-playwright';
import {
  inspectStructure,
  countElements,
  locateElement,
  toMarkdown,
  tableToRows,
  spaNote,
} from '@web-clone/core';

// ─── Utilities ──────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ─── Step Result ────────────────────────────────────────────────

interface StepResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface FailureArtifact {
  /** Raw HTML from browser */
  html: string;
  /** Page title */
  title: string;
  /** URL at failure time */
  url: string;
  /** Structure outline */
  outline: string[];
  /** Steps executed before failure */
  steps: StepResult[];
  /** Error message */
  error: string;
  /** Timestamp */
  timestamp: string;
  /** Markdown preview */
  markdownPreview: string;
  /** SPA warning */
  spaWarning?: string;
}

function saveFailureArtifact(artifact: FailureArtifact, outputDir: string): string {
  const ts = artifact.timestamp.replace(/[:.]/g, '-');
  const dir = join(outputDir, `failure-${ts}`);
  mkdirSync(dir, { recursive: true });

  // 1. Full HTML snapshot
  const htmlPath = join(dir, 'page.html');
  writeFileSync(htmlPath, artifact.html, 'utf-8');

  // 2. JSON report
  const report = {
    url: artifact.url,
    timestamp: artifact.timestamp,
    title: artifact.title,
    error: artifact.error,
    steps: artifact.steps,
    spaWarning: artifact.spaWarning || null,
    structure: artifact.outline,
    markdownPreview: artifact.markdownPreview.slice(0, 2000),
  };
  const reportPath = join(dir, 'report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  return dir;
}

// ─── Page Analyzer ──────────────────────────────────────────────
// Wraps inspect APIs for easy use after Playwright page.goto()

interface PageAnalysis {
  doc: Document;
  html: string;
  structure: Array<{ signature: string; count: number }>;
  stats: {
    totalElements: number;
    scripts: number;
    images: number;
    links: number;
    headings: number;
  };
  spaWarning: string | null;
  markdown: string;
}

function analyzePage(html: string, url: string): PageAnalysis {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;
  const body = doc.querySelector('body');

  return {
    doc,
    html,
    structure: inspectStructure(doc, { minCount: 2, topN: 30 }),
    stats: {
      totalElements: doc.querySelectorAll('*').length,
      scripts: doc.querySelectorAll('script').length,
      images: doc.querySelectorAll('img').length,
      links: doc.querySelectorAll('a').length,
      headings: doc.querySelectorAll('h1, h2, h3, h4, h5, h6').length,
    },
    spaWarning: spaNote(doc),
    markdown: toMarkdown(doc.documentElement),
  };
}

// ─── Main Workflow ──────────────────────────────────────────────

const OUTPUT = process.env.OUTPUT_DIR || './examples/output/test-results';
const TARGET_URL = process.env.TARGET_URL || 'https://example.com';
const RUN_SNAPSHOT = process.env.RUN_SNAPSHOT !== 'false';

async function main() {
  const steps: StepResult[] = [];
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    try {
      // ═══════════════════════════════════════════════════════
      // Phase 1: Navigate and wait for page to render
      // ═══════════════════════════════════════════════════════
      console.log(`\n◉ Phase 1: Navigate to ${TARGET_URL}`);
      await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
      console.log(`  ✓ Page loaded: ${await page.title()}\n`);

      // ═══════════════════════════════════════════════════════
      // Phase 2: Get rendered HTML and analyze with inspect APIs
      // ═══════════════════════════════════════════════════════
      console.log('◉ Phase 2: Analyze page structure\n');

      const html = await page.content();
      const analysis = analyzePage(html, page.url());

      if (analysis.spaWarning) {
        console.log(`  ⚠ ${analysis.spaWarning}\n`);
      }

      console.log(`  ── Page Stats ──`);
      console.log(`  Elements: ${analysis.stats.totalElements}`);
      console.log(`  Scripts:  ${analysis.stats.scripts}`);
      console.log(`  Images:   ${analysis.stats.images}`);
      console.log(`  Links:    ${analysis.stats.links}`);
      console.log(`  Headings: ${analysis.stats.headings}`);
      console.log();

      if (analysis.structure.length > 0) {
        console.log(`  ── Top Repeating Structures ──`);
        for (const entry of analysis.structure.slice(0, 10)) {
          console.log(`  ${String(entry.count).padStart(5)}  ${entry.signature}`);
        }
        console.log();
      }

      // ═══════════════════════════════════════════════════════
      // Phase 3: Run assertions
      // ═══════════════════════════════════════════════════════
      console.log('◉ Phase 3: Assertions\n');

      // Assertion 1: Page has content
      {
        const name = 'Page has content elements';
        try {
          if (analysis.stats.totalElements < 5) {
            throw new Error(`Only ${analysis.stats.totalElements} elements — page may be empty`);
          }
          if (analysis.stats.headings === 0) {
            throw new Error('No headings found on page');
          }
          steps.push({ name, passed: true });
          console.log(`  ✅ ${name}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          steps.push({ name, passed: false, error: msg });
          console.log(`  ❌ ${name}: ${msg}`);
        }
      }

      // Assertion 2: Key structural elements
      {
        const name = 'Key structural elements exist';
        try {
          if (!countElements(analysis.doc, 'main') &&
              !countElements(analysis.doc, 'article') &&
              !countElements(analysis.doc, '[role="main"]')) {
            throw new Error('No <main>, <article>, or [role="main"] found');
          }
          steps.push({ name, passed: true });
          console.log(`  ✅ ${name}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          steps.push({ name, passed: false, error: msg });
          console.log(`  ❌ ${name}: ${msg}`);
        }
      }

      // Assertion 3: Image accessibility
      {
        const name = 'Images have alt text';
        try {
          const images = analysis.doc.querySelectorAll('img');
          if (images.length > 0) {
            const missingAlt = [...images].filter((img) => !img.hasAttribute('alt'));
            if (missingAlt.length > 0) {
              throw new Error(`${missingAlt.length}/${images.length} images missing alt text`);
            }
          }
          steps.push({ name, passed: true });
          console.log(`  ✅ ${name}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          steps.push({ name, passed: false, error: msg });
          console.log(`  ❌ ${name}: ${msg}`);
        }
      }

      // Assertion 4: Search for expected text (if provided)
      const searchText = process.env.ASSERT_TEXT;
      if (searchText) {
        const name = `Page contains "${searchText}"`;
        try {
          const hits = locateElement(analysis.doc, searchText);
          if (hits.length === 0) {
            throw new Error(`Text "${searchText}" not found on page`);
          }
          steps.push({ name, passed: true });
          console.log(`  ✅ ${name} (${hits.length} location(s))`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          steps.push({ name, passed: false, error: msg });
          console.log(`  ❌ ${name}: ${msg}`);
        }
      }

      // Simulated failure for demo
      if (process.env.ASSERT_FAIL === 'true') {
        const name = 'Simulated failure (ASSERT_FAIL=true)';
        const msg = 'Demonstration: assertion failed, trigger snapshot';
        steps.push({ name, passed: false, error: msg });
        console.log(`  ❌ ${name}: ${msg}`);
      }

      // ═══════════════════════════════════════════════════════
      // Phase 4: Check results — snapshot on failure
      // ═══════════════════════════════════════════════════════
      const failedSteps = steps.filter((s) => !s.passed);

      if (failedSteps.length > 0) {
        console.log(`\n◉ Phase 4: ${failedSteps.length} assertion(s) failed — saving artifacts\n`);

        // Save failure artifact
        const artifact: FailureArtifact = {
          html: analysis.html,
          title: analysis.doc.title || '(no title)',
          url: page.url(),
          outline: analysis.structure.map(
            (e) => `${String(e.count).padStart(4)}  ${e.signature}`,
          ),
          steps,
          error: failedSteps.map((s) => `${s.name}: ${s.error}`).join('\n'),
          timestamp: new Date().toISOString(),
          markdownPreview: analysis.markdown,
          spaWarning: analysis.spaWarning || undefined,
        };
        const artifactDir = saveFailureArtifact(artifact, OUTPUT);
        console.log(`  📁 Failure artifacts: ${artifactDir}`);
        console.log(`     - page.html (raw HTML at failure time)`);
        console.log(`     - report.json (structured report with assertions)`);

        // Optional: Save full snapshot with all assets
        if (RUN_SNAPSHOT) {
          console.log(`\n  ◉ Saving full snapshot with assets...`);
          const snapshotDir = join(artifactDir, 'snapshot');
          try {
            const adapter = new PlaywrightFetcherAdapter(page, context, {
              waitForLoadState: 'networkidle',
              executeJs: true,
            });
            const result = await snapshot({
              url: page.url(),
              output: snapshotDir,
              mode: 'bundle',
              maxAssets: 100,
            }, adapter);
            console.log(`  ✓ Snapshot saved: ${snapshotDir}`);
            console.log(`     Assets: ${result.stats.fetched} fetched, ${formatBytes(result.stats.totalBytes)}`);
          } catch (snapErr) {
            console.log(`  ⚠ Snapshot save failed: ${snapErr instanceof Error ? snapErr.message : String(snapErr)}`);
          }
        }

        console.log(`\n✗ ${failedSteps.length} test(s) failed`);
        process.exit(1);
      }

      // ═══════════════════════════════════════════════════════
      // Phase 5: All passed — optional full snapshot
      // ═══════════════════════════════════════════════════════
      console.log(`\n◉ Phase 5: All ${steps.length} assertions passed`);

      if (RUN_SNAPSHOT) {
        console.log(`\n  ◉ Saving snapshot archive...`);
        const snapshotDir = join(OUTPUT, `snapshot-${Date.now()}`);
        const adapter = new PlaywrightFetcherAdapter(page, context, {
          waitForLoadState: 'networkidle',
          executeJs: true,
        });
        const result = await snapshot({
          url: page.url(),
          output: snapshotDir,
          mode: 'bundle',
          maxAssets: 100,
        }, adapter);
        console.log(`  ✓ Snapshot saved: ${snapshotDir}`);
        console.log(`     Assets: ${result.stats.fetched} fetched, ${formatBytes(result.stats.totalBytes)}`);
      }

      console.log(`\n✓ All tests passed`);
      process.exit(0);

    } finally {
      await page.close();
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`\n✗ Fatal: ${err.message}`);
  process.exit(1);
});
