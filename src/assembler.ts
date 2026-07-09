import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { type SnapshotOptions, type SnapshotResult, type AssetRef } from './types.js';
import { fetchWithTimeout } from './fetcher.js';
import { parseHtml } from './parser/html-parser.js';
import { extractCssAssets } from './parser/css-parser.js';
import { downloadAllAssets } from './fetcher.js';
import { assembleSingleFile } from './output/single-file.js';
import { assembleBundle } from './output/bundle.js';
import { assembleConvert } from './output/convert.js';
import { postDownloadValidation, isHtmlLike } from './validators.js';
import { convert } from './converter.js';

async function fetchHtml(url: string, timeout: number): Promise<string | null> {
  try {
    const result = await fetchWithTimeout(url, timeout);
    if (!result.ok) {
      process.stdout.write(`Warning: Origin returned HTTP ${result.status} for HTML page\n`);
      if (result.status >= 400 && (result.isHtmlLike || isHtmlLike(result.buffer))) {
        return result.buffer.toString('utf8');
      }
      return null;
    }
    return result.buffer.toString('utf8');
  } catch (err: any) {
    process.stdout.write(`Warning: Failed to fetch HTML: ${err.message}\n`);
    return null;
  }
}

function dedupe<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(i => {
    if (seen.has(i.url)) return false;
    seen.add(i.url);
    return true;
  });
}

function extractInlineCss(html: string): string {
  let css = '';
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match;
  while ((match = styleRegex.exec(html)) !== null) {
    css += match[1] + '\n';
  }
  return css;
}

function extractInlineJs(html: string): string {
  let js = '';
  const scriptRegex = /<script[^>]*(?!src=)(?:[^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    js += match[1] + '\n';
  }
  return js;
}

/**
 * Extract CSS and JS from downloaded assets
 */
function extractCssFromAssets(assets: any[]): string {
  return assets
    .filter(a => a.type === 'css' && a.status === 'fetched')
    .map(a => a.textContent || '')
    .filter(Boolean)
    .join('\n');
}

function extractJsFromAssets(assets: any[]): string {
  return assets
    .filter(a => a.type === 'js' && a.status === 'fetched')
    .map(a => a.textContent || '')
    .filter(Boolean)
    .join('\n');
}

export async function snapshot(options: SnapshotOptions): Promise<SnapshotResult> {
  const timestamp = new Date().toISOString();

  process.stdout.write(`Fetching HTML from ${options.url}...\n`);
  const html = await fetchHtml(options.url, options.timeout);
  if (!html) {
    throw new Error('Failed to retrieve page content');
  }

  process.stdout.write(`Parsing HTML for assets...\n`);
  const parsed = parseHtml(html, options.url);

  let allRefs: AssetRef[] = [...parsed.assets];

  for (const style of parsed.inlineStyles) {
    const refs = extractCssAssets(style.text, style.baseUrl);
    for (const r of refs) {
      allRefs.push({
        url: r.url,
        type: r.type === 'css' ? 'css' : r.type === 'font' ? 'font' : 'img',
        origin: 'style',
      });
    }
  }

  allRefs = dedupe(allRefs);

  const cssRefs = allRefs.filter(r => r.type === 'css');
  const cssContentMap = new Map<string, string>();

  for (const ref of cssRefs) {
    try {
      const result = await fetchWithTimeout(ref.url, options.timeout, options.url);
      if (result.ok) {
        const cssText = result.buffer.toString('utf8');
        cssContentMap.set(ref.url, cssText);

        const childRefs = extractCssAssets(cssText, ref.url);
        for (const r of childRefs) {
          allRefs.push({
            url: r.url,
            type: r.type === 'css' ? 'css' : r.type === 'font' ? 'font' : 'img',
            origin: `css:${ref.url}`,
          });
        }
      }
    } catch {
      // skip failed CSS fetches for recursive discovery
    }
  }

  allRefs = dedupe(allRefs);

  if (allRefs.length > options.maxAssets) {
    process.stdout.write(`Limiting from ${allRefs.length} to ${options.maxAssets} assets\n`);
    allRefs = allRefs.slice(0, options.maxAssets);
  }

  process.stdout.write(`Downloading ${allRefs.length} assets...\n`);
  const assets = await downloadAllAssets(allRefs, options, (asset, index, total) => {
    const icon = asset.status === 'fetched' ? '✓' : '✗';
    process.stdout.write(`  ${icon} [${index}/${total}] ${asset.originUrl}${asset.error ? ` (${asset.error})` : ` (${fmt(asset.size)})`}\n`);
  });

  for (const a of assets) {
    if (a.type === 'css' && a.status === 'fetched' && !a.textContent) {
      const cached = cssContentMap.get(a.originUrl);
      if (cached) a.textContent = cached;
    }
  }

  // Post-download integrity validation
  const validationFailures = postDownloadValidation(assets);
  if (validationFailures.length > 0) {
    process.stdout.write(`\nIntegrity validation warnings:\n`);
    for (const failure of validationFailures) {
      process.stdout.write(`  ⚠ ${failure.url}: ${failure.error}\n`);
    }
  }

  const stats = {
    total: assets.length,
    fetched: assets.filter(a => a.status === 'fetched').length,
    failed: assets.filter(a => a.status === 'failed').length,
    skipped: assets.filter(a => a.status === 'skipped').length,
    validationWarnings: validationFailures.length,
    totalBytes: assets.reduce((s, a) => s + a.size, 0),
  };

  process.stdout.write(`\nAssembling output (${options.mode} mode)...\n`);

  if (options.mode === 'bundle') {
    mkdirSync(options.output, { recursive: true });
    assembleBundle(parsed.document, assets, options);

    for (const a of assets) {
      if (a.status === 'fetched' && a.localPath) {
        mkdirSync(dirname(a.localPath), { recursive: true });
        const buf = a.dataUri
          ? Buffer.from(a.dataUri.split(',')[1]!, 'base64')
          : a.textContent
            ? Buffer.from(a.textContent, 'utf8')
            : Buffer.alloc(0);
        writeFileSync(a.localPath, buf);
      }
    }
  } else {
    const outputHtml = assembleSingleFile(parsed.document, assets, options);
    mkdirSync(dirname(options.output), { recursive: true });
    writeFileSync(options.output, outputHtml, 'utf8');
  }

  // Handle component extraction if requested
  if (options.extractComponents) {
    process.stdout.write(`\nExtracting component structure...\n`);

    // Collect CSS and JS from multiple sources:
    // 1. Inline CSS/JS from original HTML
    let css = extractInlineCss(html);
    let js = extractInlineJs(html);

    // 2. Downloaded CSS/JS from assets (for comprehensive coverage)
    if (assets.length > 0) {
      const cssFromAssets = extractCssFromAssets(assets);
      const jsFromAssets = extractJsFromAssets(assets);
      css = css ? (css + '\n' + cssFromAssets) : cssFromAssets;
      js = js ? (js + '\n' + jsFromAssets) : jsFromAssets;
    }

    process.stdout.write(`Converting to component structure...\n`);
    const converted = await convert(html, css, js, options);

    process.stdout.write(`Writing component output...\n`);
    const componentOutputDir = options.mode === 'bundle'
      ? options.output + '/components'
      : options.output + '_components';

    const componentOptions = {
      ...options,
      output: componentOutputDir,
    };

    assembleConvert(converted, componentOptions);
  }

  return { sourceUrl: options.url, timestamp, html: '', assets, stats };
}

function fmt(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${['B', 'KB', 'MB', 'GB'][i]}`;
}
