# web-clone 库集成设计方案

## 概述

本文档提出将 `web-clone` 从 CLI 工具演变为 NPM 库，以便在 Playwright 自动化工作流中使用，特别是用于处理需要登录、Cookie 和验证的网页快照。

**目标**：
- 支持 Playwright 浏览器上下文集成
- 支持 Cookie、认证令牌、Session 管理
- 保留现有 CLI 功能
- 提供一致的、易于使用的公开 API
- 支持流式和内存高效的快照生成

---

## 第一部分：当前架构分析

### 现状

```
src/
├── cli.ts                    # ← 入口点，命令行解析和调用
├── assembler.ts             # 核心管道：fetch → parse → download → assemble
├── fetcher.ts               # HTTP 获取（使用 node-fetch，不支持浏览器上下文）
├── parser/
│   ├── html-parser.ts       # DOM 解析和资源引用提取
│   ├── css-parser.ts        # CSS 资源提取
│   └── url-resolver.ts      # URL 解析
├── output/
│   ├── bundle.ts            # 目录输出格式
│   ├── single-file.ts       # 单文件输出格式
│   └── convert.ts           # 本地转换
├── transform/               # 组件分析（与 Playwright 无关）
└── types.ts                 # 类型定义
```

### 关键限制

1. **紧耦合 CLI**：`cli.ts` 直接调用 `snapshot()` 和 `convertLocalSnapshot()`
2. **固定 HTTP 层**：`fetcher.ts` 使用 `node-fetch`，无法使用 Playwright 浏览器/页面
3. **无认证支持**：不支持 Cookie、授权头、Session 等
4. **同步资源访问**：假设对所有资源有直接 HTTP 访问权限

---

## 第二部分：库架构设计

### 2.1 核心概念：分层架构

```
┌─────────────────────────────────────────┐
│      应用层 (Application Layer)          │
│  ├─ CLI (src/cli.ts)                   │
│  └─ Playwright 工作流 (用户代码)        │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│      适配器层 (Adapter Layer) [NEW]     │
│  ├─ CliAdapter                         │
│  ├─ PlaywrightAdapter                  │
│  └─ CustomAdapter 接口                 │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│      核心引擎层 (Core Engine Layer)      │
│  ├─ Snapshot Pipeline                  │
│  ├─ Asset Manager                      │
│  ├─ HTML/CSS/JS Parser                │
│  └─ Output Formatter                   │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│      资源获取层 (Fetch Layer) [REFACTOR]│
│  ├─ HttpFetcher (node-fetch)           │
│  ├─ BrowserFetcher (Playwright)        │
│  └─ CachedFetcher (可选)                │
└─────────────────────────────────────────┘
```

### 2.2 新增模块

#### A. 适配器接口 (`src/adapters/fetcher-adapter.ts`)

```typescript
// 定义统一的资源获取接口
export interface FetcherAdapter {
  // 获取 HTML 或其他资源
  fetch(
    url: string,
    options: FetchOptions
  ): Promise<FetchResult>;

  // 检查资源是否可访问（某些需要授权的资源）
  canAccess?(url: string): Promise<boolean>;

  // 获取当前的 Cookie/认证头
  getAuthContext?(): Promise<AuthContext>;

  // 清理资源（关闭浏览器等）
  dispose?(): Promise<void>;
}

export interface FetchOptions {
  timeout?: number;
  referer?: string;
  headers?: Record<string, string>;
  maxSize?: number;
  validateSSL?: boolean;
  followRedirects?: boolean;
}

export interface FetchResult {
  buffer: Buffer;
  mime: string;
  status: number;
  ok: boolean;
  isHtmlLike: boolean;
  headers?: Record<string, string>;
}

export interface AuthContext {
  cookies?: Array<{ name: string; value: string }>;
  headers?: Record<string, string>;
  token?: string;
}
```

#### B. HTTP 适配器 (`src/adapters/http-fetcher-adapter.ts`)

```typescript
// 现有 fetcher.ts 的包装，兼容 FetcherAdapter
export class HttpFetcherAdapter implements FetcherAdapter {
  async fetch(url: string, options: FetchOptions): Promise<FetchResult> {
    // 使用现有的 fetchWithTimeout 逻辑
  }

  async getAuthContext(): Promise<AuthContext> {
    return { cookies: [], headers: {} };
  }
}
```

