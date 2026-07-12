#!/usr/bin/env node
/**
 * 验证 Playwright 浏览器可用性
 * 检查环境中是否有正确的浏览器二进制文件
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// 浏览器路径配置
const BROWSER_PATHS = {
  chromium: 'D:\\Source\\pw-browsers\\chromium-1208\\chrome-win64\\chrome.exe',
  chromiumHeadless:
    'D:\\Source\\pw-browsers\\chromium_headless_shell-1208\\chrome-headless-shell-win64\\chrome-headless-shell.exe',
};

async function checkBrowserPath(name: string, browserPath: string): Promise<boolean> {
  try {
    await fs.access(browserPath);
    const stat = await fs.stat(browserPath);
    const size = (stat.size / (1024 * 1024)).toFixed(2);

    console.log(`  ✅ ${name}`);
    console.log(`     Path: ${browserPath}`);
    console.log(`     Size: ${size} MB\n`);

    return true;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     Path: ${browserPath}`);
    console.log(`     Error: ${error instanceof Error ? error.message : String(error)}\n`);

    return false;
  }
}

async function verifyPlaywrightEnvironment() {
  console.log('\n🔍 Playwright Browser Verification\n');
  console.log('=' .repeat(60) + '\n');

  // 打印环境信息
  console.log('📋 Environment Information:\n');
  console.log(`  Platform: ${process.platform}`);
  console.log(`  Architecture: ${process.arch}`);
  console.log(`  Node Version: ${process.version}`);
  console.log(`  PWD: ${process.cwd()}\n`);

  // 检查浏览器路径
  console.log('🔍 Checking Browser Binaries:\n');

  const chromiumExists = await checkBrowserPath('Chromium (chrome.exe)', BROWSER_PATHS.chromium);
  const headlessExists = await checkBrowserPath(
    'Chromium Headless Shell',
    BROWSER_PATHS.chromiumHeadless
  );

  // 验证 Playwright 包
  console.log('📦 Checking Playwright Installation:\n');

  try {
    const playwrightJson = await fs.readFile(
      'D:\\project\\cli\\web-clone\\node_modules\\playwright\\package.json',
      'utf-8'
    );
    const pwInfo = JSON.parse(playwrightJson);
    console.log(`  ✅ Playwright ${pwInfo.version} installed\n`);
  } catch (error) {
    console.log(`  ❌ Playwright package not found\n`);
  }

  // 总结
  console.log('=' .repeat(60) + '\n');
  console.log('📊 Summary:\n');

  if (chromiumExists && headlessExists) {
    console.log('  ✅ All required browsers are available!');
    console.log('  ✅ You can run integration tests with real browsers\n');

    console.log('🚀 Next Steps:\n');
    console.log('  1. Set environment: set PLAYWRIGHT_BROWSERS_PATH=D:\\Source\\pw-browsers');
    console.log('  2. Run tests: npm run test:integration\n');

    return true;
  } else {
    console.log('  ⚠️  Some browsers are missing!');
    console.log('  Please verify the browser paths and reinstall if needed\n');

    return false;
  }
}

// 运行验证
verifyPlaywrightEnvironment()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Verification failed:', error);
    process.exit(1);
  });
