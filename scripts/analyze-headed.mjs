#!/usr/bin/env node
/**
 * analyze-headed.mjs — 有头模式（Headed Mode）渲染分析
 *
 * 功能：使用 Playwright 有头模式（headless: false）渲染目标页面，
 * 捕获所有网络请求、最终 DOM 结构和失败的 API 请求。
 * 适用于反爬检测调试：对比有头模式与无头模式下的页面内容差异。
 *
 * 依赖：Playwright（已在 monorepo 中安装）
 * 环境：需要 PLAYWRIGHT_BROWSERS_PATH 指向浏览器二进制位置
 *       有头模式需要显示环境（Windows 桌面可用，CI 中不可用）
 *
 * 用法：
 *   HTTPS_PROXY=http://127.0.0.1:7890 node scripts/analyze-headed.mjs <url>
 *   node scripts/analyze-headed.mjs <url> --no-proxy
 *   node scripts/analyze-headed.mjs <url> --slow-mo 500   # 减速 500ms 便于观察
 */

import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TARGET_URL = process.argv[2];
const NO_PROXY = process.argv.includes('--no-proxy');
const SLOW_MO = (() => {
  const idx = process.argv.indexOf('--slow-mo');
  if (idx !== -1 && idx + 1 < process.argv.length) {
    const val = parseInt(process.argv[idx + 1], 10);
    return Number.isFinite(val) ? val : 0;
  }
  return 0;
})();

