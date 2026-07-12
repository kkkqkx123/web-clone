# 正确的 Playwright 集成实现方案

## 架构对比

### ❌ 当前错误的架构

```
web-clone (库)
│
├─ src/adapters/
│  ├─ fetcher-adapter.ts       ✅ 通用接口
│  ├─ http-fetcher-adapter.ts  ✅ HTTP 实现
│  └─ automation/playwright/
│     ├─ adapter.ts            ✅ Playwright 适配器
│     └─ options.ts            ❌ Playwright 特定选项 (违反分层)
│
├─ src/core/playwright/        ❌ 不应该存在
│  ├─ convenience-api.ts       ❌ snapshotWithPlaywright()
│  ├─ auth.ts                  ❌ 认证逻辑
│  └─ cli-integration.ts       ❌ CLI 集成
│
└─ src/cli.ts                  ❌ 包含 performPlaywrightSnapshot()
```

### ✅ 正确的架构

```
web-clone (库) - 永远不变
│
└─ src/adapters/
   ├─ fetcher-adapter.ts       ✅ 通用 FetcherAdapter 接口
   ├─ http-fetcher-adapter.ts  ✅ HTTP 实现
   │
   └─ automation/playwright/   ✅ 最小化适配器
      └─ adapter.ts            ✅ 只实现 FetcherAdapter
                                  (无生命周期管理，无认证逻辑)

用户的代码（他们的项目）
│
└─ src/pages/
   └─ snapshot-authenticated-page.ts
      │
      ├─ import { chromium } from 'playwright'          // 用户的依赖
      ├─ import { snapshot } from 'web-clone'           // 库的 API
      ├─ import { PlaywrightFetcherAdapter } from ...   // 库的适配器
      │
      └─ // 用户完全控制的代码：
         ├─ const browser = await chromium.launch()     // 用户创建
         ├─ const context = await browser.newContext()  // 用户创建
         ├─ // 用户的认证逻辑
         ├─ const adapter = new PlaywrightFetcherAdapter(page, context)
         ├─ const result = await snapshot(options, adapter)
         └─ // 用户的清理逻辑
```

## 第一步：简化 PlaywrightFetcherAdapter

**删除这些不必要的方法：**

```typescript
// ❌ 删除这些方法
async saveState(path: string): Promise<void>
async loadState(path: string): Promise<void>
async getStateSummary(): Promise<...>

// 理由：
// - Playwright 原生 API 已经提供 context.storageState()
// - web-clone 不应该包装这些逻辑
// - 用户应该在自己的代码中使用 Playwright 原生 API
```

**简化选项接口：**

```typescript
// ❌ 旧版本（复杂）
export interface PlaywrightAdapterOptions extends AutomationAdapterOptions {
  waitForLoadState?: PlaywrightWaitUntil;
  executeJs?: boolean;
  debugScreenshot?: string;
  maxConcurrentRequests?: number;
  waitForNavigation?: boolean;
}

// ✅ 新版本（最小化）
export interface PlaywrightAdapterOptions {
  /**
   * Playwright 特定的 fetch 行为
   * 这些选项只在 fetch() 调用时使用，不涉及浏览器/context 生命周期
   */
  
  /// Wait state for page.goto()
  waitForLoadState?: 'load' | 'domcontentloaded' | 'networkidle';
  
  /// Whether to execute JavaScript
  executeJs?: boolean;
  
  /// Custom headers for all requests
  customHeaders?: Record<string, string>;
  
  /// SSL certificate validation
  validateSSL?: boolean;
}
```

**删除所有关于生命周期管理的代码和注释**

## 第二步：删除所有便利函数

**删除这些文件：**

```bash
rm src/core/playwright/convenience-api.ts
rm src/core/playwright/auth.ts
rm src/core/playwright/cli-integration.ts
rm src/core/playwright/index.ts
rm -rf src/core/
```

**为什么：**
- 这些不是库的职责
- 用户应该在自己的代码中实现这些逻辑
- 每个自动化框架都需要这样的逻辑，无法共享

## 第三步：清理 package.json

