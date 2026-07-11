# 实现路线图和代码框架

## 一、项目结构变更

### 当前结构
```
src/
├── cli.ts
├── assembler.ts
├── fetcher.ts
├── types.ts
├── parser/
├── output/
├── transform/
└── validators.ts
```

### 新结构
```
src/
├── index.ts                          # ← NEW: 库入口
├── cli.ts                            # 保持不变
├── assembler.ts                      # 改进：接受 FetcherAdapter
├── fetcher.ts                        # 保持现有逻辑
├── types.ts                          # 新增 adapter 相关类型
├── adapters/                         # ← NEW: 适配器层
│   ├── index.ts
│   ├── fetcher-adapter.ts           # 接口定义
│   ├── http-fetcher-adapter.ts      # HTTP 实现
│   ├── playwright-fetcher-adapter.ts # Playwright 实现
│   └── __tests__/
│       ├── http-fetcher-adapter.test.ts
│       └── playwright-fetcher-adapter.test.ts
├── parser/
├── output/
├── transform/
└── validators.ts

docs/
└── plan/
    ├── playwright-library-integration.md  # 本文档
    ├── implementation-roadmap.md          # 本文件
    ├── code-framework.md                  # 代码框架具体实现
    └── examples/
        ├── basic-playwright.ts
        ├── multi-page-snapshot.ts
        ├── advanced-auth.ts
        └── spa-multi-route.ts

tests/
└── e2e/
    └── playwright-integration.test.ts
```

---

## 二、分阶段实现计划

### 阶段 1：基础设施（第 1-2 周）

#### 1.1 创建适配器接口 (2 小时)

**文件**：`src/adapters/fetcher-adapter.ts`

```typescript
/**
 * 统一的资源获取适配器接口
 * 支持多种后端：HTTP、Playwright、缓存等
 */
export interface FetcherAdapter {
  /**
   * 获取资源（HTML、CSS、JS、图片等）
   */
  fetch(
    url: string,
    options: FetchOptions
  ): Promise<FetchResult>;

  /**
   * 可选：检查资源是否可访问
   * 用于提前过滤无法访问的资源
   */
  canAccess?(url: string): Promise<boolean>;

  /**
   * 可选：获取当前的认证上下文
   * 返回 Cookie、令牌、自定义请求头等
   */
  getAuthContext?(): Promise<AuthContext>;

  /**
   * 可选：清理资源
   * 例如关闭浏览器连接、清理临时文件等
   */
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
  url?: string;  // 最终 URL（重定向后）
}

export interface AuthContext {
  cookies?: Array<{ name: string; value: string }>;
  headers?: Record<string, string>;
  token?: string;
}
```

#### 1.2 创建 HTTP 适配器 (3 小时)

**文件**：`src/adapters/http-fetcher-adapter.ts`

```typescript
import { FetcherAdapter, FetchOptions, FetchResult } from './fetcher-adapter.js';
import { fetchWithTimeout } from '../fetcher.js';

/**
 * HTTP 适配器：使用 node-fetch 进行 HTTP 请求
 * 包装现有的 fetchWithTimeout 逻辑
 */
export class HttpFetcherAdapter implements FetcherAdapter {
  async fetch(
    url: string,
    options: FetchOptions
  ): Promise<FetchResult> {
    const result = await fetchWithTimeout(
      url,
      options.timeout ?? 15000,
      options.referer,
      options.maxSize
    );

    return {
      buffer: result.buffer,
      mime: result.mime,
      status: result.status,
      ok: result.ok,
      isHtmlLike: result.isHtmlLike,
      headers: {},
    };
  }

  async canAccess(url: string): Promise<boolean> {
    try {
      const result = await this.fetch(url, { timeout: 5000 });
      return result.ok;
    } catch {
      return false;
    }
  }

  async getAuthContext() {
    return {
      cookies: [],
      headers: {},
    };
  }
}
```

#### 1.3 类型定义更新 (1 小时)

**更新**：`src/types.ts`

```typescript
// 新增导出（适配器层已定义，这里只是重新导出）
export type { FetcherAdapter, FetchOptions, FetchResult, AuthContext } 
  from './adapters/fetcher-adapter.js';
```

### 阶段 2：Playwright 适配器 (3-5 天)

#### 2.1 实现 Playwright 适配器 (4-5 小时)

**文件**：`src/adapters/playwright-fetcher-adapter.ts`

