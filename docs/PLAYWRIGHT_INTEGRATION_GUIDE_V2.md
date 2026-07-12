# Playwright 集成指南

**版本：2.0+**

本指南说明如何在你的项目中使用 web-clone 与 Playwright 进行网页快照。

## 核心架构变化

从 v2.0 开始，web-clone 采用了更加灵活的架构：

- ✅ **web-clone 库**：只负责网页拉取、解析、资源管理和输出
- ✅ **你的代码**：负责浏览器生命周期、认证逻辑和自动化流程
- ✅ **PlaywrightFetcherAdapter**：连接两者的适配器接口

这个设计带来的好处：

1. **版本灵活性** - 使用任意版本的 Playwright
2. **完全控制** - 浏览器配置、认证流程都由你掌控
3. **框架无关** - 支持 Puppeteer、Nightmare 或任何其他自动化框架
4. **维护简单** - 库保持精简，专注于核心功能

## 快速开始

### 1. 安装依赖

```bash
# Install web-clone library (Playwright is optional)
npm install web-clone

# Also install Playwright (choose your version)
npm install --save-dev playwright
```

### 2. 基础用法

```typescript
import { chromium } from 'playwright';
import { snapshot } from 'web-clone';
import { PlaywrightFetcherAdapter } from 'web-clone/adapters';

async function main() {
  // Step 1: Launch browser (you manage this)
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Step 2: Create adapter
    const adapter = new PlaywrightFetcherAdapter(page, context);

    // Step 3: Use snapshot() with the adapter
    const result = await snapshot({
      url: 'https://example.com',
      output: './snapshot',
      mode: 'bundle',
    }, adapter);

    console.log(`✓ Complete: ${result.stats.fetched} assets`);
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
}

main().catch(console.error);
```

## 常见用法

### 带认证的快照

你的认证逻辑在你的代码中，web-clone 只负责快照：

```typescript
async function snapshotAuthenticatedPage() {
  const browser = await chromium.launch();
  const context = await browser.newContext();

  try {
    // YOUR authentication logic
    const authPage = await context.newPage();
    await authPage.goto('https://example.com/login');
    await authPage.fill('input[name="email"]', 'user@example.com');
    await authPage.fill('input[name="password"]', 'password');
    await authPage.click('button[type="submit"]');
    await authPage.waitForNavigation();
    await authPage.close();

    // NOW use web-clone with authenticated context
    const snapshotPage = await context.newPage();
    const adapter = new PlaywrightFetcherAdapter(snapshotPage, context);

    const result = await snapshot({
      url: 'https://example.com/dashboard',
      output: './dashboard-snapshot',
      mode: 'bundle',
    }, adapter);

    await snapshotPage.close();
    return result;
  } finally {
    await context.close();
    await browser.close();
  }
}
```

### 自定义快照选项

```typescript
const adapter = new PlaywrightFetcherAdapter(page, context, {
  // Control page load behavior
  waitForLoadState: 'networkidle',  // 'load' | 'domcontentloaded' | 'networkidle' | 'commit'
  
  // Whether to execute JavaScript
  executeJs: true,  // Set to false to get raw HTML without JS execution
  
  // Custom request headers
  customHeaders: {
    'Authorization': 'Bearer token123',
    'X-Custom-Header': 'value',
  },
  
  // SSL validation
  validateSSL: true,  // Set to false for self-signed certificates
  
  // Debug screenshot
  debugScreenshot: './debug.png',  // Save screenshot for debugging
});

const result = await snapshot(options, adapter);
```

### 快照多个页面

```typescript
async function snapshotMultiplePages() {
  const browser = await chromium.launch();
  const context = await browser.newContext();

  const pages = [
    { url: 'https://example.com/', output: './snapshots/home' },
    { url: 'https://example.com/about', output: './snapshots/about' },
    { url: 'https://example.com/contact', output: './snapshots/contact' },
  ];

  for (const page of pages) {
    const snapshotPage = await context.newPage();
    try {
      const adapter = new PlaywrightFetcherAdapter(snapshotPage, context);
      await snapshot({
        url: page.url,
        output: page.output,
        mode: 'bundle',
      }, adapter);
    } finally {
      await snapshotPage.close();
    }
  }

  await context.close();
  await browser.close();
}
```