**从 dependencies 移除 Playwright：**

```json
{
  "dependencies": {
    "commander": "^15.0.0",
    "chalk": "^5.6.2",
    "css-tree": "^3.2.1",
    "postcss": "^8.5.17",
    "global-agent": "^4.1.3",
    "http-proxy-agent": "^9.1.0",
    "https-proxy-agent": "^9.1.0",
    "node-fetch-native": "^1.6.7",
    "ora": "^9.4.1",
    "@babel/parser": "^8.0.4",
    "@babel/traverse": "^8.0.4",
    "@babel/types": "^8.0.4"
    // ❌ 移除 "playwright"
  },
  "peerDependencies": {
    "playwright": ">=1.40.0"  // ✅ 用户自己提供
  },
  "peerDependenciesMeta": {
    "playwright": {
      "optional": true  // 允许 HTTP 模式不安装 Playwright
    }
  },
  "devDependencies": {
    "playwright": "^1.58.2",  // ✅ 开发/测试时用
    // ... 其他 dev 依赖
  }
}
```

## 第四步：简化 CLI

**删除 Playwright 相关选项：**

```typescript
// ❌ 删除这些选项
.option('--use-playwright', '...')
.option('--headless <bool>', '...')
.option('--proxy <url>', '...')
.option('--auth-script <path>', '...')
.option('--auth-timeout <ms>', '...')
.option('--save-state <path>', '...')
.option('--load-state <path>', '...')
.option('--user-agent <string>', '...')
.option('--viewport <widthxheight>', '...')

// ❌ 删除这个条件
if (shouldUsePlaywright(opts)) {
  result = await performPlaywrightSnapshot(options, opts);
} else {
  result = await snapshot(options.url, options);
}

// ✅ 只支持 HTTP
result = await snapshot(options.url, options);
```

**理由：**
- CLI 是简单快照工具
- Playwright 用户需要自己的代码来控制自动化
- 试图在 CLI 中支持所有的 Playwright 配置选项是不可行的
- CLI 和库 API 分开使用，CLI 只做简单的 HTTP 快照

## 第五步：提供清晰的文档和示例

**创建示例而不是在库中实现：**

```
docs/examples/
├─ playwright/
│  ├─ 01-basic-snapshot.ts
│  │  └─ 最简单的用法
│  │
│  ├─ 02-with-authentication.ts
│  │  └─ 带认证的快照
│  │
│  ├─ 03-oauth-flow.ts
│  │  └─ OAuth 登录流程
│  │
│  ├─ 04-multi-page-snapshot.ts
│  │  └─ 快照多个页面
│  │
│  └─ 05-advanced-with-custom-adapter.ts
│     └─ 自定义错误处理和重试
│
├─ puppeteer/
│  ├─ 01-basic-snapshot.ts
│  ├─ 02-with-authentication.ts
│  └─ ... (与 Playwright 示例相同的结构)
│
└─ http/
   ├─ 01-basic-snapshot.ts
   └─ 02-with-custom-adapter.ts
```

**示例内容：**

```typescript
// docs/examples/playwright/01-basic-snapshot.ts

import { chromium } from 'playwright';
import { snapshot } from 'web-clone';
import { PlaywrightFetcherAdapter } from 'web-clone/adapters';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const adapter = new PlaywrightFetcherAdapter(page, context, {
      waitForLoadState: 'networkidle',
      customHeaders: {
        'User-Agent': 'MyBot/1.0'
      }
    });

    const result = await snapshot({
      url: 'https://example.com',
      output: './snapshot',
      mode: 'bundle'
    }, adapter);

    console.log('Snapshot complete:', result.stats);
  } finally {
    await adapter.dispose();
    await context.close();
    await browser.close();
  }
}

main().catch(console.error);
```

