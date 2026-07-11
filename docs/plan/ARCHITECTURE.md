# web-clone 库架构设计方案 v2.0

**版本**：2.0  
**日期**：2026-07-11  
**状态**：✅ 已调整（高级功能定位）

---

## 核心理念

web-clone v2.0 采用**分层API设计**，将Playwright集成定位为**高级功能**而非替代原有方式：

```
用户调用层 (API)
├─ snapshot()                          ← 基础：HTTP直接拉取（现有方式）
├─ snapshotWithPlaywright()            ← 高级：Playwright + 认证
└─ snapshotWithBrowserContext()        ← 细粒度：自己管理浏览器

内部实现层
└─ snapshotInternal(options, adapter)  ← 适配器抽象（不导出）
```

---

## 第一部分：API设计

### 1.1 基础API - snapshot()

用于简单网页快照（无需认证）：

```typescript
/**
 * 基础快照函数 - 使用HTTP直接拉取
 * 这是web-clone的原有方式，保持向后兼容
 */
async function snapshot(
  url: string,
  options: SnapshotOptions
): Promise<SnapshotResult>;
```

**特点**：
- ✓ 现有CLI使用此函数
- ✓ 不需要Playwright
- ✓ 快速、轻量级
- ✓ 无认证支持

**使用示例**：
```typescript
import { snapshot } from 'web-clone';

const result = await snapshot('https://example.com', {
  output: './snapshot',
  mode: 'bundle',
});
```

### 1.2 高级API - snapshotWithPlaywright()

用于需要认证的网页快照：

```typescript
/**
 * 使用Playwright进行快照 - 支持认证、Cookie、JS执行
 */
async function snapshotWithPlaywright(
  url: string,
  options: SnapshotOptions,
  playwrightOptions?: PlaywrightSnapshotOptions
): Promise<SnapshotResult>;
```

**PlaywrightSnapshotOptions**：
```typescript
interface PlaywrightSnapshotOptions {
  /**
   * Playwright浏览器启动选项
   * 参考 https://playwright.dev/docs/api/class-browsertype#browser-type-launch
   */
  browserLaunchOptions?: LaunchOptions;
  
  /**
   * 浏览器上下文选项（Cookie、权限、用户代理等）
   */
  contextOptions?: BrowserContextOptions;
  
  /**
   * 自定义认证设置函数
   * 在快照前执行，用于登录、设置Token等
   * @example
   * async (page, context) => {
   *   await page.goto('https://example.com/login');
   *   await page.fill('[name="email"]', 'user@example.com');
   *   await page.fill('[name="password"]', 'password');
   *   await page.click('button[type="submit"]');
   *   await page.waitForNavigation();
   * }
   */
  setupAuth?: (page: Page, context: BrowserContext) => Promise<void>;
  
  /**
   * Playwright适配器选项
   */
  adapterOptions?: {
    waitForLoadState?: 'load' | 'domcontentloaded' | 'networkidle';
    customHeaders?: Record<string, string>;
    debugScreenshot?: string;
  };
}
```

**特点**：
- ✓ 自动管理浏览器生命周期
- ✓ 支持自定义认证
- ✓ Cookie自动继承
- ✓ JS执行和动态渲染
- ✗ 需要安装Playwright

**使用示例**：
```typescript
import { snapshotWithPlaywright } from 'web-clone';

const result = await snapshotWithPlaywright(
  'https://example.com/dashboard',
  {
    output: './snapshot',
    mode: 'bundle',
  },
  {
    contextOptions: {
      userAgent: 'Custom User-Agent',
    },
    setupAuth: async (page, context) => {
      // 登录逻辑
      await page.goto('https://example.com/login');
      await page.fill('[name="email"]', 'user@example.com');
      await page.fill('[name="password"]', 'password');
      await page.click('button[type="submit"]');
      await page.waitForNavigation();
    },
  }
);
```

### 1.3 细粒度API - snapshotWithBrowserContext()

用于自己管理浏览器的场景：

```typescript
/**
 * 使用自己的浏览器上下文进行快照
 * 适合需要对浏览器生命周期完全控制的场景
 */
async function snapshotWithBrowserContext(
  url: string,
  options: SnapshotOptions,
  browserContext: BrowserContext
): Promise<SnapshotResult>;
```

**特点**：
- ✓ 完全控制浏览器
- ✓ 支持多页共享上下文
- ✓ 支持代理、拦截等高级Playwright功能
- ✗ 需要自己管理浏览器生命周期

