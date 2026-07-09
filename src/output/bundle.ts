import { writeFileSync, mkdirSync } from 'node:fs';
import { join, extname, relative, dirname, resolve } from 'node:path';
import { type Asset, type SnapshotOptions } from '../types.js';

function assetCategory(type: string): string {
  const map: Record<string, string> = { css: 'css', js: 'js', img: 'img', font: 'fonts', media: 'data' };
  return map[type] || 'data';
}

function uniqueFilename(url: string, index: number): string {
  try {
    const u = new URL(url);
    let name = u.pathname.replace(/^\/+/, '') || 'index';
    if (name.length > 120) {
      const e = extname(name);
      name = name.slice(0, 100) + '_' + index + e;
    }
    return name || `asset_${index}`;
  } catch {
    return `asset_${index}${extname(url.split('?')[0]) || '.bin'}`;
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safeJoin(base: string, target: string): string | null {
  const resolvedBase = resolve(base);
  const resolved = resolve(resolvedBase, target);
  const normalizedBase = resolvedBase.replace(/\\/g, '/');
  const normalizedResolved = resolved.replace(/\\/g, '/');
  if (!normalizedResolved.startsWith(normalizedBase)) return null;
  return resolved;
}

function isRoutePath(url: string): boolean {
  try {
    const pathname = new URL(url).pathname;
    return extname(pathname) === '';
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

    const cat = assetCategory(a.type);
    const catDir = join(assetsDir, cat);
    mkdirSync(catDir, { recursive: true });

    let fn;
    if (isRoutePath(a.originUrl)) {
      fn = routeToIndexPath(a.originUrl, i);
    } else {
      fn = uniqueFilename(a.originUrl, i);
    }
    
    const localPath = join(catDir, fn);
    
    // Path traversal protection
    const safeLocalPath = safeJoin(catDir, fn);
    if (!safeLocalPath) {
      a.status = 'failed';
      a.error = 'Path traversal attempt blocked';
      continue;
    }
    
    const relPath = relative(outDir, safeLocalPath).replace(/\\/g, '/');

    a.localPath = safeLocalPath;
    assetMap.set(a.originUrl, relPath);
  }

  for (const a of assets) {
    if (a.status !== 'fetched') continue;
    const relPath = assetMap.get(a.originUrl);
    if (!relPath) continue;

    if (a.type === 'css') {
      const q = `link[href="${esc(a.originUrl)}"][rel="stylesheet"]`;
      const el = document.querySelector(q);
      if (el) el.setAttribute('href', relPath);
    } else if (a.type === 'js') {
      const q = `script[src="${esc(a.originUrl)}"]`;
      const el = document.querySelector(q);
      if (el) el.setAttribute('src', relPath);
    } else if (a.type === 'img') {
      const els = [...document.querySelectorAll(`img[src="${esc(a.originUrl)}"]`)];
      for (const el of els) el.setAttribute('src', relPath);
    }

    // Rewrite <a href> for route-to-index mapping
    if (isRoutePath(a.originUrl)) {
      const anchors = [...document.querySelectorAll(`a[href="${esc(a.originUrl)}"]`)];
      for (const el of anchors) el.setAttribute('href', relPath);
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
    head.insertBefore(mt, ms.nextSibling!);
  }

  let html = document.toString();
  if (!html.startsWith('<!')) html = '<!DOCTYPE html>\n' + html;

  writeFileSync(join(outDir, 'index.html'), html, 'utf8');

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
  };

  writeFileSync(join(outDir, 'snapshot.json'), JSON.stringify(meta, null, 2), 'utf8');

  const manifest: Record<string, { size: number; mime: string }> = {};
  for (const a of assets) {
    if (a.status === 'fetched') {
      manifest[a.originUrl] = { size: a.size, mime: a.mime };
    }
  }
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
}