```typescript
// docs/examples/playwright/02-with-authentication.ts

import { chromium } from 'playwright';
import { snapshot } from 'web-clone';
import { PlaywrightFetcherAdapter } from 'web-clone/adapters';

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext();

  try {
    // 用户的认证逻辑 - 完全在这个文件中
    const authPage = await context.newPage();
    await authPage.goto('https://example.com/login');
    await authPage.fill('input[name="email"]', process.env.AUTH_EMAIL!);
    await authPage.fill('input[name="password"]', process.env.AUTH_PASSWORD!);
    await authPage.click('button[type="submit"]');
    await authPage.waitForNavigation();
    await authPage.close();

    // 现在使用已认证的 context 快照
    const page = await context.newPage();
    const adapter = new PlaywrightFetcherAdapter(page, context);

    const result = await snapshot({
      url: 'https://example.com/dashboard',
      output: './snapshot-authenticated',
      mode: 'bundle'
    }, adapter);

    console.log('Snapshot complete:', result.stats);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch(console.error);
```

```typescript
// docs/examples/puppeteer/01-basic-snapshot.ts
// (展示支持多个自动化框架)

import puppeteer from 'puppeteer';
import { snapshot } from 'web-clone';

// 用户实现的 Puppeteer 适配器
class PuppeteerFetcherAdapter implements FetcherAdapter {
  constructor(
    private page: puppeteer.Page,
    private browser: puppeteer.Browser
  ) {}

  async fetch(url: string, options: FetchOptions): Promise<FetchResult> {
    // Puppeteer 特定的实现
    // ...
  }

  async dispose(): Promise<void> {
    await this.page.close();
  }
}

async function main() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  try {
    const adapter = new PuppeteerFetcherAdapter(page, browser);
    const result = await snapshot({
      url: 'https://example.com',
      output: './snapshot',
      mode: 'bundle'
    }, adapter);

    console.log('Snapshot complete:', result.stats);
  } finally {
    await adapter.dispose();
    await browser.close();
  }
}

main().catch(console.error);
```

## 第六步：更新导出和 API 签名

**简化 src/index.ts：**

```typescript
// ✅ 简化后的导出
export { snapshot, convertLocalSnapshot } from './assembler.js';

export type {
  SnapshotOptions,
  SnapshotResult,
  // ... 其他类型
} from './types.js';

// Adapter 相关
export { HttpFetcherAdapter, PlaywrightFetcherAdapter } from './adapters/index.js';
export type {
  FetcherAdapter,
  FetchOptions,
  FetchResult,
  AuthContext
} from './adapters/fetcher-adapter.js';

export type { PlaywrightAdapterOptions } from './adapters/automation/playwright/options.js';

// ❌ 删除这些导出
// - snapshotWithPlaywright
// - snapshotWithBrowserContext
// - PlaywrightSnapshotOptions
// - 所有来自 src/core/playwright 的导出
```

**简化 src/adapters/index.ts：**

```typescript
export { HttpFetcherAdapter } from './http-fetcher-adapter.js';
export { PlaywrightFetcherAdapter } from './automation/playwright/adapter.js';
export type { FetcherAdapter, FetchOptions, FetchResult, AuthContext } from './fetcher-adapter.js';
export type { PlaywrightAdapterOptions } from './automation/playwright/options.js';

// ❌ 删除通用的 AutomationAdapterOptions - 它在库中无处使用
// 如果用户想定义通用接口，可以在自己的代码中做
```

## 第七步：更新 TypeScript 编译

**确保 Playwright 类型是可选的：**

```typescript
// 在需要使用 Playwright 类型的地方（如适配器）：
import type { Page, BrowserContext } from 'playwright';

// 如果 Playwright 未安装，会给出清晰的错误信息
// 这是正确的 - 只有使用适配器时才需要安装 Playwright
```

---

## 完整的迁移清单

### 删除

- [ ] `src/core/` 整个目录
- [ ] `src/playwright.ts` 
- [ ] Package.json 中的 `"playwright": "^1.58.2"` (dependencies)
- [ ] CLI 中的 `--use-playwright`, `--headless`, `--proxy`, `--auth-script`, `--auth-timeout`, `--save-state`, `--load-state`, `--user-agent`, `--viewport` 选项
- [ ] `performPlaywrightSnapshot()` 函数
- [ ] `shouldUsePlaywright()` 和 `parseViewport()` 函数（移到 config/cli-helper.ts）
- [ ] `PlaywrightFetcherAdapter` 中的 `saveState()`, `loadState()`, `getStateSummary()`
- [ ] 所有关于浏览器/context 生命周期的文档和注释

