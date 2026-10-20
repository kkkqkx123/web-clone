/**
 * @web-clone/core — HTML page discovery and structured extraction
 *
 * Ported from ax's root.ts command. Provides JSDOM-based page analysis
 * (outline, locate, count, table extraction, markdown conversion) without
 * the curl/fetch mode or Bun-specific I/O.
 */

import { QueryError } from './expr.js';

// ─── Helper types ───────────────────────────────────────────

export interface OutlineEntry {
  signature: string; // tag.class
  count: number;
}

export interface LocateHit {
  selector: string;
  match: string;
}

export interface TableResult {
  headers: string[];
  rows: Record<string, string | null>[];
}

// ─── Internal helpers (ported from ax root.ts) ──────────────

/** Collapse whitespace: trim + reduce consecutive spaces to one. */
export const collapse = (s: string): string => s.trim().replace(/\s+/g, ' ');

/**
 * Parse a `--row` spec string into field definitions.
 *
 * Format: `name=selector, name2=selector@attr, ...`
 * An empty selector means the matched element itself.
 * `@attr` reads an attribute instead of textContent.
 */
export function parseRowSpec(spec: string): { name: string; sel: string; attr: string | null }[] {
  return spec
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const eq = part.indexOf('=');
      if (eq === -1) throw new QueryError(`bad --row field (expected name=selector): ${part}`);
      const name = part.slice(0, eq).trim();
      let sel = part.slice(eq + 1).trim();
      let attr: string | null = null;
      const at = sel.indexOf('@');
      if (at !== -1) {
        attr = sel.slice(at + 1).trim();
        sel = sel.slice(0, at).trim();
      }
      if (!name) throw new QueryError(`bad --row field (missing name): ${part}`);
      return { name, sel, attr };
    });
}

/** Generate a `tag.class1.class2` signature for an element. */
export function signature(el: Element): string {
  const classes = [...el.classList];
  return el.localName + (classes.length ? '.' + classes.join('.') : '');
}

/** Generate a CSS selector path from this element up to body. */
export function selectorPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.localName !== 'body' && node.localName !== 'html') {
    parts.unshift(node.id ? `${node.localName}#${node.id}` : signature(node));
    node = node.parentElement;
  }
  return parts.join(' > ');
}

/** Convert inline element content to Markdown (links, breaks). */
export function inlineToMd(el: Element): string {
  let out = '';
  const walkNode = (node: Element) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        out += (child as Text).data;
        continue;
      }
      if (child.nodeType !== 1) continue;
      const ce = child as Element;
      if (ce.localName === 'a') {
        const href = ce.getAttribute('href') ?? '';
        const inner = inlineToMd(ce);
        out += href ? `[${inner}](${href})` : inner;
      } else if (ce.localName === 'br') {
        out += ' ';
      } else {
        walkNode(ce);
      }
    }
  };
  walkNode(el);
  return out;
}

/** Convert a document/root element to Markdown. */
export function toMarkdown(root: Element): string {
  const out: string[] = [];
  const walk = (el: Element, depth: number) => {
    for (const child of el.children) {
      const tag = child.localName;
      if (['script', 'style', 'nav', 'header', 'footer', 'aside', 'noscript', 'svg', 'form'].includes(tag)) continue;
      if (/^h[1-6]$/.test(tag) || tag === 'p' || tag === 'li' || tag === 'blockquote') {
        const text = collapse(inlineToMd(child));
        if (/^h[1-6]$/.test(tag) && text) {
          out.push(`${'#'.repeat(Number(tag[1]))} ${text}`);
        } else if (tag === 'p' && text) {
          out.push(text);
        } else if (tag === 'li' && text) {
          out.push(`- ${text}`);
        } else if (tag === 'blockquote' && text) {
          out.push(`> ${text}`);
        } else {
          walk(child, depth + 1);
        }
      } else if (tag === 'pre') {
        out.push('```\n' + (child.textContent ?? '').trim() + '\n```');
      } else if (tag === 'table') {
        const rows = [...child.querySelectorAll('tr')].map((tr) =>
          [...tr.querySelectorAll('th, td')].map((c) => collapse(inlineToMd(c))).join(' | '),
        );
        out.push(rows.join('\n'));
      } else {
        walk(child, depth + 1);
      }
    }
  };
  const main =
    root.querySelector('article') ??
    root.querySelector('main') ??
    root.querySelector('body') ??
    root;
  walk(main as Element, 0);
  return out.join('\n\n');
}

// ─── Core API functions ─────────────────────────────────────

/**
 * Generate a structure outline of the document, showing tag.class signatures
 * and their occurrence counts.
 *
 * @param doc - The parsed DOM Document.
 * @param options.minCount - Minimum count threshold (default: 2).
 * @param options.topN - Limit results to top N (default: no limit).
 */
export function inspectStructure(
  doc: Document,
  options?: { minCount?: number; topN?: number },
): OutlineEntry[] {
  const minCount = options?.minCount ?? 2;
  const counts = new Map<string, number>();
  for (const el of doc.querySelectorAll('*')) {
    const sig = signature(el);
    counts.set(sig, (counts.get(sig) ?? 0) + 1);
  }
  let entries: OutlineEntry[] = [...counts.entries()]
    .filter(([, n]) => n >= minCount)
    .sort((a, b) => b[1] - a[1])
    .map(([sig, count]) => ({ signature: sig, count }));

  if (options?.topN && options.topN > 0) {
    entries = entries.slice(0, options.topN);
  }
  return entries;
}

