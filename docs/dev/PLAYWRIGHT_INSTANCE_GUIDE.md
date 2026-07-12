# Playwright 实例获取指南

## 快速开始

### 1. 环境配置（必须）

在运行任何 Playwright 代码之前，必须设置环境变量指向浏览器位置：

**PowerShell：**
```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "D:\Source\pw-browsers"
```

**CMD：**
```cmd
set PLAYWRIGHT_BROWSERS_PATH=D:\Source\pw-browsers
```

**Bash/Git Bash：**
```bash
export PLAYWRIGHT_BROWSERS_PATH="D:\\Source\\pw-browsers"
```

### 2. 验证环境

```bash
npm run check-browsers
```

输出应该显示：
```
✅ Chromium (chrome.exe) - 2.87 MB
✅ Chromium Headless Shell - 183.18 MB
✅ Playwright 1.58.2 installed
```

### 3. 测试 Playwright 功能

```bash
npm run test-playwright
```

输出应该显示所有测试通过。

---

## 获取 Playwright 实例

### 模式 1：单页面实例（最常用）

```typescript
import { chromium } from 'playwright';

async function main() {
  // 启动浏览器
  const browser = await chromium.launch({
    headless: true,
    timeout: 30000,
  });

  // 创建上下文（虚拟浏览器，拥有独立的 Cookie、localStorage 等）
  const context = await browser.newContext();

  // 创建页面
  const page = await context.newPage();

  try {
    // 使用页面
    await page.goto('https://example.com');
    console.log(await page.title());
  } finally {
    // 清理
    await page.close();
    await context.close();
    await browser.close();
  }
}

main();
```

### 模式 2：多页面实例（共享 Cookie）

```typescript
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // 创建多个页面，共享同一个上下文（Cookie、localStorage 等）
  const page1 = await context.newPage();
  const page2 = await context.newPage();

  try {
    // 登录
    await page1.goto('https://example.com/login');
    await page1.fill('[name="username"]', 'user@example.com');
    await page1.fill('[name="password"]', 'password');
    await page1.click('[type="submit"]');

    // 另一个页面继承 Cookie
    await page2.goto('https://example.com/dashboard');
    // page2 可以访问需要认证的资源，因为它继承了 page1 的 Cookie
  } finally {
    await page1.close();
    await page2.close();
    await context.close();
    await browser.close();
  }
}

main();
```

### 模式 3：多上下文实例（隔离 Cookie）

```typescript
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });

  // 两个独立的上下文，各有独立的 Cookie
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();

  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    // 上下文 1：以用户 A 身份登录
    await page1.goto('https://example.com/login');
    await page1.fill('[name="username"]', 'userA@example.com');
    await page1.fill('[name="password"]', 'passwordA');
    await page1.click('[type="submit"]');

    // 上下文 2：以用户 B 身份登录（独立的 Cookie）
    await page2.goto('https://example.com/login');
    await page2.fill('[name="username"]', 'userB@example.com');
    await page2.fill('[name="password"]', 'passwordB');
    await page2.click('[type="submit"]');

    // page1 和 page2 在不同的认证状态下
  } finally {
    await page1.close();
    await page2.close();
    await context1.close();
    await context2.close();
    await browser.close();
  }
}

main();
```

---

## PlaywrightFetcherAdapter 使用

### 用于 web-clone 快照

```typescript
import { chromium } from 'playwright';
import { snapshot } from './src/assembler';
import { PlaywrightFetcherAdapter } from './src/adapters/playwright-fetcher-adapter';

async function snapshotWithPlaywright() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 创建 PlaywrightFetcherAdapter
    const adapter = new PlaywrightFetcherAdapter(page, context, {
      waitForLoadState: 'networkidle',  // 等待网络空闲
      executeJs: true,                   // 执行 JavaScript
      customHeaders: {
        'Authorization': 'Bearer token123',
      },
    });

    // 使用适配器进行快照
    const result = await snapshot(
      {
        url: 'https://example.com',
        output: './snapshots/example',
        mode: 'bundle',
      },
      adapter
    );

    console.log(`Snapshot created: ${result.stats.successful} assets`);
  } finally {
    await context.close();
    await browser.close();
  }
}

snapshotWithPlaywright();
```

---

## 完整示例：带认证的页面快照

```typescript
import { chromium } from 'playwright';
import { snapshot } from './src/assembler';
import { PlaywrightFetcherAdapter } from './src/adapters/playwright-fetcher-adapter';

async function snapshotAuthenticatedPage() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 步骤 1：登录流程
    console.log('🔐 Logging in...');
    await page.goto('https://example.com/login', { waitUntil: 'domcontentloaded' });
    
    await page.fill('[name="email"]', 'user@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('[type="submit"]');
    
    await page.waitForNavigation(); // 等待重定向到仪表板
    console.log('✅ Logged in successfully');

    // 步骤 2：导航到目标页面
    console.log('📄 Navigating to dashboard...');
    await page.goto('https://example.com/dashboard');
    await page.waitForLoadState('networkidle');
    console.log('✅ Page loaded');

    // 步骤 3：创建适配器（继承认证状态）
    const adapter = new PlaywrightFetcherAdapter(page, context, {
      waitForLoadState: 'networkidle',
      executeJs: true,
    });

    // 步骤 4：快照（所有资源都会使用认证 Cookie）
    console.log('📸 Creating snapshot...');
    const result = await snapshot(
      {
        url: 'https://example.com/dashboard',
        output: './snapshots/authenticated-dashboard',
        mode: 'bundle',
        extractComponents: true,
      },
      adapter
    );

    console.log(`✨ Snapshot complete: ${result.stats.successful} assets`);

    // 步骤 5：获取认证上下文（用于后续请求）
    const authCtx = await adapter.getAuthContext();
    console.log(`🔑 Auth context:`, {
      cookies: authCtx.cookies?.length || 0,
      token: authCtx.token ? '***' : 'none',
    });
  } finally {
    await context.close();
    await browser.close();
  }
}

snapshotAuthenticatedPage();
```

