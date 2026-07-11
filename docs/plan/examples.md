# 实际使用示例集合

本文档包含完整的、可运行的示例代码，展示如何在 Playwright 自动化工作流中使用 web-clone。

---

## 1. 基础示例：简单登录和快照

**场景**：登录网站并快照首页

**文件**：`examples/1-basic-login.ts`

```typescript
import { chromium } from 'playwright';
import { snapshot } from 'web-clone';
import { PlaywrightFetcherAdapter } from 'web-clone/adapters';

/**
 * 基础示例：使用 Playwright 登录后进行网页快照
 * 
 * 工作流：
 * 1. 启动浏览器
 * 2. 访问登录页面
 * 3. 输入凭证并提交
 * 4. 等待导航完成
 * 5. 创建 Playwright 适配器
 * 6. 使用适配器进行快照（使用已认证的浏览器会话）
 * 7. 清理资源
 */
async function basicLoginAndSnapshot() {
  const browser = await chromium.launch({
    headless: true,  // 无头模式
  });

  try {
    const context = await browser.newContext({
      // 可选：设置 viewport 模拟特定设备
      viewport: { width: 1280, height: 720 },
    });

    const page = await context.newPage();

    // 第一步：访问登录页面
    console.log('📍 Navigating to login page...');
    await page.goto('https://example.com/login', {
      waitUntil: 'domcontentloaded',
    });

    // 第二步：填充并提交登录表单
    console.log('🔐 Logging in...');
    await page.fill('input[name="email"]', 'user@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // 等待重定向到仪表板或首页
    await page.waitForNavigation({ waitUntil: 'networkidle' });
    console.log('✅ Login successful');

    // 第三步：在当前认证会话中快照页面
    console.log('📸 Creating snapshot...');
    
    // 创建 Playwright 适配器
    // 该适配器会自动使用浏览器的 Cookie 和认证令牌
    const adapter = new PlaywrightFetcherAdapter(page, context);

    // 执行快照
    const result = await snapshot({
      url: page.url(),  // 当前页面 URL
      output: './snapshots/dashboard',
      mode: 'bundle',  // 输出为目录结构
      maxAssets: 100,
      concurrency: 6,
      timeout: 15000,
    }, adapter);

    // 第四步：输出统计信息
    console.log('\n✓ Snapshot complete!');
    console.log(`  Total assets: ${result.stats.total}`);
    console.log(`  Fetched: ${result.stats.fetched}`);
    console.log(`  Failed: ${result.stats.failed}`);
    console.log(`  Total size: ${formatBytes(result.stats.totalBytes)}`);

    await context.close();
  } finally {
    await browser.close();
  }
}

// 辅助函数：格式化字节大小
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// 运行示例
basicLoginAndSnapshot().catch(console.error);
```

**运行命令**：
```bash
npx tsx examples/1-basic-login.ts
```

---

## 2. 多页快照示例：SPA 应用

**场景**：登录 SPA 应用并快照多个路由页面

**文件**：`examples/2-multi-page-snapshot.ts`