#### C. Playwright 适配器 (`src/adapters/playwright-fetcher-adapter.ts`)

```typescript
// 使用 Playwright 浏览器上下文进行资源获取
export class PlaywrightFetcherAdapter implements FetcherAdapter {
  constructor(
    private page: Page,
    private context: BrowserContext,
    private options: PlaywrightAdapterOptions = {}
  ) {}

  async fetch(url: string, options: FetchOptions): Promise<FetchResult> {
    // 使用 page.goto() 或 context.request.fetch()
    // 支持当前页面的 Cookie、Session、JS 执行
  }

  async canAccess(url: string): Promise<boolean> {
    // 检查资源是否可访问
  }

  async getAuthContext(): Promise<AuthContext> {
    // 获取当前页面的 Cookie、LocalStorage、SessionStorage
    return {
      cookies: await this.context.cookies(),
      headers: this.options.customHeaders || {},
    };
  }

  async dispose(): Promise<void> {
    // 无需关闭浏览器（由调用者管理）
  }
}

interface PlaywrightAdapterOptions {
  waitForNavigation?: boolean;  // 等待页面加载完成
  executeJs?: boolean;          // 执行页面 JS（获取动态加载的内容）
  screenshotPath?: string;      // 可选：保存截图用于调试
  customHeaders?: Record<string, string>;
  waitForLoadState?: 'load' | 'domcontentloaded' | 'networkidle';
}
```

#### D. 核心管道重构 (`src/assembler.ts` 改进)

```typescript
// 修改 snapshot() 签名以支持自定义 fetcher
export async function snapshot(
  options: SnapshotOptions,
  fetcherAdapter?: FetcherAdapter
): Promise<SnapshotResult> {
  // 如果没有提供 adapter，使用 HttpFetcherAdapter（向后兼容）
  const fetcher = fetcherAdapter || new HttpFetcherAdapter();

  // 核心管道：
  // 1. 使用 fetcher.fetch() 而不是直接调用 fetchWithTimeout()
  const html = await fetchHtml(options.url, options.timeout, fetcher);

  // 2. 解析 HTML（逻辑不变）
  const refs = parseHtml(html, options.url);

  // 3. 递归提取 CSS（逻辑不变，但调用 fetcher.fetch()）
  const cssRefs = await extractCssAssets(refs, fetcher, options);

  // 4. 去重和下载（使用 fetcher）
  const assets = await downloadAllAssets(
    dedupe([...refs, ...cssRefs]),
    fetcher,
    options
  );

  // 5. 输出（逻辑不变）
  return assembleOutput(html, assets, options);
}
```

---

## 第三部分：Playwright 工作流集成

### 3.1 使用流程

```typescript
// 示例 1：基本的 Playwright 集成
import { chromium } from 'playwright';
import { snapshot } from 'web-clone';
import { PlaywrightFetcherAdapter } from 'web-clone/adapters';

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

// 登录
await page.goto('https://example.com/login');
await page.fill('[name="username"]', 'user@example.com');
await page.fill('[name="password"]', 'password');
await page.click('button[type="submit"]');
await page.waitForNavigation();

// 导航到目标页面
await page.goto('https://example.com/dashboard');

// 创建 Playwright 适配器（使用当前的浏览器上下文和 Cookie）
const adapter = new PlaywrightFetcherAdapter(page, context, {
  executeJs: true,
  waitForLoadState: 'networkidle',
});

// 快照（将使用浏览器的 Cookie、Session、认证状态）
const result = await snapshot({
  url: 'https://example.com/dashboard',
  output: './snapshots/dashboard',
  mode: 'bundle',
  extractComponents: true,
  frameworkHint: 'react',
}, adapter);

console.log(`Snapshot saved with ${result.stats.fetched} assets`);

await browser.close();
```

### 3.2 高级场景

#### A. Cookie 和认证令牌

```typescript
// 场景：API 需要 Bearer 令牌
const token = await page.evaluate(() => {
  return localStorage.getItem('auth_token');
});

const adapter = new PlaywrightFetcherAdapter(page, context, {
  customHeaders: {
    'Authorization': `Bearer ${token}`,
    'X-Custom-Header': 'value',
  },
});

const result = await snapshot(options, adapter);
```

#### B. 动态渲染内容

