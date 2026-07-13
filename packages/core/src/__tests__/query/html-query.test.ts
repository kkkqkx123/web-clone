/**
 * Tests for @web-clone/core — HTML page discovery (html-query.ts)
 *
 * These tests use JSDOM to create mock documents for testing.
 */
import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  collapse,
  parseRowSpec,
  signature,
  selectorPath,
  toMarkdown,
  inspectStructure,
  locateElement,
  countElements,
  tableToRows,
  rowStats,
  spaNote,
} from '../../query/html-query.js';
import { QueryError } from '../../query/expr.js';

function makeDoc(html: string): Document {
  const dom = new JSDOM(html, { url: 'https://example.com' });
  return dom.window.document;
}

describe('collapse', () => {
  it('trims and collapses whitespace', () => {
    expect(collapse('  hello   world  ')).toBe('hello world');
  });
});

describe('parseRowSpec', () => {
  it('parses simple fields', () => {
    const fields = parseRowSpec('title=a, href=a@href');
    expect(fields).toHaveLength(2);
    expect(fields[0]).toEqual({ name: 'title', sel: 'a', attr: null });
    expect(fields[1]).toEqual({ name: 'href', sel: 'a', attr: 'href' });
  });

  it('handles empty selector (self-reference)', () => {
    const fields = parseRowSpec('text=');
    expect(fields).toHaveLength(1);
    expect(fields[0]).toEqual({ name: 'text', sel: '', attr: null });
  });

  it('throws on bad format', () => {
    expect(() => parseRowSpec('noequalsign')).toThrow(QueryError);
    expect(() => parseRowSpec('=val')).toThrow(QueryError);
  });
});

describe('signature', () => {
  it('generates tag.class signature', () => {
    const doc = makeDoc('<div class="foo bar"><p>text</p></div>');
    const div = doc.querySelector('div')!;
    expect(signature(div)).toBe('div.foo.bar');
  });

  it('generates bare tag with no classes', () => {
    const doc = makeDoc('<p>text</p>');
    const p = doc.querySelector('p')!;
    expect(signature(p)).toBe('p');
  });
});

describe('selectorPath', () => {
  it('generates a path from element to body', () => {
    const doc = makeDoc('<div class="card"><span id="x"><a>link</a></span></div>');
    const a = doc.querySelector('a')!;
    const path = selectorPath(a);
    expect(path).toContain('span#x');
    expect(path).toContain('div.card');
  });
});

describe('toMarkdown', () => {
  it('converts headings', () => {
    const doc = makeDoc('<body><h1>Title</h1><p>Text</p></body>');
    const md = toMarkdown(doc.documentElement);
    expect(md).toContain('# Title');
    expect(md).toContain('Text');
  });

  it('converts links', () => {
    const doc = makeDoc('<body><p>See <a href="https://example.com">here</a></p></body>');
    const md = toMarkdown(doc.documentElement);
    expect(md).toContain('[here](https://example.com)');
  });

  it('converts lists', () => {
    const doc = makeDoc('<body><ul><li>Item 1</li><li>Item 2</li></ul></body>');
    const md = toMarkdown(doc.documentElement);
    expect(md).toContain('- Item 1');
    expect(md).toContain('- Item 2');
  });

  it('skips script, style, nav, header, footer', () => {
    const doc = makeDoc('<body><p>Visible</p><script>hidden</script><style>.c{}</style></body>');
    const md = toMarkdown(doc.documentElement);
    expect(md).toContain('Visible');
    expect(md).not.toContain('hidden');
  });
});

describe('inspectStructure', () => {
  it('returns repeating signatures with counts', () => {
    const doc = makeDoc('<div class="card">1</div><div class="card">2</div><p>x</p>');
    const entries = inspectStructure(doc);
    expect(entries.find((e) => e.signature === 'div.card' && e.count === 2)).toBeTruthy();
    // p appears once, below default minCount of 2
    expect(entries.find((e) => e.signature === 'p')).toBeUndefined();
  });

  it('respects minCount option', () => {
    const doc = makeDoc('<p>1</p><p>2</p><span>3</span>');
    const entries = inspectStructure(doc, { minCount: 1 });
    expect(entries.length).toBeGreaterThanOrEqual(2);
  });

  it('respects topN option', () => {
    const doc = makeDoc('<p>1</p><p>2</p><span>3</span><span>4</span>');
    const entries = inspectStructure(doc, { minCount: 1, topN: 1 });
    expect(entries.length).toBe(1);
  });
});

