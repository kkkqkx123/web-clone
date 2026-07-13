# Library Architecture Design - web-clone 库化方案

**Status:** Design Phase  
**Date:** 2026-07-13  
**Context:** 将 web-clone 从单一 CLI 工具重构为可复用的库，支持多种资源获取适配器  

---

## 核心设计原则

### 1. 关切点分离（Separation of Concerns）

```
┌──────────────────────────────────────────┐
│         web-clone 库 (核心)               │
│  ┌────────────────────────────────────┐  │
│  │ snapshot(url, options, adapter)    │  │
│  │                                    │  │
│  │ • 专注网页快照逻辑                 │  │
│  │ • 不关心资源获取方式               │  │
│  │ • 不包含浏览器自动化               │  │
│  │ • 不包含 UI 特定优化               │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
              ↑                       ↑
              │ 库 API               │ CLI API
              │ (通用)               │ (HTTP only)
              │                      │
    ┌─────────┴─────────┐      ┌────┴──────────┐
    │  用户项目         │      │  web-clone    │
    │  (自己的 PW)      │      │  (CLI)        │
    │                   │      │               │
    │ import from       │      │ npm run dev   │
    │ 'web-clone'       │      │               │
    │                   │      │ 仅 HTTP       │
    └───────────────────┘      └───────────────┘
```

### 2. 依赖最小化

**原则：** 库项目不应该管理用户的 Playwright 版本

**当前问题：**
```json
{
  "peerDependencies": {
    "playwright": ">=1.40.0"  // ❌ 会导致安装混乱
  },
  "devDependencies": {
    "playwright": "^1.58.2"   // ✓ 用于开发
  }
}
```

**为什么这样有问题：**
- npm 会在用户项目中提示安装 playwright
- 但用户项目（如果是 Playwright 项目）会自己安装 playwright
- 导致版本冲突或重复安装
- 库和应用的 Playwright 版本不应该耦合

**正确做法：**
- Playwright **仅作为 devDependencies**（开发本项目）
- 用户项目完全独立管理 playwright
- 库通过动态导入 + 错误提示处理

### 3. 适配器模式

```typescript
// 库不依赖任何具体实现，只定义接口
interface FetcherAdapter {
  fetch(url, options): Promise<FetchResult>;
  canAccess?(url): Promise<boolean>;
  getAuthContext?(): Promise<AuthContext>;
  dispose?(): Promise<void>;
}

// 用户提供实现
- HttpFetcherAdapter（库提供）
- PlaywrightFetcherAdapter（库提供示例，用户可选用）
- 自定义 CachingAdapter
- 自定义 HybridAdapter
- 等等
```

---

## 实现方案

### Phase 1: 完善库 API 导出

#### 1.1 创建库主入口（src/index.ts）

**目的：** 所有公共 API 通过这个文件导出

```typescript
// src/index.ts
export type {
  SnapshotOptions,
  SnapshotResult,
  Asset,
  AssetRef,
  AssetType,
} from './types.js';

export { snapshot, convertLocalSnapshot } from './assembler.js';

export type {
  FetcherAdapter,
  FetchOptions,
  FetchResult,
  AuthContext,
} from './adapters/fetcher-adapter.js';

export { HttpFetcherAdapter } from './adapters/http-fetcher-adapter.js';
```

**导出结构：**
```
npm 安装后
import { snapshot } from 'web-clone'
import type { SnapshotOptions } from 'web-clone'
import { HttpFetcherAdapter } from 'web-clone'

或细分导出
import { snapshot } from 'web-clone'
import type { FetcherAdapter } from 'web-clone/adapters'
```

#### 1.2 创建适配器导出（src/adapters/index.ts）

```typescript
// src/adapters/index.ts
export { HttpFetcherAdapter } from './http-fetcher-adapter.js';

export type {
  FetcherAdapter,
  FetchOptions,
  FetchResult,
  AuthContext,
} from './fetcher-adapter.js';

// 提供动态导入辅助，避免强制依赖 Playwright
export async function loadPlaywrightAdapter() {
  try {
    const module = await import('./automation/playwright/adapter.js');
    return module.PlaywrightFetcherAdapter;
  } catch (err) {
    throw new Error(
      'PlaywrightFetcherAdapter requires "playwright" package. ' +
      'Install it in your project with: npm install playwright'
    );
  }
}
```