### 修改

- [ ] Package.json：添加 `peerDependencies` 和 `peerDependenciesMeta`
- [ ] `PlaywrightAdapterOptions` 接口：简化，只保留 fetch 时的行为选项
- [ ] `PlaywrightFetcherAdapter` 的注释和文档：不提及浏览器生命周期管理
- [ ] `src/adapters/index.ts`：简化导出
- [ ] `src/index.ts`：删除便利函数导出
- [ ] CLI：只支持 HTTP 快照
- [ ] 集成指南文档：改为示例而不是教人如何使用便利函数

### 保留

- [ ] `FetcherAdapter` 接口（通用）
- [ ] `HttpFetcherAdapter` 实现
- [ ] `PlaywrightFetcherAdapter` 实现（但简化）
- [ ] `snapshot()` 核心函数
- [ ] 核心的网页拉取和转换逻辑

### 添加

- [ ] `docs/examples/playwright/` 目录和示例
- [ ] `docs/examples/puppeteer/` 目录和示例（可选但推荐）
- [ ] 清晰的集成指南（说明如何在用户代码中使用）
- [ ] 版本升级指南（解释为什么做这个改变）

---

## 测试策略

**添加单元测试验证简化的适配器：**

```typescript
// src/adapters/automation/playwright/__tests__/adapter.test.ts

describe('PlaywrightFetcherAdapter', () => {
  it('should implement FetcherAdapter interface', async () => {
    // 验证 adapter 实现了所有必要的方法
    const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
    
    expect(typeof adapter.fetch).toBe('function');
    expect(typeof adapter.canAccess).toBe('function');
    expect(typeof adapter.getAuthContext).toBe('function');
    expect(typeof adapter.dispose).toBe('function');
  });

  it('should fetch main document with page.goto()', async () => {
    // ... 测试
  });

  it('should fetch sub-resources with context.request.fetch()', async () => {
    // ... 测试
  });

  it('should not expose browser lifecycle methods', () => {
    const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
    
    // ✅ 这些方法不应该存在
    expect(adapter.saveState).toBeUndefined();
    expect(adapter.loadState).toBeUndefined();
    expect(adapter.getStateSummary).toBeUndefined();
  });
});
```

**删除集成测试中关于 snapshotWithPlaywright 的测试**

---

## 向后兼容性

**由于这是一个 v1.x 的主要设计改变，可以：**

1. 在 CHANGELOG 中明确说明这是"破坏性改变"
2. 创建一个 v0.x 分支用于维护旧版本（可选）
3. 发布为 v2.0.0（主版本号增加）
4. 提供清晰的迁移指南

**旧代码的迁移路径：**

```typescript
// ❌ 旧代码（v1.x）
import { snapshotWithPlaywright } from 'web-clone';
const result = await snapshotWithPlaywright(url, options, { setupAuth });

// ✅ 新代码（v2.0+）
import { snapshot } from 'web-clone';
import { PlaywrightFetcherAdapter } from 'web-clone/adapters';

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

// 用户的认证逻辑
await setupAuth(page, context);

const adapter = new PlaywrightFetcherAdapter(page, context);
const result = await snapshot(options, adapter);
```

---

## 总结

这个重构的核心目标：

> **web-clone 从一个"Playwright 包装库"变回一个"通用网页拉取库"**
>
> - 支持任何自动化框架（Playwright、Puppeteer、Nightmare 等）
> - 每个框架只需实现 `FetcherAdapter` 接口
> - 没有框架绑定，没有生命周期管理，没有认证逻辑
> - 用户完全控制他们的自动化代码

这样做的好处：

✅ 代码更精简（删除 40% 的代码）
✅ 维护更容易（无需为每个框架复制逻辑）
✅ 版本冲突消除（用户控制依赖版本）
✅ 扩展性更好（添加新框架时无需修改库）
✅ 使用体验更清晰（职责分明）
