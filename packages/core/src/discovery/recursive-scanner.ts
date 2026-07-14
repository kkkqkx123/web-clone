import { extname } from 'node:path';

// ──────────────────────────────────────────────────────────────
// JS URL extraction
// ──────────────────────────────────────────────────────────────

export interface DiscoveredUrl {
  url: string;
  source: string;    // JS file URL where this was found
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Extract URLs from JavaScript source text using regex-based scanning.
 *
 * Targets:
 * - url() / url("...") / url('...') in CSS-in-JS
 * - src = "...", src = '...'
 * - fetch("..."), fetch('...'), fetch(`...`)
 * - import("..."), import('...')
 * - new URL("...", ...), new URL('...', ...)
 * - require("..."), require('...')
 * - import.meta.url based concatenations (basic)
 * - Template literals with static content only (`https://cdn.example.com/file.js`)
 *
 * Does NOT evaluate dynamic expressions — only picks up string literals
 * that look like absolute URLs or absolute paths.
 */
export function extractJsUrls(jsText: string, baseUrl: string): DiscoveredUrl[] {
  const found = new Map<string, DiscoveredUrl>();
  const absoluteUrlRe = /https?:\/\/[^\s"'`)\]}>]+\.\w{2,}(?:\/[^\s"'`)\]}>]*)?/gi;

  // Pattern 1: Absolute URLs in string literals
  let match: RegExpExecArray | null;
  const re1 = /['"`](https?:\/\/[^\s"'`]+)['"`]/g;
  while ((match = re1.exec(jsText)) !== null) {
    const url = normalizeUrl(match[1]);
    if (url && !found.has(url)) {
      found.set(url, { url, source: baseUrl, confidence: 'high' });
    }
  }

  // Pattern 2: url(...) calls (CSS-in-JS)
  const re2 = /url\(\s*['"]?(https?:\/\/[^\s"'`)]+)['"]?\s*\)/g;
  while ((match = re2.exec(jsText)) !== null) {
    const url = normalizeUrl(match[1]);
    if (url && !found.has(url)) {
      found.set(url, { url, source: baseUrl, confidence: 'high' });
    }
  }

  // Pattern 3: fetch(), import(), require() with string literal
  const re3 = /(?:fetch|import|require)\s*\(\s*['"`]([^\s"'`]+)['"`]\s*\)/g;
  while ((match = re3.exec(jsText)) !== null) {
    const raw = match[1].trim();
    const url = resolveMaybeRelative(raw, baseUrl);
    if (url && !found.has(url)) {
      found.set(url, { url, source: baseUrl, confidence: 'medium' });
    }
  }

  // Pattern 4: src/href/postMessage assignments
  const re4 = /(?:src|href)\s*[=:]\s*['"`]([^\s"'`]+)['"`]/g;
  while ((match = re4.exec(jsText)) !== null) {
    const raw = match[1].trim();
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('//')) {
      const url = normalizeUrl(raw);
      if (url && !found.has(url)) {
        found.set(url, { url, source: baseUrl, confidence: 'medium' });
      }
    }
  }

  // Pattern 5: new URL(..., import.meta.url) — second arg is import.meta.url
  const re5 = /new\s+URL\s*\(\s*['"`]([^\s"'`]+)['"`]\s*,\s*(?:import\.meta\.url|location\.href|document\.baseURI)\s*\)/g;
  while ((match = re5.exec(jsText)) !== null) {
    const raw = match[1].trim();
    const url = resolveMaybeRelative(raw, baseUrl);
    if (url && !found.has(url)) {
      found.set(url, { url, source: baseUrl, confidence: 'low' });
    }
  }

  return [...found.values()];
}

/**
 * Extract URLs from CDN/manifest-like JSON structures.
 * Looks for any string values that match media/resource URL patterns.
 */
export function extractJsonUrls(jsonText: string, baseUrl: string): DiscoveredUrl[] {
  const found = new Map<string, DiscoveredUrl>();

  // Try JSON parse first — if it succeeds, deep-walk the object tree
  try {
    const obj = JSON.parse(jsonText);
    walkJson(obj, (value) => {
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      // Match: absolute URLs, absolute paths, relative paths with known extensions
      if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('//')) {
        const url = normalizeUrl(trimmed);
        if (url && !found.has(url)) {
          found.set(url, { url, source: baseUrl, confidence: 'high' });
        }
      } else if (extname(trimmed).length > 0 && /\.(png|jpg|jpeg|gif|webp|svg|mp4|webm|json|js|css|woff2?|ttf|wasm)$/i.test(trimmed)) {
        const url = resolveMaybeRelative(trimmed, baseUrl);
        if (url && !found.has(url)) {
          found.set(url, { url, source: baseUrl, confidence: 'low' });
        }
      }
    });
  } catch {
    // Not valid JSON — use regex as fallback
    const re = /"(https?:\/\/[^\s"]+\.\w{2,}(?:\/[^"]*)?)"/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(jsonText)) !== null) {
      const url = normalizeUrl(match[1]);
      if (url && !found.has(url)) {
        found.set(url, { url, source: baseUrl, confidence: 'low' });
      }
    }
  }

  return [...found.values()];
}

/**
 * Detect webpack runtime chunk map in JS source and extract chunk file names.
 *
 * Webpack/Nuxt bundles embed a chunk ID → filename mapping like:
 *   f.p + "" + { 41: "b02411f", 42: "d8b86cf" }[e] + ".js"
 *
 * Standard URL extraction cannot discover these because the chunk IDs are
 * dynamically indexed. This function extracts the hex hash values and
 * reconstructs the chunk file names (e.g. "b02411f.js").
 *
 * Uses a two-pass approach: first finds the entire chunk map object pattern
 * `{...}[id] + ".js"`, then extracts all hex hash values from within it.
 * This avoids the context-window problem that plagues per-entry matching
 * when the chunk map is large (30+ entries spanning 200+ characters).
 */
export function extractWebpackChunks(jsText: string, baseUrl: string): DiscoveredUrl[] {
  const found = new Map<string, DiscoveredUrl>();

  // Resolve chunk files relative to the JS file's directory
  const baseUrlObj = new URL(baseUrl);
  const baseDir = baseUrlObj.origin + baseUrlObj.pathname.substring(0, baseUrlObj.pathname.lastIndexOf('/') + 1);

  // Pass 1: Find the entire chunk map object pattern.
  // Matches: { 3:"692284f", 4:"2d4adf4", ... 42:"d8b86cf" }[e] + ".js"
  // The object literal must be flat (no nesting), which is always true for
  // webpack chunk maps.
  const chunkMapRe = /\{[^}]+?\}\s*\[\w+\]\s*\+\s*["']\.js["']/g;

  let mapMatch: RegExpExecArray | null;
  while ((mapMatch = chunkMapRe.exec(jsText)) !== null) {
    const chunkMapStr = mapMatch[0];

    // Pass 2: Extract all hex hash values from the matched chunk map object.
    const hashRe = /["']([a-f0-9]{6,8})["']/g;
    let hashMatch: RegExpExecArray | null;
    while ((hashMatch = hashRe.exec(chunkMapStr)) !== null) {
      const hash = hashMatch[1];
      const fileName = `${hash}.js`;
      const url = resolveMaybeRelative(fileName, baseDir);
      if (url && !found.has(url)) {
        found.set(url, {
          url,
          source: baseUrl,
          confidence: 'low',
        });
      }
    }
  }

  return [...found.values()];
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function normalizeUrl(raw: string): string | null {
  let url = raw.trim();
  if (url.startsWith('//')) url = 'https:' + url;
  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}

function resolveMaybeRelative(raw: string, baseUrl: string): string | null {
  try {
    return new URL(raw, baseUrl).href;
  } catch {
    return null;
  }
}

function walkJson(obj: unknown, visit: (value: unknown) => void): void {
  if (Array.isArray(obj)) {
    for (const item of obj) walkJson(item, visit);
  } else if (obj !== null && typeof obj === 'object') {
    for (const val of Object.values(obj)) walkJson(val, visit);
  } else {
    visit(obj);
  }
}
