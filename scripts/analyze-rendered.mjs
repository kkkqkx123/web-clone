#!/usr/bin/env node
/**
 * analyze-rendered.mjs — Playwright 渲染分析
 *
 * 功能：使用 Playwright 渲染目标页面（执行 JS），捕获所有网络请求、
 * 最终 DOM 结构和动态加载的资源。适用于 SPA 页面调试。
 *
 * 依赖：Playwright（已在 monorepo 中安装）
 * 环境：需要 PLAYWRIGHT_BROWSERS_PATH 指向浏览器二进制位置
 *
 * 用法：
 *   HTTPS_PROXY=http://127.0.0.1:7890 node scripts/analyze-rendered.mjs <url>
 *   node scripts/analyze-rendered.mjs <url>  --no-proxy
 */

import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TARGET_URL = process.argv[2];
const NO_PROXY = process.argv.includes('--no-proxy');

if (!TARGET_URL) {
  console.error('Usage: node scripts/analyze-rendered.mjs <url> [--no-proxy]');
  console.error('  HTTPS_PROXY=http://127.0.0.1:7890 node scripts/analyze-rendered.mjs <url>');
  process.exit(1);
}

// Load Playwright from monorepo context
function loadPlaywright() {
  const base = resolve(ROOT, 'packages/adapter-playwright');
  const req = createRequire(resolve(base, 'noop.mjs'));
  const { chromium } = req('playwright');
  return { chromium };
}