**使用示例**：
```typescript
import { chromium } from 'playwright';
import { snapshotWithBrowserContext } from 'web-clone';

const browser = await chromium.launch();
const context = await browser.newContext({
  proxy: { server: 'http://proxy.example.com:8080' },
});
const page = await context.newPage();

// 登录
await page.goto('https://example.com/login');
// ... 认证逻辑 ...

// 快照（复用已认证的context）
await snapshotWithBrowserContext(
  'https://example.com/dashboard',
  { output: './snapshot', mode: 'bundle' },
  context
);

await browser.close();
```

---

## 第二部分：内部架构

### 2.1 适配器模式（内部实现）

**FetcherAdapter** 是内部抽象，不导出给用户：

```typescript
// 内部接口（src/adapters/fetcher-adapter.ts）
interface FetcherAdapter {
  fetch(url: string, options: FetchOptions): Promise<FetchResult>;
  canAccess?(url: string): Promise<boolean>;
  getAuthContext?(): Promise<AuthContext>;
  dispose?(): Promise<void>;
}
```

**实现**：
- `HttpFetcherAdapter` - 使用 node-fetch（内部使用）
- `PlaywrightFetcherAdapter` - 使用 Playwright（导出给高级用户）

### 2.2 双通道获取策略

Playwright适配器采用**双通道策略**提高性能：

```
┌─────────────────────────────────────┐
│ PlaywrightFetcherAdapter            │
├─────────────────────────────────────┤
│                                     │
│ 主文档 (HTML)                        │
│ └─ page.goto() + page.content()     │
│    • 执行 JavaScript                │
│    • 处理重定向                     │
│    • 等待动态内容                   │
│                                     │
│ 子资源 (CSS/JS/图片)                │
│ └─ context.request.fetch()         │
│    • 自动继承 Cookie               │
│    • 无需等待 JS 执行              │
│    • 快速并发                       │
└─────────────────────────────────────┘
```

### 2.3 核心管道

```typescript
async function snapshotInternal(
  url: string,
  options: SnapshotOptions,
  adapter: FetcherAdapter
): Promise<SnapshotResult> {
  // 1. 获取 HTML（使用适配器）
  const html = await fetchHtml(url, options, adapter);
  
  // 2. 解析资源引用
  const refs = parseHtml(html, url);
  
  // 3. 递归提取 CSS（使用适配器）
  const cssRefs = await extractCssAssets(refs, adapter, options);
  
  // 4. 去重
  const allRefs = dedupe([...refs, ...cssRefs]);
  
  // 5. 下载资源（使用适配器）
  const assets = await downloadAllAssets(allRefs, adapter, options);
  
  // 6. 组装输出
  return assembleOutput(html, assets, options);
}
```

---

## 第三部分：设计决策

### D1：两套API的分离

**为什么不是 `snapshot(options, adapter?)`？**

❌ **问题**：
```typescript
// 看起来两者地位相等，容易误导
snapshot(options, new HttpFetcherAdapter());
snapshot(options, new PlaywrightFetcherAdapter(page, context));
```

✅ **方案**：
```typescript
// 清晰的意图表达
snapshot(url, options);                    // 基础快照
snapshotWithPlaywright(url, options);      // 高级快照
snapshotWithBrowserContext(url, options);  // 细粒度控制
```

**好处**：
- 用户一眼看出：什么是基础、什么是高级
- 清晰的API层级
- 文档和示例容易组织
- 易于维护和扩展

### D2：Playwright作为可选依赖

```json
{
  "peerDependencies": {
    "playwright": "^1.40.0"
  },
  "peerDependenciesOptional": {
    "playwright": "^1.40.0"
  }
}
```

**原因**：
- CLI用户无需Playwright
- 库用户按需安装
- 减少依赖包大小

### D3：向后兼容性

```typescript
// v1.x 的代码继续工作
const result = await snapshot({
  url: 'https://example.com',
  output: './snapshot',
  mode: 'bundle',
});

// v2.0 新代码
const result = await snapshotWithPlaywright(
  'https://example.com',
  { output: './snapshot', mode: 'bundle' },
  { setupAuth: async (page) => { /* ... */ } }
);
```

### D4：适配器不导出给用户

**FetcherAdapter 和 HttpFetcherAdapter 不导出**：
- 这是实现细节
- 用户不应该直接选择适配器
- 防止API表面积过大

**PlaywrightFetcherAdapter 导出**：
- 给需要完全控制的高级用户
- 用于 `snapshotWithBrowserContext()` 场景

---

## 第四部分：导出API

### 4.1 公开导出