#### 1.3 更新 package.json 导出配置

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./adapters": "./dist/adapters/index.js",
    "./types": "./dist/types.js",
    "./cli": "./dist/cli.js"
  },
  "dependencies": {
    "@babel/parser": "...",
    "chalk": "...",
    "commander": "...",
    // ... 不包含 playwright
  },
  "peerDependencies": {
    // ❌ 移除 playwright
  },
  "devDependencies": {
    "playwright": "^1.58.2"  // ✓ 仅用于开发和测试
  }
}
```

---

### Phase 2: 分离库逻辑与 CLI 优化

#### 问题分析

当前 `assembler.ts` 中的 `injectVueHydrationScript()` 是一个 **CLI 优化**，不应该在库中：

```typescript
// ❌ 不好的做法
function injectVueHydrationScript(document: Document) {
  // Vue 特定的初始化脚本
}

export async function snapshot(...) {
  // ...
  injectVueHydrationScript(doc);  // ← 库在做 UI 优化
}
```

**问题：**
- 库不应该硬编码任何框架特定的行为
- 库应该是框架无关的
- 用户可能不用 Vue，或用自己的方式初始化

#### 解决方案

**1. 将脚本注入移到 CLI 层**

```typescript
// src/cli.ts - CLI 自己决定优化策略
if (!opts.playwright) {
  // HTTP 模式下，注入 hydration 脚本帮助本地测试
  injectVueHydrationScript(document);
} else {
  // Playwright 模式下，不需要注入（已经真正执行了）
}
```

**2. 库保持纯净**

```typescript
// src/assembler.ts - 库只做核心工作
export async function snapshot(
  urlOrOptions: string | SnapshotOptions,
  optionsOrAdapter?: Omit<SnapshotOptions, 'url'> | FetcherAdapter
): Promise<SnapshotResult> {
  // ... 核心快照逻辑
  // ✓ 只关心下载、验证、汇总
  // ✗ 不注入任何脚本
}
```

---

### Phase 3: 提供使用示例

#### 3.1 示例项目结构（users 自己创建）

```
my-snapshot-project/
├── package.json
├── src/
│   ├── index.ts                    # 主程序
│   ├── authenticated-snapshot.ts   # 需要认证的快照
│   ├── spa-snapshot.ts             # SPA 应用快照
│   ├── batch-snapshot.ts           # 批量快照
│   └── utils/
│       ├── auth-helper.ts          # 登录辅助
│       └── wait-helpers.ts         # Playwright 等待条件
├── README.md
└── .env                            # 凭证
```

**package.json：**
```json
{
  "name": "my-snapshot-project",
  "dependencies": {
    "web-clone": "^1.0.0"
  },
  "devDependencies": {
    "playwright": "^1.58.2",
    "typescript": "^5.0.0",
    "tsx": "^4.0.0"
  }
}
```

#### 3.2 基础使用示例

**示例 1：HTTP 快照（无 Playwright）**
```typescript
// src/index.ts
import { snapshot } from 'web-clone';

async function basicSnapshot() {
  const result = await snapshot('https://example.com', {
    output: './snapshots',
    mode: 'bundle',
    maxAssets: 100,
  });
  console.log('Done:', result);
}

basicSnapshot();
```

**示例 2：带 Playwright 的快照**
```typescript
// src/spa-snapshot.ts
import { chromium } from 'playwright';
import { snapshot } from 'web-clone';
import { loadPlaywrightAdapter } from 'web-clone/adapters';

async function snapshotWithPlaywright() {
  // 1. 用户完全控制 Playwright 实例和版本
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 2. 动态加载 adapter（避免硬依赖）
    const PlaywrightAdapter = await loadPlaywrightAdapter();
    const adapter = new PlaywrightAdapter(page, context, {
      waitForLoadState: 'networkidle',
      timeout: 30000,
    });

    // 3. 快照时使用 Playwright adapter
    const result = await snapshot({
      url: 'https://example.com/app',
      output: './spa-snapshot',
      mode: 'bundle',
    }, adapter);

    console.log('SPA 快照完成');
  } finally {
    await context.close();
    await browser.close();
  }
}

snapshotWithPlaywright();
```

**示例 3：需要认证的快照**
```typescript
// src/authenticated-snapshot.ts
import { chromium } from 'playwright';
import { snapshot } from 'web-clone';
import { loadPlaywrightAdapter } from 'web-clone/adapters';