async function main() {
  const { chromium } = loadPlaywright();
  const proxyUrl = NO_PROXY ? '' :
    (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || '');

  console.log('='.repeat(60));
  console.log('  Rendered Page Analysis (Playwright)');
  console.log('='.repeat(60));
  console.log(`  URL:   ${TARGET_URL}`);
  console.log(`  Proxy: ${proxyUrl || '(none)'}`);
  console.log(`  Browser: Chromium (Playwright)`);
  console.log('='.repeat(60));

  const browser = await chromium.launch({
    headless: true,
    timeout: 30000,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      ...(proxyUrl ? [`--proxy-server=${proxyUrl.replace(/^https?:\/\//, '')}`, '--ignore-certificate-errors'] : []),
    ],
  });

  const context = await browser.newContext({
    bypassCSP: true,
    ignoreHTTPSErrors: !!proxyUrl,
    javaScriptEnabled: true,
  });

  const page = await context.newPage();

  // ── Collect network requests ─────────────────────────────────
  const allRequests = [];
  const allResponses = [];
  const failedRequests = [];

  page.on('request', req => {
    allRequests.push({ url: req.url(), method: req.method(), type: req.resourceType() });
  });
  page.on('response', res => {
    allResponses.push({ url: res.url(), status: res.status(), type: res.request().resourceType() });
  });
  page.on('requestfailed', req => {
    failedRequests.push({ url: req.url(), error: req.failure()?.errorText || 'unknown' });
  });
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`  [CONSOLE ERROR] ${msg.text()}`);
  });
  page.on('pageerror', err => console.log(`  [PAGE ERROR] ${err.message}`));

  // ── Navigate ─────────────────────────────────────────────────
  console.log('\n📄 Navigating...');
  const response = await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60000 });
  console.log(`  Status: ${response?.status() || 'unknown'}`);
  console.log(`  Final URL: ${page.url()}`);

  // Extra wait for SPA rendering
  await page.waitForTimeout(2000);
  try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch { /* ok */ }

  // ── 1. Network requests ──────────────────────────────────────
  console.log('\n🌐 Network requests:');
  const uniqueUrls = [...new Set(allResponses.map(r => r.url))];
  console.log(`  Total: ${allResponses.length}, Unique: ${uniqueUrls.length}`);

  const byType = {};
  for (const r of allResponses) {
    const t = r.type || 'unknown';
    if (!byType[t]) byType[t] = [];
    if (!byType[t].some(x => x.url === r.url)) byType[t].push(r);
  }
  for (const [type, list] of Object.entries(byType).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  [${type}] ${list.length}:`);
    for (const r of list) {
      const size = r.headers?.['content-length'] ? ` (${r.headers['content-length']}B)` : '';
      console.log(`    ${r.status} ${r.url}${size}`);
    }
  }

  if (failedRequests.length) {
    console.log(`\n  ❌ Failed (${failedRequests.length}):`);
    for (const f of failedRequests) console.log(`    ${f.url} — ${f.error}`);
  }

  // ── 2. Rendered DOM ──────────────────────────────────────────
  const renderedHtml = await page.content();
  const outPath = resolve(ROOT, 'scripts/debug-rendered.html');
  writeFileSync(outPath, renderedHtml, 'utf8');
  console.log(`\n📄 Rendered HTML: ${(renderedHtml.length / 1024).toFixed(1)} KB`);
  console.log(`  Saved to: ${outPath}`);

  // ── 3. Final DOM resources ───────────────────────────────────
  const domResources = await page.evaluate(() => {
    const r = [];
    // Elements with src attribute
    document.querySelectorAll('[src]').forEach(el => {
      const val = el.getAttribute('src');
      if (val && !val.startsWith('data:') && !val.startsWith('blob:'))
        r.push({ tag: el.tagName.toLowerCase(), attr: 'src', value: val });
    });
    // External link elements
    document.querySelectorAll('link[href]').forEach(el => {
      const rel = el.getAttribute('rel');
      if (rel && rel !== 'canonical') {
        const val = el.getAttribute('href');
        if (val && !val.startsWith('data:')) r.push({ tag: 'link', attr: 'href', rel, value: val });
      }
    });
    // style[textContent] with url() refs
    document.querySelectorAll('style').forEach(el => {
      const text = el.textContent || '';
      const urls = [...text.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)].map(m => m[1]);
      for (const u of urls) {
        if (!u.startsWith('#') && !u.startsWith('data:')) r.push({ tag: 'style', attr: 'url()', value: u });
      }
    });
    return r;
  });

  console.log(`\n📦 DOM resource references: ${domResources.length}`);
  for (const d of domResources) console.log(`  [${d.tag}/${d.attr}] ${d.value}`);

  // ── 4. Performance API ───────────────────────────────────────
  const perfEntries = await page.evaluate(() =>
    performance.getEntriesByType('resource').map(e => ({
      url: e.name, type: e.initiatorType, size: e.transferSize, duration: e.duration.toFixed(0)
    }))
  );
  const perfFiltered = perfEntries.filter(e => !e.url.startsWith('data:'));
  if (perfFiltered.length) {
    console.log(`\n📊 Performance API: ${perfFiltered.length} resources`);
    for (const e of perfFiltered) console.log(`  [${e.type}] ${e.url} (${e.size}B, ${e.duration}ms)`);
  }

  // ── 5. Summary ───────────────────────────────────────────────
  const contentType = {};
  for (const r of allResponses) {
    const t = r.type || 'unknown';
    contentType[t] = (contentType[t] || 0) + 1;
  }
  const totalTransferSize = perfEntries.reduce((s, e) => s + e.size, 0);

  console.log('\n📊 Summary:');
  console.log(`  Request count:    ${allResponses.length} total, ${uniqueUrls.length} unique`);
  console.log(`  Failed requests:  ${failedRequests.length}`);
  console.log(`  Transfer size:    ${(totalTransferSize / 1024).toFixed(1)} KB (from Performance API)`);
  console.log(`  Rendered HTML:    ${(renderedHtml.length / 1024).toFixed(1)} KB`);
  console.log(`  Content types:    ${Object.entries(contentType).map(([k, v]) => `${k}×${v}`).join(', ')}`);
  console.log(`  DOM resources:    ${domResources.length} external references`);
  console.log('');

  await context.close();
  await browser.close();
}

main().catch(err => {
  console.error(`\n❌ Error: ${err.message}`);
  process.exit(1);
});