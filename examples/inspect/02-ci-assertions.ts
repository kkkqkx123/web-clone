/**
 * CI Assertions with Page Inspection
 *
 * Demonstrates using inspect APIs as programmatic assertions in CI pipelines.
 * Checks page structure stability, element presence, and content correctness.
 *
 * This is the library equivalent of:
 *   pnpm dev:cli inspect <url> --outline
 *   pnpm dev:cli inspect <url> --count <selector>
 *   pnpm dev:cli inspect <url> --locate <text>
 *
 * Usage:
 *   pnpm tsx examples/inspect/02-ci-assertions.ts <url>
 *
 *   # With custom assertions via environment:
 *   MIN_COUNT=5 MIN_IMAGES=1 ASSERT_TEXT="Submit" ASSERT_SELECTOR=".product-card" \
 *     pnpm tsx examples/inspect/02-ci-assertions.ts https://example.com
 *
 * Prerequisites:
 *   pnpm add @web-clone/core jsdom
 */

import { JSDOM } from 'jsdom';
import {
  inspectStructure,
  countElements,
  locateElement,
  spaNote,
} from '@web-clone/core';

// ─── Configuration ──────────────────────────────────────────────
// All values can be overridden via environment variables for CI flexibility.
// For example: ASSERT_STRUCTURE_COUNT=5 ASSERT_NO_NEW_TAGS=div.unknown

interface Assertions {
  /** Minimum count threshold for top repeating structures */
  minStructureCount?: number;
  /** Expected minimum number of a specific CSS selector */
  minSelectorCount?: Record<string, number>;
  /** Maximum number allowed for a specific CSS selector */
  maxSelectorCount?: Record<string, number>;
  /** Text that must exist somewhere on the page */
  mustContainText?: string[];
  /** Tags/signatures that must NOT appear (e.g., unexpected ad containers) */
  forbiddenSignatures?: string[];
  /** SPA husk detection should NOT fire */
  expectSpa?: boolean;
  /** Minimum number of images */
  minImages?: number;
  /** Minimum number of links */
  minLinks?: number;
}

// Parse assertions from env vars
function loadAssertions(): Assertions {
  return {
    minStructureCount: process.env.MIN_STRUCTURE_COUNT
      ? Number(process.env.MIN_STRUCTURE_COUNT) : undefined,
    minSelectorCount: process.env.MIN_SELECTOR_COUNT
      ? parseSelectorMap(process.env.MIN_SELECTOR_COUNT) : undefined,
    maxSelectorCount: process.env.MAX_SELECTOR_COUNT
      ? parseSelectorMap(process.env.MAX_SELECTOR_COUNT) : undefined,
    mustContainText: process.env.MUST_CONTAIN_TEXT
      ? process.env.MUST_CONTAIN_TEXT.split(',').map((s) => s.trim()) : undefined,
    forbiddenSignatures: process.env.FORBIDDEN_SIGNATURES
      ? process.env.FORBIDDEN_SIGNATURES.split(',').map((s) => s.trim()) : undefined,
    expectSpa: process.env.EXPECT_SPA === 'true' ? true : undefined,
    minImages: process.env.MIN_IMAGES ? Number(process.env.MIN_IMAGES) : undefined,
    minLinks: process.env.MIN_LINKS ? Number(process.env.MIN_LINKS) : undefined,
  };
}

function parseSelectorMap(input: string): Record<string, number> {
  const map: Record<string, number> = {};
  for (const pair of input.split(',')) {
    const [sel, countStr] = pair.split('=').map((s) => s.trim());
    if (sel && countStr) map[sel] = Number(countStr);
  }
  return map;
}

// ─── Assertion Runner ──────────────────────────────────────────

interface AssertionResult {
  passed: number;
  failed: number;
  errors: string[];
}

