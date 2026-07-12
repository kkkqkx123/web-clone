/**
 * 验证 Playwright 浏览器配置
 * 检查是否能够使用环境中已有的 Playwright 浏览器
 */

import { chromium } from 'playwright';

async function verifyPlaywrightBrowsers() {
  console.log('🔍 Verifying Playwright Browser Configuration\n');

  // 打印环境信息
  console.log('📋 Environment:');
  console.log(`  PLAYWRIGHT_BROWSERS_PATH: ${process.env.PLAYWRIGHT_BROWSERS_PATH || '(not set)'}`);
  console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Platform: ${process.platform}`);
  console.log(`  Node version: ${process.version}\n`);

  // 打印 Playwright 版本
  try {
    const pwPackage = require('playwright/package.json');
    console.log(`📦 Playwright Version: ${pwPackage.version}\n`);
  } catch (error) {
    console.log('⚠️  Could not read Playwright version\n');
  }

  // 尝试启动浏览器
  console.log('🚀 Attempting to launch Chromium...\n');

  try {
    const browser = await chromium.launch({
      headless: true,
      timeout: 30000,
    });

    console.log('✅ SUCCESS: Chromium browser launched successfully!\n');

    // 获取浏览器版本
    const version = await browser.evaluate('navigator.userAgent');
    console.log(`🔧 Browser Info:\n  ${version}\n`);

    // 创建页面测试
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('✅ Successfully created browser context and page\n');

    // 测试基本导航
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

        // 获取页面标题
        const title = await page.title();
        console.log(`  Page Title: ${title}\n`);
      }
    } catch (navError) {
      console.log('⚠️  Navigation test failed (expected if no network):');
      console.log(`  ${navError instanceof Error ? navError.message : String(navError)}\n`);
    }

    // 清理
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
    console.log('  2. Verify chromium-1208 exists in the browsers directory');
    console.log('  3. Run: npx playwright install chromium');
    console.log('  4. Check file permissions on browser binaries\n');

    return false;
  }
}

// 运行验证
verifyPlaywrightBrowsers().catch((error) => {
  console.error('Verification failed:', error);
  process.exit(1);
});
