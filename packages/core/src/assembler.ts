import { writeFile, mkdir } from 'node:fs/promises';
import { mkdirSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { type SnapshotOptions, type SnapshotResult, type AssetRef, type Asset, type SnapshotIssue } from './types.js';
import { parseHtml } from './parser/html-parser.js';
import { extractCssAssets } from './parser/css-parser.js';
import { downloadAllAssets } from './fetcher.js';
import { assembleSingleFile } from './output/single-file.js';
import { assembleBundle } from './output/bundle.js';
import { assembleConvert } from './output/convert.js';
import { postDownloadValidation, isHtmlLike } from './validators.js';
import { convert } from './converter.js';
import { assessMemoryBudget, formatDegradationSummary } from './memory-budget.js';
import { runPool } from './worker/pool.js';
import { ResourceFilter } from './resource-filter.js';
import { detectFramework } from './framework/detector.js';
import { postSnapshotStrategies } from './framework/strategies/index.js';
import type { FrameworkDetection, SignalTier } from './framework/types.js';
import { compareTier, type FrameworkType } from './framework/types.js';
import { FRAMEWORK_TO_CODEGEN } from '@web-clone/codegen/framework-rules';
import { extractJsUrls, extractJsonUrls, extractWebpackChunks } from './discovery/recursive-scanner.js';
import type { FetcherAdapter, FetchResult } from './adapters/fetcher-adapter.js';
import { HttpFetcherAdapter } from './adapters/http-fetcher-adapter.js';
import { writeIssuesFiles, writeLogFiles } from './output/issues.js';
import { DEFAULTS } from './config/defaults.js';

async function fetchHtml(
  url: string,
  timeout: number,
  maxSize: number | undefined,
  adapter: FetcherAdapter,
  logs: SnapshotIssue[],
  issues: SnapshotIssue[]
): Promise<{ html: string; browserFramework?: FetchResult['browserFramework'] } | null> {
  try {
    const result = await adapter.fetch(url, { timeout, maxSize, isMainDocument: true });
    const browserFramework = result.browserFramework;
    if (!result.ok) {
      // Always log the HTTP status for debugging
      logs.push({
        severity: result.status >= 400 ? 'error' : 'info',
        category: 'html_fetch',
        source: url,
        message: `Origin returned HTTP ${result.status} for HTML page`,
        detail: `HTTP status code ${result.status}`,
      });

      // Handle 3xx status codes (redirects that weren't followed, 304 Not Modified, etc.)
      if (result.status >= 300 && result.status < 400) {
        if (result.buffer.length > 0) {
          return { html: result.buffer.toString('utf8'), browserFramework };
        }
        const errMsg = `HTTP ${result.status} with no content body — cannot proceed`;
        process.stdout.write(`  ${errMsg}\n`);
        return null;
      }

      // Handle 4xx/5xx: accept if the response is HTML-like (404 error page, 401 login form, etc.)
      if (result.status >= 400 && (result.isHtmlLike || isHtmlLike(result.buffer))) {
        // Quality issue: the page content might not be what the user expected
        issues.push({
          severity: 'warning',
          category: 'html_fetch',
          source: url,
          message: `HTML page returned HTTP ${result.status} — content accepted but may not be the intended page`,
          detail: `Server returned ${result.status}; the response body was accepted as HTML`,
          action: 'Review the snapshot output to verify the page content is correct',
        });
        return { html: result.buffer.toString('utf8'), browserFramework };
      }
      return null;
    }
    return { html: result.buffer.toString('utf8'), browserFramework };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const errMsg = `Failed to fetch HTML: ${message}`;
    process.stdout.write(`Warning: ${errMsg}\n`);
    logs.push({
      severity: 'error',
      category: 'html_fetch',
      source: url,
      message: errMsg,
      detail: message,
      action: 'Verify the URL is accessible and the network is available',
    });
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
  // Only matches <script> tags without the src attribute.
  // Ensure that src does not appear in tag attributes using negative first assertion
  const scriptRegex = /<script(?:\s+(?!src\b)[^>]*)*\s*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    js += match[1] + '\n';
  }
  return js;
}

/**
 * Extract CSS and JS from downloaded assets
 */
function extractCssFromAssets(assets: Asset[]): string {
  return assets
    .filter(a => a.type === 'css' && a.status === 'fetched')
    .map(a => a.textContent || '')
    .filter(Boolean)
    .join('\n');
}

/**
 * Framework/library file path patterns for JS pre-filtering.
 */
const FRAMEWORK_PATTERNS = [
  /\/node_modules\//,
  /\/react(\.[a-z]+)?\.js$/,
  /\/vue(\.[a-z]+)?\.js$/,
  /\/angular(\.[a-z]+)?\.js$/,
  /\/jquery(\.[a-z]+)?\.js$/,
  /\/umi(\.[a-z]+)?\.js$/,
  /\/lodash(\.[a-z]+)?\.js$/,
  /\/moment(\.[a-z]+)?\.js$/,
  /\/antd(\.[a-z]+)?\.js$/,
  /\/babel(\.[a-z]+)?\.js$/,
  /\/webpack(\.[a-z]+)?\.js$/,
  /\.min\.js$/,
];

function isFrameworkCode(originUrl: string): boolean {
  return FRAMEWORK_PATTERNS.some(pattern => pattern.test(originUrl));
}

/**
 * Check if the statically detected framework is more specific than
 * the browser-detected generic framework. When this returns true,
 * the static detection should take precedence.
 *
 * Examples:
 * - vitepress (static) is more specific than vue3/vue2 (browser)
 * - astro (static) is more specific than react (browser)
 * - nextjs (static) is more specific than react (browser)
 * - nuxt3/nuxt2 (static) is more specific than vue3/vue2 (browser)
 * - sveltekit (static) is more specific than svelte (browser)
 */
export function isMoreSpecific(staticFramework: FrameworkType, browserFramework: FrameworkType): boolean {
  // Specific frameworks that should override generic parent frameworks
  const specificToGeneric: Record<string, string[]> = {
    'vitepress': ['vue2', 'vue3'],
    'nuxt3': ['vue3'],
    'nuxt2': ['vue2'],
    'nextjs': ['react18', 'react'],
    'astro': ['react18', 'react', 'vue3', 'vue2'],
    'sveltekit': ['svelte'],
  };

  const genericOverrides = specificToGeneric[staticFramework];
  return !!genericOverrides && genericOverrides.includes(browserFramework);
}

function extractJsFromAssets(assets: Asset[]): string {
  const userCode = assets.filter((a) =>
    a.type === 'js' &&
    a.status === 'fetched' &&
    !isFrameworkCode(a.originUrl)
  );
  const frameworkCode = assets.filter((a) =>
    a.type === 'js' &&
    a.status === 'fetched' &&
    isFrameworkCode(a.originUrl)
  );

  if (frameworkCode.length > 0) {
    const userSize = userCode.reduce((s: number, a) => s + (a.size || 0), 0);
    const fwSize = frameworkCode.reduce((s: number, a) => s + (a.size || 0), 0);
    process.stdout.write(`  JS filter: ${userCode.length} user files (${fmt(userSize)}) + ${frameworkCode.length} framework files (${fmt(fwSize)}) filtered\n`);
  }

  return userCode
    .map((a) => a.textContent || '')
    .filter(Boolean)
    .join('\n');
}

/**
 * Async write assets with concurrency control and progress reporting.
 */
async function writeAssets(assets: Asset[], concurrency: number = 5): Promise<void> {
  const toWrite = assets.filter((a) => a.status === 'fetched' && a.localPath);
  const total = toWrite.length;
  if (total === 0) return;

  const tasks = toWrite.map(a => async (): Promise<void> => {
    const localPath = a.localPath;
    if (!localPath) return; // Safety check
    const dir = dirname(localPath);
    await mkdir(dir, { recursive: true });
    const dataUriContent = a.dataUri?.split(',')[1];
    const buf = dataUriContent
      ? Buffer.from(dataUriContent, 'base64')
      : a.textContent
        ? Buffer.from(a.textContent, 'utf8')
        : Buffer.alloc(0);
    await writeFile(localPath, buf);
  });

  await runPool(tasks, { concurrency: Math.max(2, Math.min(concurrency, 10)) }, (_result, _idx, completedCount) => {
    if (completedCount % Math.max(1, Math.floor(total / 10)) === 0 || completedCount === total) {
      process.stdout.write(`  Writing assets: ${completedCount}/${total}\n`);
    }
  });
}

/**
 * Basic Snapshot Functions - Pulling Directly Using HTTP
 * @public
 */
// Overload 1: backward-compatible CLI signature — snapshot(url, optionsWithoutUrl)
export async function snapshot(url: string, optionsWithoutUrl: Omit<SnapshotOptions, 'url'>): Promise<SnapshotResult>;
// Overload 2: library-friendly signature — snapshot(options, adapter?)
// The optional adapter allows passing a custom FetcherAdapter (e.g. PlaywrightFetcherAdapter)
// for browser-context snapshotting. Defaults to HttpFetcherAdapter when omitted.
export async function snapshot(options: SnapshotOptions, adapter?: FetcherAdapter): Promise<SnapshotResult>;
// Implementation
export async function snapshot(
  urlOrOptions: string | SnapshotOptions,
  optionsOrAdapter?: Omit<SnapshotOptions, 'url'> | FetcherAdapter
): Promise<SnapshotResult> {
  if (typeof urlOrOptions === 'string') {
    // Overload 1: CLI style — snapshot(url, optionsWithoutUrl)
    const opts = { ...(optionsOrAdapter as Omit<SnapshotOptions, 'url'>), url: urlOrOptions } as SnapshotOptions;
    return snapshotInternal(opts, new HttpFetcherAdapter());
  }
  // Overload 2: Library style — snapshot(options, adapter?)
  const fetcher = (optionsOrAdapter as FetcherAdapter | undefined) || new HttpFetcherAdapter();
  return snapshotInternal(urlOrOptions, fetcher);
}

/**
 * Internal Core Pipeline - shared by public APIs
 * @internal
 */
async function snapshotInternal(
  options: SnapshotOptions,
  adapter: FetcherAdapter
): Promise<SnapshotResult> {
  // Apply defaults for any option not explicitly set by the caller.
  // CLI path applies DEFAULTS via fromCommander(); library API path does not.
  options = { ...DEFAULTS, ...options };

  const timestamp = new Date().toISOString();
  const issues: SnapshotIssue[] = [];
  const logs: SnapshotIssue[] = [];

  const hybridAuthDomains = options.hybridAuthDomains ?? [];
  const downloadAdapter = (options.hybrid && adapter.constructor.name !== 'HttpFetcherAdapter')
    ? new HttpFetcherAdapter()
    : adapter;

  process.stdout.write(`Fetching HTML from ${options.url}...\n`);
  const fetchResult = await fetchHtml(options.url, options.timeout, options.maxFileSize, adapter, logs, issues);
  if (!fetchResult) {
    throw new Error('Failed to retrieve page content');
  }
  const html = fetchResult.html;
  const browserFramework = fetchResult.browserFramework;

  if (downloadAdapter !== adapter) {
    process.stdout.write(`Using hybrid mode: browser for HTML, HTTP pool for asset downloads.\n`);
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

  // Parallel CSS fetch + recursive @import extraction
  if (cssRefs.length > 0) {
    interface CssFetchResult {
      url: string;
      ok: boolean;
      cssText?: string;
      childRefs?: import('./parser/css-parser.js').CssAssetRef[];
    }

    const cssTasks = cssRefs.map(ref => async (): Promise<CssFetchResult> => {
      try {
        const result = await downloadAdapter.fetch(ref.url, { timeout: options.timeout, maxSize: options.maxFileSize, referer: options.url });
        if (result.ok) {
          const cssText = result.buffer.toString('utf8');
          const childRefs = extractCssAssets(cssText, ref.url);
          return { url: ref.url, ok: true, cssText, childRefs };
        }
        // CSS fetch returned non-ok status
        const msg = `HTTP ${result.status || 'error'}`;
        process.stdout.write(`  CSS fetch skipped: ${ref.url} — ${msg}\n`);
        logs.push({
          severity: 'warning',
          category: 'css_fetch',
          source: ref.url,
          message: `Failed to fetch CSS: ${msg}`,
          detail: `HTTP status ${result.status || 'unknown'}`,
        });
        return { url: ref.url, ok: false };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        process.stdout.write(`  CSS fetch skipped: ${ref.url} — ${message}\n`);
        logs.push({
          severity: 'warning',
          category: 'css_fetch',
          source: ref.url,
          message: `Failed to fetch CSS: ${message}`,
          detail: message,
        });
        return { url: ref.url, ok: false };
      }
    });

    process.stdout.write(`Fetching ${cssRefs.length} external CSS file(s)...\n`);

    const cssResults = await runPool(cssTasks, { concurrency: Math.max(2, Math.min(options.concurrency, 5)), timeoutMs: 60000 }, (_result, _idx, completedCount) => {
      process.stdout.write(`  CSS ${completedCount}/${cssRefs.length}\n`);
    });

    // Collect child refs sequentially (safe: no race conditions on allRefs)
    for (const r of cssResults) {
      if (r && r.ok && r.cssText && r.childRefs) {
        cssContentMap.set(r.url, r.cssText);
        for (const child of r.childRefs) {
          allRefs.push({
            url: child.url,
            type: child.type === 'css' ? 'css' : child.type === 'font' ? 'font' : 'img',
            origin: `css:${r.url}`,
          });
        }
      }
    }
  }

  allRefs = dedupe(allRefs);

  // Apply resource filtering
  const filter = new ResourceFilter({
    skipExtensions: options.skipExtensions,
    enableDefaultBlacklist: true,
  });
  const filteredRefs = filter.filter(allRefs);
  const filterStats = filter.getStats();

  if (filterStats.filtered > 0) {
    process.stdout.write(`Filtered ${filterStats.filtered} resource(s):\n`);
    for (const [reason, count] of Object.entries(filterStats.filterReasons)) {
      process.stdout.write(`  • ${reason}: ${count}\n`);
      logs.push({
        severity: 'info',
        category: 'resource_filter',
        source: 'Resource Filter',
        message: `${count} resource(s) filtered: ${reason}`,
        detail: `Total filtered: ${filterStats.filtered}`,
      });
    }
  }

  if (filteredRefs.length === 0) {
    process.stdout.write(`No external assets found — page is self-contained (all CSS/JS/images are inline)\n`);
  } else {
    process.stdout.write(`Downloading ${filteredRefs.length} assets (max: ${options.maxAssets})...\n`);
  }
  
  /**
   * Download assets with hybrid auth domain support.
   * When hybridAuthDomains is configured, assets from auth domains
   * use the browser adapter to preserve authentication context.
   */
  async function downloadAssetsWithAuthSupport(
    refs: AssetRef[],
    onProgress: (asset: Asset, index: number, total: number) => void,
  ): Promise<Asset[]> {
    if (hybridAuthDomains.length === 0) {
      return downloadAllAssets(refs, options, onProgress, downloadAdapter);
    }

    // Split assets into auth and non-auth groups
    const authRefs: AssetRef[] = [];
    const nonAuthRefs: AssetRef[] = [];
    for (const ref of refs) {
      try {
        const hostname = new URL(ref.url).hostname;
        const needsAuth = hybridAuthDomains.some(
          domain => hostname === domain || hostname.endsWith('.' + domain)
        );
        (needsAuth ? authRefs : nonAuthRefs).push(ref);
      } catch {
        nonAuthRefs.push(ref);
      }
    }

    const results: Asset[] = [];

    if (nonAuthRefs.length > 0) {
      process.stdout.write(`  Downloading ${nonAuthRefs.length} non-auth assets via HTTP pool...\n`);
      const nonAuthAssets = await downloadAllAssets(nonAuthRefs, options, onProgress, downloadAdapter);
      results.push(...nonAuthAssets);
    }

    if (authRefs.length > 0) {
      process.stdout.write(`  Downloading ${authRefs.length} auth assets via browser adapter...\n`);
      const authAssets = await downloadAllAssets(authRefs, options, onProgress, adapter);
      results.push(...authAssets);
    }

    return results;
  }

  const assets = await downloadAssetsWithAuthSupport(filteredRefs, (asset, index, total) => {
    const icon = asset.status === 'fetched' ? '✓' : '✗';
    process.stdout.write(`  ${icon} [${index}/${total}] ${asset.originUrl}${asset.error ? ` (${asset.error})` : ` (${fmt(asset.size)})`}\n`);
    // Collect issues for failed/skipped downloads
    if (asset.status === 'failed') {
      logs.push({
        severity: 'error',
        category: 'asset_download',
        source: asset.originUrl,
        message: `Failed to download: ${asset.error || 'Unknown error'}`,
        detail: asset.error,
      });
    } else if (asset.status === 'skipped' && asset.error) {
      logs.push({
        severity: 'info',
        category: 'asset_download',
        source: asset.originUrl,
        message: `Skipped: ${asset.error}`,
        detail: asset.error,
      });
    }
  });

  // Log resources accepted with non-2xx status codes (lenient acceptance)
  const lenientAcceptedAssets = assets.filter(a => a.acceptedWithWarning);
  if (lenientAcceptedAssets.length > 0) {
    process.stdout.write(`\n✓ Lenient acceptance (4xx/5xx with valid content):\n`);
    for (const asset of lenientAcceptedAssets) {
      process.stdout.write(`  ⚠ HTTP ${asset.statusCode} → ${asset.type.toUpperCase()} (${fmt(asset.size)}) ${asset.originUrl}\n`);
      issues.push({
        severity: 'warning',
        category: 'asset_download',
        source: asset.originUrl,
        message: `Accepted with HTTP ${asset.statusCode} — content may be incorrect`,
        detail: `Resource returned ${asset.statusCode} but contained valid ${asset.type.toUpperCase()} content and was accepted in lenient mode`,
        action: 'Verify this resource manually to ensure correct content was captured',
      });
    }
    process.stdout.write('\n');
  }

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
      issues.push({
        severity: 'warning',
        category: 'asset_validation',
        source: failure.url,
        message: `Integrity validation: ${failure.error}`,
        detail: failure.error,
        action: 'This asset may be corrupted or incomplete; verify manually or re-run the snapshot',
      });
    }
  }

  // Recursive resource discovery — multi-round scanning
  const scanDepth = options.scanDepth ?? 1; // defaults provide 1, fallback for null
  if (scanDepth > 1) {
    process.stdout.write(`\nRecursive resource scanning (depth: ${scanDepth})...\n`);

    const seenUrls = new Set(allRefs.map(r => r.url));

    // Determine which file extensions to scan for URLs in each round
    const scanJsEnabled = options.scanJs !== false;
    const scanJsonEnabled = options.scanJson === true;

    // Helper: scan a list of assets for embedded URLs, returning newly discovered refs
    const scanAssets = (assetsToScan: Asset[], round: number): AssetRef[] => {
      const discovered: AssetRef[] = [];

      if (scanJsEnabled) {
        for (const asset of assetsToScan) {
          if (asset.status !== 'fetched') continue;
          const ext = extname(new URL(asset.originUrl).pathname).toLowerCase();
          if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
            const text = asset.textContent || (asset.dataUri ? Buffer.from(asset.dataUri.split(',')[1], 'base64').toString('utf8') : '');
            if (text) {
              const urls = extractJsUrls(text, asset.originUrl);
              for (const found of urls) {
                if (!seenUrls.has(found.url)) {
                  seenUrls.add(found.url);
                  discovered.push({
                    url: found.url,
                    type: classifyByExt(found.url),
                    origin: `js:${asset.originUrl}`,
                  });
                }
              }
              // Extract webpack chunk map entries (e.g. { 41: "b02411f" }[e] + ".js")
              const webpackChunks = extractWebpackChunks(text, asset.originUrl);
              for (const found of webpackChunks) {
                if (!seenUrls.has(found.url)) {
                  seenUrls.add(found.url);
                  discovered.push({
                    url: found.url,
                    type: 'js',
                    origin: `webpack-chunk:${asset.originUrl}`,
                  });
                }
              }
            }
          }
        }
      }

      if (scanJsonEnabled) {
        for (const asset of assetsToScan) {
          if (asset.status !== 'fetched') continue;
          const ext = extname(new URL(asset.originUrl).pathname).toLowerCase();
          if (ext === '.json') {
            const text = asset.textContent || (asset.dataUri ? Buffer.from(asset.dataUri.split(',')[1], 'base64').toString('utf8') : '');
            if (text) {
              const urls = extractJsonUrls(text, asset.originUrl);
              for (const found of urls) {
                if (!seenUrls.has(found.url)) {
                  seenUrls.add(found.url);
                  discovered.push({
                    url: found.url,
                    type: classifyByExt(found.url),
                    origin: `json:${asset.originUrl}`,
                  });
                }
              }
            }
          }
        }
      }

      return discovered;
    };

    // Round 2: scan the initially downloaded assets
    let currentBatchAssets = assets;
    let roundTotalDiscovered = 0;

    for (let round = 2; round <= scanDepth; round++) {
      const discoveredRefs = scanAssets(currentBatchAssets, round);

      if (discoveredRefs.length === 0) {
        process.stdout.write(`  Round ${round}/${scanDepth}: no new assets discovered, stopping early.\n`);
        break;
      }

      roundTotalDiscovered += discoveredRefs.length;
      process.stdout.write(`  Round ${round}/${scanDepth}: discovered ${discoveredRefs.length} new asset(s)\n`);

      // Apply resource filtering to discovered refs
      const filter = new ResourceFilter({
        skipExtensions: options.skipExtensions,
        resourcePreset: options.resourcePreset,
        includeExtensions: options.includeExtensions,
        excludeExtensions: options.excludeExtensions,
        enableDefaultBlacklist: true,
      });
      const filteredNewRefs = filter.filter(discoveredRefs);

      if (filteredNewRefs.length === 0) {
        process.stdout.write(`    All filtered out by resource rules, stopping early.\n`);
        break;
      }

      process.stdout.write(`    Downloading ${filteredNewRefs.length} asset(s)...\n`);
      const newAssets = await downloadAssetsWithAuthSupport(filteredNewRefs, (asset, index, total) => {
        const icon = asset.status === 'fetched' ? '✓' : '✗';
        process.stdout.write(`    ${icon} [${index}/${total}] ${asset.originUrl}${asset.error ? ` (${asset.error})` : ` (${fmt(asset.size)})`}\n`);
        if (asset.status === 'failed') {
          logs.push({
            severity: 'error',
            category: 'asset_download',
            source: asset.originUrl,
            message: `Failed to download (recursive scan): ${asset.error || 'Unknown error'}`,
            detail: asset.error,
          });
        }
      });

      assets.push(...newAssets);

      // Prepare next round: only scan newly downloaded JS/CSS/JSON assets
      currentBatchAssets = newAssets.filter(a => {
        if (a.status !== 'fetched') return false;
        const ext = extname(new URL(a.originUrl).pathname).toLowerCase();
        return (
          (scanJsEnabled && (ext === '.js' || ext === '.mjs' || ext === '.cjs')) ||
          (scanJsonEnabled && ext === '.json') ||
          ext === '.css'   // Also scan CSS files in subsequent rounds for nested @import/url()
        );
      });

      // Stop if nothing scannable was downloaded
      if (currentBatchAssets.length === 0) {
        process.stdout.write(`    No scannable assets (JS/CSS/JSON) in this round, stopping.\n`);
        break;
      }
    }

    if (roundTotalDiscovered > 0) {
      process.stdout.write(`  Total discovered: ${roundTotalDiscovered} new asset(s) across recursive scanning.\n`);
    }
  }

  const stats = {
    total: assets.length,
    fetched: assets.filter(a => a.status === 'fetched').length,
    failed: assets.filter(a => a.status === 'failed').length,
    skipped: assets.filter(a => a.status === 'skipped').length,
    validationWarnings: validationFailures.length,
    totalBytes: assets.reduce((s, a) => s + a.size, 0),
    htmlBytes: html.length,
  };

  process.stdout.write(`\nAssembling output (${options.mode} mode)...\n`);

  // Collect downloaded JS contents for enhanced framework detection.
  // Include both textContent and dataUri (Base64-encoded) content to cover
  // all asset storage modes (HTTP adapter uses textContent, Playwright adapter
  // may use dataUri for sub-resources fetched via browser context).
  const jsContents = assets
    .filter(a => a.type === 'js' && a.status === 'fetched')
    .map(a => {
      if (a.textContent) return a.textContent;
      if (a.dataUri) {
        const base64 = a.dataUri.split(',')[1];
        if (base64) {
          try {
            return Buffer.from(base64, 'base64').toString('utf8');
          } catch { /* skip unreadable */ }
        }
      }
      return '';
    })
    .filter(Boolean);
  
  // Framework detection: prefer browser-collected info (from SPA hydration)
  // over static HTML/JS scanning, as the browser has direct access to runtime
  // framework internals (__NUXT__, __NEXT_DATA__, devtools hooks, etc.).
  // Uses ordinal signal tier comparison instead of arbitrary numeric confidence.
  // When tiers are equal, browser detection wins — the browser accesses
  // runtime state (window.__NUXT__ etc.) which is objectively more reliable
  // than static text scanning of the same tier.
  //
  // Exception: when the static detection identifies a specific framework
  // (e.g., vitepress, astro) and the browser detects a generic parent
  // framework (e.g., vue3, react), the static detection takes priority
  // because it is more specific.
  let detection = detectFramework(html, jsContents);
  if (browserFramework && browserFramework.framework !== 'unknown') {
    const browserFw = browserFramework.framework as FrameworkType;
    const browserTier = browserFramework.tier as SignalTier;

    // If the static detection is more specific than the browser detection,
    // prefer the static result regardless of tier comparison.
    const staticIsMoreSpecific = isMoreSpecific(detection.framework, browserFw);

    if (!staticIsMoreSpecific && compareTier(browserTier, detection.tier) >= 0) {
      detection = {
        framework: browserFw,
        tier: browserTier,
        appElement: browserFramework.appElement || detection.appElement || null,
        markers: [
          `browser:${browserFramework.framework}`,
          ...(browserFramework.isHydrated ? ['hydration-confirmed'] : []),
          ...detection.markers,
        ],
      };
    }
  }
  const strategy = postSnapshotStrategies.find(s => s.matches(detection));
  if (strategy) {
    strategy.rewritePaths(parsed.document);
  }

  // NOTE: Post-snapshot probe script injection is handled by the caller
  // (CLI) as a post-processing step, not by the assembler itself.
  // The library stays framework-agnostic; callers can post-process the output.

  if (options.mode === 'bundle') {
    mkdirSync(options.output, { recursive: true });
    assembleBundle(parsed.document, assets, options);

    await writeAssets(assets, options.concurrency);
  } else {
    const outputHtml = assembleSingleFile(parsed.document, assets, options);
    await mkdir(dirname(options.output), { recursive: true });
    await writeFile(options.output, outputHtml, 'utf8');
  }

  // Write issues and log report files (both bundle and single-file modes)
  const issuesOutputDir = options.mode === 'bundle' ? options.output : dirname(options.output);
  writeIssuesFiles(issuesOutputDir, issues, options.url);
  writeLogFiles(issuesOutputDir, logs, options.url);

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

    // In-memory budget assessment and degradation
    const budget = assessMemoryBudget(html, css, js);
    const degradations = formatDegradationSummary(budget);

    if (degradations.length > 0) {
      process.stdout.write(`⚠ Memory budget: ${degradations.join(', ')} — results may be partial\n`);
      issues.push({
        severity: 'warning',
        category: 'memory_budget',
        source: options.url,
        message: `Memory budget exceeded: ${degradations.join(', ')}`,
        detail: `HTML: ${fmt(html.length)}, CSS: ${fmt(css.length)}, JS: ${fmt(js.length)}`,
        action: 'Increase --memory-limit or reduce page scope for better component extraction results',
      });
    }

    // If the HTML is marked as skip, the entire component extraction is skipped.
    if (budget.htmlStrategy === 'skip') {
      process.stdout.write(`⚠ HTML too large (${(html.length / 1024 / 1024).toFixed(1)}MB), skipping component extraction\n`);
      issues.push({
        severity: 'error',
        category: 'memory_budget',
        source: options.url,
        message: `HTML too large (${(html.length / 1024 / 1024).toFixed(1)}MB), component extraction skipped`,
        detail: `HTML size exceeds memory budget threshold`,
        action: 'Increase --memory-limit to allow component extraction, or reduce page scope',
      });
    } else {
      // Pass the downgrade policy to convert
      const convertOptions = {
        ...options,
        memoryBudget: budget,
      };

      process.stdout.write(`Converting to component structure...\n`);
      const converted = await convert(html, css, js, convertOptions, detection);

      process.stdout.write(`Writing component output...\n`);
      const componentOutputDir = options.mode === 'bundle'
        ? options.output + '/components'
        : options.output + '_components';

      const componentOptions = {
        ...options,
        output: componentOutputDir,
      };

      // Auto-bridge framework detection to code generation when the user
      // hasn't explicitly specified a codegen framework via CLI/config.
      if (detection.framework !== 'unknown' && !componentOptions.frameworkCodegen?.framework) {
        const suggested = FRAMEWORK_TO_CODEGEN[detection.framework];
        if (suggested) {
          process.stdout.write(`Auto-detected codegen framework: ${suggested} (from ${detection.framework})\n`);
          componentOptions.frameworkCodegen = {
            ...componentOptions.frameworkCodegen,
            framework: suggested,
            detectedFramework: detection.framework,
          };
        }
      }

      // Auto-select Vue API style based on detected framework version.
      // Nuxt 2 / Vue 2 use Options API; Nuxt 3 / Vue 3 use Composition API.
      // Only applies when the user hasn't explicitly set vueApi.
      if (!componentOptions.frameworkCodegen?.vueApi) {
        if (detection.framework === 'vue2' || detection.framework === 'nuxt2') {
          componentOptions.frameworkCodegen = {
            ...componentOptions.frameworkCodegen,
            vueApi: 'options',
          };
        }
      }

      assembleConvert(converted, componentOptions);
    }
  }

  // Convert browserFramework (from FetchResult) to FrameworkDetection format
  const browserFrameworkResult: FrameworkDetection | undefined = browserFramework && browserFramework.framework !== 'unknown'
    ? {
        framework: browserFramework.framework as FrameworkType,
        tier: browserFramework.tier as SignalTier,
        appElement: browserFramework.appElement || null,
        markers: [
          `browser:${browserFramework.framework}`,
          ...(browserFramework.isHydrated ? ['hydration-confirmed'] : []),
        ],
      }
    : undefined;

  return { sourceUrl: options.url, timestamp, html, assets, stats, frameworkDetection: detection, browserFramework: browserFrameworkResult, issues, logs };
}