async function runAssertions(url: string, assertions: Assertions): Promise<AssertionResult> {
  const result: AssertionResult = { passed: 0, failed: 0, errors: [] };
  const pass = () => { result.passed++; };
  const fail = (msg: string) => { result.failed++; result.errors.push(msg); };

  // Fetch and parse
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  console.log(`  Page: ${doc.title || '(no title)'}`);
  console.log(`  Size: ${(html.length / 1024).toFixed(1)} KB`);
  console.log();

  // 1. SPA husk check
  const spa = spaNote(doc);
  if (assertions.expectSpa === true) {
    // SPA is expected — if spaNote returns null, that's suspicious
    if (spa === null) {
      fail('Expected a SPA page but body has substantial visible text');
    } else {
      pass();
    }
  } else if (spa) {
    // SPA not expected but detected
    console.log(`  ⚠  SPA detection: ${spa}`);
    console.log(`     (consider using --browser playwright for accurate results)\n`);
    // Not a hard fail, just a warning
  }

  // 2. Structure stability
  const outline = inspectStructure(doc, { minCount: 2, topN: 30 });
  const topSignatures = outline.map((e) => e.signature);

  if (assertions.minStructureCount !== undefined) {
    if (outline.length >= assertions.minStructureCount) {
      console.log(`  ✓ Structure has ${outline.length} repeating patterns (>= ${assertions.minStructureCount})`);
      pass();
    } else {
      fail(`Structure has only ${outline.length} repeating patterns, expected >= ${assertions.minStructureCount}`);
    }
  }

  // 3. Forbidden signatures
  if (assertions.forbiddenSignatures) {
    for (const sig of assertions.forbiddenSignatures) {
      // Check if any signature in the outline starts with the forbidden pattern
      const found = topSignatures.filter((s) => s.startsWith(sig));
      if (found.length > 0) {
        fail(`Forbidden signature "${sig}" found: ${found.join(', ')}`);
      } else {
        console.log(`  ✓ Forbidden "${sig}" not found`);
        pass();
      }
    }
  }

  // 4. Min selector count assertions
  if (assertions.minSelectorCount) {
    for (const [selector, expected] of Object.entries(assertions.minSelectorCount)) {
      const actual = countElements(doc, selector);
      if (actual >= expected) {
        console.log(`  ✓ ${selector}: ${actual} (>= ${expected})`);
        pass();
      } else {
        fail(`Expected at least ${expected} of "${selector}", got ${actual}`);
      }
    }
  }

  // 5. Max selector count assertions
  if (assertions.maxSelectorCount) {
    for (const [selector, expected] of Object.entries(assertions.maxSelectorCount)) {
      const actual = countElements(doc, selector);
      if (actual <= expected) {
        console.log(`  ✓ ${selector}: ${actual} (<= ${expected})`);
        pass();
      } else {
        fail(`Expected at most ${expected} of "${selector}", got ${actual}`);
      }
    }
  }

  // 6. Text presence
  if (assertions.mustContainText) {
    for (const text of assertions.mustContainText) {
      const hits = locateElement(doc, text);
      if (hits.length > 0) {
        console.log(`  ✓ Text "${text}" found (${hits.length} location(s))`);
        pass();
      } else {
        fail(`Required text "${text}" not found on page`);
      }
    }
  }

  // 7. Media assertions
  if (assertions.minImages !== undefined) {
    const actual = doc.querySelectorAll('img').length;
    if (actual >= assertions.minImages) {
      console.log(`  ✓ Images: ${actual} (>= ${assertions.minImages})`);
      pass();
    } else {
      fail(`Expected at least ${assertions.minImages} images, got ${actual}`);
    }
  }

  if (assertions.minLinks !== undefined) {
    const actual = doc.querySelectorAll('a').length;
    if (actual >= assertions.minLinks) {
      console.log(`  ✓ Links: ${actual} (>= ${assertions.minLinks})`);
      pass();
    } else {
      fail(`Expected at least ${assertions.minLinks} links, got ${actual}`);
    }
  }

  return result;
}

// ─── Main ───────────────────────────────────────────────────────

const url = process.argv[2];
if (!url) {
  console.error('Usage: pnpm tsx examples/inspect/02-ci-assertions.ts <url>');
  console.error('');
  console.error('Environment variables for assertions:');
  console.error('  MIN_STRUCTURE_COUNT=<n>       Min repeating patterns');
  console.error('  MIN_SELECTOR_COUNT=<sel=n,...>  Min element count by selector');
  console.error('  MAX_SELECTOR_COUNT=<sel=n,...>  Max element count by selector');
  console.error('  MUST_CONTAIN_TEXT=<t1,t2,...>   Required text on page');
  console.error('  FORBIDDEN_SIGNATURES=<s1,s2>    Tags that must not appear');
  console.error('  MIN_IMAGES=<n>                  Min <img> count');
  console.error('  MIN_LINKS=<n>                   Min <a> count');
  process.exit(1);
}

async function main() {
  const assertions = loadAssertions();

  console.log(`\n◉ CI Assertions for: ${url}\n`);

  const result = await runAssertions(url, assertions);

  console.log(`\n  ── Results ──`);
  console.log(`  ✅ Passed: ${result.passed}`);
  if (result.failed > 0) {
    console.log(`  ❌ Failed: ${result.failed}`);
    console.log('');
    for (const err of result.errors) {
      console.log(`  ❌ ${err}`);
    }
    process.exit(1);
  } else {
    console.log(`  All assertions passed!`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(`\n✗ Fatal error: ${err.message}`);
  process.exit(1);
});