## PlaywrightFetcherAdapter API

### 构造器

```typescript
new PlaywrightFetcherAdapter(page, context, options?)
```

- `page` - Playwright 页面对象
- `context` - Playwright 浏览器上下文
- `options` - 可选配置（见上面的选项说明）

### 方法

#### `fetch(url, options)`

获取资源。由 `snapshot()` 自动调用，你通常不需要直接调用。

#### `canAccess(url)`

检查资源是否可访问（使用 HEAD 请求）。

```typescript
const isAccessible = await adapter.canAccess('https://example.com/api/data');
```

#### `getAuthContext()`

提取当前认证信息（cookies、headers、tokens）。

```typescript
const auth = await adapter.getAuthContext();
console.log(auth.cookies);  // Array of cookies
```

#### `dispose()`

清理适配器资源。由你调用，而不是自动调用。

```typescript
await adapter.dispose();
// 然后自己关闭 page 和 context
await page.close();
await context.close();
```

## 高级用法

### 自定义 FetcherAdapter

如果你想使用其他自动化框架（Puppeteer、Nightmare 等），你可以实现自己的适配器：

```typescript
import type {
  FetcherAdapter,
  FetchOptions,
  FetchResult,
  AuthContext,
} from 'web-clone/adapters';

class MyCustomAdapter implements FetcherAdapter {
  async fetch(url: string, options: FetchOptions): Promise<FetchResult> {
    // Your implementation
  }

  async canAccess(url: string): Promise<boolean> {
    // Your implementation
  }

  async getAuthContext(): Promise<AuthContext> {
    // Your implementation
  }

  async dispose(): Promise<void> {
    // Your implementation
  }
}

// Use it the same way
const adapter = new MyCustomAdapter(...);
const result = await snapshot(options, adapter);
```

详见 `examples/puppeteer-adapter.ts` 了解完整示例。

## 浏览器配置

所有 Playwright 浏览器配置都由你在代码中完成：

```typescript
// 自定义浏览器选项
const browser = await chromium.launch({
  headless: false,           // Show browser
  proxy: { server: 'http://proxy:8080' },  // Proxy settings
  slowMo: 100,              // Slow down operations for debugging
});

// 自定义上下文选项
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  userAgent: 'MyBot/1.0',
  locale: 'zh-CN',
  geolocation: { latitude: 39.9, longitude: 116.4 },
  permissions: ['geolocation'],
  // ... 所有 Playwright 支持的选项
});
```

## CLI vs 库 API

- **CLI** (`npm run snapshot <url>`) - 用于简单的 HTTP 快照
- **库 API** - 用于需要自动化或自定义逻辑的场景

CLI 无法满足所有自动化需求，这就是为什么我们提供库 API 给你完全控制权。

## 常见问题

### Q: 为什么 Playwright 不是强依赖？

**A**: 因为许多用户只需要 HTTP 快照，无需浏览器。通过将 Playwright 设为可选依赖，我们让 HTTP 用户的安装体积更小。

### Q: 我能使用不同版本的 Playwright 吗？

**A**: 可以！只要 API 兼容（>=1.40.0）。你有完全的版本控制权。

### Q: 旧代码会怎样？

**A**: v1.x 的代码需要迁移到 v2.0 API。详见迁移指南。

### Q: 能同时使用多个自动化框架吗？

**A**: 可以！为每个框架实现一个适配器即可。详见 `examples/puppeteer-adapter.ts`。

## 更多示例

- `examples/playwright/01-basic-snapshot.ts` - 基础用法
- `examples/playwright/02-with-authentication.ts` - 认证示例
- `examples/playwright/03-multiple-pages.ts` - 多页快照
- `examples/puppeteer-adapter.ts` - 自定义适配器

## 获取帮助

- 查看示例代码：`examples/` 目录
- 查看类型定义：`src/adapters/index.ts`
- 阅读源代码：`src/adapters/automation/playwright/`