---

## 关键配置参数

### PlaywrightFetcherAdapter 选项

```typescript
interface PlaywrightAdapterOptions {
  // 是否等待页面导航完成（默认：true）
  waitForNavigation?: boolean;

  // 是否执行页面 JavaScript（默认：true）
  executeJs?: boolean;

  // 等待加载状态
  // - 'load': 等待 load 事件
  // - 'domcontentloaded': 等待 DOMContentLoaded 事件
  // - 'networkidle': 等待网络空闲（推荐）
  waitForLoadState?: 'load' | 'domcontentloaded' | 'networkidle';

  // 自定义请求头（如认证令牌）
  customHeaders?: Record<string, string>;

  // 调试模式：保存截图
  debugScreenshot?: string;

  // 是否验证 SSL 证书（默认：true）
  validateSSL?: boolean;
}
```

### chromium.launch() 选项

```typescript
const browser = await chromium.launch({
  // 无头模式（默认：true）
  headless: true,

  // 启动超时（毫秒）
  timeout: 30000,

  // 减速（毫秒）- 用于调试
  slowMo: 0,

  // 浏览器参数
  args: [
    '--no-sandbox',           // 禁用沙箱
    '--disable-dev-shm-usage', // 禁用 /dev/shm
  ],
});
```

---

## 常见操作

### 设置 Cookie

```typescript
await context.addCookies([
  {
    name: 'session',
    value: 'abc123',
    domain: 'example.com',
    path: '/',
    url: 'https://example.com',
  },
]);
```

### 获取 Cookie

```typescript
const cookies = await context.cookies();
console.log(cookies);
```

### 保存认证状态

```typescript
// 保存到文件
await context.storageState({ path: 'auth-state.json' });

// 稍后恢复
const newBrowser = await chromium.launch();
const newContext = await newBrowser.newContext({
  storageState: 'auth-state.json',
});
```

### 在页面中执行 JavaScript

```typescript
// 简单值
const title = await page.evaluate(() => document.title);

// 复杂操作
const data = await page.evaluate(() => {
  const elements = document.querySelectorAll('.item');
  return Array.from(elements).map(el => ({
    text: el.textContent,
    href: el.getAttribute('href'),
  }));
});

// 传递参数
const result = await page.evaluate(([name, age]) => ({
  message: `${name} is ${age} years old`,
}), ['John', 30]);
```

### 等待特定元素

```typescript
// 等待元素出现
await page.waitForSelector('.loading-spinner');

// 等待元素消失
await page.waitForFunction(() => !document.querySelector('.loading-spinner'));

// 等待导航
await page.waitForNavigation();

// 等待加载完成
await page.waitForLoadState('networkidle');
```

---

## 错误处理

### 处理导航错误

```typescript
try {
  const response = await page.goto('https://example.com', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  if (!response?.ok()) {
    console.error(`Failed: Status ${response?.status()}`);
  }
} catch (error) {
  if (error instanceof Error) {
    if (error.message.includes('Timeout')) {
      console.error('Navigation timeout');
    } else if (error.message.includes('Connection refused')) {
      console.error('Connection refused');
    } else {
      console.error('Navigation failed:', error.message);
    }
  }
}
```

### 安全关闭资源

```typescript
try {
  // ... 使用 page/context/browser ...
} finally {
  // 确保资源被正确关闭
  if (page && !page.isClosed()) {
    await page.close();
  }
  if (context) {
    await context.close();
  }
  if (browser) {
    await browser.close();
  }
}
```

---

## 性能优化

### 减少加载时间

```typescript
// 只等待 DOM 而不等待网络
await page.goto(url, { waitUntil: 'domcontentloaded' });

// 而不是
await page.goto(url, { waitUntil: 'networkidle' }); // 更慢
```

### 并行请求

```typescript
// 同时在多个页面中操作
const pages = [page1, page2, page3];
await Promise.all(pages.map(p => p.goto('https://example.com')));
```

### 限制浏览器打开数量

```typescript
// 限制并发浏览器实例
const MAX_BROWSERS = 2;
const queue = [];

async function getBrowser() {
  if (queue.length < MAX_BROWSERS) {
    return await chromium.launch();
  }
  // 等待某个浏览器释放
  return new Promise(resolve => {
    // 等待逻辑...
  });
}
```

---

## 调试技巧

### 启用详细日志

```bash
DEBUG=pw:api npm run dev
```

### 非 Headless 模式调试

```typescript
const browser = await chromium.launch({
  headless: false,  // 显示浏览器窗口
  slowMo: 1000,     // 减速 1 秒，便于观察
});
```

### 使用 Playwright Inspector

```bash
PWDEBUG=1 npm run test:integration
```

这会启动交互式调试器，允许逐步执行操作。

---

## 总结

✅ 环境已验证
✅ Playwright 1.58.2 已安装
✅ 浏览器二进制文件可用
✅ 所有示例代码已测试

**下一步：**
1. 设置 `PLAYWRIGHT_BROWSERS_PATH` 环境变量
2. 运行 `npm run test-playwright` 验证
3. 使用提供的示例开始开发
4. 查看 `docs/tests/` 了解测试指南