```typescript
import { chromium } from 'playwright';
import { snapshot } from 'web-clone';
import { PlaywrightFetcherAdapter } from 'web-clone/adapters';

/**
 * 多页快照示例：快照 SPA 应用的多个页面
 * 
 * 优点：
 * - 一次登录，多个页面使用同一认证会话
 * - 每个页面使用相同的 Cookie 和认证令牌
 * - 快速且高效
 */
async function multiPageSnapshot() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const baseUrl = 'https://app.example.com';

  try {
    // 登录一次
    console.log('🔐 Logging in...');
    await page.goto(`${baseUrl}/login`);
    await page.fill('[name="email"]', 'user@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForNavigation();
    console.log('✅ Logged in\n');

    // 要快照的页面列表
    const pages = [
      {
        name: 'Dashboard',
        path: '/dashboard',
        options: { 
          extractComponents: true,
          frameworkHint: 'react' as const,
        },
      },
      {
        name: 'Users',
        path: '/users',
        options: { 
          extractComponents: true,
          frameworkHint: 'react' as const,
        },
      },
      {
        name: 'Settings',
        path: '/settings',
        options: { extractComponents: false },
      },
      {
        name: 'Reports',
        path: '/reports',
        options: { 
          extractComponents: true,
          frameworkHint: 'react' as const,
        },
      },
    ];

    const results = [];

    // 快照每个页面
    for (const pageConfig of pages) {
      console.log(`📍 Navigating to ${pageConfig.name}...`);
      
      // 导航到页面
      await page.goto(`${baseUrl}${pageConfig.path}`, {
        waitUntil: 'networkidle',
      });

      // 等待动态内容加载（如果需要）
      await page.waitForLoadState('networkidle');

      // 创建适配器
      const adapter = new PlaywrightFetcherAdapter(page, context, {
        executeJs: true,  // 执行 JS 以获取动态渲染内容
        waitForLoadState: 'networkidle',
      });

      console.log(`📸 Snapshotting ${pageConfig.name}...`);

      try {
        // 执行快照
        const result = await snapshot({
          url: page.url(),
          output: `./snapshots/spa${pageConfig.path}`,
          mode: 'bundle',
          maxAssets: 150,
          concurrency: 8,
          timeout: 20000,
          ...pageConfig.options,
        }, adapter);

        results.push({
          page: pageConfig.name,
          success: true,
          stats: result.stats,
        });

        console.log(`✓ ${pageConfig.name} - ${result.stats.fetched} assets\n`);
      } catch (error) {
        results.push({
          page: pageConfig.name,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });

        console.error(`✗ ${pageConfig.name} - ${error}\n`);
      }
    }

    // 输出总结
    console.log('\n📊 Summary:');
    console.log('─'.repeat(50));
    for (const result of results) {
      if (result.success) {
        console.log(
          `✓ ${result.page.padEnd(15)} - ${result.stats?.fetched} assets`
        );
      } else {
        console.log(`✗ ${result.page.padEnd(15)} - ${result.error}`);
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log('─'.repeat(50));
    console.log(`Total: ${successCount}/${results.length} pages snapshotted`);
  } finally {
    await context.close();
    await browser.close();
  }
}

// 运行示例
multiPageSnapshot().catch(console.error);
```

---

## 3. API 令牌认证示例

**场景**：使用 API 令牌（JWT、OAuth）进行认证

**文件**：`examples/3-api-token-auth.ts`

```typescript
import { chromium } from 'playwright';
import { snapshot } from 'web-clone';
import { PlaywrightFetcherAdapter } from 'web-clone/adapters';

/**
 * API 令牌认证示例
 * 
 * 场景：
 * - 某些 API 需要 JWT 或 OAuth 令牌
 * - 令牌存储在 localStorage 或 sessionStorage
 * - 需要在每个请求中附加令牌
 */
async function apiTokenAuth() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const baseUrl = 'https://api.example.com';

  try {
    // 方法 1：通过 API 获取令牌
    console.log('🔑 Acquiring API token...');
    const tokenResponse = await page.evaluate(async () => {
      const response = await fetch('https://api.example.com/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'user@example.com',
          password: 'password123',
        }),
      });
      return response.json();
    });

    const authToken = tokenResponse.access_token;
    console.log(`✅ Token acquired: ${authToken.substring(0, 20)}...\n`);

    // 方法 2：通过登录页面获取令牌
    // await page.goto(`${baseUrl}/login`);
    // await page.fill('[name="username"]', 'user@example.com');
    // await page.fill('[name="password"]', 'password123');
    // await page.click('button[type="submit"]');
    // await page.waitForNavigation();
    // const authToken = await page.evaluate(() => {
    //   return localStorage.getItem('auth_token') || sessionStorage.getItem('token');
    // });

    // 导航到需要认证的页面
    console.log('📍 Navigating to protected page...');
    await page.goto(`${baseUrl}/dashboard`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
      waitUntil: 'networkidle',
    });

    // 创建 Playwright 适配器并附加令牌
    const adapter = new PlaywrightFetcherAdapter(page, context, {
      customHeaders: {
        'Authorization': `Bearer ${authToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      waitForLoadState: 'networkidle',
    });

    console.log('📸 Creating snapshot with API token auth...');

    // 快照页面
    const result = await snapshot({
      url: page.url(),
      output: './snapshots/api-dashboard',
      mode: 'single',  // 单文件模式
      inline: true,   // 内联所有资源
      maxAssets: 100,
    }, adapter);

    console.log('\n✓ Snapshot complete!');
    console.log(`  Assets: ${result.stats.fetched}`);
    console.log(`  Size: ${(result.stats.totalBytes / 1024 / 1024).toFixed(2)} MB`);
  } finally {
    await context.close();
    await browser.close();
  }
}

