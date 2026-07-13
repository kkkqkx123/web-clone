/**
 * Test Automation Workflow with Snapshot-on-Failure
 *
 * Demonstrates a complete automated testing workflow:
 * 1. Run structured assertions against a live page
 * 2. If assertions fail, automatically save a full page snapshot for debugging
 * 3. Include failure context (locate output, structure outline) in the report
 *
 * This pattern is useful for:
 *   - CI pipelines monitoring page changes
 *   - E2E test suites that need failure artifacts
 *   - Regression detection after deployments
 *   - Visual diff workflows
 *
 * Usage:
 *   pnpm tsx examples/inspect/03-test-workflow-with-snapshot.ts <url>
 *
 *   # Simulate a failing assertion to see the snapshot behavior:
 *   ASSERT_FAIL=true pnpm tsx examples/inspect/03-test-workflow-with-snapshot.ts https://example.com
 *
 * Prerequisites:
 *   pnpm add @web-clone/core jsdom
 */

import { JSDOM } from 'jsdom';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  inspectStructure,
  locateElement,
  countElements,
  toMarkdown,
  sanitizeLine,
} from '@web-clone/core';

// ─── Failure Context ────────────────────────────────────────────
// Collected when an assertion fails, to aid debugging.

interface FailureContext {
  url: string;
  timestamp: string;
  pageTitle: string;
  pageSizeKB: number;
  error: string;
  /** Top repeating structures at time of failure */
  structureOutline: string[];
  /** SPA warning if applicable */
  spaWarning?: string;
  /** Located elements for the failed assertion text */
  locateHits?: Array<{ selector: string; match: string }>;
  /** Markdown preview */
  markdownPreview: string;
  /** File paths of saved artifacts */
  artifacts: {
    snapshotDir?: string;
    failureReport: string;
  };
}

// ─── Snapshot Artifacts ─────────────────────────────────────────
// When a test fails, save the full snapshot + failure report.

function saveFailureArtifacts(
  html: string,
  context: FailureContext,
  outputDir: string,
): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `failure-${timestamp}`;
  const dir = join(outputDir, baseName);

  mkdirSync(join(dir, 'assets'), { recursive: true });

  // 1. Save the raw HTML for inspection
  writeFileSync(join(dir, 'index.html'), html, 'utf-8');
  context.artifacts.snapshotDir = dir;

  // 2. Save structured failure report
  const reportPath = join(dir, 'failure-report.json');
  const report = {
    url: context.url,
    timestamp: context.timestamp,
    pageTitle: context.pageTitle,
    pageSizeKB: context.pageSizeKB,
    error: context.error,
    spaWarning: context.spaWarning || null,
    structure: context.structureOutline,
    locateHits: context.locateHits || [],
    markdownPreview: context.markdownPreview.slice(0, 2000),
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  context.artifacts.failureReport = reportPath;

  // 3. Save a human-readable summary
  const summaryPath = join(dir, 'SUMMARY.md');
  const summary = [
    `# Test Failure Report`,
    ``,
    `**URL**: ${context.url}`,
    `**Time**: ${context.timestamp}`,
    `**Error**: ${context.error}`,
    ``,
    `## Page Info`,
    ``,
    `- Title: ${context.pageTitle}`,
    `- Size: ${context.pageSizeKB} KB`,
    context.spaWarning ? `- ⚠ ${context.spaWarning}` : '',
    ``,
    `## Structure Outline`,
    ``,
    ...context.structureOutline.map((l) => `- ${l}`),
    ``,
    context.locateHits && context.locateHits.length > 0
      ? [
          `## Element Locations`,
          ``,
          ...context.locateHits.map(
            (h) => `- \`${h.selector}\` → ${h.match}`,
          ),
          ``,
        ].join('\n')
      : '',
    `## Artifacts`,
    ``,
    `- HTML snapshot: \`index.html\``,
    `- Full report: \`failure-report.json\``,
    `- Page preview: open \`index.html\` in browser`,
    ``,
  ].join('\n');
  writeFileSync(summaryPath, summary, 'utf-8');

  console.log(`  📁 Artifacts saved to: ${dir}`);
  console.log(`  📄 Report: ${reportPath}`);
  console.log(`  📋 Summary: ${summaryPath}`);
}

// ─── Test Runner ────────────────────────────────────────────────
// Simulates a test suite that collects failure context.

interface TestStep {
  name: string;
  run: (doc: Document) => Promise<void> | void;
}

