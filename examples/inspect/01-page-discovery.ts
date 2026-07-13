/**
 * Page Discovery — Programmatic Library API Usage
 *
 * Demonstrates using the inspect/query APIs from @web-clone/core as a library,
 * without going through the CLI. Useful for scripting, automation, and
 * integrating page analysis into your own tools.
 *
 * Usage:
 *   pnpm tsx examples/inspect/01-page-discovery.ts https://example.com
 *
 * Prerequisites:
 *   pnpm add @web-clone/core jsdom
 */

import { JSDOM } from 'jsdom';
import {
  inspectStructure,
  locateElement,
  countElements,
  toMarkdown,
  tableToRows,
  spaNote,
} from '@web-clone/core';

const url = process.argv[2];
if (!url) {
  console.error('Usage: pnpm tsx examples/inspect/01-page-discovery.ts <url>');
  process.exit(1);
}

async function main() {
  // ── 1. Fetch HTML ──────────────────────────────────────────
  console.log(`\n◉ Fetching: ${url}\n`);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  const html = await response.text();

  // ── 2. Parse with JSDOM ─────────────────────────────────────
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  // ── 3. SPA Detection ───────────────────────────────────────
  const note = spaNote(doc);
  if (note) {
    console.log(`  ⚠ ${note}\n`);
  }

  // ── 4. Structure Outline ───────────────────────────────────
  console.log('  ── Top Repeating Structures ──');
  const outline = inspectStructure(doc, { minCount: 2, topN: 15 });
  if (outline.length === 0) {
    console.log('  (no repeating structures found)');
  } else {
    for (const entry of outline) {
      console.log(`  ${String(entry.count).padStart(5)}  ${entry.signature}`);
    }
  }
  console.log();

  // ── 5. Element Count ───────────────────────────────────────
  const totalElements = doc.querySelectorAll('*').length;
  const scripts = doc.querySelectorAll('script').length;
  const images = doc.querySelectorAll('img').length;
  const links = doc.querySelectorAll('a').length;
  console.log(`  ── Page Stats ──`);
  console.log(`  Elements: ${totalElements}`);
  console.log(`  Scripts:  ${scripts}`);
  console.log(`  Images:   ${images}`);
  console.log(`  Links:    ${links}`);
  console.log();

  // ── 6. Locate Text ─────────────────────────────────────────
  const title = doc.title || '(no title)';
  console.log(`  ── Page Title ──`);
  console.log(`  ${title}`);
  console.log();

  // If the user provided a search term via --locate or env, demonstrate it
  const searchTerm = process.env.LOCATE_TEXT || '';
  if (searchTerm) {
    console.log(`  ── Locate: "${searchTerm}" ──`);
    const hits = locateElement(doc, searchTerm);
    if (hits.length === 0) {
      console.log(`  (not found)`);
    } else {
      for (const hit of hits.slice(0, 10)) {
        console.log(`  ${hit.selector}`);
        console.log(`    → ${hit.match.slice(0, 100)}`);
      }
      if (hits.length > 10) {
        console.log(`  ... and ${hits.length - 10} more`);
      }
    }
    console.log();
  }

  // ── 7. Convert to Markdown ─────────────────────────────────
  console.log(`  ── Markdown Preview (first 20 lines) ──`);
  const md = toMarkdown(doc.documentElement);
  const lines = md.split('\n');
  console.log(lines.slice(0, 20).join('\n'));
  if (lines.length > 20) {
    console.log(`  ... (${lines.length - 20} more lines)`);
  }
  console.log();

  // ── 8. Table Extraction (if tables exist) ──────────────────
  const tables = doc.querySelectorAll('table');
  if (tables.length > 0) {
    console.log(`  ── Table Extraction (${tables.length} table(s)) ──`);
    for (let i = 0; i < Math.min(tables.length, 2); i++) {
      const { headers, rows } = tableToRows(tables[i] as Element);
      if (headers.length > 0 && rows.length > 0) {
        console.log(`  Table #${i + 1}: ${headers.join(' | ')}`);
        for (const row of rows.slice(0, 3)) {
          console.log(`    ${headers.map((h) => row[h] ?? '').join(' | ')}`);
        }
        if (rows.length > 3) {
          console.log(`    ... (${rows.length - 3} more rows)`);
        }
      }
    }
    console.log();
  }

  console.log('✓ Done');
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
