/**
 * query subcommand — Structured data extraction from HTML pages
 *
 * Extracts structured data from HTML pages using CSS selectors,
 * with support for row extraction, table parsing, filtering, and
 * multiple output formats.
 *
 * Usage:
 *   pnpm dev:cli query <url> <selector> [options]
 *
 * Examples:
 *   pnpm dev:cli query https://example.com '.card' --row 'title=a, href=a@href'
 *   pnpm dev:cli query https://example.com 'table' --table --where 'Stars >= 100'
 *   pnpm dev:cli query https://example.com '.item' --attr 'data-id' --json
 *   pnpm dev:cli query https://example.com '.item' --count
 *   pnpm dev:cli query https://example.com '.item' --html
 */

import chalk from 'chalk';
import { JSDOM } from 'jsdom';
import { parseRowSpec, tableToRows, rowStats, compileWhere, emitLines, emitJson } from '@web-clone/core';

export interface QueryOptions {
  row?: string;
  table?: boolean;
  where?: string;
  attr?: string;
  count?: boolean;
  html?: boolean;
  json?: boolean;
  tsv?: boolean;
  text?: boolean;
  limit?: number;
  all?: boolean;
  budget?: number;
}

export async function query(url: string, selector: string, options: QueryOptions): Promise<void> {
  console.log(chalk.cyan('\n◉ Structured Query\n'));
  console.log(chalk.gray(`  URL: ${url}`));
  console.log(chalk.gray(`  Selector: ${selector}`));

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

    const opts = { limit: options.limit ?? 50, all: options.all ?? false, budget: options.budget ?? 0 };

    // Execute the selector
    let elements: Element[];
    try {
      elements = [...doc.querySelectorAll(selector)];
    } catch (e) {
      throw new Error(`Bad selector: ${selector} (${(e as Error).message})`);
    }

    if (elements.length === 0) {
      console.log(chalk.yellow(`  Selector matched nothing: ${selector}`));
      return;
    }

    // --count: just count
    if (options.count) {
      console.log(`${chalk.bold(String(elements.length))} element(s) matched "${selector}"`);
      return;
    }

    // --table: parse tables
    if (options.table) {
      const tables = elements.filter((el) => el.localName === 'table' || el.querySelector('table'));
      if (tables.length === 0) {
        console.log(chalk.yellow(`  No <table> found under: ${selector}`));
        return;
      }
      const targets = tables.flatMap((el) =>
        el.localName === 'table' ? [el] : [...el.querySelectorAll('table')],
      ) as Element[];

      const parsed = targets.map((t) => tableToRows(t));
      const wherePred = options.where ? compileWhere(options.where) : null;
      const beforeWhere = parsed.length === 1 ? parsed[0].rows.length : 0;
      if (wherePred) {
        for (const p of parsed) p.rows = p.rows.filter(wherePred);
      }

      if (parsed.length === 1) {
        const note = rowStats(parsed[0].rows, wherePred ? beforeWhere : undefined);
        if (note) console.log(chalk.gray(`  ℹ ${note}`));
      }

      const tableResult = parsed.length === 1 ? parsed[0].rows : parsed;

      if (options.json || parsed.length > 1) {
        const result = emitJson(tableResult, opts);
        if (result.notes.length > 0) {
          for (const n of result.notes) console.log(chalk.gray(`  ℹ ${n}`));
        }
        console.log(result.lines.join('\n'));
      } else {
        // TSV output
        const lines = [parsed[0].headers.join('\t')];
        for (const row of parsed[0].rows) {
          lines.push(parsed[0].headers.map((h: string) => String(row[h] ?? '')).join('\t'));
        }
        const result = emitLines(lines, opts);
        if (result.notes.length > 0) {
          for (const n of result.notes) console.log(chalk.gray(`  ℹ ${n}`));
        }
        console.log(result.lines.join('\n'));
      }
      return;
    }

    // --row: structured row extraction
    if (options.row) {
      const fields = parseRowSpec(options.row);
      const rows = elements.map((el) => {
        const obj: Record<string, string | null> = {};
        for (const f of fields) {
          const target = f.sel === '' ? el : el.querySelector(f.sel);
          if (!target) obj[f.name] = null;
          else if (f.attr) obj[f.name] = target.getAttribute(f.attr);
          else obj[f.name] = target.textContent?.trim().replace(/\s+/g, ' ') ?? null;
        }
        return obj;
      });

      const wherePred = options.where ? compileWhere(options.where) : null;
      const rowResult = wherePred ? rows.filter(wherePred) : rows;
      const note = rowStats(rowResult, wherePred ? rows.length : undefined);
      if (note) console.log(chalk.gray(`  ℹ ${note}`));

      if (options.json) {
        const result = emitJson(rowResult, opts);
        if (result.notes.length > 0) {
          for (const n of result.notes) console.log(chalk.gray(`  ℹ ${n}`));
        }
        console.log(result.lines.join('\n'));
      } else {
        // TSV output
        const headers = Object.keys(rowResult[0] ?? {});
        if (rowResult.length === 0) {
          console.log(chalk.yellow('  No rows extracted.'));
          return;
        }
        const lines = [headers.join('\t')];
        for (const row of rowResult) {
          lines.push(headers.map((h) => String(row[h] ?? '')).join('\t'));
        }
        const result = emitLines(lines, opts);
        if (result.notes.length > 0) {
          for (const n of result.notes) console.log(chalk.gray(`  ℹ ${n}`));
        }
        console.log(result.lines.join('\n'));
      }
      return;
    }

    // --attr <name>: extract single attribute
    if (options.attr) {
      const vals = elements
        .map((el) => el.getAttribute(options.attr!))
        .filter((v): v is string => v !== null);
      const result = emitLines(vals, opts);
      if (result.notes.length > 0) {
        for (const n of result.notes) console.log(chalk.gray(`  ℹ ${n}`));
      }
      console.log(result.lines.join('\n'));
      return;
    }

    // --html: extract inner HTML
    if (options.html) {
      const result = emitLines(
        elements.map((el) => el.innerHTML),
        opts,
      );
      if (result.notes.length > 0) {
        for (const n of result.notes) console.log(chalk.gray(`  ℹ ${n}`));
      }
      console.log(result.lines.join('\n'));
      return;
    }

    // --text (default): extract text content
    if (options.json) {
      const rows = elements.map((el) => ({
        text: (el.textContent ?? '').trim(),
        html: el.innerHTML,
        attrs: Object.fromEntries(el.getAttributeNames().map((n) => [n, el.getAttribute(n) ?? ''])),
      }));
      const result = emitJson(rows, opts);
      if (result.notes.length > 0) {
        for (const n of result.notes) console.log(chalk.gray(`  ℹ ${n}`));
      }
      console.log(result.lines.join('\n'));
      return;
    }

    // Default: text output
    const texts = elements.map((el) => (el.textContent ?? '').trim().replace(/\s+/g, ' '));
    const result = emitLines(texts, opts);
    if (result.notes.length > 0) {
      for (const n of result.notes) console.log(chalk.gray(`  ℹ ${n}`));
    }
    console.log(result.lines.join('\n'));
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(chalk.red(`\n✗ Error: ${error.message}`));
    process.exit(1);
  }
}
