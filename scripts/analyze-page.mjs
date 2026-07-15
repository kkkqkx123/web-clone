#!/usr/bin/env node
/**
 * analyze-page.mjs — 静态 HTML 结构分析
 *
 * 功能：获取目标页面的静态 HTML，分析其 DOM 结构和资源引用情况。
 * 适用于快速判断页面类型（SPA / 静态 / 混合）、识别外部资源。
 *
 * 用法：
 *   HTTPS_PROXY=http://127.0.0.1:7890 node scripts/analyze-page.mjs <url>
 *   node scripts/analyze-page.mjs <url>                              # 无需代理
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TARGET_URL = process.argv[2];

if (!TARGET_URL) {
  console.error('Usage: node scripts/analyze-page.mjs <url>');
  console.error('  HTTPS_PROXY=http://127.0.0.1:7890 node scripts/analyze-page.mjs <url>');
  process.exit(1);
}

// ── HTTP fetch with proxy support ──────────────────────────────
import { createRequire } from 'node:module';

async function fetchHtml(url, timeout = 15000) {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy
    || process.env.HTTP_PROXY || process.env.http_proxy || '';

  const isHttps = url.startsWith('https:');
  const mod = isHttps ? await import('https') : await import('http');

  // Resolve proxy agent from core package context (pnpm hoisted dependency)
  let agent;
  if (proxyUrl) {
    const coreReq = createRequire(resolve(ROOT, 'packages/core/noop.mjs'));
    if (isHttps) {
      const { HttpsProxyAgent } = coreReq('https-proxy-agent');
      agent = new HttpsProxyAgent(proxyUrl);
    } else {
      const { HttpProxyAgent } = coreReq('http-proxy-agent');
      agent = new HttpProxyAgent(proxyUrl);
    }
  }

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const opts = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      ...(agent ? { agent } : {}),
    };

    const req = mod.get(url, opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

// ── Tag counting helper ────────────────────────────────────────
function countTags(htmlStr) {
  const counts = {};
  const matches = htmlStr.match(/<\/(\w+)>/g); // closing tags = reliable
  if (matches) {
    for (const m of matches) {
      const tag = m.slice(2, -1);
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  return counts;
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(60));
  console.log('  Static HTML Analysis');
  console.log('='.repeat(60));
  console.log(`  URL:   ${TARGET_URL}`);
  console.log(`  Proxy: ${process.env.HTTPS_PROXY || process.env.https_proxy || '(none)'}`);
  console.log('='.repeat(60));

  // Fetch
  console.log('\n📥 Fetching HTML...');
  const html = await fetchHtml(TARGET_URL);
  console.log(`  Size: ${(html.length / 1024).toFixed(1)} KB (${html.length} bytes)`);

  // Save for reference
  const outPath = resolve(ROOT, 'scripts/debug-page.html');
  writeFileSync(outPath, html, 'utf8');
  console.log(`  Saved to: ${outPath}`);

  // ── 1. Document structure ────────────────────────────────────
  console.log('\n📄 Document structure:');
  const doctype = html.match(/<!DOCTYPE[^>]*>/i);
  console.log(`  DOCTYPE: ${doctype ? doctype[0] : '(none)'}`);
  const htmlTag = html.match(/<html[^>]*>/i);
  console.log(`  <html>:  ${htmlTag ? htmlTag[0] : '(none)'}`);

  // ── 2. Element counts ────────────────────────────────────────
  const tags = countTags(html);
  const sorted = Object.entries(tags).sort((a, b) => b[1] - a[1]);
  console.log(`\n🔢 Element counts (top 20):`);
  for (const [tag, count] of sorted.slice(0, 20)) {
    console.log(`  <${tag}>: ${count}`);
  }

  // ── 3. External resources ────────────────────────────────────
  console.log('\n📦 External resources:');

  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/gi)];
  console.log(`  Scripts (external): ${scripts.length}`);
  for (const m of scripts) {
    const url = m[1];
    const isExternal = url.startsWith('http');
    console.log(`    ${isExternal ? '🌐' : '📁'} ${url}${isExternal ? '' : ' (relative)'}`);
  }

  const stylesheets = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/gi)];
  console.log(`  Stylesheets: ${stylesheets.length}`);
  for (const m of stylesheets) {
    console.log(`    ${m[1]}`);
  }

  const images = [...html.matchAll(/<img[^>]+src="([^"]+)"/gi)];
  console.log(`  Images: ${images.length}`);
  for (const m of images.slice(0, 10)) {
    console.log(`    ${m[1]}`);
  }
  if (images.length > 10) console.log(`    ... and ${images.length - 10} more`);

  const fonts = [...html.matchAll(/@font-face\s*\{/gi)];
  console.log(`  @font-face rules: ${fonts.length}`);

  const imports = [...html.matchAll(/@import\s+(?:url\()?['"]?([^'";)]+)['"]?\)?/gi)];
  console.log(`  @import rules: ${imports.length}`);
  for (const m of imports) {
    if (!m[1].startsWith('url(')) console.log(`    ${m[1]}`);
  }

  // ── 4. Inline content ────────────────────────────────────────
  console.log('\n📝 Inline content:');
  const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  console.log(`  Inline <script> blocks: ${inlineScripts.length}`);
  for (let i = 0; i < inlineScripts.length; i++) {
    const s = inlineScripts[i][1];
    console.log(`    [${i}] ${(s.length / 1024).toFixed(1)} KB`);
    const hasDocWrite = s.includes('document.write');
    const hasCreateEl = s.includes('createElement');
    const hasInnerHTML = s.includes('innerHTML');
    const hasFetch = s.includes('fetch(');
    const hasXHR = s.includes('XMLHttpRequest');
    const hints = [hasDocWrite && 'document.write', hasCreateEl && 'createElement',
      hasInnerHTML && 'innerHTML', hasFetch && 'fetch()', hasXHR && 'XMLHttpRequest']
      .filter(Boolean);
    if (hints.length) console.log(`    Dynamic: ${hints.join(', ')}`);
  }

  const inlineStyles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
  console.log(`  Inline <style> blocks: ${inlineStyles.length}`);
  for (let i = 0; i < inlineStyles.length; i++) {
    const s = inlineStyles[i][1];
    const urlRefs = [...s.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)];
    const externalUrls = urlRefs.filter(r => !r[1].startsWith('#') && !r[1].startsWith('data:'));
    console.log(`    [${i}] ${(s.length / 1024).toFixed(1)} KB, ${urlRefs.length} url() refs (${externalUrls.length} external)`);
    for (const r of externalUrls) console.log(`      url(${r[1]})`);
  }

  // ── 5. SPA detection ─────────────────────────────────────────
  console.log('\n⚡ Framework / SPA hints:');
  const hints = [];
  if (html.includes('__NUXT__')) hints.push('Nuxt.js');
  if (html.includes('__VUE_')) hints.push('Vue.js');
  if (html.includes('__NEXT_DATA__')) hints.push('Next.js');
  if (html.includes('__REACT_')) hints.push('React');
  if (html.includes('ng-version')) hints.push('Angular');
  if (html.includes('__svelte')) hints.push('Svelte');
  if (html.includes('_nuxt/')) hints.push('Nuxt (/_nuxt/ path)');
  if (html.includes('/_astro/')) hints.push('Astro');
  if (html.includes('type="module"')) hints.push('ES Module');
  if (html.includes('importmap')) hints.push('Import Map');
  if (html.includes('webpack')) hints.push('Webpack');
  if (hints.length) {
    for (const h of hints) console.log(`  🏷  ${h}`);
  } else {
    console.log('  (none detected)');
  }

  // ── 6. Summary ───────────────────────────────────────────────
  console.log('\n📊 Summary:');
  const totalExternal = scripts.length + stylesheets.length + images.length;
  const isSpa = inlineScripts.some(s => s[1].includes('createElement') || s[1].includes('innerHTML'));
  const isSingleFile = totalExternal === 0 && inlineScripts.length > 0 && inlineStyles.length > 0;

  console.log(`  External assets: ${totalExternal} (${scripts.length} scripts, ${stylesheets.length} CSS, ${images.length} images)`);
  console.log(`  Inline JS:       ${inlineScripts.length} blocks (${inlineScripts.reduce((s, x) => s + x[1].length, 0) / 1024 | 0} KB)`);
  console.log(`  Inline CSS:      ${inlineStyles.length} blocks (${inlineStyles.reduce((s, x) => s + x[1].length, 0) / 1024 | 0} KB)`);
  console.log(`  Page type:       ${isSingleFile ? '📄 Single-file (self-contained, no external assets)' : isSpa ? '⚡ SPA (dynamic content via JS)' : '📄 Static HTML'}`);
  console.log(`  Browser needed:  ${isSpa ? '✅ Yes (use --adapter playwright)' : '❌ No (HTTP mode is sufficient)'}`);
  console.log('');
}

main().catch(err => {
  console.error(`\n❌ Error: ${err.message}`);
  process.exit(1);
});