if (!TARGET_URL) {
  console.error('Usage: node scripts/analyze-headed.mjs <url> [--no-proxy] [--slow-mo <ms>]');
  console.error('  HTTPS_PROXY=http://127.0.0.1:7890 node scripts/analyze-headed.mjs <url>');
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
  console.log('  Headed Mode Page Analysis (Playwright)');
  console.log('='.repeat(60));
  console.log(`  URL:     ${TARGET_URL}`);
  console.log(`  Proxy:   ${proxyUrl || '(none)'}`);
  console.log(`  Mode:    HEADED (headless: false)`);
  console.log(`  SlowMo:  ${SLOW_MO > 0 ? SLOW_MO + 'ms' : '(none)'}`);
  console.log(`  Browser: Chromium (Playwright)`);
  console.log('='.repeat(60));

  const browser = await chromium.launch({
    headless: false,   // 有头模式 — 显示浏览器窗口
    slowMo: SLOW_MO,   // 减速便于观察
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
    // 设置合理的 viewport 和 user-agent 降低被检测概率
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
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
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`  [CONSOLE ${msg.type().toUpperCase()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => console.log(`  [PAGE ERROR] ${err.message}`));

  // 注入指纹检测绕过脚本
  await page.addInitScript(() => {
    // 覆盖 webdriver 属性
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    // 覆盖 chrome.runtime 检测
    if (window.chrome) {
      window.chrome.runtime = Object.assign({}, window.chrome.runtime, {
        connect: () => {},
        sendMessage: () => {},
      });
    }
    // 覆盖权限查询
    const originalQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (params) =>
      params.name === 'notifications'
        ? Promise.resolve({ state: 'denied', onchange: null })
        : originalQuery(params);
  });

  // ── Navigate ─────────────────────────────────────────────────
  console.log('\n📄 Navigating...');
  // 使用 domcontentloaded 而非 networkidle，因为目标页面可能有持续的网络请求（埋点/轮询）
  // 导致 networkidle 永远无法达到
  const response = await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log(`  Status: ${response?.status() || 'unknown'}`);
  console.log(`  Final URL: ${page.url()}`);

  // 等待页面渲染完成（额外等待 SPA 初始化和 API 请求完成）
  console.log('  Waiting for page to settle...');
  try {
    await page.waitForLoadState('networkidle', { timeout: 30000 });
  } catch {
    console.log('  ⚠ networkidle timeout (page may have continuous polling), proceeding with current state');
  }
  // Extra wait for SPA rendering
  await page.waitForTimeout(3000);

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
      console.log(`    ${r.status} ${r.url}`);
    }
  }

  if (failedRequests.length) {
    console.log(`\n  ❌ Failed (${failedRequests.length}):`);
    for (const f of failedRequests) console.log(`    ${f.url} — ${f.error}`);
  }

  // ── 2. Check API responses for anti-bot errors ──────────────
  console.log('\n🔍 API 反爬检测:');
  const apiFailures = [];
  for (const r of allResponses) {
    if (r.type === 'xhr' || r.type === 'fetch') {
      const status = r.status;
      // 尝试获取 response body 检查错误码
      try {
        // 使用 page.evaluate 通过浏览器获取响应内容
        const body = await page.evaluate(async (url) => {
          try {
            const res = await fetch(url);
            const text = await res.text();
            return text.substring(0, 500);
          } catch { return ''; }
        }, r.url);
        if (body.includes('errorCode') || body.includes('error_code')) {
          apiFailures.push({ url: r.url, status, body: body.substring(0, 200) });
        }
      } catch { /* 忽略非 JSON 响应 */ }
    }
  }
  if (apiFailures.length > 0) {
    console.log(`  ⚠ 发现 ${apiFailures.length} 个 API 错误响应:`);
    for (const f of apiFailures) {
      console.log(`    HTTP ${f.status} | ${f.url}`);
      console.log(`    Body: ${f.body}`);
    }
  } else {
    console.log('  ✅ 未检测到 API 反爬错误（所有 API 请求状态正常）');
  }

  // ── 3. Rendered DOM ──────────────────────────────────────────
  const renderedHtml = await page.content();
  const outPath = resolve(ROOT, 'scripts/debug-headed.html');
  writeFileSync(outPath, renderedHtml, 'utf8');
  console.log(`\n📄 Rendered HTML: ${(renderedHtml.length / 1024).toFixed(1)} KB`);
  console.log(`  Saved to: ${outPath}`);

  // ── 4. Content analysis ──────────────────────────────────────
  const contentCheck = await page.evaluate(() => {
    const rootSelectors = ['#root', '#app', '#__nuxt', '.app', '[data-reactroot]'];
    let mainContent = null;
    for (const sel of rootSelectors) {
      const el = document.querySelector(sel);
      if (el) { mainContent = { selector: sel, children: el.children.length, htmlLen: el.innerHTML.length }; break; }
    }

    // 检查是否有书籍列表内容
    const bookItems = document.querySelectorAll('[class*="book"], [class*="card"], [class*="item"], li, .list-item');
    const visibleText = document.body?.innerText?.substring(0, 500) || '';

    return {
      mainContent,
      bookElements: bookItems.length,
      bodyChildren: document.body?.children?.length || 0,
      visibleTextPreview: visibleText,
      isEmpty: visibleText.trim().length < 50 && !document.querySelector('img, [class*="content"]'),
    };
  });

  console.log('\n📊 内容分析:');
  if (contentCheck.mainContent) {
    console.log(`  主容器: ${contentCheck.mainContent.selector}`);
    console.log(`  子元素数: ${contentCheck.mainContent.children}`);
    console.log(`  内容长度: ${contentCheck.mainContent.htmlLen} 字符`);
  } else {
    console.log('  主容器: 未检测到常见 SPA 根容器');
  }
  console.log(`  疑似内容元素: ${contentCheck.bookElements}`);
  console.log(`  body 子元素: ${contentCheck.bodyChildren}`);
  console.log(`  页面文本预览: ${contentCheck.visibleTextPreview.substring(0, 200)}`);
  console.log(`  是否为空: ${contentCheck.isEmpty ? '⚠️ 是（页面可能无内容）' : '✅ 否（页面有内容）'}`);

  // ── 5. WebDriver 检测结果 ────────────────────────────────────
  const webdriverCheck = await page.evaluate(() => {
    return {
      webdriver: navigator.webdriver,
      chrome: typeof window.chrome !== 'undefined',
      headless: navigator.webdriver === true, // 粗略判断
    };
  });
  console.log(`\n🔍 浏览器指纹检测结果:`);
  console.log(`  navigator.webdriver: ${webdriverCheck.webdriver}`);
  console.log(`  chrome 对象存在: ${webdriverCheck.chrome}`);

  // ── 6. Summary ───────────────────────────────────────────────
  const contentType = {};
  for (const r of allResponses) {
    const t = r.type || 'unknown';
    contentType[t] = (contentType[t] || 0) + 1;
  }

  console.log('\n📊 Summary:');
  console.log(`  Request count:    ${allResponses.length} total, ${uniqueUrls.length} unique`);
  console.log(`  Failed requests:  ${failedRequests.length}`);
  console.log(`  Rendered HTML:    ${(renderedHtml.length / 1024).toFixed(1)} KB`);
  console.log(`  Content types:    ${Object.entries(contentType).map(([k, v]) => `${k}×${v}`).join(', ')}`);
  console.log(`  Page has content: ${contentCheck.isEmpty ? '❌ No' : '✅ Yes'}`);
  console.log('');

  await context.close();
  await browser.close();
}

main().catch(err => {
  console.error(`\n❌ Error: ${err.message}`);
  process.exit(1);
});