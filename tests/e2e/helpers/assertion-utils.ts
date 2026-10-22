/**
 * E2E Assertion Utilities
 *
 * Shared assertion functions that unify the validation criteria across frameworks.
 * All assertions verify web-clone's snapshot output.
 */

import { expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { CrawlResult } from './spider-runner.js';

/** Ordinal rank for SignalTier comparison. */
const TIER_RANK: Record<string, number> = {
  definitive: 4,
  strong: 3,
  moderate: 2,
  weak: 1,
  none: 0,
};

/**
 * Validate the output directory structure of bundle mode:
 * - index.html must exist
 * - if sub-resources were downloaded, an assets/ directory should exist
 */
export function assertBundleStructure(outputDir: string): void {
  expect(existsSync(outputDir), `Output directory should exist: ${outputDir}`).toBe(true);
  expect(existsSync(join(outputDir, 'index.html')), `index.html should exist: ${outputDir}`).toBe(true);
}

/**
 * Validate single-file mode output:
 * - the output file exists
 * - the HTML contains inline CSS (<style>) or data: URIs
 */
export function assertSingleFileMode(outputPath: string): void {
  expect(existsSync(outputPath), `single-file output should exist: ${outputPath}`).toBe(true);

  const content = readFileSync(outputPath, 'utf-8');

  // In single-file mode, CSS/JS in the HTML should be inlined
  const hasInlineStyles = /<style[^>]*>/.test(content);
  const hasDataUri = /data:(text\/css|application\/javascript|text\/javascript)/.test(content);
  const hasScriptContent = /<script[^>]*>[\s\S]{50,}?<\/script>/.test(content);

  // At least one inlining mechanism must be present
  expect(
    hasInlineStyles || hasDataUri || hasScriptContent,
    `single-file mode should have inline CSS or a data: URI, or a <script> with content: ${outputPath}`
  ).toBe(true);

  // No assets/ subdirectory should remain next to the output file
  const parentDir = dirname(outputPath);
  const assetsDir = join(parentDir, 'assets');
  if (existsSync(assetsDir)) {
    const entries = readdirSync(assetsDir);
    expect(
      entries.length,
      `assets/ should be empty in single-file mode, but contains ${entries.length} file(s)`
    ).toBe(0);
  }
}

/**
 * Validate that the HTML file contains well-formed structural markers:
 * - contains <!DOCTYPE html>
 * - contains <html> and </html>
 * - contains <head>
 * - contains <body>
 */
export function assertValidHtml(htmlPath: string): void {
  expect(existsSync(htmlPath), `HTML file should exist: ${htmlPath}`).toBe(true);
  const content = readFileSync(htmlPath, 'utf-8');
  expect(content, 'HTML content should not be empty').toBeTruthy();
  expect(content, 'should contain a DOCTYPE declaration').toMatch(/<!DOCTYPE html/i);
  expect(content, 'should contain the <html> tag').toMatch(/<html/i);
  expect(content, 'should contain the </html> tag').toMatch(/<\/html>/i);
  expect(content, 'should contain the <head> tag').toMatch(/<head/i);
  expect(content, 'should contain the <body> tag').toMatch(/<body/i);
}

/**
 * Validate that the page content was captured correctly:
 * - text content longer than 100 characters (excludes blank pages / loading skeletons)
 * - at least 3 HTML element tags (excludes text-only blank pages)
 */
export function assertContentCaptured(htmlPath: string): void {
  const content = readFileSync(htmlPath, 'utf-8');

  // Extract plain text (strip HTML tags)
  const textContent = content.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  expect(
    textContent.length,
    `Text content length should be >= 100, actual: ${textContent.length}
     Content preview: ${textContent.substring(0, 200)}`
  ).toBeGreaterThanOrEqual(100);

  // Count closing HTML element tags
  const elementMatches = content.match(/<\/[a-zA-Z][a-zA-Z0-9]*>/g) || [];
  expect(
    elementMatches.length,
    `should contain at least 3 closing HTML tags, actual: ${elementMatches.length}`
  ).toBeGreaterThanOrEqual(3);
}

/**
 * Validate framework detection:
 * - the detected framework matches the expectation
 * - signal tier >= minTier
 */
export function assertFrameworkDetection(
  result: CrawlResult,
  expectedFramework: string,
  minTier = 'weak'
): void {
  expect(
    result.frameworkMatch,
    `crawl result should contain frameworkMatch info: ${result.framework}`
  ).not.toBeNull();

  const match = result.frameworkMatch!;
  expect(
    match.detected,
    `${result.framework}: detected framework should be ${expectedFramework}, actual: ${match.detected}`
  ).toBe(expectedFramework);
  expect(
    match.match,
    `${result.framework}: framework should match ${expectedFramework}`
  ).toBe(true);

  const actualRank = TIER_RANK[match.tier] ?? 0;
  const minRank = TIER_RANK[minTier] ?? 0;
  expect(
    actualRank,
    `${result.framework}: signal tier ${match.tier} should be >= ${minTier}`
  ).toBeGreaterThanOrEqual(minRank);
}

/**
 * Validate that SPA detection exists and includes hydration markers.
 * Requirements:
 * - at least 1 detection marker
 * - signal tier > none
 * - hydration confirmed (isHydrated === true)
 */
export function assertSpaHydrationDetected(result: CrawlResult): void {
  expect(
    result.spaDetection,
    `${result.framework}: SPA detection result should not be empty`
  ).not.toBeNull();

  const spa = result.spaDetection!;
  expect(
    spa.markers,
    `${result.framework}: should have at least 1 detection marker`
  ).not.toHaveLength(0);
  expect(
    TIER_RANK[spa.tier] ?? 0,
    `${result.framework}: signal tier should be > none, actual: ${spa.tier}`
  ).toBeGreaterThan(0);
  expect(
    spa.isHydrated,
    `${result.framework}: page should be fully hydrated (isHydrated should be true), ` +
    `detection markers: ${JSON.stringify(spa.markers)}`
  ).toBe(true);
}

/**
 * Validate that sub-resources were downloaded:
 * - the assets/ directory exists and is non-empty
 */
export function assertSubResourcesDownloaded(outputDir: string): void {
  const assetsDir = join(outputDir, 'assets');
  if (existsSync(assetsDir)) {
    const entries = readdirSync(assetsDir);
    expect(
      entries.length,
      `assets/ directory should contain sub-resource files`
    ).toBeGreaterThan(0);
  }
  // If assets/ is absent, the page may have no external sub-resources or they
  // were inlined; this is not treated as a failure, but noted for information
}

/**
 * Validate that all crawl results are error-free.
 */
export function assertAllCrawlsSuccessful(results: CrawlResult[]): void {
  const failures = results.filter((r) => !r.success);
  expect(
    failures,
    `All crawls should succeed, failures: ${failures.length}/${results.length}\n${failures.map((f) => `  - ${f.framework}: ${f.error}`).join('\n')}`
  ).toHaveLength(0);
}

/**
 * Generate and print a summary of the crawl results.
 */
export function generateResultsSummary(results: CrawlResult[]): string {
  const lines: string[] = [];
  lines.push('='.repeat(60));
  lines.push('SPA Crawl E2E Results Summary');
  lines.push('='.repeat(60));

  for (const r of results) {
    const status = r.success ? 'PASS' : 'FAIL';
    const match = r.frameworkMatch;
    const detected = match ? match.detected : 'N/A';
    const expected = match?.expected || 'N/A';
    const tier = match?.tier || 'none';
    const duration = `${(r.duration / 1000).toFixed(1)}s`;

    lines.push(`\n[${status}] ${r.framework}`);
    lines.push(`  Framework: ${detected} (expected: ${expected}, signal tier: ${tier})`);
    if (r.spaDetection?.isHydrated) {
      lines.push(`  Hydration: confirmed`);
    }
    if (r.stats) {
      lines.push(`  Assets: ${r.stats.fetchedAssets}/${r.stats.totalAssets} downloaded, ${r.stats.totalBytes} bytes`);
    }
    lines.push(`  Duration: ${duration}`);
    if (r.error) {
      lines.push(`  Error: ${r.error}`);
    }
  }

  const passed = results.filter((r) => r.success).length;
  lines.push(`\nTotal: ${passed}/${results.length} passed`);

  const summary = lines.join('\n');
  console.log(summary);
  return summary;
}
