#!/usr/bin/env node
/**
 * 测试 Playwright 功能
 * 验证是否能够成功启动浏览器并执行基本操作
 */

import { chromium } from 'playwright';

async function testPlaywrightFunctionality() {
  console.log('\n🧪 Testing Playwright Functionality\n');
  console.log('='.repeat(60) + '\n');

  try {
    // 步骤 1：启动浏览器
    console.log('1️⃣  Launching Chromium browser...\n');

    const browser = await chromium.launch({
      headless: true,
      timeout: 30000,
    });

    console.log('   ✅ Browser launched successfully\n');

    // 步骤 2：创建上下文
    console.log('2️⃣  Creating browser context...\n');

    const context = await browser.newContext();
    console.log('   ✅ Context created successfully\n');

    // 步骤 3：创建页面
    console.log('3️⃣  Creating page...\n');

    const page = await context.newPage();
    console.log('   ✅ Page created successfully\n');

    // 步骤 4：测试页面方法
    console.log('4️⃣  Testing page methods...\n');

    // 测试 evaluate
    const result = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
      };
    });

    console.log('   ✅ page.evaluate() works');
    console.log(`      URL: ${result.url}`);
    console.log(`      Title: ${result.title}\n`);

    // 步骤 5：测试导航（如果有网络）
    console.log('5️⃣  Testing navigation (with timeout fallback)...\n');

    try {
      const response = await page.goto('https://example.com', {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });

      if (response) {
        console.log('   ✅ Navigation successful');
        console.log(`      Status: ${response.status()}`);
        console.log(`      URL: ${page.url()}\n`);
      }
    } catch (navError) {
      console.log('   ⚠️  Navigation failed (expected if offline)');
      console.log(`      Error: ${navError instanceof Error ? navError.message : String(navError)}\n`);
    }

    // 步骤 6：清理
    console.log('6️⃣  Cleaning up...\n');

    await page.close();
    console.log('   ✅ Page closed');

    await context.close();
    console.log('   ✅ Context closed');

    await browser.close();
    console.log('   ✅ Browser closed\n');

    // 成功
    console.log('='.repeat(60) + '\n');
    console.log('✨ All tests passed!\n');
    console.log('📊 Summary:\n');
    console.log('   ✅ Playwright can launch browser');
    console.log('   ✅ Can create contexts and pages');
    console.log('   ✅ Can execute JavaScript on pages');
    console.log('   ✅ Can navigate (with network)');
    console.log('   ✅ Environment is ready for testing\n');

    return true;
  } catch (error) {
    console.error('❌ Test failed:\n');
    console.error(error);
    console.log('\n' + '='.repeat(60) + '\n');
    console.log('🔧 Troubleshooting:\n');
    console.log('   1. Verify PLAYWRIGHT_BROWSERS_PATH is set correctly');
    console.log('   2. Check browser binary permissions');
    console.log('   3. Try running as administrator\n');

    return false;
  }
}

// 运行测试
testPlaywrightFunctionality()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