async function snapshotAuthenticatedPage(loginUrl: string, targetUrl: string) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. 用户自己写登录流程（完全灵活）
    await page.goto(loginUrl);
    await page.fill('input[name="email"]', process.env.EMAIL!);
    await page.fill('input[name="password"]', process.env.PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForNavigation();

    // 2. 登录后快照
    const PlaywrightAdapter = await loadPlaywrightAdapter();
    const adapter = new PlaywrightAdapter(page, context);

    const result = await snapshot({
      url: targetUrl,
      output: './authenticated-snapshot',
      mode: 'bundle',
    }, adapter);

    // 3. 导出认证上下文供复用
    const auth = await adapter.getAuthContext();
    console.log(`Captured ${auth.cookies?.length} cookies`);

    return result;
  } finally {
    await context.close();
    await browser.close();
  }
}

snapshotAuthenticatedPage(
  'https://app.example.com/login',
  'https://app.example.com/dashboard'
);
```

#### 3.3 集成到 AI Agent 框架

```typescript
// src/agent-skill.ts
import type { Page, BrowserContext } from 'playwright';
import { snapshot } from 'web-clone';
import { loadPlaywrightAdapter } from 'web-clone/adapters';

// 作为 AI Agent 的一个 skill
export function createSnapshotSkill(page: Page, context: BrowserContext) {
  return {
    name: 'snapshot-webpage',
    description: 'Snapshot current webpage or any URL',
    
    async execute(params: {
      url?: string;
      output: string;
      mode?: 'single' | 'bundle';
      maxAssets?: number;
    }) {
      const PlaywrightAdapter = await loadPlaywrightAdapter();
      
      // 如果指定了 URL，导航到它
      if (params.url && params.url !== page.url()) {
        await page.goto(params.url);
      }

      const adapter = new PlaywrightAdapter(page, context);
      const result = await snapshot({
        url: page.url(),
        output: params.output,
        mode: params.mode || 'bundle',
        maxAssets: params.maxAssets || 100,
      }, adapter);

      return {
        success: true,
        output: params.output,
        stats: result.stats,
      };
    }
  };
}
```

---

### Phase 4: 编写集成文档

#### 4.1 快速开始（INTEGRATION.md）

```markdown
# 集成 web-clone 库

## 安装

### 方式 A：标准 npm 安装
\`\`\`bash
npm install web-clone
\`\`\`

### 方式 B：GitHub
\`\`\`bash
npm install github:your-org/web-clone
\`\`\`

### 方式 C：本地路径
\`\`\`bash
npm install ../web-clone
\`\`\`

## 使用场景

### 场景 1：HTTP 快照（推荐用于简单网页）
\`\`\`typescript
import { snapshot } from 'web-clone';

await snapshot('https://example.com', {
  output: './snapshot',
  mode: 'bundle',
  maxAssets: 100
});
\`\`\`

### 场景 2：SPA/SSR 应用（需要 Playwright）
\`\`\`bash
npm install playwright  # 在你的项目中
\`\`\`

\`\`\`typescript
import { chromium } from 'playwright';
import { snapshot } from 'web-clone';
import { loadPlaywrightAdapter } from 'web-clone/adapters';

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

const PlaywrightAdapter = await loadPlaywrightAdapter();
const adapter = new PlaywrightAdapter(page, context);

await snapshot({ url: 'https://example.com', ... }, adapter);
\`\`\`

### 场景 3：认证后的快照
\`\`\`typescript
// 先登录
await page.goto('https://app.example.com/login');
await page.fill('input[name="email"]', 'user@example.com');
await page.fill('input[name="password"]', 'password');
await page.click('button[type="submit"]');
await page.waitForNavigation();

// 再快照
const adapter = new PlaywrightAdapter(page, context);
await snapshot({ url: 'https://app.example.com/dashboard', ... }, adapter);
\`\`\`

### 场景 4：AI Agent 集成
\`\`\`typescript
// 在你的 Agent 框架中定义 skill
const snapshotSkill = createSnapshotSkill(page, context);
agent.registerSkill(snapshotSkill);
\`\`\`

## API 参考

### snapshot(url, options, adapter?)

\`\`\`typescript
export async function snapshot(
  url: string,
  options: Omit<SnapshotOptions, 'url'>,
  adapter?: FetcherAdapter
): Promise<SnapshotResult>
\`\`\`

**参数：**
- \`url\` - 目标网页 URL
- \`options\` - 快照配置（见下）
- \`adapter\` - 资源获取适配器（可选，默认 HTTP）

**SnapshotOptions：**
\`\`\`typescript
interface SnapshotOptions {
  url: string;
  output: string;           // 输出路径
  mode: 'single' | 'bundle'; // 输出格式
  maxAssets: number;        // 最多下载多少资源
  concurrency: number;      // 并发数
  timeout: number;          // 超时（毫秒）
  inline: boolean;          // 内联资源
  pretty: boolean;          // 格式化 HTML
  maxFileSize: number;      // 单个文件最大大小
  // ... 更多选项见类型定义
}
\`\`\`

### FetcherAdapter 接口

```typescript
interface FetcherAdapter {
  fetch(url: string, options: FetchOptions): Promise<FetchResult>;
  canAccess?(url: string): Promise<boolean>;
  getAuthContext?(): Promise<AuthContext>;
  dispose?(): Promise<void>;
}
```

## 实现自定义 Adapter

```typescript
import type { FetcherAdapter, FetchResult, FetchOptions } from 'web-clone';