/**
 * Locate elements containing specific text (case-insensitive).
 * Searches both attributes and text content.
 *
 * @param doc - The parsed DOM Document.
 * @param text - The text to search for.
 * @param scope - Optional scope element (defaults to body).
 */
export function locateElement(doc: Document, text: string, scope?: ParentNode): LocateHit[] {
  const needle = text.toLowerCase();
  const root = scope ?? (doc.querySelector('body') ?? doc);
  const hits: LocateHit[] = [];
  for (const el of root.querySelectorAll('*')) {
    const attrHit = el
      .getAttributeNames()
      .map((n) => [n, el.getAttribute(n) ?? ''] as const)
      .find(([, v]) => v.toLowerCase().includes(needle));
    const childHit = [...el.children].some((c) =>
      (c.textContent ?? '').toLowerCase().includes(needle),
    );
    const textHit = !childHit && (el.textContent ?? '').toLowerCase().includes(needle);
    if (!attrHit && !textHit) continue;
    const snippet = attrHit ? `${attrHit[0]}="${attrHit[1]}"` : collapse(el.textContent ?? '');
    hits.push({
      selector: selectorPath(el),
      match: snippet.length > 80 ? snippet.slice(0, 80) + '…' : snippet,
    });
  }
  return hits;
}

/**
 * Count elements matching a CSS selector.
 *
 * @param doc - The parsed DOM Document.
 * @param selector - CSS selector string.
 */
export function countElements(doc: Document, selector: string): number {
  try {
    return doc.querySelectorAll(selector).length;
  } catch (e) {
    throw new QueryError(`bad selector: ${selector} (${(e as Error).message})`);
  }
}

/**
 * Parse an HTML `<table>` element into structured rows.
 *
 * Handles colspan/rowspan, header detection via `<th>` rows,
 * and deduplicates header names when collisions occur.
 *
 * @param table - The `<table>` element to parse.
 * @returns Headers and an array of row objects.
 */
export function tableToRows(table: Element): TableResult {
  if (table.localName !== 'table') {
    throw new QueryError('tableToRows expects a <table> element');
  }
  const allRows = [...table.querySelectorAll('tr')].filter(
    (tr) => tr.closest('table') === table,
  );
  if (allRows.length === 0) return { headers: [], rows: [] };

  const cellsOf = (tr: Element) =>
    [...tr.children].filter((c) => c.localName === 'th' || c.localName === 'td');

  const grid: (string | undefined)[][] = allRows.map(() => []);
  allRows.forEach((tr, r) => {
    let c = 0;
    for (const cell of cellsOf(tr)) {
      while (grid[r]![c] !== undefined) c++;
      const text = collapse(cell.textContent ?? '');
      const cs = Math.max(1, Number(cell.getAttribute('colspan')) || 1);
      const rs = Math.max(1, Number(cell.getAttribute('rowspan')) || 1);
      for (let dr = 0; dr < rs && r + dr < allRows.length; dr++) {
        for (let dc = 0; dc < cs; dc++) grid[r + dr]![c + dc] = text;
      }
      c += cs;
    }
  });

  let headerRowCount = 0;
  while (
    headerRowCount < allRows.length &&
    cellsOf(allRows[headerRowCount]!).every((c) => c.localName === 'th') &&
    cellsOf(allRows[headerRowCount]!).length > 0
  ) {
    headerRowCount++;
  }

  const width = Math.max(...grid.map((row) => row.length));
  const named = Array.from({ length: width }, (_, i) =>
    headerRowCount > 0 ? grid[0]![i] || `col${i}` : `col${i}`,
  );
  const seen = new Map<string, number>();
  const headers = named.map((h) => {
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n === 1 ? h : `${h}_${n}`;
  });

  const rows = grid
    .slice(headerRowCount)
    .map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? null])))
    .filter((r) => Object.values(r).some((v) => v));

  return { headers, rows };
}

/**
 * Generate row extraction statistics: row count and per-field empty/null counts.
 * Returns a note string (same format as ax's stderr output).
 */
export function rowStats(
  rows: Record<string, string | null>[],
  beforeWhere?: number,
): string | null {
  if (rows.length === 0) {
    return beforeWhere !== undefined
      ? `0 of ${beforeWhere} rows match --where`
      : '0 rows extracted — check the selector and field spec';
  }
  const nulls: string[] = [];
  for (const key of Object.keys(rows[0]!)) {
    const n = rows.filter((r) => r[key] === null || r[key] === '').length;
    if (n > 0) nulls.push(`${key}: ${n} empty`);
  }
  return `${rows.length} rows extracted${nulls.length ? ` — check: ${nulls.join(', ')}` : ', no empty fields'}`;
}

/**
 * Check if the body of a document is likely a JS-rendered SPA husk.
 * Returns a warning string if suspicious, otherwise null.
 */
export function spaNote(doc: Document): string | null {
  const body = doc.querySelector('body');
  const text = collapse(body?.textContent ?? '');
  const scripts = doc.querySelectorAll('script').length;
  if (text.length < 200 && scripts > 0) {
    return `body has ${text.length} chars of visible text and ${scripts} script(s) — likely a JS-rendered SPA (ax reads raw HTML)`;
  }
  return null;
}