```typescript
import type { Page, BrowserContext } from 'playwright';
import { FetcherAdapter, FetchOptions, FetchResult, AuthContext } from './fetcher-adapter.js';

export interface PlaywrightAdapterOptions {
  /**
   * 是否等待页面加载完成
   * @default true
   */
  waitForNavigation?: boolean;

  /**
   * 是否执行页面 JavaScript
   * @default true
   */
  executeJs?: boolean;

  /**
   * 等待的加载状态
   * @default 'networkidle'
   */
  waitForLoadState?: 'load' | 'domcontentloaded' | 'networkidle';

  /**
   * 自定义请求头（会与 Cookie 一起发送）
   */
  customHeaders?: Record<string, string>;

  /**
   * 调试模式：保存页面截图
   */
  debugScreenshot?: string;

  /**
   * 是否验证 SSL 证书
   * @default true
   */
  validateSSL?: boolean;
}

/**
 * Playwright 浏览器适配器
 * 使用 Playwright 浏览器上下文进行资源获取
 * 支持 Cookie、认证、JS 执行等
 */
export class PlaywrightFetcherAdapter implements FetcherAdapter {
  constructor(
    private page: Page,
    private context: BrowserContext,
    private options: PlaywrightAdapterOptions = {}
  ) {}

  async fetch(
    url: string,
    options: FetchOptions
  ): Promise<FetchResult> {
    const mergedOptions: PlaywrightAdapterOptions = {
      waitForNavigation: this.options.waitForNavigation ?? true,
      executeJs: this.options.executeJs ?? true,
      waitForLoadState: this.options.waitForLoadState ?? 'networkidle',
      validateSSL: options.validateSSL ?? true,
      ...this.options,
    };

    try {
      // 对于主 HTML 文档，使用 page.goto()
      // 对于其他资源，使用 context.request.fetch()
      if (url === this.page.url() || !this.page.url()) {
        return await this.fetchWithPage(url, options, mergedOptions);
      } else {
        return await this.fetchWithContext(url, options, mergedOptions);
      }
    } catch (error) {
      throw new Error(
        `Playwright fetch failed for ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async fetchWithPage(
    url: string,
    options: FetchOptions,
    pwOptions: PlaywrightAdapterOptions
  ): Promise<FetchResult> {
    // 导航到页面
    const response = await this.page.goto(url, {
      timeout: options.timeout ?? 30000,
      waitUntil: pwOptions.waitForLoadState,
    });

    if (!response) {
      throw new Error(`Failed to navigate to ${url}`);
    }

    // 等待加载完成
    if (pwOptions.waitForLoadState) {
      await this.page.waitForLoadState(pwOptions.waitForLoadState);
    }

    // 可选：执行调试截图
    if (pwOptions.debugScreenshot) {
      await this.page.screenshot({
        path: pwOptions.debugScreenshot,
      });
    }

    // 获取最终的 HTML 内容
    const html = await this.page.content();
    const buffer = Buffer.from(html, 'utf-8');

    return {
      buffer,
      mime: 'text/html',
      status: response.status(),
      ok: response.ok(),
      isHtmlLike: true,
      headers: Object.fromEntries(await response.allHeaders()),
      url: this.page.url(),
    };
  }

  private async fetchWithContext(
    url: string,
    options: FetchOptions,
    pwOptions: PlaywrightAdapterOptions
  ): Promise<FetchResult> {
    // 使用浏览器上下文请求 API（继承 Cookie、认证等）
    const response = await this.context.request.fetch(url, {
      timeout: options.timeout ?? 15000,
      headers: {
        ...options.headers,
        ...this.options.customHeaders,
      },
    });

    // 读取响应正文
    const buffer = await response.body();

    const contentType = response.headers()['content-type'] || 'application/octet-stream';

    return {
      buffer,
      mime: contentType,
      status: response.status(),
      ok: response.ok(),
      isHtmlLike: contentType.includes('text/html'),
      headers: response.headers(),
      url: response.url(),
    };
  }

  async canAccess(url: string): Promise<boolean> {
    try {
      const response = await this.context.request.head(url, {
        timeout: 5000,
      });
      return response.ok();
    } catch {
      return false;
    }
  }

  async getAuthContext(): Promise<AuthContext> {
    const cookies = await this.context.cookies();
    const storageState = await this.context.storageState();

    return {
      cookies: cookies.map(c => ({
        name: c.name,
        value: c.value,
      })),
      headers: this.options.customHeaders,
      token: storageState?.origins?.[0]?.localStorage?.[0]?.['auth_token'],
    };
  }

  async dispose(): Promise<void> {
    // 不关闭浏览器，由调用者管理生命周期
    // 但可以清理页面特定资源
    try {
      await this.page.close();
    } catch {
      // 忽略错误
    }
  }
}
```

#### 2.2 单元测试 (2-3 小时)

**文件**：`src/adapters/__tests__/playwright-fetcher-adapter.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlaywrightFetcherAdapter } from '../playwright-fetcher-adapter.js';