class MyCachingAdapter implements FetcherAdapter {
  private cache = new Map<string, FetchResult>();

  async fetch(url: string, options: FetchOptions): Promise<FetchResult> {
    if (this.cache.has(url)) {
      return this.cache.get(url)!;
    }
    
    // 你的实现...
    const result = await fetch(url).then(...);
    this.cache.set(url, result);
    return result;
  }

  async canAccess(url: string): Promise<boolean> {
    // 你的实现...
  }
}

// 使用
const adapter = new MyCachingAdapter();
await snapshot(url, options, adapter);
```

## 故障排除

### 错误：PlaywrightFetcherAdapter 需要 playwright 包
\`\`\`
请在你的项目中安装 Playwright：
npm install playwright
\`\`\`

### 使用 HTTP adapter 的注意事项
- 无法执行 JavaScript（仅获取 HTML/CSS/JS 文件）
- 无法等待动态内容
- 无法处理客户端路由（SPA）

### 使用 Playwright 的注意事项
- 需要额外安装 Playwright（~200MB）
- 启动浏览器有开销（~1-2 秒）
- 首次运行会下载浏览器二进制文件
```

---

## 文件清单

### 需要创建的文件

```
src/
├── index.ts                          # ✨ NEW - 库主入口
└── adapters/
    └── index.ts                      # ✨ NEW - 适配器导出

docs/
├── plan/
│   ├── 01-library-architecture.md   # 本文件
│   ├── 02-dependency-strategy.md    # 依赖策略
│   └── 03-migration-checklist.md    # 迁移清单
└── guides/
    └── INTEGRATION.md                # ✨ NEW - 集成指南

examples/
└── playwright-snapshot/              # 用户可参考的示例
    ├── package.json
    ├── src/
    │   ├── index.ts
    │   ├── authenticated-snapshot.ts
    │   └── utils/
    └── README.md
```

### 需要修改的文件

```
package.json
  - 移除 peerDependencies.playwright
  - 更新 exports 配置

src/assembler.ts
  - 停止在库中调用 injectVueHydrationScript
  - 库函数保持纯净

src/cli.ts
  - 仅对 HTTP 模式使用 injectVueHydrationScript
  - 不要在库中使用任何 CLI 优化
```

---

## 决策记录

### 为什么移除 peerDependencies 中的 Playwright？

**背景：**
- peerDependencies 用于表示"你的项目需要安装这个依赖才能使用我"
- 但 web-clone 库本身**不需要** playwright
- 只有当用户选择使用 PlaywrightFetcherAdapter 时，才需要 playwright
- 而且用户会在**自己的项目**中安装 playwright，不应该由 web-clone 管理

**决定：**
- ✅ devDependencies: playwright（用于开发和测试 web-clone）
- ❌ peerDependencies: 不需要
- ✅ 运行时动态检查（loadPlaywrightAdapter 中）

**优势：**
1. 更清晰的依赖关系
2. 用户项目完全控制 playwright 版本
3. 没有版本冲突或重复安装的警告
4. 库保持轻量级

---

## 验证清单

- [ ] 创建 src/index.ts
- [ ] 创建 src/adapters/index.ts
- [ ] 更新 package.json exports
- [ ] 移除 peerDependencies.playwright
- [ ] 停止库中调用 injectVueHydrationScript
- [ ] 编写 docs/guides/INTEGRATION.md
- [ ] 创建 examples/playwright-snapshot/
- [ ] 测试库导入：`import { snapshot } from 'web-clone'`
- [ ] 测试适配器导入：`import { HttpFetcherAdapter } from 'web-clone'`
- [ ] 验证 TypeScript 类型正确导出
- [ ] 更新主 README.md 指向集成指南
