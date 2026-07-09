import { parse, walk } from 'css-tree';
import type { CssNode } from 'css-tree';
import { resolveUrl } from './url-resolver.js';

export interface CssAssetRef {
  url: string;
  type: 'font' | 'img' | 'css' | 'other';
}

function classifyCssUrl(urlStr: string): CssAssetRef['type'] {
  const ext = urlStr.split('?')[0].split('#')[0].toLowerCase();
  if (ext.endsWith('.woff') || ext.endsWith('.woff2') || ext.endsWith('.ttf') || ext.endsWith('.otf') || ext.endsWith('.eot')) {
    return 'font';
  }
  if (ext.endsWith('.css')) {
    return 'css';
  }
  const imgExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.ico'];
  if (imgExts.some(e => ext.endsWith(e))) {
    return 'img';
  }
  return 'other';
}

export function extractCssAssets(css: string, baseUrl: string): CssAssetRef[] {
  const refs: CssAssetRef[] = [];
  let ast;
  try {
    ast = parse(css, { positions: false });
  } catch {
    return refs;
  }

  walk(ast, (node: CssNode) => {
    if (node.type === 'Url') {
      const urlStr = node.value;
      if (urlStr) {
        const resolved = resolveUrl(urlStr, baseUrl);
        if (resolved) {
          refs.push({ url: resolved, type: classifyCssUrl(resolved) });
        }
      }
    }

    if (node.type === 'Atrule' && node.name === 'import') {
      const prelude = node.prelude;
      if (prelude) {
        let importUrl: string | null = null;
        walk(prelude, (child: CssNode) => {
          if (child.type === 'String' && !importUrl) {
            importUrl = child.value;
          }
          if (child.type === 'Url' && !importUrl) {
            importUrl = child.value;
          }
        });
        if (importUrl) {
          const resolved = resolveUrl(importUrl, baseUrl);
          if (resolved) {
            refs.push({ url: resolved, type: 'css' });
          }
        }
      }
    }
  });

  return refs;
}

export function rewriteCssUrls(css: string, urlMap: Map<string, string>): string {
  let result = css;
  for (const [original, replacement] of urlMap) {
    const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), replacement);
  }
  return result;
}