describe('PlaywrightFetcherAdapter', () => {
  let mockPage: any;
  let mockContext: any;

  beforeEach(() => {
    // 模拟 Playwright 对象
    mockPage = {
      goto: vi.fn(),
      content: vi.fn(),
      waitForLoadState: vi.fn(),
      screenshot: vi.fn(),
      close: vi.fn(),
      url: vi.fn(() => 'https://example.com'),
    };

    mockContext = {
      cookies: vi.fn().mockResolvedValue([
        { name: 'session', value: 'abc123' },
      ]),
      storageState: vi.fn().mockResolvedValue({}),
      request: {
        fetch: vi.fn(),
        head: vi.fn(),
      },
    };
  });

  it('should fetch HTML via page.goto', async () => {
    const htmlContent = '<html><body>Test</body></html>';
    mockPage.goto.mockResolvedValue({
      status: () => 200,
      ok: () => true,
      allHeaders: async () => ({ 'content-type': 'text/html' }),
    });
    mockPage.content.mockResolvedValue(htmlContent);

    const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
    const result = await adapter.fetch('https://example.com', {
      timeout: 5000,
    });

    expect(result.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.mime).toBe('text/html');
  });

  it('should fetch resources via context.request', async () => {
    const buffer = Buffer.from('/* css content */');
    mockContext.request.fetch.mockResolvedValue({
      status: () => 200,
      ok: () => true,
      headers: () => ({ 'content-type': 'text/css' }),
      body: async () => buffer,
      url: () => 'https://example.com/style.css',
    });

    const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
    const result = await adapter.fetch('https://example.com/style.css', {});

    expect(result.status).toBe(200);
    expect(result.mime).toContain('text/css');
  });

  it('should merge custom headers', async () => {
    mockContext.request.fetch.mockResolvedValue({
      status: () => 200,
      ok: () => true,
      headers: () => ({}),
      body: async () => Buffer.from(''),
      url: () => 'https://api.example.com/data',
    });

    const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext, {
      customHeaders: { 'Authorization': 'Bearer token' },
    });

    await adapter.fetch('https://api.example.com/data', {
      headers: { 'Accept': 'application/json' },
    });

    expect(mockContext.request.fetch).toHaveBeenCalledWith(
      'https://api.example.com/data',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer token',
          'Accept': 'application/json',
        }),
      })
    );
  });

  it('should retrieve auth context with cookies', async () => {
    const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext, {
      customHeaders: { 'X-Token': 'secret' },
    });

    const authContext = await adapter.getAuthContext();

    expect(authContext.cookies).toEqual([
      { name: 'session', value: 'abc123' },
    ]);
    expect(authContext.headers).toEqual({
      'X-Token': 'secret',
    });
  });
});
```

### 阶段 3：集成和重构 (3-4 天)

#### 3.1 更新 assembler.ts (2-3 小时)

**修改**：`src/assembler.ts`

关键变更：

```typescript
import { FetcherAdapter } from './adapters/fetcher-adapter.js';
import { HttpFetcherAdapter } from './adapters/http-fetcher-adapter.js';

/**
 * 核心快照函数
 * 现在接受可选的 FetcherAdapter 参数
 */
export async function snapshot(
  options: SnapshotOptions,
  fetcherAdapter?: FetcherAdapter
): Promise<SnapshotResult> {
  // 默认使用 HTTP 适配器（向后兼容）
  const fetcher = fetcherAdapter || new HttpFetcherAdapter();

  // 第一步：获取 HTML
  const html = await fetchHtml(options.url, options.timeout, fetcher);
  if (!html) {
    throw new Error(`Failed to fetch HTML from ${options.url}`);
  }

  // 第二步：解析资源引用
  const refs = parseHtml(html, options.url);
  
  // 第三步：递归提取 CSS（传递 fetcher）
  const cssRefs = await extractCssAssets(refs, fetcher, options);

  // 第四步：去重
  const allRefs = dedupe([...refs, ...cssRefs]);

  // 第五步：下载资源
  const assets = await downloadAllAssets(allRefs, fetcher, options);

  // ... 后续输出逻辑
}