describe('locateElement', () => {
  it('finds text in element content', () => {
    const doc = makeDoc('<body><div><p>Hello World</p></div></body>');
    const hits = locateElement(doc, 'Hello');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].match).toContain('Hello World');
  });

  it('finds text in attributes', () => {
    const doc = makeDoc('<body><a href="https://example.com/search?q=hello">link</a></body>');
    const hits = locateElement(doc, 'hello');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('returns empty when not found', () => {
    const doc = makeDoc('<body><p>Hello</p></body>');
    const hits = locateElement(doc, 'NonExistent');
    expect(hits.length).toBe(0);
  });
});

describe('countElements', () => {
  it('counts matching elements', () => {
    const doc = makeDoc('<div class="card">1</div><div class="card">2</div><p>x</p>');
    expect(countElements(doc, '.card')).toBe(2);
    expect(countElements(doc, 'p')).toBe(1);
  });
});

describe('tableToRows', () => {
  it('parses a simple table', () => {
    const doc = makeDoc(`
      <table>
        <tr><th>Name</th><th>Age</th></tr>
        <tr><td>Alice</td><td>30</td></tr>
        <tr><td>Bob</td><td>25</td></tr>
      </table>
    `);
    const table = doc.querySelector('table')!;
    const result = tableToRows(table);
    expect(result.headers).toEqual(['Name', 'Age']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ Name: 'Alice', Age: '30' });
    expect(result.rows[1]).toEqual({ Name: 'Bob', Age: '25' });
  });

  it('handles colspan', () => {
    const doc = makeDoc(`
      <table>
        <tr><th>Name</th><th colspan="2">Details</th></tr>
        <tr><td>Alice</td><td>Age: 30</td><td>City: NY</td></tr>
      </table>
    `);
    const table = doc.querySelector('table')!;
    const result = tableToRows(table);
    expect(result.headers).toContain('Name');
    expect(result.rows).toHaveLength(1);
  });

  it('handles rowspan', () => {
    const doc = makeDoc(`
      <table>
        <tr><th>Name</th><th>Age</th></tr>
        <tr><td rowspan="2">Alice</td><td>30</td></tr>
        <tr><td>31</td></tr>
      </table>
    `);
    const table = doc.querySelector('table')!;
    const result = tableToRows(table);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].Name).toBe('Alice');
    expect(result.rows[1].Name).toBe('Alice');
  });

  it('handles empty tables', () => {
    const doc = makeDoc('<table></table>');
    const table = doc.querySelector('table')!;
    const result = tableToRows(table);
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it('throws for non-table elements', () => {
    const doc = makeDoc('<div></div>');
    const div = doc.querySelector('div')!;
    expect(() => tableToRows(div)).toThrow(QueryError);
  });
});

describe('rowStats', () => {
  it('reports extraction with no empty fields', () => {
    const note = rowStats([{ a: '1', b: '2' }]);
    expect(note).toContain('1 rows extracted');
    expect(note).toContain('no empty fields');
  });

  it('reports empty fields', () => {
    const note = rowStats([{ a: '1', b: null }]);
    expect(note).toContain('b: 1 empty');
  });

  it('reports 0 rows', () => {
    const note = rowStats([]);
    expect(note).toContain('0 rows extracted');
  });

  it('reports --where filter effect', () => {
    const note = rowStats([], 10);
    expect(note).toContain('0 of 10 rows');
  });
});

describe('spaNote', () => {
  it('returns null for normal pages', () => {
    const doc = makeDoc('<body><p>Lots of visible content here, more than 200 chars...</p></body>');
    expect(spaNote(doc)).toBeNull();
  });

  it('returns warning for sparse body with many scripts', () => {
    const doc = makeDoc('<body><script>a</script><script>b</script><p>Hi</p></body>');
    const note = spaNote(doc);
    expect(note).not.toBeNull();
    expect(note).toContain('SPA');
  });
});
