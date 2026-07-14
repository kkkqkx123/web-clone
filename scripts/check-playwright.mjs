#!/usr/bin/env node
/**
 * Playwright 环境检查脚本
 *
 * 功能：
 * - 检测 Playwright 包版本
 * - 检测浏览器二进制路径、大小
 * - 实际启动浏览器验证可用性
 * - 输出环境诊断信息
 *
 * 用法： node scripts/check-playwright.mjs
 */

import { createRequire } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// 在 monorepo 中，playwright 安装在 adapter-playwright 包下
// 先尝试从 adapter-playwright 解析，再尝试从根目录解析
function resolvePlaywright() {
  const candidates = [
    resolve(ROOT, 'packages/adapter-playwright'),
    resolve(ROOT, 'node_modules'),
  ];
  for (const base of candidates) {
    try {
      const pw = createRequire(resolve(base, 'noop.mjs'));
      const pkgPath = pw.resolve('playwright/package.json');
      const mainPath = pw.resolve('playwright');
      return { pkgPath, mainPath, playwright: pw('playwright') };
    } catch { /* try next */ }
  }
  return null;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

async function main() {
  console.log('');

  // ── 1. Playwright 包检测 ──────────────────────────────
  console.log('📦  Playwright Package');
  console.log('─'.repeat(50));

  const resolved = resolvePlaywright();
  if (!resolved) {
    console.log('  ❌ Playwright package not found');
    console.log('\n  Install: pnpm add @web-clone/adapter-playwright\n');
    process.exit(1);
  }

  const { pkgPath, mainPath, playwright: pw } = resolved;
  const { chromium } = pw;
  const pkg = createRequire(pkgPath)('playwright/package.json');
  console.log(`  ✅  playwright        ${pkg.version}`);
  console.log(`      Path:  ${mainPath.replace(ROOT, '.')}`);
  console.log(`      Chrome for Testing: ${pkg.browsers?.chromium || 'bundled'}`);

  // ── 2. 环境变量 ────────────────────────────────────────
  console.log('\n🔧  Environment');
  console.log('─'.repeat(50));
  const pwPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  console.log(`  PLAYWRIGHT_BROWSERS_PATH: ${pwPath ? pwPath : '(not set — using default)'}`);

  // ── 3. 浏览器二进制检测 ────────────────────────────────
  console.log('\n📁  Browser Binaries');
  console.log('─'.repeat(50));

  // 尝试从 pnpm store 中的 playwright-core 获取浏览器安装信息
  let browserFound = false;
  let browserExePath = null;
  let browserSize = 0;

  // 策略 1: 检查 PLAYWRIGHT_BROWSERS_PATH 下的 chromium
  if (pwPath) {
    const candidates = [
      resolve(pwPath, 'chromium-1208', 'chrome-win64', 'chrome.exe'),
      resolve(pwPath, 'chromium-1223', 'chrome-win64', 'chrome.exe'),
      resolve(pwPath, 'chromium-1222', 'chrome-win64', 'chrome.exe'),
    ];
    for (const exe of candidates) {
      if (existsSync(exe)) {
        browserExePath = exe;
        browserSize = statSync(exe).size;
        browserFound = true;
        break;
      }
    }
  }

  if (browserFound) {
    console.log(`  ✅  Chromium found`);
    console.log(`      Path: ${browserExePath}`);
    console.log(`      Size: ${formatBytes(browserSize)}`);
  } else {
    console.log(`  ⚠️  Chromium binary not found at expected location`);
    if (pwPath) {
      console.log(`      Searched in: ${pwPath}`);
    }
  }

  // 检查 headless shell
  let headlessFound = false;
  if (pwPath) {
    const headlessCandidates = [
      resolve(pwPath, 'chromium_headless_shell-1208', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
      resolve(pwPath, 'chromium_headless_shell-1223', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
    ];
    for (const exe of headlessCandidates) {
      if (existsSync(exe)) {
        console.log(`  ✅  Headless Shell   ${formatBytes(statSync(exe).size)}`);
        headlessFound = true;
        break;
      }
    }
  }
  if (!headlessFound && pwPath) {
    console.log(`  ⚠️  Headless Shell not found`);
  }

  // ── 4. 实际启动验证 ────────────────────────────────────
  console.log('\n🚀  Launch Test');
  console.log('─'.repeat(50));

  try {
    const browser = await chromium.launch({ headless: true, timeout: 15000 });
    const version = await browser.version();
    const ctxCount = browser.contexts().length;
    await browser.close();

    console.log(`  ✅  Browser launched successfully`);
    console.log(`      Version: ${version}`);
    console.log(`      Contexts: ${ctxCount}`);
  } catch (err) {
    console.log(`  ❌  Browser launch failed`);
    console.log(`      Error: ${err.message}`);
    console.log('\n🔧  Troubleshooting:');
    console.log(`  1. Install browser:  npx playwright install chromium`);
    console.log(`  2. Set PLAYWRIGHT_BROWSERS_PATH if custom location`);
    console.log(`  3. Check disk permissions`);
    process.exit(1);
  }

  // ── 5. 总结 ────────────────────────────────────────────
  console.log('\n' + '='.repeat(50));
  console.log('✅  Playwright environment is ready\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});