/**
 * 使用 FetcherAdapter 获取 HTML
 */
async function fetchHtml(
  url: string,
  timeout: number,
  fetcher: FetcherAdapter,
  maxSize?: number
): Promise<string | null> {
  try {
    const result = await fetcher.fetch(url, {
      timeout,
      maxSize,
    });

    if (!result.ok && !result.isHtmlLike) {
      return null;
    }

    return result.buffer.toString('utf8');
  } catch (err) {
    console.warn(`Failed to fetch HTML: ${err}`);
    return null;
  }
}

/**
 * 使用 FetcherAdapter 下载资源
 */
async function downloadAllAssets(
  refs: AssetRef[],
  fetcher: FetcherAdapter,
  options: SnapshotOptions
): Promise<Asset[]> {
  // 使用 fetcher 下载每个资源
  // 保持现有的并发控制和重试逻辑
  // ...
}
```

#### 3.2 创建库入口 (1 小时)

**新文件**：`src/index.ts`

```typescript
/**
 * web-clone 库入口
 * 暴露核心 API 和适配器
 */

// 核心函数
export { snapshot, convertLocalSnapshot } from './assembler.js';

// 类型
export type {
  SnapshotOptions,
  SnapshotResult,
  SnapshotMode,
  AssetType,
  Asset,
  AssetRef,
  ComponentSpec,
  ComponentManifest,
  StateVariable,
  EventBinding,
  MethodSpec,
} from './types.js';

// 适配器接口和实现
export type {
  FetcherAdapter,
  FetchOptions,
  FetchResult,
  AuthContext,
} from './adapters/fetcher-adapter.js';

export { HttpFetcherAdapter } from './adapters/http-fetcher-adapter.js';
export { PlaywrightFetcherAdapter } from './adapters/playwright-fetcher-adapter.js';
export type { PlaywrightAdapterOptions } from './adapters/playwright-fetcher-adapter.js';