```typescript
// 主导出 (src/index.ts)
export {
  snapshot,
  snapshotWithPlaywright,
  snapshotWithBrowserContext,
  convertLocalSnapshot,  // 保持现有
} from './assembler.js';

export type {
  SnapshotOptions,
  SnapshotResult,
  // ... 其他现有类型
} from './types.js';

export {
  PlaywrightFetcherAdapter,
} from './adapters/playwright-fetcher-adapter.js';

export type {
  PlaywrightAdapterOptions,
} from './adapters/playwright-fetcher-adapter.js';
```

### 4.2 CLI保持不变

```bash
# 所有现有命令继续工作
npm run snapshot -- https://example.com -o ./snapshot -m bundle
npm run snapshot -- https://example.com --extract-components
```

---

## 第五部分：使用场景

### 场景1：简单网页快照

```typescript
// 最简单的用法
import { snapshot } from 'web-clone';

await snapshot('https://blog.example.com', {
  output: './snapshot',
  mode: 'bundle',
});
```

### 场景2：登录后快照（推荐）

```typescript
import { snapshotWithPlaywright } from 'web-clone';

await snapshotWithPlaywright(
  'https://app.example.com/dashboard',
  {
    output: './dashboard-snapshot',
    mode: 'bundle',
    extractComponents: true,
    frameworkHint: 'react',
  },
  {
    setupAuth: async (page) => {
      await page.goto('https://app.example.com/login');
      await page.fill('[name="email"]', 'user@example.com');
      await page.fill('[name="password"]', 'password');
      await page.click('button[type="submit"]');
      await page.waitForNavigation();
    },
  }
);
```

### 场景3：多页快照（完全控制）

```typescript
import { chromium } from 'playwright';
import { snapshotWithBrowserContext } from 'web-clone';

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

// 登录一次
await page.goto('https://app.example.com/login');
// ... 登录逻辑 ...

// 快照多个页面（复用已认证的context）
for (const route of ['/dashboard', '/settings', '/users']) {
  await page.goto(`https://app.example.com${route}`);
  await page.waitForLoadState('networkidle');
  
  await snapshotWithBrowserContext(
    `https://app.example.com${route}`,
    {
      output: `./snapshots${route}`,
      mode: 'bundle',
    },
    context
  );
}

await browser.close();
```

---

## 第六部分：与Phase 1/2代码的关系

### Phase 1：适配器层（保留）

- `src/adapters/fetcher-adapter.ts` ✓ 保留（内部接口）
- `src/adapters/http-fetcher-adapter.ts` ✓ 保留（内部实现）
- 单元测试 ✓ 保留

### Phase 2：Playwright适配器（保留）

- `src/adapters/playwright-fetcher-adapter.ts` ✓ 保留并导出
- 单元测试 ✓ 保留

### Phase 3：新增API函数（本方案）

- `snapshot()` - 改造为直接HTTP调用（不传适配器）
- `snapshotWithPlaywright()` - 新增
- `snapshotWithBrowserContext()` - 新增
- 修改 `assembler.ts` 中的核心逻辑

---

## 第七部分：向后兼容性

### CLI完全兼容

```bash
# v1.x 的命令继续工作
npm run dev -- https://example.com -o ./snapshot -m bundle
npm run dev -- https://example.com --extract-components --framework react
```

### 库用户的现有代码

```typescript
// 如果用户之前这样用（如果支持的话）
import { snapshot } from 'web-clone';
const result = await snapshot({
  url: 'https://example.com',
  output: './snapshot',
  mode: 'bundle',
});

// v2.0中继续工作（函数签名兼容）
const result = await snapshot('https://example.com', {
  output: './snapshot',
  mode: 'bundle',
});
```

---

## 第八部分：总结

| 维度 | v1.x | v2.0 |
|------|------|------|
| **基础快照** | `snapshot()` | `snapshot()` ✓ |
| **CLI** | 原有功能 | 原有功能 ✓ |
| **Playwright支持** | ✗ | `snapshotWithPlaywright()` ✓ |
| **认证支持** | ✗ | ✓ (内置) |
| **细粒度控制** | ✗ | `snapshotWithBrowserContext()` ✓ |
| **API清晰度** | - | 两层：基础 + 高级 ✓ |
| **向后兼容性** | - | 100% ✓ |

---

**关键点**：
- ✅ Playwright集成是高级功能，不改变基础API
- ✅ HTTP快照保持现有性能和简洁
- ✅ 两套API清晰分离
- ✅ 完全向后兼容
- ✅ 用户一眼看出什么是基础、什么是高级
