import { writeFileSync, mkdirSync } from 'node:fs';
import { join, extname, relative, resolve, dirname } from 'node:path';
import { parse, walk } from 'css-tree';
import { type Asset, type SnapshotOptions } from '../types.js';
import { rewriteCssUrls } from '../parser/css-parser.js';
import { resolveUrl } from '../parser/url-resolver.js';

/**
 * Serialize Document to HTML string, compatible with both linkedom and jsdom
 *
 * Uses outerHTML as the primary method (produces proper HTML serialization).
 * Falls back to XMLSerializer (for linkedom-like environments) or toString().
 */
function serializeDocument(document: Document): string {
  // Prefer outerHTML (HTML serialization) — preserves SVG, avoids
  // XMLSerializer's HTML-entity-encoding of <script> content.
  if ('documentElement' in document && document.documentElement) {
    try {
      const html = document.documentElement.outerHTML;
      if (html) return html;
    } catch {
      // outerHTML may throw in some DOM implementations
    }

    // Fallback: try jsdom's XMLSerializer
    const defaultView = document.defaultView as Window & typeof globalThis;
    if (defaultView && defaultView.XMLSerializer) {
      const serializer = new defaultView.XMLSerializer();
      return serializer.serializeToString(document);
    }
  }
  // Fallback for linkedom or other implementations
  return document.toString();
}

function prettyPrintHtml(html: string): string {
  const indentStr = '  ';
  const lines: string[] = [];

  const result = html
    .replace(/>\s*</g, '>\n<')  // Add newline between tags
    .replace(/\n\s+/g, '\n');   // Remove existing whitespace

  let currentIndent = 0;
  for (const line of result.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Close tags decrease indent
    if (trimmed.startsWith('</')) {
      currentIndent = Math.max(0, currentIndent - 1);
    }

    lines.push(indentStr.repeat(currentIndent) + trimmed);

    // Self-closing or empty tags don't change indent
    if (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.endsWith('/>')) {
      // Open tags increase indent (unless they close on the same line)
      if (!trimmed.includes('</')) {
        currentIndent++;
      }
    }
  }

  return lines.join('\n');
}

function assetCategory(type: string): string {
  const map: Record<string, string> = { css: 'css', js: 'js', img: 'img', font: 'fonts', media: 'data' };
  return map[type] || 'data';
}

/** Escape a string for use as a CSS attribute selector value (inside `[attr="..."]) */
function escCssAttr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Escape a URL string for use in a regex — safe for literal URL matching in srcset replacement */
function escRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeJoin(base: string, target: string): string | null {
  const resolvedBase = resolve(base);
  const resolved = resolve(resolvedBase, target);
  const normalizedBase = resolvedBase.replace(/\\/g, '/');
  const normalizedResolved = resolved.replace(/\\/g, '/');
  if (!normalizedResolved.startsWith(normalizedBase)) return null;
  return resolved;
}

/** MIME → extension mapping */
function extnameFromMime(mime: string): string | null {
  const map: Record<string, string> = {
    'text/css': '.css',
    'application/javascript': '.js',
    'text/javascript': '.js',
    'application/x-javascript': '.js',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'image/webp': '.webp',
    'image/x-icon': '.ico',
    'font/woff': '.woff',
    'font/woff2': '.woff2',
    'font/ttf': '.ttf',
    'font/opentype': '.otf',
  };
  return map[mime] || null;
}

/**
 * Classify an asset URL and produce a safe filename.
 * Priority: Content-Type → URL path semantics → fallback.
 */
function classifyAssetFilename(url: string, mime: string, index: number): string {
  try {
    const u = new URL(url);
    const pathname = u.pathname.replace(/^\/+/, '') || 'index';

    // 1. Content-Type inference extension name
    const extFromMime = extnameFromMime(mime);
    const existingExt = extname(pathname);
    if (extFromMime && !existingExt) {
      return pathname + extFromMime;
    }
    if (extFromMime && existingExt && existingExt !== extFromMime) {
      // The file has an extension but differs from, For example,js files are not treated text .html.
      return pathname + extFromMime;
    }

    // 2. Handle paths with query parameters like /gtag/js?id=xxx without extension
    const lastSegment = pathname.split('/').pop() || 'index';
    const extFromUrl = extname(lastSegment);
    if (!extFromUrl && u.search) {
      // As /gtag/js?id=xxx → → /gtagtag.js
      const base = lastSegment.length < 10 ? `asset_${index}` : lastSegment;
      // According to MIME, add a supplemental extension
      if (extFromMime) return base + extFromMime;
      // Common path segment path inference
      if (lastSegment === 'js' || lastSegment === 'script') return base + '.js';
      if (lastSegment === 'css' || lastSegment === 'style') return base + '.css';
      return base + '.bin';
    }

    // 3. Existing extension
    if (existingExt) return pathname;

    // 4. No file extension, query parameters → may be a route path
    return pathname || `asset_${index}`;
  } catch {
    return `asset_${index}${extname(url.split('?')[0]) || '.bin'}`;
  }
}

