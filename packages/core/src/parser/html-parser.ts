import { JSDOM } from 'jsdom';
import { type AssetType, type AssetRef } from '../types.js';
import { resolveUrl, parseSrcset } from './url-resolver.js';
import { extractCssAssets } from './css-parser.js';

let snapshotIdCounter = 0;

export interface ParsedHtml {
  document: Document;
  assets: AssetRef[];
  inlineStyles: { text: string; baseUrl: string; element: Element }[];
}

// Item descriptor for TAG_ATTR_MAP entries
interface TagAttrRule {
  sel: string;
  attr: string;
  type: AssetType;
  /** Optional filter: return false to skip downloading this resource (but still mark data-origin-url) */
  filter?: (url: string) => boolean;
}

const TAG_ATTR_MAP: Record<string, TagAttrRule[]> = {
  link: [
    { sel: 'link[rel="stylesheet"][href]', attr: 'href', type: 'css' },
    { sel: 'link[rel="preload"][href]', attr: 'href', type: 'other' },
    { sel: 'link[rel="icon"][href]', attr: 'href', type: 'img' },
    { sel: 'link[rel="apple-touch-icon"][href]', attr: 'href', type: 'img' },
  ],
  script: [
    {
      sel: 'script[src]',
      attr: 'src',
      type: 'js',
      // Only download resources that look like actual JS files.
      // Route paths (e.g. /web_auto_login_v2/index.html) return HTML, not JS,
      // and would cause "Unexpected token '<'" errors if loaded as scripts.
      filter: (url: string) => {
        const pathname = new URL(url).pathname;
        // Must have a .js/.mjs/.cjs extension or look like a hashed file
        return /\.(?:js|mjs|cjs)(?:\?[^#]*)?(?:#.*)?$/i.test(pathname);
      },
    },
  ],
  img: [
    { sel: 'img[src]', attr: 'src', type: 'img' },
  ],
  source: [
    { sel: 'source[src]', attr: 'src', type: 'media' },
  ],
  video: [
    { sel: 'video[src]', attr: 'src', type: 'media' },
  ],
  audio: [
    { sel: 'audio[src]', attr: 'src', type: 'media' },
  ],
};

function addSnapshotAttrs(el: Element, originUrl: string): void {
  if (!el.hasAttribute('data-snapshot-id')) {
    el.setAttribute('data-snapshot-id', `snap-${++snapshotIdCounter}`);
  }
  if (!el.hasAttribute('data-origin-url')) {
    el.setAttribute('data-origin-url', originUrl);
  }
}

function processSrcsetElements(
  selector: string,
  selectorLabel: string,
  document: Document,
  baseUrl: string,
  seen: Set<string>,
  assets: AssetRef[],
): void {
  for (const el of document.querySelectorAll(selector)) {
    const raw = el.getAttribute('srcset');
    if (!raw) continue;
    for (const url of parseSrcset(raw, baseUrl)) {
      if (!seen.has(url)) {
        seen.add(url);
        assets.push({ url, type: 'img', origin: selectorLabel, attribute: 'srcset' });
      }
      addSnapshotAttrs(el, url);
    }
  }
}

export function parseHtml(html: string, baseUrl: string): ParsedHtml {
  const dom = new JSDOM(html, { url: baseUrl });
  const document = dom.window.document as unknown as Document;
  const assets: AssetRef[] = [];
  const seen = new Set<string>();
  const inlineStyles: ParsedHtml['inlineStyles'] = [];

  // NOTE: snapshotIdCounter is NOT reset here to ensure unique IDs across multiple parseHtml calls
  // This is critical for component extraction which calls parseHtml multiple times

  for (const rules of Object.values(TAG_ATTR_MAP)) {
    for (const { sel, attr, type, filter } of rules) {
      for (const el of document.querySelectorAll(sel)) {
        const raw = el.getAttribute(attr);
        if (!raw) continue;
        const resolved = resolveUrl(raw, baseUrl);
        if (!resolved) continue;
        // Always add snapshot attrs so assembler can locate the element,
        // even if asset is a duplicate (same URL referenced multiple times in the page)
        addSnapshotAttrs(el, resolved);
        if (seen.has(resolved)) continue;
        // If a filter is defined and it rejects this URL, skip downloading
        // but still keep the data-origin-url marker for later cleanup
        if (filter && !filter(resolved)) continue;
        seen.add(resolved);
        assets.push({ url: resolved, type, origin: sel, attribute: attr });
      }
    }
  }

  processSrcsetElements('img[srcset]', 'img[srcset]', document, baseUrl, seen, assets);
  processSrcsetElements('source[srcset]', 'source[srcset]', document, baseUrl, seen, assets);

  for (const el of document.querySelectorAll('style')) {
    const text = el.textContent || '';
    if (text.trim()) {
      inlineStyles.push({ text, baseUrl, element: el });
      const cssRefs = extractCssAssets(text, baseUrl);
      for (const ref of cssRefs) {
        if (seen.has(ref.url)) continue;
        seen.add(ref.url);
        assets.push({ url: ref.url, type: ref.type === 'css' ? 'css' : ref.type === 'font' ? 'font' : 'img', origin: 'style', attribute: 'textContent' });
      }
    }
  }

  return { document, assets, inlineStyles };
}