// 工具函数
export { parseHtml } from './parser/html-parser.js';
export { extractCssAssets } from './parser/css-parser.js';
```

#### 3.3 更新 package.json (30 分钟)

```json
{
  "name": "web-clone",
  "version": "2.0.0",
  "description": "Web page snapshot tool - CLI and library for Playwright automation",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "snapshot": "dist/cli.js"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./adapters": {
      "types": "./dist/adapters/index.d.ts",
      "default": "./dist/adapters/index.js"
    },
    "./types": {
      "types": "./dist/types.d.ts",
      "default": "./dist/types.js"
    }
  },
  "peerDependencies": {
    "playwright": "^1.40.0"
  },
  "peerDependenciesOptional": {
    "playwright": "^1.40.0"
  }
}
```

### 阶段 4：文档和示例 (2-3 天)

#### 4.1 API 文档

**文件**：`docs/LIBRARY_API.md`

包含：
- API 参考
- 类型定义
- 适配器选择指南
- TypeScript 类型安全性

#### 4.2 集成指南

**文件**：`docs/PLAYWRIGHT_INTEGRATION.md`

包含：
- 快速开始
- 身份验证模式
- 常见场景
- 故障排除

#### 4.3 示例代码

在 `docs/examples/` 中创建：

```
examples/
├── 1-basic-login.ts              # 最简单的登录 + 快照
├── 2-multi-page-snapshot.ts      # 多页面快照
├── 3-spa-routing.ts              # SPA 路由快照
├── 4-api-token-auth.ts           # API 令牌认证
├── 5-advanced-js-execution.ts    # 高级 JS 执行
└── 6-error-handling.ts           # 错误处理最佳实践
```

### 阶段 5：测试和验证 (2-3 天)

#### 5.1 集成测试

**文件**：`src/__tests__/snapshot-with-adapter.test.ts`

```typescript
describe('snapshot() with adapters', () => {
  it('should maintain backward compatibility with HTTP fetcher', async () => {
    const result = await snapshot({
      url: 'https://example.com',
      output: './test-output',
      mode: 'bundle',
    });
    // 不传 adapter，应该使用默认的 HttpFetcherAdapter
    expect(result.stats.fetched).toBeGreaterThan(0);
  });

  it('should work with custom HTTP adapter', async () => {
    const adapter = new HttpFetcherAdapter();
    const result = await snapshot({
      url: 'https://example.com',
      output: './test-output',
      mode: 'bundle',
    }, adapter);
    expect(result.stats.fetched).toBeGreaterThan(0);
  });
});
```

#### 5.2 E2E 测试（可选）

**文件**：`tests/e2e/playwright-integration.test.ts`

```typescript
describe('Playwright integration E2E', () => {
  it('should snapshot authenticated page', async () => {
    // 需要实际的测试网站或 mock 服务器
  });
});
```

---

## 三、关键代码修改清单

### 需要修改的文件

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `src/adapters/fetcher-adapter.ts` | NEW | 创建适配器接口 |
| `src/adapters/http-fetcher-adapter.ts` | NEW | HTTP 实现 |
| `src/adapters/playwright-fetcher-adapter.ts` | NEW | Playwright 实现 |
| `src/adapters/__tests__/` | NEW | 适配器单元测试 |
| `src/index.ts` | NEW | 库入口 |
| `src/assembler.ts` | MODIFY | 接受 FetcherAdapter 参数 |
| `src/fetcher.ts` | KEEP | 保留现有逻辑，被 HTTP 适配器调用 |
| `src/cli.ts` | MINOR | 无需修改（或最小修改） |
| `package.json` | MODIFY | 添加导出、peerDependencies |
| `tsconfig.json` | MODIFY | 确保 Playwright 类型支持 |

### 无需修改的文件

- `src/parser/*` — 保持不变
- `src/output/*` — 保持不变
- `src/transform/*` — 保持不变
- `src/types.ts` — 仅添加重新导出
- `src/validators.ts` — 保持不变

---

## 四、测试覆盖率目标

| 模块 | 当前 | 目标 | 优先级 |
|------|------|------|--------|
| adapters/* | 0% | 85%+ | P0 |
| assembler.ts | ~60% | 75%+ | P1 |
| cli.ts | 0% | 50%+ | P2 |
| 总体 | ~40% | 65%+ | |

---

## 五、发布检查清单

- [ ] 所有单元测试通过
- [ ] TypeScript 编译无错误
- [ ] ESLint 检查通过
- [ ] README.md 更新说明库用法
- [ ] CHANGELOG.md 记录 v2.0.0 破坏性变更（如有）
- [ ] NPM 包大小检查（`npm pack`）
- [ ] 文档完整性检查
- [ ] 示例代码可运行
- [ ] Git 标签 `v2.0.0`

---

## 六、向后兼容性验证

### CLI 验证

```bash
# 所有现有命令应该继续工作
npm run snapshot -- https://example.com
npm run snapshot -- https://example.com -m single --extract-components
npm run snapshot -- https://example.com -o ./output --extract-components --framework react
```

### 库 API 验证

```typescript
// 旧代码应该继续工作
import { snapshot } from 'web-clone';
const result = await snapshot(options);

// 新代码可以使用适配器
import { snapshot, PlaywrightFetcherAdapter } from 'web-clone';
const adapter = new PlaywrightFetcherAdapter(page, context);
const result = await snapshot(options, adapter);
```

---

## 七、风险评估和缓解

| 风险 | 概率 | 影响 | 缓解方案 |
|------|------|------|---------|
| Playwright API 变更 | 低 | 高 | 版本锁定、抽象层 |
| 性能回退 | 中 | 中 | 基准测试、缓存策略 |
| 集成复杂性 | 中 | 低 | 详细文档、示例、测试 |
| TypeScript 兼容性 | 低 | 中 | CI 检查、类型测试 |

---

## 八、成功指标

1. **功能完整性**
   - ✓ CLI 工具 100% 向后兼容
   - ✓ Playwright 适配器支持所有主要认证场景
   - ✓ 测试覆盖率 ≥65%

2. **性能指标**
   - ✓ HTTP 适配器性能 ≈ 当前 CLI
   - ✓ Playwright 适配器性能 ≤ 20% 开销
   - ✓ 内存使用量 ≤ 2x 当前峰值

3. **可维护性**
   - ✓ 清晰的模块边界
   - ✓ 完整的文档
   - ✓ 可复用的示例

4. **采纳度**
   - ✓ NPM 周下载量增长 ≥2x
   - ✓ GitHub 问题和讨论来自 Playwright 用户