/**
 * Run component extraction + codegen on an existing local bundle/single output
 * without re-fetching the URL. Reads index.html, assets/css/*.css, and
 * assets/js/*.js from the local directory, then runs the full conversion pipeline.
 */
export async function convertLocalSnapshot(options: SnapshotOptions): Promise<SnapshotResult> {
  if (!options.convertLocal) {
    throw new Error('convertLocal option is required');
  }
  const localPath = options.convertLocal;
  const timestamp = new Date().toISOString();

  if (!existsSync(localPath)) {
    throw new Error(`Local path not found: ${localPath}`);
  }

  // Detect mode: directory = bundle, .html file = single
  const isDir = statSync(localPath).isDirectory();
  const htmlPath = isDir ? join(localPath, 'index.html') : localPath;

  if (!existsSync(htmlPath)) {
    throw new Error(`No index.html found in ${localPath}`);
  }

  process.stdout.write(`Reading HTML from ${htmlPath}...\n`);
  const html = readFileSync(htmlPath, 'utf8');

  // Collect CSS
  let css = extractInlineCss(html);
  if (isDir) {
    const cssDir = join(localPath, 'assets', 'css');
    const cssContent = readFilesRecursively(cssDir, '.css');
    if (cssContent) {
      css += cssContent;
      // Count files for reporting
      const count = (cssContent.match(/\n/g) || []).length + 1;
      process.stdout.write(`  Loaded CSS from ${count} blocks\n`);
    }
  }

  // Collect JS
  let js = extractInlineJs(html);
  if (isDir) {
    const jsDir = join(localPath, 'assets', 'js');
    const jsContent = readFilesRecursively(jsDir, '.js');
    if (jsContent) {
      js += jsContent;
      const count = (jsContent.match(/\n/g) || []).length + 1;
      process.stdout.write(`  Loaded JS from ${count} blocks\n`);
    }
  }

  // Memory budget assessment
  const budget = assessMemoryBudget(html, css, js);
  const degradations = formatDegradationSummary(budget);

  if (degradations.length > 0) {
    process.stdout.write(`⚠ Memory budget: ${degradations.join(', ')} — results may be partial\n`);
  }

  if (budget.htmlStrategy === 'skip') {
    throw new Error(`HTML too large (${(html.length / 1024 / 1024).toFixed(1)}MB), cannot extract components`);
  }

  process.stdout.write(`Converting to component structure...\n`);
  const convertOptions: SnapshotOptions = {
    ...options,
    convertLocal: undefined,
  };
  const converted = await convert(html, css, js, convertOptions);

  process.stdout.write(`Writing component output...\n`);
  const componentOutputDir = isDir
    ? join(options.output, 'components')
    : options.output.replace(/(\.html?)?$/i, '_components');

  const componentOptions = {
    ...options,
    output: componentOutputDir,
  };

  assembleConvert(converted, componentOptions);

  // Build stats from conversion result
  const componentList = Array.from(converted.components.values());

  // Use dummy assets to satisfy SnapshotResult type
  const assets: Asset[] = [];

  const localIssues: SnapshotIssue[] = [];

  if (degradations.length > 0) {
    localIssues.push({
      severity: 'warning',
      category: 'memory_budget',
      source: localPath,
      message: `Memory budget: ${degradations.join(', ')} — results may be partial`,
      detail: `HTML: ${fmt(html.length)}, CSS: ${fmt(css.length)}, JS: ${fmt(js.length)}`,
      action: 'Increase --memory-limit or reduce scope for better results',
    });
  }

  // Write issues files for local conversion
  const localIssuesDir = isDir ? join(options.output, 'components') : options.output.replace(/(\.html?)?$/i, '_components');
  writeIssuesFiles(localIssuesDir, localIssues, localPath);
  writeLogFiles(localIssuesDir, [], localPath);

  return {
    sourceUrl: localPath,
    timestamp,
    html,
    assets,
    stats: {
      total: componentList.length,
      fetched: 0,
      failed: 0,
      skipped: 0,
      validationWarnings: 0,
      totalBytes: 0,
      htmlBytes: html.length,
      stateful: componentList.filter(c => c.type === 'stateful').length,
      presentational: componentList.filter(c => c.type === 'presentational').length,
    },
    issues: localIssues,
    logs: [],
  } as SnapshotResult;
}

function readFilesRecursively(dir: string, ext: string): string {
  let result = '';
  if (!existsSync(dir)) return result;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      result += readFilesRecursively(fullPath, ext);
    } else if (entry.isFile() && extname(entry.name) === ext) {
      try {
        result += '\n' + readFileSync(fullPath, 'utf8');
      } catch {
        // Skip unreadable files
      }
    }
  }
  return result;
}

function fmt(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${['B', 'KB', 'MB', 'GB'][i]}`;
}

/**
 * Classify a URL's asset type by file extension.
 */
function classifyByExt(url: string): import('./types.js').AssetType {
  try {
    const ext = extname(new URL(url).pathname).toLowerCase();
    if (ext === '.css') return 'css';
    if (['.js', '.mjs', '.cjs'].includes(ext)) return 'js';
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.ico'].includes(ext)) return 'img';
    if (['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext)) return 'font';
    if (['.mp4', '.webm', '.m3u8', '.ts', '.mp3', '.wav', '.ogg'].includes(ext)) return 'media';
    return 'other';
  } catch {
    return 'other';
  }
}