```typescript
// 场景：页面使用 JavaScript 动态加载内容
const adapter = new PlaywrightFetcherAdapter(page, context, {
  executeJs: true,  // 执行 JS 以获取动态内容
  waitForLoadState: 'networkidle',  // 等待网络空闲
});

// Playwright 适配器会：
// 1. 使用 page.goto() 加载页面并等待 JS 执行
// 2. 对子资源使用 context.request.fetch() 继承 Cookie
// 3. 获取最终渲染后的 HTML
```

#### C. 多页面快照

```typescript
// 场景：快照多个需要认证的页面
const urls = ['/dashboard', '/settings', '/profile'];
const results = [];

for (const url of urls) {
  await page.goto(`https://example.com${url}`);
  await page.waitForLoadState('networkidle');

  const adapter = new PlaywrightFetcherAdapter(page, context);
  const result = await snapshot({
    url: `https://example.com${url}`,
    output: `./snapshots${url}`,
    mode: 'bundle',
  }, adapter);

  results.push(result);
}
```

#### D. 代理和自定义请求

```typescript
// 场景：通过代理访问受限资源
const context = await browser.newContext({
  proxy: { server: 'http://proxy.example.com:8080' },
  httpCredentials: { username: 'user', password: 'pass' },
});

const adapter = new PlaywrightFetcherAdapter(page, context);
const result = await snapshot(options, adapter);
```

---

## 第四部分：公开 API 设计

### 4.1 导出结构

```typescript
// src/index.ts [NEW - 库入口]

// 核心函数（保持现有签名的向后兼容）
export { snapshot, convertLocalSnapshot } from './assembler.js';

// 类型
export type {
  SnapshotOptions,
  SnapshotResult,
  SnapshotMode,
  Asset,
  AssetRef,
  ComponentSpec,
} from './types.js';

// 适配器接口和实现
export {
  type FetcherAdapter,
  type FetchOptions,
  type FetchResult,
  type AuthContext,
} from './adapters/fetcher-adapter.js';

export { HttpFetcherAdapter } from './adapters/http-fetcher-adapter.js';
export { PlaywrightFetcherAdapter } from './adapters/playwright-fetcher-adapter.js';

// 工具函数
export { parseHtml } from './parser/html-parser.js';
export { extractCssAssets } from './parser/css-parser.js';
export { validateUrlScheme } from './validators.js';
```

### 4.2 package.json 更新

```json
{
  "name": "web-clone",
  "version": "2.0.0",
  "description": "Web page snapshot tool - CLI and library for Playwright automation",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "snapshot": "dist/cli.js"
  },
  "exports": {
    ".": "./dist/index.js",
    "./adapters": "./dist/adapters/index.js",
    "./cli": "./dist/cli.js",
    "./types": "./dist/types.js"
  },
  "dependencies": {
    "chalk": "^5.3.0",
    "commander": "^11.1.0",
    "css-tree": "^2.3.1",
    "linkedom": "^0.16.8",
    "node-fetch-native": "^1.6.2",
    "ora": "^8.0.1",
    "postcss": "^8.4.35"
  },
  "peerDependencies": {
    "playwright": "^1.40.0"
  },
  "peerDependenciesOptional": {
    "playwright": "^1.40.0"
  },
  "devDependencies": {
    "@types/playwright": "^1.40.0",
    "@types/node": "^20.11.0",
    "playwright": "^1.40.0",
    "typescript": "^5.3.3",
    "tsx": "^4.7.0",
    "vitest": "^1.0.0"
  }
}
```

---

## 第五部分：实现步骤

### 步骤 1：创建适配器接口和 HTTP 实现（阶段 1）

```
src/adapters/
├── index.ts                      # 导出所有适配器
├── fetcher-adapter.ts            # 接口定义
└── http-fetcher-adapter.ts       # HTTP 实现（wrapping 现有 fetcher.ts）
```

**工作量**：
- 定义 `FetcherAdapter` 接口
- 提取现有 `fetchWithTimeout()` 到 `HttpFetcherAdapter`
- 更新 `assembler.ts` 以接受 `FetcherAdapter` 参数
- 确保向后兼容性

**验证**：CLI 和现有测试仍然通过

### 步骤 2：实现 Playwright 适配器（阶段 2）

```
src/adapters/
├── playwright-fetcher-adapter.ts  # Playwright 实现
└── __tests__/
    └── playwright-fetcher-adapter.test.ts
