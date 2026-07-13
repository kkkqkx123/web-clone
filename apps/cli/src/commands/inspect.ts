/**
 * inspect subcommand — Page discovery and analysis
 *
 * Analyzes a web page's structure without downloading all assets.
 * Based on ax's page discovery capabilities.
 *
 * Usage:
 *   pnpm dev:cli inspect <url> [options]
 *
 * Examples:
 *   pnpm dev:cli inspect https://example.com                     # Quick summary
 *   pnpm dev:cli inspect https://example.com --outline           # Structure outline
 *   pnpm dev:cli inspect https://example.com --locate "Search"   # Find text
 *   pnpm dev:cli inspect https://example.com --count '.card'     # Count elements
 *   pnpm dev:cli inspect https://example.com --md                # Markdown view
 *   pnpm dev:cli inspect https://example.com --budget 2000       # Token budget
 */

import chalk from 'chalk';
import { JSDOM } from 'jsdom';
import { inspectStructure, locateElement, countElements, toMarkdown, emitLines } from '@web-clone/core';
import type { OutlineEntry, LocateHit } from '@web-clone/core';

export interface InspectOptions {
  outline?: boolean;
  locate?: string;
  count?: string;
  md?: boolean;
  json?: boolean;
  limit?: number;
  all?: boolean;
  budget?: number;
}

export async function inspect(url: string, options: InspectOptions): Promise<void> {
  console.log(chalk.cyan('\n◉ Page Discovery\n'));
  console.log(chalk.gray(`  URL: ${url}`));

  const startTime = Date.now();

  try {
    // Fetch the page HTML
    console.log(chalk.gray(`  Fetching page...`));
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(chalk.gray(`  Fetched in ${elapsed}s (${html.length.toLocaleString()} chars)\n`));

    // Check for SPA husk
    const body = doc.querySelector('body');
    const textLen = (body?.textContent ?? '').trim().length;
    const scripts = doc.querySelectorAll('script').length;
    if (textLen < 200 && scripts > 0) {
      console.log(chalk.yellow(`  ⚠ Warning: body has only ${textLen} chars of visible text with ${scripts} script(s) — likely a JS-rendered SPA\n`));
    }

    const opts = { limit: options.limit ?? 50, all: options.all ?? false, budget: options.budget ?? 0 };

    // --outline: structure outline
    if (options.outline) {
      const entries = inspectStructure(doc, { minCount: 2 });
      if (entries.length === 0) {
        console.log(chalk.yellow('  No repeating structures found.'));
        return;
      }
      const lines = entries.map((e: OutlineEntry) => `${String(e.count).padStart(5)}  ${e.signature}`);
      const result = emitLines(lines, opts);
      if (result.notes.length > 0) {
        for (const note of result.notes) {
          console.log(chalk.gray(`  ℹ ${note}`));
        }
      }
      console.log(result.lines.join('\n'));
      return;
    }

    // --locate <text>: find text in elements/attributes
    if (options.locate) {
      const hits = locateElement(doc, options.locate);
      if (hits.length === 0) {
        console.log(chalk.yellow(`  Text not found: "${options.locate}"`));
        return;
      }
      if (options.json) {
        console.log(JSON.stringify(hits, null, 2));
        return;
      }
      console.log(chalk.green(`  Found ${hits.length} location(s) for "${options.locate}":\n`));
      for (const hit of hits) {
        console.log(`  ${chalk.cyan(hit.selector)}`);
        console.log(`  ${chalk.gray(hit.match)}`);
        console.log('');
      }
      return;
    }

    // --count <selector>: count matching elements
    if (options.count) {
      const count = countElements(doc, options.count);
      console.log(`  Selector "${options.count}": ${chalk.bold(String(count))} match(es)`);
      return;
    }

    // --md: convert to Markdown
    if (options.md) {
      const md = toMarkdown(doc.documentElement);
      const lines = md.split('\n');
      const result = emitLines(lines, { ...opts, budget: opts.budget || 2000 });
      if (result.notes.length > 0) {
        for (const note of result.notes) {
          console.log(chalk.gray(`  ℹ ${note}`));
        }
      }
      console.log(result.lines.join('\n'));
      return;
    }

    // Default: quick summary
    const topEntries = inspectStructure(doc, { minCount: 2, topN: 15 });
    const totalElements = doc.querySelectorAll('*').length;

    console.log(chalk.white('  Page Summary:'));
    console.log(`    Elements: ${chalk.bold(String(totalElements))}`);
    console.log(`    Scripts:  ${chalk.bold(String(scripts))}`);
    console.log(`    Title:    ${chalk.bold(doc.title || '(none)')}`);
    console.log('');

    if (topEntries.length > 0) {
      console.log(chalk.white('  Top repeating structures:'));
      for (const e of topEntries) {
        console.log(`    ${chalk.cyan(String(e.count).padStart(4))}  ${e.signature}`);
      }
      console.log(chalk.gray(`\n  Tip: use --outline for full structure, --locate <text> to find elements`));
    } else {
      console.log(chalk.gray('  No repeating structures found.'));
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(chalk.red(`\n✗ Error: ${error.message}`));
    process.exit(1);
  }
}