async function runTests(
  url: string,
  steps: TestStep[],
  outputDir: string,
): Promise<void> {
  // Fetch the page
  console.log(`\n◉ Fetching: ${url}\n`);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  const body = doc.querySelector('body');
  const textLen = (body?.textContent ?? '').trim().length;
  const scripts = doc.querySelectorAll('script').length;
  const isSpaHusk = textLen < 200 && scripts > 0;

  // Build failure context skeleton
  const outline = inspectStructure(doc, { minCount: 2, topN: 20 });
  const mdPreview = toMarkdown(doc.documentElement);

  let failed = false;

  for (const step of steps) {
    process.stdout.write(`  Test: ${step.name} ... `);
    try {
      await step.run(doc);
      console.log('✅ PASS');
    } catch (err) {
      failed = true;
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.log(`❌ FAIL: ${errorMessage}`);

      // ── On failure: collect context and save artifacts ──
      const context: FailureContext = {
        url,
        timestamp: new Date().toISOString(),
        pageTitle: doc.title || '(no title)',
        pageSizeKB: Math.round(html.length / 1024),
        error: errorMessage,
        spaWarning: isSpaHusk
          ? `body has ${textLen} chars with ${scripts} scripts — possible SPA husk`
          : undefined,
        structureOutline: outline.map((e) => `${String(e.count).padStart(4)}  ${e.signature}`),
        markdownPreview: mdPreview.slice(0, 1000),
        artifacts: { failureReport: '' },
      };

      saveFailureArtifacts(html, context, outputDir);
      break; // Stop on first failure
    }
  }

  if (failed) {
    console.log(`\n✗ Tests failed — artifacts saved to ${outputDir}`);
    process.exit(1);
  } else {
    console.log(`\n✓ All ${steps.length} test(s) passed`);
  }
}

// ─── Main ───────────────────────────────────────────────────────

const url = process.argv[2];
if (!url) {
  console.error('Usage: pnpm tsx examples/inspect/03-test-workflow-with-snapshot.ts <url>');
  console.error('');
  console.error('Environment:');
  console.error('  ASSERT_FAIL=true    Simulate a failing assertion to demonstrate snapshot-on-failure');
  process.exit(1);
}

const outputDir = process.env.OUTPUT_DIR || './test-artifacts';

async function main() {
  await runTests(url, [
    {
      name: 'Page has at least one visible heading',
      run(doc) {
        const headings = doc.querySelectorAll('h1, h2, h3');
        if (headings.length === 0) {
          throw new Error('No headings found on page');
        }
      },
    },

    {
      name: 'All images have alt text',
      run(doc) {
        const images = [...doc.querySelectorAll('img')];
        const missingAlt = images.filter((img) => !img.hasAttribute('alt'));
        if (missingAlt.length > 0) {
          throw new Error(
            `${missingAlt.length} image(s) missing alt text (out of ${images.length})`,
          );
        }
      },
    },

    {
      name: 'No broken links (basic)',
      run(doc) {
        const links = [...doc.querySelectorAll('a[href]')];
        const empty = links.filter((a) => !(a.getAttribute('href') ?? '').trim());
        if (empty.length > 0) {
          throw new Error(`${empty.length} anchor(s) have empty href`);
        }
      },
    },

    {
      name: 'Key content element exists',
      run(doc) {
        // Check for common content containers
        const main = doc.querySelector('main');
        const article = doc.querySelector('article');
        const content = doc.querySelector('[role="main"]');
        if (!main && !article && !content) {
          throw new Error('No <main>, <article>, or [role="main"] found');
        }
      },
    },

    {
      name: 'Page has reasonable structure',
      run(doc) {
        const structure = inspectStructure(doc, { minCount: 2, topN: 5 });
        if (structure.length === 0) {
          throw new Error('No repeating structures detected — page may be empty or SPA husk');
        }
      },
    },

    // ── Simulate a failing assertion if ASSERT_FAIL is set ──
    ...(process.env.ASSERT_FAIL === 'true'
      ? [
          {
            name: 'Simulated failure (ASSERT_FAIL=true)',
            run(_doc: Document) {
              throw new Error(
                'This is a simulated test failure. The snapshot and report ' +
                  'have been saved to demonstrate the snapshot-on-failure workflow.',
              );
            },
          },
        ]
      : []),
  ], outputDir);
}

main().catch((err) => {
  console.error(`\n✗ Fatal: ${err.message}`);

  // Even setup failures should produce an artifact
  const reportDir = join(outputDir, `setup-failure-${Date.now()}`);
  mkdirSync(reportDir, { recursive: true });
  const reportPath = join(reportDir, 'setup-failure.json');
  writeFileSync(
    reportPath,
    JSON.stringify({ error: err.message, timestamp: new Date().toISOString() }, null, 2),
    'utf-8',
  );
  console.log(`  📄 Setup failure report: ${reportPath}`);
  process.exit(1);
});