```

**关键实现点**：
- 使用 `page` 进行主文档获取（支持 JS 执行）
- 使用 `context.request` 进行子资源获取（继承 Cookie）
- 处理 Playwright 页面导航和加载状态
- 错误处理和超时管理

**验证**：
- 单元测试：模拟 Playwright 对象
- 集成测试：实际浏览器测试（可选：使用 CI 中的 Playwright 实例）

### 步骤 3：创建库入口和导出（阶段 3）

```
src/index.ts  # 库入口
```

**工作量**：
- 定义公开 API
- 确保 TypeScript 类型导出
- 添加 JSDoc 文档

### 步骤 4：完整文档和示例（阶段 4）

```
docs/
├── LIBRARY_API.md                # 库使用文档
├── PLAYWRIGHT_INTEGRATION.md     # Playwright 集成指南
└── examples/
    ├── basic-playwright.ts       # 基本登录 + 快照
    ├── multi-page-snapshot.ts    # 多页快照
    ├── advanced-auth.ts          # 高级认证场景
    └── stream-processing.ts      # 流式处理（可选）
```

---

## 第六部分：设计决策和权衡

### D1：Playwright 作为可选依赖

**决策**：Playwright 在 `peerDependencies` 中是可选的

**原因**：
- web-clone 的核心不依赖 Playwright
- CLI 用户不需要安装 Playwright
- 库用户可以选择性安装

**实现**：
```typescript
// src/adapters/playwright-fetcher-adapter.ts
let PlaywrightTypes: typeof import('playwright') | null = null;

try {
  PlaywrightTypes = await import('playwright');
} catch {
  throw new Error(
    'Playwright adapter requires "playwright" to be installed. ' +
    'Run: npm install playwright'
  );
}
```

### D2：适配器模式而非修改现有代码

**决策**：通过适配器抽象资源获取层，而非修改 `fetcher.ts`

**原因**：
- 保持向后兼容性
- 遵循开闭原则（对扩展开放，对修改关闭）
- 易于测试和维护
- 支持未来的其他适配器（例如缓存、代理等）

### D3：主 HTML 和子资源的不同处理

**决策**：
- 主文档（初始 URL）：使用 `page.goto()` 以支持 JS 执行
- 子资源（CSS、JS、图片）：使用 `context.request.fetch()` 以继承 Cookie

**原因**：
- 主文档需要 JS 执行以获取动态内容
- 子资源只需 HTTP 请求（继承认证上下文）
- 性能优化：避免为每个资源打开新页面

### D4：Cookie 和认证管理

**决策**：将认证管理职责留给用户

**原因**：
- 认证机制多种多样（OAuth、SAML、JWT、Session 等）
- web-clone 关注资源获取，不关注认证逻辑
- 用户可以在调用 `snapshot()` 前管理认证状态

**支持**：
- 提供 `getAuthContext()` 方法查询当前认证状态
- 支持自定义请求头和 Cookie

---

## 第七部分：使用示例

### 示例 1：GitHub 私有仓库页面

```typescript
import { chromium } from 'playwright';
import { snapshot } from 'web-clone';
import { PlaywrightFetcherAdapter } from 'web-clone/adapters';

async function snapshotPrivateGitHubRepo() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // 登录 GitHub
  await page.goto('https://github.com/login');
  await page.fill('[name="login"]', process.env.GITHUB_USER!);
  await page.fill('[name="password"]', process.env.GITHUB_PASSWORD!);
  await page.click('[type="submit"]');
  await page.waitForNavigation();

  // 导航到私有仓库
  const repoUrl = 'https://github.com/org/private-repo';
  await page.goto(repoUrl);
  await page.waitForLoadState('networkidle');

  // 使用认证的浏览器上下文快照
  const adapter = new PlaywrightFetcherAdapter(page, context);
  const result = await snapshot({
    url: repoUrl,
    output: './github-backup',
    mode: 'bundle',
    extractComponents: true,
  }, adapter);

  console.log(`Backed up ${result.stats.fetched} assets`);
  await browser.close();
}
```

### 示例 2：SPA 应用中的多页快照

```typescript
import { chromium } from 'playwright';
import { snapshot } from 'web-clone';
import { PlaywrightFetcherAdapter } from 'web-clone/adapters';

