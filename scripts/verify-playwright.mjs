#!/usr/bin/env node
/**
 * 验证 Playwright 浏览器配置
 *
 * 在 pnpm monorepo 中正确解析 playwright 模块路径，
 * 检查浏览器二进制可用性，并实际启动验证。
 *
 * 用法：
 *   node scripts/verify-playwright.mjs
 *   pnpm verify-playwright
 */

import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// 在 monorepo 中从 adapter-playwright 解析 playwright
function loadPlaywright() {
  const base = resolve(ROOT, 'packages/adapter-playwright');
  const req = createRequire(resolve(base, 'noop.mjs'));
  try {
    const pkg = req('playwright/package.json');
    const { chromium } = req('playwright');
    return { version: pkg.version, chromium };
  } catch {
    return null;
  }
}

async function main() {
  console.log('🔍 Verifying Playwright Browser Configuration\n');

  // 环境信息
  console.log('📋 Environment:');
  console.log(`  PLAYWRIGHT_BROWSERS_PATH: ${process.env.PLAYWRIGHT_BROWSERS_PATH || '(not set)'}`);
  console.log(`  Platform: ${process.platform}`);
  console.log(`  Node version: ${process.version}\n`);

  // Playwright 版本
  const pw = loadPlaywright();
  if (!pw) {
    console.error('❌ Playwright package not found.');
    console.error('   Install: pnpm add @web-clone/adapter-playwright\n');
    process.exit(1);
  }
  console.log(`📦 Playwright Version: ${pw.version}\n`);

  // 启动浏览器
  console.log('🚀 Attempting to launch Chromium...\n');

  try {
    const browser = await pw.chromium.launch({
      headless: true,
      timeout: 30000,
    });

    console.log('✅ SUCCESS: Chromium browser launched successfully!\n');

    const version = await browser.version();
    console.log(`🔧 Browser Info:\n  ${version}\n`);

    const context = await browser.newContext();
    const page = await context.newPage();
    console.log('✅ Successfully created browser context and page\n');

    // 测试导航
    console.log('🌐 Testing basic navigation to https://example.com...\n');
    try {
      const response = await page.goto('https://example.com', {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });
      if (response?.ok()) {
        console.log('✅ Navigation successful');
        console.log(`  Status: ${response.status()}`);
        console.log(`  URL: ${page.url()}\n`);
        const title = await page.title();
        console.log(`  Page Title: ${title}\n`);
      }
    } catch (navError) {
      console.log('⚠️  Navigation test failed (expected if no network):');
      console.log(`  ${navError instanceof Error ? navError.message : String(navError)}\n`);
    }

    await context.close();
    await browser.close();
    console.log('✅ Browser closed successfully\n');
    console.log('✨ All verification tests passed!');
    return true;
  } catch (error) {
    console.error('❌ ERROR: Failed to launch browser:\n');
    console.error(error instanceof Error ? error.message : String(error));
    console.log('\n🔧 Troubleshooting:');
    console.log('  1. Check PLAYWRIGHT_BROWSERS_PATH environment variable');
    console.log('  2. Run: npx playwright install chromium');
    console.log('  3. Check file permissions on browser binaries\n');
    return false;
  }
}

main().then(success => process.exit(success ? 0 : 1)).catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});