/**
 * Determine if a URL represents a route path (i.e. produces an HTML page).
 * Strict check: pathname has no extension AND last segment is not a short filename-like word.
 */
function isRoutePath(url: string): boolean {
  try {
    const u = new URL(url);
    const pathname = u.pathname.replace(/\/+$/, '');
    const ext = extname(pathname);
    if (ext) return false; // Has extension → File

    // Check the last path segment
    const lastSegment = pathname.split('/').pop() || '';
    // Has query parameters and the last part is shorter → Likely an API or file (e.g., /gtag/js?id=xxx)
    if (lastSegment && lastSegment.length < 10 && u.search) return false;
    // No query parameters → Route path
    return true;
  } catch {
    return false;
  }
}

function routeToIndexPath(url: string, index: number): string {
  try {
    const u = new URL(url);
    const pathname = u.pathname.replace(/^\/+/, '') || 'index';
    return join(pathname, 'index.html');
  } catch {
    return `route_${index}/index.html`;
  }
}

export function assembleBundle(
  document: Document,
  assets: Asset[],
  options: SnapshotOptions,
): void {
  const outDir = options.output;
  const assetsDir = join(outDir, 'assets');
  const assetMap = new Map<string, string>();

  mkdirSync(assetsDir, { recursive: true });

  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    if (a.status !== 'fetched') continue;

    let fn;
    if (isRoutePath(a.originUrl)) {
      fn = routeToIndexPath(a.originUrl, i);
    } else {
      fn = classifyAssetFilename(a.originUrl, a.mime, i);
    }
    
    // Path traversal protection
    const safeLocalPath = safeJoin(assetsDir, fn);
    if (!safeLocalPath) {
      a.status = 'failed';
      a.error = 'Path traversal attempt blocked';
      continue;
    }
    
    // Ensure parent directory exists
    mkdirSync(dirname(safeLocalPath), { recursive: true });
    
    const relPath = relative(outDir, safeLocalPath).replace(/\\/g, '/');

    a.localPath = safeLocalPath;
    assetMap.set(a.originUrl, relPath);
  }

  // ── Rewrite CSS content: replace remote url() references with local paths ──
  // This ensures that CSS files (url(font.woff2), url(image.png), etc.)
  // point to the local assets/ directory instead of the original remote URLs.
  for (const a of assets) {
    if (a.status !== 'fetched' || a.type !== 'css' || !a.textContent) continue;
    const cssLocalPath = assetMap.get(a.originUrl);
    if (!cssLocalPath) continue;
    const cssDir = dirname(cssLocalPath);

    const cssUrlMap = new Map<string, string>();
    for (const [originUrl, assetRelPath] of assetMap.entries()) {
      // Compute relative path from the CSS file's directory to the referenced asset
      // e.g. CSS at assets/css/foo.css → assets/img/bar.png → ../img/bar.png
      if (originUrl === a.originUrl) continue;
      const relFromCss = relative(cssDir, assetRelPath).replace(/\\/g, '/');

      // Map 1: full URL → relative path (covers CSS using full URLs like url(https://...))
      cssUrlMap.set(originUrl, relFromCss);

      // Map 2: absolute path → relative path (covers Nuxt/Vue CSS using
      // url(/_nuxt/fonts/xxx.woff) instead of full URLs). The pathname
      // extracted from the origin URL matches the absolute-path reference
      // used in the CSS content since they share the same origin.
      try {
        const urlObj = new URL(originUrl);
        const absolutePath = urlObj.pathname;
        if (absolutePath.startsWith('/') && absolutePath.length > 1) {
          cssUrlMap.set(absolutePath, relFromCss);
        }
      } catch {
        // Skip if originUrl is not a valid URL (should not happen in practice)
      }
    }

    // Map 3: relative paths in CSS (e.g. url(../icons/icon.svg)) →
    // correct relative path from the CSS file's local directory.
    // These are not covered by Map 1 (full URL) or Map 2 (absolute path)
    // because the CSS literally uses the relative form.
    // We parse the CSS AST to find all url() references, resolve each
    // relative path to its full URL, look it up in assetMap, and compute
    // the correct relative path from the CSS file's directory.
    let cssAst: ReturnType<typeof parse> | null = null;
    try {
      cssAst = parse(a.textContent, { positions: false });
    } catch {
      // Malformed CSS — skip relative-path mapping
    }
    if (cssAst) {
      walk(cssAst, (node) => {
        if (node.type !== 'Url' || !node.value) return;
        const urlStr = node.value;
        // Skip inline / fragment-only URLs
        if (urlStr.startsWith('data:') || urlStr.startsWith('blob:') ||
            urlStr.startsWith('javascript:') || urlStr.startsWith('#')) return;
        // Only handle relative paths (not full URLs or absolute paths)
        if (urlStr.startsWith('http://') || urlStr.startsWith('https://') ||
            urlStr.startsWith('/') || urlStr.startsWith('//')) return;
        // Resolve the relative path against the CSS file's origin URL
        const resolved = resolveUrl(urlStr, a.originUrl);
        if (!resolved) return;
        const assetRelPath = assetMap.get(resolved);
        if (!assetRelPath) return;
        // Skip if the CSS file *is* the resolved asset (shouldn't happen)
        if (resolved === a.originUrl) return;
        const relFromCss = relative(cssDir, assetRelPath).replace(/\\/g, '/');
        // Only add if the original text is different from what we'd compute
        // (avoid redundant entries that would cause no-op replacements)
        if (urlStr !== relFromCss) {
          cssUrlMap.set(urlStr, relFromCss);
        }
      });
    }

    if (cssUrlMap.size > 0) {
      a.textContent = rewriteCssUrls(a.textContent, cssUrlMap);
    }
  }

  for (const a of assets) {
    if (a.status !== 'fetched') continue;
    const relPath = assetMap.get(a.originUrl);
    if (!relPath) continue;

    // Use data-origin-url (set by html-parser with resolved URL) to locate elements,
    // because DOM attributes (src/href) still hold raw paths (e.g. "/_nuxt/...")
    // while a.originUrl is the resolved absolute URL.
    const els = [...document.querySelectorAll(`[data-origin-url="${escCssAttr(a.originUrl)}"]`)];
    for (const el of els) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'link') {
        el.setAttribute('href', relPath);
      } else if (tag === 'script' || tag === 'img' || tag === 'source' || tag === 'video' || tag === 'audio' || tag === 'embed') {
        el.setAttribute('src', relPath);
      } else if (tag === 'object') {
        el.setAttribute('data', relPath);
      } else if (tag === 'use' || tag === 'image') {
        el.setAttribute('href', relPath);
      }

      // Rewrite URLs inside srcset attribute (responsive images, picture elements)
      if ((tag === 'img' || tag === 'source') && el.hasAttribute('srcset')) {
        const srcset = el.getAttribute('srcset');
        if (srcset) {
          // srcset format: "url descriptor, url descriptor, ..."
          // e.g. "img/hero-1x.jpg 1x, img/hero-2x.jpg 2x"
          // Browsers may percent-encode the URL in srcset (e.g. ? → %3F),
          // so we try matching both the raw originUrl and its encoded form.
          const rawEscaped = escRegex(a.originUrl);
          const encodedUrl = a.originUrl.replace(/[^a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=]/g, c =>
            encodeURIComponent(c)
          );
          const encodedEscaped = encodedUrl !== a.originUrl ? escRegex(encodedUrl) : null;
          const pattern = encodedEscaped
            ? `(?:${rawEscaped}|${encodedEscaped})`
            : rawEscaped;
          const replaced = srcset.replace(
            new RegExp(pattern, 'g'),
            relPath,
          );
          el.setAttribute('srcset', replaced);
        }
      }
    }

    // Rewrite <a href> for route-to-index mapping
    if (isRoutePath(a.originUrl)) {
      const anchors = [...document.querySelectorAll(`a[href="${escCssAttr(a.originUrl)}"]`)];
      for (const el of anchors) el.setAttribute('href', relPath);
    }
  }

  // Clean up failed/skipped assets: remove their src/href to avoid dangling
  // external requests in offline mode and potential privacy leaks.
  const processedOriginUrls = new Set(assets.map(a => a.originUrl));
  for (const a of assets) {
    if (a.status === 'fetched') continue;
    const els = [...document.querySelectorAll(`[data-origin-url="${escCssAttr(a.originUrl)}"]`)];
    for (const el of els) {
      const tag = el.tagName.toLowerCase();
      // Remove the resource attribute so the browser doesn't attempt to load it
      if (tag === 'link') {
        el.removeAttribute('href');
      } else if (tag === 'script' || tag === 'img' || tag === 'source' || tag === 'video' || tag === 'audio' || tag === 'embed') {
        el.removeAttribute('src');
      } else if (tag === 'object') {
        el.removeAttribute('data');
      } else if (tag === 'use' || tag === 'image') {
        el.removeAttribute('href');
      }
      // For srcset, also clear it since all candidates would fail
      if ((tag === 'img' || tag === 'source') && el.hasAttribute('srcset')) {
        el.removeAttribute('srcset');
      }
    }
  }

  // Catch-all: remove src/href from elements whose data-origin-url was registered
  // by parseHtml() but never appeared in the assets array (e.g., filtered out by
  // the script[src] filter). Without this, those elements retain their original
  // absolute paths, causing 404 errors in serve mode or broken paths in file://.
  for (const el of document.querySelectorAll('[data-origin-url]')) {
    const originUrl = el.getAttribute('data-origin-url');
    if (!originUrl || processedOriginUrls.has(originUrl)) continue;
    const tag = el.tagName.toLowerCase();
    if (tag === 'link') {
      el.removeAttribute('href');
    } else if (tag === 'script' || tag === 'img' || tag === 'source' || tag === 'video' || tag === 'audio' || tag === 'embed') {
      el.removeAttribute('src');
    } else if (tag === 'object') {
      el.removeAttribute('data');
    } else if (tag === 'use' || tag === 'image') {
      el.removeAttribute('href');
    }
    if ((tag === 'img' || tag === 'source') && el.hasAttribute('srcset')) {
      el.removeAttribute('srcset');
    }
  }

  const head = document.querySelector('head');
  if (head) {
    const ms = document.createElement('meta');
    ms.setAttribute('name', 'snapshot:source');
    ms.setAttribute('content', options.url);
    head.prepend(ms);

    const mt = document.createElement('meta');
    mt.setAttribute('name', 'snapshot:time');
    mt.setAttribute('content', new Date().toISOString());
    const nextNode = ms.nextSibling;
    if (nextNode) {
      head.insertBefore(mt, nextNode);
    } else {
      head.appendChild(mt);
    }
  }

  // Clean up the snapshot helper attribute to avoid leaking the full URL in the output
  for (const el of document.querySelectorAll('[data-snapshot-id]')) {
    el.removeAttribute('data-snapshot-id');
  }
  for (const el of document.querySelectorAll('[data-origin-url]')) {
    el.removeAttribute('data-origin-url');
  }

  let html = serializeDocument(document);
  if (!html.startsWith('<!')) html = '<!DOCTYPE html>\n' + html;

  // Apply pretty-printing if requested
  if (options.pretty) {
    html = prettyPrintHtml(html);
  }

  writeFileSync(join(outDir, 'index.html'), html, 'utf8');

  const manifest: Record<string, { size: number; mime: string }> = {};
  for (const a of assets) {
    if (a.status === 'fetched') {
      manifest[a.originUrl] = { size: a.size, mime: a.mime };
    }
  }

  const meta = {
    sourceUrl: options.url,
    timestamp: new Date().toISOString(),
    stats: {
      total: assets.length,
      fetched: assets.filter(a => a.status === 'fetched').length,
      failed: assets.filter(a => a.status === 'failed').length,
      skipped: assets.filter(a => a.status === 'skipped').length,
      totalBytes: assets.reduce((s, a) => s + a.size, 0),
    },
    assets: assets.map(a => ({
      originUrl: a.originUrl,
      localPath: assetMap.get(a.originUrl) || null,
      type: a.type,
      status: a.status,
      size: a.size,
      mime: a.mime,
      error: a.error || null,
    })),
    manifest,
  };

  writeFileSync(join(outDir, 'snapshot.json'), JSON.stringify(meta, null, 2), 'utf8');
}