async function snapshotSPA() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const baseUrl = 'https://app.example.com';

  // 一次登录，多个页面快照
  await page.goto(`${baseUrl}/login`);
  await page.fill('[name="email"]', 'user@example.com');
  await page.fill('[name="password"]', 'password');
  await page.click('button[type="submit"]');
  await page.waitForNavigation();

  const routes = [
    '/dashboard',
    '/users',
    '/settings',
    '/reports',
  ];

  for (const route of routes) {
    await page.goto(`${baseUrl}${route}`);
    await page.waitForLoadState('domcontentloaded');

    const adapter = new PlaywrightFetcherAdapter(page, context, {
      executeJs: true,
      waitForLoadState: 'networkidle',
    });

    const result = await snapshot({
      url: `${baseUrl}${route}`,
      output: `./spa-backup${route}`,
      mode: 'single',
      extractComponents: true,
      frameworkHint: 'react',
    }, adapter);

    console.log(`✓ Snapshotted ${route}`);
  }

  await browser.close();
}
```

### 示例 3：API 令牌认证

```typescript
import { chromium } from 'playwright';
import { snapshot } from 'web-clone';
import { PlaywrightFetcherAdapter } from 'web-clone/adapters';

async function snapshotWithApiToken() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // 获取 API 令牌（可能通过 OAuth 或其他机制）
  await page.goto('https://api.example.com/oauth/authorize');
  // ... 认证流程 ...
  const token = await page.evaluate(() => {
    return localStorage.getItem('api_token');
  });

  // 创建带自定义头的适配器
  const adapter = new PlaywrightFetcherAdapter(page, context, {
    customHeaders: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });

  const result = await snapshot({
    url: 'https://api.example.com/dashboard',
    output: './api-dashboard',
    mode: 'bundle',
  }, adapter);

  await browser.close();
}
```

---

## 第八部分：测试策略

### 单元测试

```typescript
// src/adapters/__tests__/http-fetcher-adapter.test.ts
describe('HttpFetcherAdapter', () => {
  it('should fetch resources with timeout', async () => {
    const adapter = new HttpFetcherAdapter();
    const result = await adapter.fetch('https://example.com', {
      timeout: 5000,
    });
    expect(result.status).toBe(200);
  });

  it('should return empty auth context', async () => {
    const adapter = new HttpFetcherAdapter();
    const auth = await adapter.getAuthContext();
    expect(auth.cookies).toEqual([]);
  });
});
```

```typescript
// src/adapters/__tests__/playwright-fetcher-adapter.test.ts
describe('PlaywrightFetcherAdapter', () => {
  it('should fetch with page context', async () => {
    const mockPage = { /* ... */ };
    const mockContext = { /* ... */ };

    const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
    // 模拟 page.goto() 和 context.cookies()
    const result = await adapter.fetch('https://example.com', {});

    expect(result.status).toBe(200);
  });

  it('should merge custom headers with request', async () => {
    // ...
  });
});
```

### 集成测试（可选）

```typescript
// src/__tests__/snapshot-with-adapter.test.ts
describe('snapshot() with adapters', () => {
  it('should work with HttpFetcherAdapter', async () => {
    const adapter = new HttpFetcherAdapter();
    const result = await snapshot({
      url: 'https://example.com',
      output: './test-snapshot',
      mode: 'bundle',
    }, adapter);

    expect(result.stats.fetched).toBeGreaterThan(0);
  });

  // Playwright 集成测试可选（需要实际浏览器）
});
```

### 端到端测试

```typescript
// examples/__tests__/e2e-playwright.test.ts
describe('Playwright integration E2E', () => {
  let browser: Browser;
  let context: BrowserContext;

  beforeEach(async () => {
    browser = await chromium.launch();
    context = await browser.newContext();
  });

  afterEach(async () => {
    await browser.close();
  });

  it('should snapshot authenticated page', async () => {
    const page = await context.newPage();
    // ... 登录逻辑 ...
    const adapter = new PlaywrightFetcherAdapter(page, context);
    const result = await snapshot(options, adapter);
    expect(result.stats.fetched).toBeGreaterThan(0);
  });
});
```

---

## 第九部分：迁移和向后兼容性

### CLI 兼容性

现有 CLI 完全保持不变：

```bash
# 这些命令继续工作
npm run snapshot -- https://example.com -o ./output -m bundle
npm run snapshot -- https://example.com -m single --extract-components
```

**实现**：`cli.ts` 调用 `snapshot(options)` 时不传 `FetcherAdapter`，默认使用 `HttpFetcherAdapter`

### 库用户向后兼容性

```typescript
// 旧版本签名继续工作
const result = await snapshot(options);

