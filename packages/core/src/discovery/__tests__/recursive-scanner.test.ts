import { describe, it, expect } from 'vitest';
import { extractJsUrls, extractJsonUrls, type DiscoveredUrl } from '../recursive-scanner.js';

const BASE = 'https://example.com/js/app.js';

// ──────────────────────────────────────────────────────────────
// extractJsUrls
// ──────────────────────────────────────────────────────────────

describe('extractJsUrls', () => {
  it('should extract absolute URLs from string literals', () => {
    const js = `
      const img = 'https://cdn.example.com/hero.png';
      const css = "https://cdn.example.com/style.css";
    `;
    const result = extractJsUrls(js, BASE);
    expect(result).toHaveLength(2);
    const urls = result.map(r => r.url);
    expect(urls).toContain('https://cdn.example.com/hero.png');
    expect(urls).toContain('https://cdn.example.com/style.css');
  });

  it('should extract URLs from url() calls (CSS-in-JS)', () => {
    const js = `
      const bg = url("https://cdn.example.com/bg.jpg");
      const font = url('https://fonts.example.com/font.woff2');
    `;
    const result = extractJsUrls(js, BASE);
    expect(result).toHaveLength(2);
    expect(result.every(r => r.confidence === 'high')).toBe(true);
  });

  it('should extract URLs from fetch() calls', () => {
    const js = `
      fetch('https://api.example.com/data.json');
      fetch("https://api.example.com/items");
    `;
    const result = extractJsUrls(js, BASE);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.map(r => r.url)).toContain('https://api.example.com/data.json');
  });

  it('should resolve relative paths in fetch/import calls', () => {
    const js = `
      import('./lazy.js');
      import("./other.js");
    `;
    const result = extractJsUrls(js, BASE);
    const urls = result.map(r => r.url);
    expect(urls).toContain('https://example.com/js/lazy.js');
    expect(urls).toContain('https://example.com/js/other.js');
  });

  it('should extract URLs from src/href assignments', () => {
    const js = `
      img.src = 'https://cdn.example.com/photo.webp';
      link.href = "https://cdn.example.com/print.css";
    `;
    const result = extractJsUrls(js, BASE);
    expect(result).toHaveLength(2);
    expect(result.every(r => r.confidence === 'medium')).toBe(true);
  });

  it('should extract URLs from new URL(..., import.meta.url)', () => {
    const js = `
      const url = new URL('./wasm/engine.wasm', import.meta.url);
      const url2 = new URL('./worker.js', location.href);
    `;
    const result = extractJsUrls(js, BASE);
    const urls = result.map(r => r.url);
    expect(urls).toContain('https://example.com/js/wasm/engine.wasm');
    expect(urls).toContain('https://example.com/js/worker.js');
    expect(result.every(r => r.confidence === 'low')).toBe(true);
  });

  it('should not duplicate URLs', () => {
    const js = `
      const a = 'https://cdn.example.com/dup.png';
      const b = "https://cdn.example.com/dup.png";
    `;
    const result = extractJsUrls(js, BASE);
    expect(result).toHaveLength(1);
  });

  it('should ignore dynamic expressions (template literals with variables)', () => {
    const js = `
      const url = \`https://api.example.com/\${id}/data\`;
      fetch(\`/api/\${path}\`);
    `;
    const result = extractJsUrls(js, BASE);
    // The function only picks up fully static template literals,
    // so dynamic ones with \${} should be ignored
    expect(result).toHaveLength(0);
  });

  it('should handle empty JS text', () => {
    const result = extractJsUrls('', BASE);
    expect(result).toHaveLength(0);
  });

  it('should handle JS with no URLs', () => {
    const js = `
      const x = 42;
      function add(a, b) { return a + b; }
    `;
    const result = extractJsUrls(js, BASE);
    expect(result).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────
// extractJsonUrls
// ──────────────────────────────────────────────────────────────

describe('extractJsonUrls', () => {
  const JSON_BASE = 'https://example.com/data/manifest.json';

  it('should extract absolute URLs from parsed JSON', () => {
    const json = JSON.stringify({
      icon: 'https://cdn.example.com/icon.png',
      script: 'https://cdn.example.com/bundle.js',
    });
    const result = extractJsonUrls(json, JSON_BASE);
    expect(result).toHaveLength(2);
    expect(result.every(r => r.confidence === 'high')).toBe(true);
  });

  it('should extract URLs from nested JSON structures', () => {
    const json = JSON.stringify({
      assets: {
        images: ['https://cdn.example.com/a.png', 'https://cdn.example.com/b.jpg'],
        fonts: [{ url: 'https://cdn.example.com/font.woff2' }],
      },
    });
    const result = extractJsonUrls(json, JSON_BASE);
    expect(result).toHaveLength(3);
  });

  it('should extract URLs from JSON arrays', () => {
    const json = JSON.stringify([
      'https://cdn.example.com/1.js',
      'https://cdn.example.com/2.css',
      'https://cdn.example.com/3.png',
    ]);
    const result = extractJsonUrls(json, JSON_BASE);
    expect(result).toHaveLength(3);
  });

  it('should resolve relative paths in JSON', () => {
    const json = JSON.stringify({
      main: './dist/app.js',
      style: './dist/style.css',
    });
    const result = extractJsonUrls(json, JSON_BASE);
    const urls = result.map(r => r.url);
    expect(urls).toContain('https://example.com/data/dist/app.js');
    expect(urls).toContain('https://example.com/data/dist/style.css');
  });

  it('should handle protocol-relative URLs (//)', () => {
    const json = JSON.stringify({
      src: '//cdn.example.com/asset.js',
    });
    const result = extractJsonUrls(json, JSON_BASE);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://cdn.example.com/asset.js');
  });

  it('should use regex fallback for malformed JSON', () => {
    const json = `{ "url": "https://cdn.example.com/image.png", broken: true, }`;
    const result = extractJsonUrls(json, JSON_BASE);
    // Should still find URLs via regex fallback
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].confidence).toBe('low');
  });

  it('should handle empty JSON object', () => {
    const result = extractJsonUrls('{}', JSON_BASE);
    expect(result).toHaveLength(0);
  });

  it('should handle completely empty string', () => {
    const result = extractJsonUrls('', JSON_BASE);
    expect(result).toHaveLength(0);
  });

  it('should not include non-URL string values', () => {
    const json = JSON.stringify({
      name: 'my-app',
      version: '1.0.0',
      description: 'A simple description',
    });
    const result = extractJsonUrls(json, JSON_BASE);
    expect(result).toHaveLength(0);
  });

  it('should deduplicate URLs in JSON', () => {
    const json = JSON.stringify({
      src1: 'https://cdn.example.com/dup.js',
      src2: 'https://cdn.example.com/dup.js',
    });
    const result = extractJsonUrls(json, JSON_BASE);
    expect(result).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────────────────
// Edge cases
// ──────────────────────────────────────────────────────────────

describe('extractJsUrls + extractJsonUrls edge cases', () => {
  it('should handle very long JS text without crashing', () => {
    const longJs = `
      const urls = [
        ${Array.from({ length: 100 }, (_, i) => `'https://cdn.example.com/asset${i}.js',`).join('\n        ')}
      ];
    `;
    const result = extractJsUrls(longJs, BASE);
    expect(result.length).toBe(100);
  });

  it('should handle URLs with query parameters', () => {
    const js = `fetch('https://api.example.com/data?version=2&format=json');`;
    const result = extractJsUrls(js, BASE);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://api.example.com/data?version=2&format=json');
  });

  it('should handle URLs with hash fragments', () => {
    const js = `const u = 'https://cdn.example.com/file.js#v1.0';`;
    const result = extractJsUrls(js, BASE);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://cdn.example.com/file.js#v1.0');
  });
});
