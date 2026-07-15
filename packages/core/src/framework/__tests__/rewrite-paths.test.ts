/**
 * Nuxt 3 Path Rewriting Unit Tests.
 *
 * Covers:
 * - Literal assetsPath: "/_nuxt/" → "./assets/_nuxt/"
 * - Unicode-encoded assetsPath: "\u002F_nuxt\u002F" → "./assets/_nuxt/"
 * - No assetsPath present → no changes
 * - Non-Nuxt document → no changes
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { nuxt3Strategy } from '../strategies/nuxt3.js';

function createDocument(scriptContent: string): Document {
  const html = `<!DOCTYPE html><html><head></head><body><script>${scriptContent}<\/script></body></html>`;
  const dom = new JSDOM(html);
  return dom.window.document;
}

function getScriptContent(doc: Document): string {
  return doc.querySelector('script')?.textContent || '';
}

describe('nuxt3Strategy.rewritePaths', () => {
  it('should rewrite literal assetsPath: "/_nuxt/" to "./assets/_nuxt/"', () => {
    const doc = createDocument('window.__NUXT__ = { assetsPath: "/_nuxt/" }');
    nuxt3Strategy.rewritePaths(doc);
    const content = getScriptContent(doc);
    expect(content).toContain('assetsPath:"./assets/_nuxt/"');
    expect(content).not.toContain('assetsPath:"/_nuxt/"');
  });

  it('should rewrite Unicode-encoded assetsPath: "\\u002F_nuxt\\u002F"', () => {
    const doc = createDocument('window.__NUXT__ = { assetsPath: "\\u002F_nuxt\\u002F" }');
    nuxt3Strategy.rewritePaths(doc);
    const content = getScriptContent(doc);
    expect(content).toContain('assetsPath:".\\u002Fassets\\u002F_nuxt\\u002F"');
  });

  it('should not modify script when assetsPath is absent', () => {
    const original = 'window.__NUXT__ = { page: "/home" }';
    const doc = createDocument(original);
    nuxt3Strategy.rewritePaths(doc);
    const content = getScriptContent(doc);
    expect(content).toBe(original);
  });

  it('should not modify script when __NUXT__ is absent', () => {
    const original = 'window.__NEXT_DATA__ = { page: "/home" }';
    const doc = createDocument(original);
    nuxt3Strategy.rewritePaths(doc);
    const content = getScriptContent(doc);
    expect(content).toBe(original);
  });

  it('should handle multiple scripts, only rewriting the one with __NUXT__', () => {
    const html = `<!DOCTYPE html>
<html><head></head><body>
<script>console.log("first");<\/script>
<script>window.__NUXT__ = { assetsPath: "/_nuxt/" };<\/script>
<script>window.__NEXT_DATA__ = {};<\/script>
</body></html>`;
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    nuxt3Strategy.rewritePaths(doc);

    const scripts = Array.from(doc.querySelectorAll('script'));
    // First script unchanged
    expect(scripts[0].textContent).toBe('console.log("first");');
    // Second script rewritten
    expect(scripts[1].textContent).toContain('./assets/_nuxt/');
    // Third script unchanged
    expect(scripts[2].textContent).toBe('window.__NEXT_DATA__ = {};');
  });

  it('should handle empty document with no scripts', () => {
    const html = '<!DOCTYPE html><html><head></head><body></body></html>';
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    // Should not throw
    expect(() => nuxt3Strategy.rewritePaths(doc)).not.toThrow();
  });
});