// 运行示例
apiTokenAuth().catch(console.error);
```

---

## 4. 高级 JS 执行示例

**场景**：处理需要 JavaScript 执行的动态内容加载

**文件**：`examples/4-advanced-js-execution.ts`

```typescript
import { chromium } from 'playwright';
import { snapshot } from 'web-clone';
import { PlaywrightFetcherAdapter } from 'web-clone/adapters';

/**
 * 高级 JS 执行示例
 * 
 * 处理场景：
 * - 动态渲染内容（React、Vue、Angular 等）
 * - 无限滚动加载
 * - 异步加载的模态框
 * - 需要用户交互的内容
 */
async function advancedJsExecution() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const baseUrl = 'https://example.com';

  try {
    // 示例 1：处理需要滚动加载的内容
    console.log('📍 Loading page with dynamic content...');
    await page.goto(`${baseUrl}/infinite-scroll`);

    // 模拟滚动以加载更多内容
    console.log('📜 Scrolling to load more content...');
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      await page.waitForTimeout(1000);  // 等待内容加载
    }

    // 等待网络空闲
    await page.waitForLoadState('networkidle');
    console.log('✅ Content loaded\n');

    // 示例 2：处理延迟加载的图片
    console.log('🖼️ Waiting for lazy-loaded images...');
    await page.evaluate(() => {
      // 触发所有延迟加载图片的加载
      document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
        img.removeAttribute('loading');
        img.setAttribute('loading', 'eager');
      });
    });
    await page.waitForLoadState('networkidle');
    console.log('✅ Images loaded\n');

    // 示例 3：打开模态框并等待内容
    console.log('🔔 Opening modal dialog...');
    await page.click('[data-action="open-modal"]');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    await page.waitForLoadState('networkidle');
    console.log('✅ Modal loaded\n');

    // 现在进行快照（此时所有动态内容应已加载）
    const adapter = new PlaywrightFetcherAdapter(page, context, {
      executeJs: true,
      waitForLoadState: 'networkidle',
      // 可选：保存调试截图
      debugScreenshot: './debug-screenshot.png',
    });

    console.log('📸 Creating snapshot...');
    const result = await snapshot({
      url: page.url(),
      output: './snapshots/dynamic-content',
      mode: 'bundle',
      extractComponents: true,
      frameworkHint: 'react',
      maxAssets: 200,
      concurrency: 10,
    }, adapter);

    console.log('\n✓ Snapshot complete!');
    console.log(`  Total assets: ${result.stats.total}`);
    console.log(`  Successfully fetched: ${result.stats.fetched}`);
    if (result.stats.failed > 0) {
      console.log(`  Failed: ${result.stats.failed}`);
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

// 运行示例
advancedJsExecution().catch(console.error);
```

---

## 5. 错误处理和重试示例

**场景**：完整的错误处理、重试逻辑和日志记录

**文件**：`examples/5-error-handling.ts`

```typescript
import { chromium } from 'playwright';
import { snapshot } from 'web-clone';
import { PlaywrightFetcherAdapter } from 'web-clone/adapters';

/**
 * 生产级别的错误处理示例
 * 
 * 包含：
 * - 网络超时处理
 * - 认证失败处理
 * - 重试逻辑
 * - 详细日志
 */
class SnapshotManager {
  private maxRetries = 3;
  private retryDelay = 1000;  // 毫秒

  async snapshotWithRetry(
    url: string,
    outputPath: string,
    credentials: { email: string; password: string }
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`\n📸 Snapshot attempt ${attempt}/${this.maxRetries}`);
        await this.performSnapshot(url, outputPath, credentials);
        console.log('✓ Snapshot successful');
        return true;
      } catch (error) {
        if (attempt === this.maxRetries) {
          console.error(`✗ All ${this.maxRetries} attempts failed`);
          throw error;
        }

        const delay = this.retryDelay * attempt;
        console.warn(
          `⚠️ Attempt ${attempt} failed: ${error}`
        );
        console.log(`⏳ Retrying in ${delay}ms...\n`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    return false;
  }

  private async performSnapshot(
    url: string,
    outputPath: string,
    credentials: { email: string; password: string }
  ) {
    let browser: any = null;
    let context: any = null;

    try {
      // 启动浏览器
      console.log('🚀 Launching browser...');
      browser = await chromium.launch({
        headless: true,
        timeout: 30000,
      });

      // 创建上下文和页面
      console.log('📄 Creating page...');
      context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      const page = await context.newPage();

      // 添加事件监听器用于调试
      page.on('console', msg => console.log(`  [console] ${msg.text()}`));
      page.on('error', err => console.error(`  [error] ${err}`));

      // 登录
      console.log('🔐 Logging in...');
      await page.goto('https://example.com/login', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      const loginStartTime = Date.now();
      await page.fill('[name="email"]', credentials.email);
      await page.fill('[name="password"]', credentials.password);
      await page.click('button[type="submit"]');

      // 等待导航或错误
      try {
        await Promise.race([
          page.waitForNavigation({ timeout: 15000 }),
          page.waitForSelector('[data-error]', { timeout: 5000 })
            .then(() => { throw new Error('Login failed: Error displayed'); }),
        ]);
      } catch (error) {
        if (error instanceof Error && error.message.includes('Login failed')) {
          throw error;
        }
        // 如果只是超时，继续（某些页面可能不会导航）
      }

      const loginDuration = Date.now() - loginStartTime;
      console.log(`✅ Logged in (${loginDuration}ms)`);

      // 导航到目标页面
      console.log(`📍 Navigating to ${url}...`);
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // 检查页面是否实际加载
      const pageTitle = await page.title();
      if (!pageTitle || pageTitle.includes('Error') || pageTitle.includes('404')) {
        throw new Error(`Page load failed or error page detected: "${pageTitle}"`);
      }

      console.log(`✅ Page loaded: "${pageTitle}"`);

      // 创建适配器
      console.log('🔌 Creating Playwright adapter...');
      const adapter = new PlaywrightFetcherAdapter(page, context, {
        executeJs: true,
        waitForLoadState: 'networkidle',
      });

      // 获取并显示认证上下文
      const authContext = await adapter.getAuthContext();
      console.log(
        `📋 Auth context: ${authContext.cookies?.length || 0} cookies, ` +
        `token: ${authContext.token ? '✓' : '✗'}`
      );

      // 执行快照
      console.log('📸 Performing snapshot...');
      const snapshotStartTime = Date.now();

      const result = await snapshot({
        url: page.url(),
        output: outputPath,
        mode: 'bundle',
        maxAssets: 100,
        concurrency: 6,
        timeout: 20000,
        retryCount: 2,
      }, adapter);

      const snapshotDuration = Date.now() - snapshotStartTime;

      // 输出详细统计
      console.log(`\n📊 Snapshot Statistics (${snapshotDuration}ms):`);
      console.log(`  Total assets:      ${result.stats.total}`);
      console.log(`  ✓ Fetched:        ${result.stats.fetched}`);
      console.log(`  ✗ Failed:         ${result.stats.failed}`);
      console.log(`  ⊘ Skipped:        ${result.stats.skipped}`);
      console.log(`  📦 Total size:    ${this.formatBytes(result.stats.totalBytes)}`);

      if (result.stats.failed > 0) {
        console.warn(`⚠️ ${result.stats.failed} asset(s) failed to download`);
      }

      await adapter.dispose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Snapshot failed: ${message}`);
    } finally {
      // 清理资源
      if (context) {
        try {
          await context.close();
        } catch (e) {
          console.warn(`Failed to close context: ${e}`);
        }
      }

      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          console.warn(`Failed to close browser: ${e}`);
        }
      }
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
}

// 运行示例
async function main() {
  const manager = new SnapshotManager();

  try {
    await manager.snapshotWithRetry(
      'https://example.com/dashboard',
      './snapshots/dashboard',
      {
        email: 'user@example.com',
        password: 'password123',
      }
    );
  } catch (error) {
    console.error('\n❌ Final error:', error);
    process.exit(1);
  }
}

main();
```

---

## 6. 批量快照和导出示例

**场景**：批量快照多个 URL 并生成报告

**文件**：`examples/6-batch-snapshot.ts`

```typescript
import { chromium } from 'playwright';
import { snapshot } from 'web-clone';
import { PlaywrightFetcherAdapter } from 'web-clone/adapters';
import { writeFileSync } from 'fs';

/**
 * 批量快照示例
 * 
 * 用途：
 * - 快照整个网站
 * - 定期备份
 * - 网站镜像
 */
async function batchSnapshot() {
  const urls = [
    'https://example.com/',
    'https://example.com/about',
    'https://example.com/products',
    'https://example.com/contact',
  ];

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const results: Array<{
    url: string;
    success: boolean;
    outputPath: string;
    stats?: any;
    error?: string;
    duration: number;
  }> = [];

  try {
    for (const url of urls) {
      const startTime = Date.now();
      console.log(`\n📍 Snapshotting ${url}...`);

      try {
        await page.goto(url, { waitUntil: 'networkidle' });

        const adapter = new PlaywrightFetcherAdapter(page, context);
        const outputPath = `./snapshots/${new URL(url).pathname.replace(/\//g, '_')}`;

        const result = await snapshot({
          url,
          output: outputPath,
          mode: 'bundle',
        }, adapter);

        const duration = Date.now() - startTime;

        results.push({
          url,
          success: true,
          outputPath,
          stats: result.stats,
          duration,
        });

        console.log(`✓ Success (${duration}ms)`);
      } catch (error) {
        const duration = Date.now() - startTime;

        results.push({
          url,
          success: false,
          outputPath: '',
          error: error instanceof Error ? error.message : String(error),
          duration,
        });

        console.log(`✗ Failed (${duration}ms)`);
      }
    }

    // 生成报告
    console.log('\n\n📊 Batch Snapshot Report');
    console.log('═'.repeat(60));

    const report = {
      timestamp: new Date().toISOString(),
      totalUrls: urls.length,
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length,
      totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
      results,
    };

    for (const result of results) {
      if (result.success) {
        console.log(
          `✓ ${result.url}\n  ` +
          `Output: ${result.outputPath}\n  ` +
          `Assets: ${result.stats?.fetched}, Duration: ${result.duration}ms`
        );
      } else {
        console.log(
          `✗ ${result.url}\n  ` +
          `Error: ${result.error}`
        );
      }
      console.log();
    }

    console.log('═'.repeat(60));
    console.log(`Total: ${report.successCount}/${report.totalUrls} successful`);
    console.log(`Total duration: ${report.totalDuration}ms`);

    // 保存报告
    writeFileSync(
      './snapshot-report.json',
      JSON.stringify(report, null, 2)
    );
    console.log('\n📄 Report saved to snapshot-report.json');
  } finally {
    await context.close();
    await browser.close();
  }
}

batchSnapshot().catch(console.error);
```

---

## 总结

这些示例展示了 web-clone 库在 Playwright 工作流中的典型使用模式：

| 示例 | 场景 | 关键特性 |
|------|------|---------|
| 基础登录 | 简单认证和快照 | 基础使用 |
| 多页快照 | SPA 应用多页 | Cookie 复用、高效 |
| API 令牌 | API 认证 | 自定义请求头 |
| 高级 JS | 动态内容加载 | JS 执行、交互 |
| 错误处理 | 生产部署 | 重试、日志、资源清理 |
| 批量快照 | 网站备份 | 批量处理、报告生成 |

每个示例都可以独立运行，并包含完整的错误处理和日志记录。