// 新版本：可选传递适配器
const adapter = new PlaywrightFetcherAdapter(page, context);
const result = await snapshot(options, adapter);
```

---

## 第十部分：性能和优化考虑

### P1：连接复用

Playwright 的 `context.request` API 自动复用浏览器的连接池和 Cookie，比为每个资源创建新的 HTTP 连接更高效。

### P2：并发控制

Playwright 适配器应尊重现有的并发限制：

```typescript
// 使用现有的 runPool 机制
const assets = await downloadAllAssets(
  refs,
  fetcher,  // 现在可以是 PlaywrightFetcherAdapter
  {
    concurrency: options.concurrency,  // 限制并发请求
  }
);
```

### P3：缓存策略（可选）

```typescript
// 未来可实现的缓存适配器
export class CachedFetcherAdapter implements FetcherAdapter {
  constructor(
    private innerAdapter: FetcherAdapter,
    private cache: Map<string, FetchResult> = new Map()
  ) {}

  async fetch(url: string, options: FetchOptions): Promise<FetchResult> {
    if (this.cache.has(url)) {
      return this.cache.get(url)!;
    }
    const result = await this.innerAdapter.fetch(url, options);
    this.cache.set(url, result);
    return result;
  }
}
```

---

## 第十一部分：部署和发布

### 版本策略

- **v1.x.x** → CLI 工具专用
- **v2.0.0** → 库 + CLI（主要版本更新）
- **v2.x.x** → 库功能增强

### 发布清单

- [ ] 创建适配器模块
- [ ] 更新 `assembler.ts` 以支持适配器
- [ ] 创建 `src/index.ts` 库入口
- [ ] 更新 `package.json`（导出、peerDependencies）
- [ ] 编写文档（LIBRARY_API.md、PLAYWRIGHT_INTEGRATION.md）
- [ ] 创建示例（examples/）
- [ ] 添加测试
- [ ] 更新 README.md
- [ ] 发布到 NPM

---

## 第十二部分：常见问题和故障排除

### Q1：Playwright 不是必需的吗？

**A**：正确。Playwright 是可选的 peerDependency。如果只使用 CLI，无需安装 Playwright。如果要在库模式下使用 Playwright 适配器，需要显式安装。

### Q2：如何处理需要特定 User-Agent 的网站？

**A**：使用 Playwright 适配器时，可以在创建 `BrowserContext` 时指定：
```typescript
const context = await browser.newContext({
  userAgent: 'Custom User-Agent String'
});
```

### Q3：是否支持无头模式和有头模式？

**A**：是的，完全由 Playwright 配置控制：
```typescript
const browser = await chromium.launch({
  headless: false  // 有头模式，可视化调试
});
```

### Q4：如何处理动态加载的无限滚动？

**A**：使用 Playwright 的滚动和等待能力，然后快照：
```typescript
await page.goto(url);
await page.evaluate(() => {
  // 向下滚动以加载更多内容
  window.scrollTo(0, document.body.scrollHeight);
});
await page.waitForLoadState('networkidle');

const adapter = new PlaywrightFetcherAdapter(page, context);
const result = await snapshot(options, adapter);
```

---

## 第十三部分：时间线和成本估计

| 阶段 | 任务 | 工作量 | 优先级 |
|------|------|--------|--------|
| 1 | 创建适配器接口、HTTP 实现 | 4-6 小时 | P0 |
| 2 | Playwright 适配器实现 | 6-8 小时 | P0 |
| 3 | 库入口、导出、类型定义 | 2-3 小时 | P0 |
| 4 | 单元和集成测试 | 4-6 小时 | P1 |
| 5 | 文档和示例 | 3-4 小时 | P1 |
| 6 | E2E 测试和验证 | 2-3 小时 | P2 |
| | **总计** | **21-30 小时** | |

---

## 总结

这个设计方案通过：
- **适配器模式** 分离资源获取层，支持多种 HTTP 后端
- **可选依赖** 保持 CLI 工具的轻量级
- **向后兼容** 不破坏现有 CLI 用户
- **清晰的 API** 使库易于集成到 Playwright 工作流中

使得 web-clone 可以无缝地从 CLI 工具演变为一个灵活的、可在自动化工作流中使用的库，特别适合处理需要登录、Cookie 和认证的网页快照场景。
