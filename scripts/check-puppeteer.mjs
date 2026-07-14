#!/usr/bin/env node
/**
 * Puppeteer 环境检查脚本
 *
 * 功能：
 * - 检测 Puppeteer 包版本
 * - 检测浏览器二进制路径、大小
 * - 实际启动浏览器验证可用性
 * - 输出环境诊断信息
 *
 * 用法： node scripts/check-puppeteer.mjs
 */

import { createRequire } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function resolvePuppeteer() {
  const candidates = [
    resolve(ROOT, 'packages/adapter-puppeteer'),
    resolve(ROOT, 'node_modules'),
  ];
  for (const base of candidates) {
    try {
      const req = createRequire(resolve(base, 'noop.mjs'));
      const pkgPath = req.resolve('puppeteer/package.json');
      const mainPath = req.resolve('puppeteer');
      const puppeteer = req('puppeteer');
      return { pkgPath, mainPath, puppeteer };
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

  // ── 1. Puppeteer 包检测 ─────────────────────────────────
  console.log('📦  Puppeteer Package');
  console.log('─'.repeat(50));

  const resolved = resolvePuppeteer();
  if (!resolved) {
    console.log('  ❌ Puppeteer package not found');
    console.log('\n  Install: pnpm add @web-clone/adapter-puppeteer\n');
    process.exit(1);
  }

  const { pkgPath, mainPath, puppeteer } = resolved;
  const pkg = createRequire(pkgPath)('puppeteer/package.json');
  console.log(`  ✅  puppeteer        ${pkg.version}`);
  console.log(`      Path:  ${mainPath.replace(ROOT, '.')}`);
  console.log(`      Chrome for Testing: ${pkg.browsers?.chromium || 'bundled'}`);

  // ── 2. 浏览器二进制检测 ─────────────────────────────────
  console.log('\n📁  Browser Binaries');
  console.log('─'.repeat(50));

  // Puppeteer 下载浏览器到 node_modules/puppeteer/.local-chromium/
  const localChromeDir = resolve(dirname(pkgPath), '.local-chromium');
  let browserFound = false;
  let browserExePath = null;

  if (existsSync(localChromeDir)) {
    // 遍历查找 chrome.exe
    const { readdirSync } = await import('node:fs');
    const versions = readdirSync(localChromeDir);
    for (const ver of versions) {
      const win64 = resolve(localChromeDir, ver, 'chrome-win64', 'chrome.exe');
      const win32 = resolve(localChromeDir, ver, 'win32', 'chrome.exe');
      const linux = resolve(localChromeDir, ver, 'chrome-linux64', 'chrome');
      const mac = resolve(localChromeDir, ver, 'mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
      for (const exe of [win64, win32, linux, mac]) {
        if (existsSync(exe)) {
          browserExePath = exe;
          browserFound = true;
          break;
        }
      }
      if (browserFound) break;
    }
  }

  if (browserFound) {
    const size = statSync(browserExePath).size;
    console.log(`  ✅  Chromium found`);
    console.log(`      Path: ${browserExePath}`);
    console.log(`      Size: ${formatBytes(size)}`);
  } else {
    console.log(`  ⚠️  No local Chromium found in puppeteer cache`);
    console.log(`      Expected: ${localChromeDir}`);
  }

  // ── 3. 实际启动验证 ─────────────────────────────────────
  console.log('\n🚀  Launch Test');
  console.log('─'.repeat(50));

  try {
    const browser = await puppeteer.launch({ headless: true, timeout: 15000 });
    const version = await browser.version();
    const pages = (await browser.pages()).length;
    await browser.close();

    console.log(`  ✅  Browser launched successfully`);
    console.log(`      Version: ${version}`);
    console.log(`      Pages: ${pages}`);
  } catch (err) {
    console.log(`  ❌  Browser launch failed`);
    console.log(`      Error: ${err.message}`);
    console.log('\n🔧  Troubleshooting:');
    console.log(`  1. Install browser: npx puppeteer browsers install chromium`);
    console.log(`  2. Or set executablePath in puppeteer.launch()`);
    process.exit(1);
  }

  // ── 4. 总结 ─────────────────────────────────────────────
  console.log('\n' + '='.repeat(50));
  console.log('✅  Puppeteer environment is ready\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});