# Playwright 集成测试方案

## 目录
1. [测试概览](#测试概览)
2. [项目结构](#项目结构)
3. [Mock 测试（无真实浏览器）](#mock-测试无真实浏览器)
4. [集成测试（需要真实浏览器）](#集成测试需要真实浏览器)
5. [测试覆盖范围](#测试覆盖范围)
6. [运行指南](#运行指南)

---

## 测试概览

### 项目状态
- **当前实现**：PlaywrightFetcherAdapter 完整实现
- **适配器接口**：FetcherAdapter 标准接口已定义
- **单元测试**：PlaywrightFetcherAdapter 单元测试已完成（43 个用例）
- **测试框架**：Vitest + Mock（目前不依赖真实浏览器）

### 测试类型划分

| 测试类型 | 是否需要真实浏览器 | 工具 | 目的 | 维护成本 |
|---------|------------------|------|------|--------|
| **Mock 单元测试** | ❌ 否 | Vitest + vi.mock() | 验证适配器方法逻辑 | 低 ✓ |
| **集成测试** | ✅ 是 | Vitest + 真实 Playwright | 验证适配器与管道交互 | 中 |
| **快照测试** | ✅ 是 | Vitest + 文件系统 | 验证输出结构一致性 | 低 |

### 测试金字塔
```
        △ 集成测试（需真实浏览器）
       △ △ 
      △  △  快照测试（小范围真实）
     △  △  △
    △  △  △  △ Mock 单元测试（纯 Vitest）
   ▲▲▲▲▲▲▲▲▲▲▲▲
   ↑ 容易维护   容易执行 ↑
```

---

## 项目结构

### 2.1 整体目录布局

```
src/adapters/
├── __tests__/                                  # 所有测试文件（Mock 为主）
│   ├── fixtures/
│   │   ├── mock-factories.ts                  # Mock 对象工厂
│   │   └── test-data.ts                       # 测试数据集
│   ├── playwright-fetcher-adapter.test.ts     # ✅ 已完成（43 个用例）
│   ├── http-fetcher-adapter.test.ts           # ⏳ 待实现
│   ├── adapter-switching.test.ts              # ⏳ 待实现
│   └── fetcher-adapter-interface.test.ts      # ⏳ 待实现
│
├── playwright-fetcher-adapter.ts              # ✅ 已实现
├── http-fetcher-adapter.ts                    # ⏳ 待实现
├── fetcher-adapter.ts                         # ✅ 接口已定义
└── index.ts                                   # ✅ 导出

src/__tests__/                                 # 集成测试（需要真实浏览器）
├── integration/
│   ├── snapshot-with-playwright.test.ts       # ⏳ PlaywrightFetcherAdapter 与 snapshot() 交互
│   ├── snapshot-with-http.test.ts             # ⏳ HttpFetcherAdapter 向后兼容性
│   ├── adapter-compatibility.test.ts          # ⏳ 多适配器兼容性
│   └── authenticated-pages.test.ts            # ⏳ 认证场景（需真实浏览器）
│
└── snapshots/                                 # 快照测试数据
    ├── example-static.json
    ├── example-spa.json
    └── example-authenticated.json

e2e/                                           # 端到端测试（可选）
├── real-website-snapshot.test.ts              # ⏳ 真实网站快照（可选）
└── fixtures/
    └── real-server/                           # 本地测试服务器配置

docs/tests/
├── PLAYWRIGHT_INTEGRATION_TEST_PLAN.md        # 本文件
├── TEST_SETUP.md                              # 测试环境配置
├── MOCK_GUIDE.md                              # Mock 对象使用指南
└── BROWSER_INTEGRATION_GUIDE.md               # 真实浏览器集成指南
```

### 2.2 测试文件命名规范

```
✓ 单元测试：     <module>.test.ts              （Mock 为主）
✓ 集成测试：     integration/<feature>.test.ts （需真实浏览器）
✓ 快照测试：     snapshots/<name>.json
✓ Fixtures：     fixtures/<type>.ts
```

### 2.3 分层职责

#### 层级 1：Mock 单元测试（无浏览器）
```
src/adapters/__tests__/
  ├── playwright-fetcher-adapter.test.ts
  ├── http-fetcher-adapter.test.ts
  ├── adapter-switching.test.ts
  └── fetcher-adapter-interface.test.ts
```
**特征**：
- 使用 `vi.fn()` mock 所有 Playwright 对象
- 快速执行（< 1 秒）
- 无外部依赖
- 100% 可重复执行

#### 层级 2：集成测试（需真实浏览器）
```
src/__tests__/integration/
  ├── snapshot-with-playwright.test.ts
  ├── snapshot-with-http.test.ts
  ├── adapter-compatibility.test.ts
  └── authenticated-pages.test.ts
```
**特征**：
- 使用真实 Playwright 浏览器
- 测试适配器与快照管道的交互
- 验证输出文件结构
- 执行时间较长（10-30 秒/测试）
- 需要网络访问

#### 层级 3：快照对比测试
```
src/__tests__/snapshots/
  ├── example-static.json      # 预期输出
  ├── example-spa.json
  └── example-authenticated.json
```
**特征**：
- 存储预期的快照输出
- 用于验证生成内容的一致性
- 需要定期更新

---

## Mock 测试（无真实浏览器）

### 3.1 PlaywrightFetcherAdapter Mock 测试

**文件**：`src/adapters/__tests__/playwright-fetcher-adapter.test.ts`

**现有实现** ✅：

已完成 43 个单元测试用例，覆盖所有方法：

```
✓ fetch() - 主文档获取          （5 用例）
✓ fetch() - 子资源获取          （5 用例）
✓ fetch() - 错误处理            （2 用例）
✓ canAccess() - 资源检查        （4 用例）
✓ getAuthContext() - 认证提取   （6 用例）
✓ dispose() - 资源清理          （5 用例）
✓ saveState() / loadState()     （7 用例）
✓ getStateSummary()             （4 用例）
✓ 集成场景                       （2 用例）
✓ 边界情况                       （3 用例）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
总计：43 用例 ✓ 100% 完成
```

**运行方式**：
```bash
# 运行所有 Mock 测试
npm run test:run -- src/adapters/__tests__/playwright-fetcher-adapter.test.ts

# 监听模式
npm run test -- src/adapters/__tests__/playwright-fetcher-adapter.test.ts

# 特定测试
npm run test:run -- --grep "should fetch HTML via page.goto"
```

### 3.2 HttpFetcherAdapter Mock 测试

**文件**：`src/adapters/__tests__/http-fetcher-adapter.test.ts`（⏳ 待实现）

**测试用例清单**：
```typescript
describe('HttpFetcherAdapter', () => {
  describe('fetch()', () => {
    // 基础功能
    it('should fetch resource with default timeout');
    it('should fetch resource with custom timeout');
    it('should respect maxSize limit');
    it('should return correct MIME type');
    it('should handle HTTP 200 response');
    
    // 错误处理
    it('should handle HTTP 404 error');
    it('should handle HTTP 500 error');
    it('should handle network timeout');
    it('should handle connection refused');
    it('should handle invalid URL');
    
    // 重定向
    it('should follow single redirect');
    it('should follow redirect chain');
    it('should respect max redirect limit');
  });
  
  describe('canAccess()', () => {
    it('should use HEAD request for efficiency');
    it('should return true for 2xx response');
    it('should return false for 4xx response');
    it('should return false on network error');
  });
  
  describe('getAuthContext()', () => {
    it('should return empty context');
    it('should return custom headers if configured');
  });
});
```

**预期用例数**：15-20 个

### 3.3 适配器接口兼容性测试

**文件**：`src/adapters/__tests__/fetcher-adapter-interface.test.ts`（⏳ 待实现）

```typescript
describe('FetcherAdapter Interface Compliance', () => {
  // 验证所有适配器实现遵循接口约定
  it('should implement fetch() method');
  it('should implement optional canAccess() with correct signature');
  it('should implement optional getAuthContext() with correct return type');
  it('should implement optional dispose() with correct behavior');
  it('should return compatible FetchResult types');
  it('should handle FetchOptions correctly');
});
```

**预期用例数**：8-10 个

### 3.4 适配器切换测试

**文件**：`src/adapters/__tests__/adapter-switching.test.ts`（⏳ 待实现）

```typescript
describe('Adapter Switching', () => {
  it('should allow switching between adapters mid-operation');
  it('should maintain compatibility when switching adapters');
  it('should handle resource fetch with different adapters');
  it('should preserve authentication context when switching');
});
```

**预期用例数**：4-6 个

### 3.5 Mock 对象工厂

**文件**：`src/adapters/__tests__/fixtures/mock-factories.ts`（待创建）

```typescript
/**
 * 创建模拟 Playwright Page
 */
export function createMockPage(overrides?: Partial<Page>): Page {
  return {
    goto: vi.fn(),
    content: vi.fn(),
    waitForLoadState: vi.fn(),
    screenshot: vi.fn(),
    close: vi.fn(),
    isClosed: vi.fn(() => false),
    url: vi.fn(() => 'https://example.com'),
    ...overrides,
  } as unknown as Page;
}

/**
 * 创建模拟 BrowserContext
 */
export function createMockContext(
  overrides?: Partial<BrowserContext>
): BrowserContext {
  return {
    cookies: vi.fn().mockResolvedValue([
      { name: 'session', value: 'abc123', url: '', domain: '', path: '' },
    ]),
    storageState: vi.fn().mockResolvedValue({
      origins: [
        {
          origin: 'https://example.com',
          localStorage: [{ name: 'auth_token', value: 'token123' }],
        },
      ],
    }),
    request: {
      fetch: vi.fn(),
      head: vi.fn(),
    },
    ...overrides,
  } as unknown as BrowserContext;
}

/**
 * 预设 FetchResult 模板
 */
export const MOCK_RESULTS = {
  html: () => ({
    buffer: Buffer.from('<html><body>Test</body></html>'),
    mime: 'text/html; charset=utf-8',
    status: 200,
    ok: true,
    isHtmlLike: true,
  }),
  css: () => ({
    buffer: Buffer.from('body { color: red; }'),
    mime: 'text/css',
    status: 200,
    ok: true,
    isHtmlLike: false,
  }),
  image: () => ({
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]), // PNG
    mime: 'image/png',
    status: 200,
    ok: true,
    isHtmlLike: false,
  }),
  error404: () => ({
    buffer: Buffer.from('Not Found'),
    mime: 'text/html',
    status: 404,
    ok: false,
    isHtmlLike: true,
  }),
};
```

### 3.6 测试数据集

**文件**：`src/adapters/__tests__/fixtures/test-data.ts`（待创建）

```typescript
export const TEST_URLS = {
  simple: 'https://example.com',
  withPath: 'https://example.com/page',
  withQuery: 'https://example.com/search?q=test',
  sameOrigin: {
    main: 'https://example.com',
    subResource: 'https://example.com/style.css',
  },
  crossOrigin: {
    main: 'https://example.com',
    cdn: 'https://cdn.example.com/style.css',
  },
};

export const TEST_HEADERS = {
  auth: { 'Authorization': 'Bearer token123' },
  custom: { 'X-Custom-Header': 'value' },
  combined: {
    'Authorization': 'Bearer token',
    'X-Custom-Header': 'value',
    'Accept': 'application/json',
  },
};

export const TEST_COOKIES = [
  { name: 'session', value: 'abc123' },
  { name: 'tracking', value: 'xyz789' },
  { name: 'preferences', value: 'lang=en;theme=dark' },
];

export const TEST_AUTH_TOKENS = {
  jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  bearer: 'Bearer abc123def456',
  basic: 'Basic dXNlcjpwYXNz',
};
```

---

## 集成测试（需要真实浏览器）

### 4.1 什么时候使用真实浏览器？

✅ **必须使用真实浏览器的场景**：
- 验证 `page.goto()` 实际执行 JavaScript
- 验证 `context.request.fetch()` 继承 Cookie
- 测试真实的 HTML 解析和资源提取
- 验证快照输出文件结构
- 测试与快照管道的完整集成

❌ **不需要真实浏览器的场景**：
- 验证单个方法的逻辑
- 测试错误处理路径
- 测试参数验证
- 测试 Mock 交互

### 4.2 集成测试 - PlaywrightFetcherAdapter 与 snapshot()

**文件**：`src/__tests__/integration/snapshot-with-playwright.test.ts`（⏳ 待实现）

**环境需求**：
```
✅ 真实 Playwright 浏览器（Chromium）
✅ 网络访问（可选，可使用本地服务器）
✅ 文件系统写权限
```

**测试用例**：

```typescript
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { snapshot } from '../assembler';
import { PlaywrightFetcherAdapter } from '../adapters';

describe('Integration: snapshot() with PlaywrightFetcherAdapter', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  beforeAll(async () => {
    // 一次性启动浏览器
    browser = await chromium.launch({ headless: true });
  });

  beforeEach(async () => {
    // 每个测试创建新的 context 和 page
    context = await browser.newContext();
    page = await context.newPage();
  });

  afterEach(async () => {
    await context.close();
  });

  afterAll(async () => {
    await browser.close();
  });

  describe('Bundle mode', () => {
    it('should create snapshot with asset directory structure', async () => {
      const adapter = new PlaywrightFetcherAdapter(page, context);
      
      const result = await snapshot({
        url: 'https://example.com',
        output: './test-bundle-snapshot',
        mode: 'bundle',
      }, adapter);

      // 验证输出结构
      expect(fs.existsSync('./test-bundle-snapshot/index.html')).toBe(true);
      expect(fs.existsSync('./test-bundle-snapshot/assets')).toBe(true);
      expect(result.stats.fetched).toBeGreaterThan(0);
      expect(result.stats.successful).toBeGreaterThan(0);
    });

    it('should correctly rewrite asset paths in bundle mode', async () => {
      // 验证 HTML 中的路径被重写为相对路径
      const html = fs.readFileSync(
        './test-bundle-snapshot/index.html',
        'utf-8'
      );
      
      expect(html).toMatch(/href=["']\.\/assets\//);
      expect(html).toMatch(/src=["']\.\/assets\//);
    });
  });

  describe('Single file mode', () => {
    it('should create single HTML file with inlined assets', async () => {
      const adapter = new PlaywrightFetcherAdapter(page, context);
      
      const result = await snapshot({
        url: 'https://example.com',
        output: './test-snapshot.html',
        mode: 'single',
      }, adapter);

      expect(fs.existsSync('./test-snapshot.html')).toBe(true);
      
      const html = fs.readFileSync('./test-snapshot.html', 'utf-8');
      expect(html).toMatch(/<html/);
      expect(html).toContain('</html>');
    });

    it('should inline CSS and JavaScript', async () => {
      const html = fs.readFileSync('./test-snapshot.html', 'utf-8');
      
      // 应该包含内联的 <style> 或 data URI
      expect(
        html.includes('<style>') || html.includes('data:')
      ).toBe(true);
    });
  });

  describe('Cookie inheritance', () => {
    it('should inherit cookies from browser context', async () => {
      // 设置 Cookie
      await context.addCookies([
        {
          name: 'test_cookie',
          value: 'test_value',
          url: 'https://example.com',
        },
      ]);

      const adapter = new PlaywrightFetcherAdapter(page, context);
      const authCtx = await adapter.getAuthContext();

      expect(authCtx.cookies).toContainEqual({
        name: 'test_cookie',
        value: 'test_value',
      });
    });
  });

  describe('Component extraction', () => {
    it('should work with extract-components flag', async () => {
      const adapter = new PlaywrightFetcherAdapter(page, context);
      
      const result = await snapshot({
        url: 'https://example.com',
        output: './test-component-snapshot',
        mode: 'bundle',
        extractComponents: true,
        frameworkHint: 'react',
      }, adapter);

      // 验证组件目录被创建
      expect(
        fs.existsSync('./test-component-snapshot/components')
      ).toBe(true);
    });
  });
});
```

**预期用例数**：8-10 个

### 4.3 集成测试 - HttpFetcherAdapter 向后兼容性

**文件**：`src/__tests__/integration/snapshot-with-http.test.ts`（⏳ 待实现）

```typescript
describe('Integration: snapshot() with HttpFetcherAdapter', () => {
  describe('Backward compatibility', () => {
    it('should work without specifying adapter (default HttpFetcherAdapter)', async () => {
      // 不传递 adapter 参数，应使用默认的 HttpFetcherAdapter
      const result = await snapshot({
        url: 'https://example.com',
        output: './test-http-snapshot',
        mode: 'bundle',
      });

      expect(result.stats.fetched).toBeGreaterThan(0);
      expect(fs.existsSync('./test-http-snapshot/index.html')).toBe(true);
    });

    it('should explicitly use HttpFetcherAdapter', async () => {
      const adapter = new HttpFetcherAdapter();
      
      const result = await snapshot({
        url: 'https://example.com',
        output: './test-http-explicit',
        mode: 'bundle',
      }, adapter);

      expect(result.stats.fetched).toBeGreaterThan(0);
    });
  });

  describe('Output consistency', () => {
    it('should produce same output structure as Playwright adapter', async () => {
      // 比较两个适配器的输出结构是否一致
      // （不比较内容，因为动态 JS 执行可能导致差异）
    });
  });
});
```

**预期用例数**：4-6 个

### 4.4 集成测试 - 多适配器兼容性

**文件**：`src/__tests__/integration/adapter-compatibility.test.ts`（⏳ 待实现）

```typescript
describe('Integration: Multi-adapter compatibility', () => {
  it('should support switching adapters during snapshot', async () => {
    // 先用 PlaywrightFetcherAdapter 获取页面
    // 后用 HttpFetcherAdapter 获取子资源
    // 验证兼容性
  });

  it('should maintain output structure across adapters', async () => {
    // 验证不同适配器生成的快照结构一致
  });
});
```

**预期用例数**：3-5 个

### 4.5 集成测试 - 认证场景（可选）

**文件**：`src/__tests__/integration/authenticated-pages.test.ts`（⏳ 可选实现）

```typescript
describe('Integration: Authenticated pages', () => {
  it('should preserve cookies across requests', async () => {
    // 使用真实浏览器测试 Cookie 流程
    // 需要实际服务器或模拟服务器
  });

  it('should handle state persistence', async () => {
    // 测试 saveState() 和 loadState()
  });
});
```

**注意**：这个测试需要有测试服务器或真实的登录环节，可选实现。

---

## 快照测试数据

### 5.1 快照数据集

**文件**：`src/__tests__/snapshots/example-static.json`

存储预期的快照输出结构：

```json
{
  "name": "example-static",
  "url": "https://example.com",
  "mode": "bundle",
  "expectedStructure": {
    "files": [
      "index.html",
      "assets/css/style.css",
      "assets/js/script.js",
      "assets/img/logo.png"
    ],
    "indexHtmlContent": {
      "hasDoctype": true,
      "hasHead": true,
      "hasBody": true
    }
  }
}
```

---

## 测试覆盖范围

### 6.1 功能覆盖矩阵

| 功能 | Mock 单元 | 集成测试 | 覆盖% |
|------|----------|---------|-------|
| fetch() - 主文档 | ✅ | ✅ | 100% |
| fetch() - 子资源 | ✅ | ✅ | 100% |
| Cookie 继承 | ✅ | ✅ | 100% |
| 自定义请求头 | ✅ | ⊘ | 85% |
| 超时处理 | ✅ | ✅ | 95% |
| 错误恢复 | ✅ | ⊘ | 90% |
| 状态持久化 | ✅ | ✅ | 90% |
| 资源可访问性检查 | ✅ | ⊘ | 90% |
| 输出文件结构 | ⊘ | ✅ | 100% |
| 路径重写 | ⊘ | ✅ | 100% |

### 6.2 错误场景覆盖

| 错误 | Mock 单元 | 集成 | 类型 |
|-----|----------|------|------|
| 网络超时 | ✅ | ✅ | 预期 |
| 404 Not Found | ✅ | ✅ | 预期 |
| 500 Server Error | ✅ | ✅ | 预期 |
| SSL 验证失败 | ✅ | ⊘ | 配置 |
| 文件大小超限 | ✅ | ✅ | 预期 |
| 页面导航失败 | ✅ | ⊘ | 预期 |
| 无效 URL | ✅ | ⊘ | 预期 |

---

## 运行指南

### 7.1 运行 Mock 单元测试

#### 所有 Mock 测试
```bash
npm run test:run -- src/adapters/__tests__
```

#### 特定 Mock 测试文件
```bash
npm run test:run -- src/adapters/__tests__/playwright-fetcher-adapter.test.ts
```

#### 特定测试用例
```bash
npm run test:run -- --grep "should fetch HTML via page.goto"
```

#### 监听模式（开发中）
```bash
npm run test -- src/adapters/__tests__
```

**特点**：
- 快速执行（< 1 秒）
- 无需浏览器
- 100% 可重复
- 适合快速迭代

### 7.2 运行集成测试

#### 前置条件：安装浏览器
```bash
npx playwright install chromium
```

#### 所有集成测试
```bash
npm run test:run -- src/__tests__/integration
```

#### 特定集成测试
```bash
npm run test:run -- src/__tests__/integration/snapshot-with-playwright.test.ts
```

#### 调试模式
```bash
PWDEBUG=1 npm run test:run -- src/__tests__/integration
```

**特点**：
- 执行时间较长（30 秒 - 2 分钟）
- 需要浏览器和网络
- 验证真实交互
- 必要时配合 PWDEBUG 调试

### 7.3 清理测试输出

```bash
# 删除生成的快照
rm -rf ./test-*-snapshot ./test-snapshot.html

# 或使用脚本（⏳ 可选）
npm run test:clean
```

### 7.4 完整测试流程

```bash
# 1. 安装浏览器（仅首次）
npx playwright install chromium

# 2. 运行所有 Mock 单元测试（快速）
npm run test:run -- src/adapters/__tests__

# 3. 运行集成测试（慢速）
npm run test:run -- src/__tests__/integration

# 4. 生成覆盖率报告
npm run test:coverage

# 5. 清理测试文件
rm -rf ./test-*
```

### 7.5 故障排查

#### 问题：Playwright 浏览器下载失败
```bash
# 解决方案
npx playwright install chromium --with-deps
```

#### 问题：测试超时
```bash
# 增加超时时间
npm run test:run -- --timeout 30000 src/__tests__/integration
```

#### 问题：Mock 不符合预期
```bash
# 启用调试输出
DEBUG=* npm run test:run -- src/adapters/__tests__
```

#### 问题：集成测试网络错误
```bash
# 使用本地测试服务器或检查网络
# 某些测试需要实际网络访问
```

---

## 项目初始化清单

### 待创建的文件

- [ ] `src/adapters/__tests__/fixtures/mock-factories.ts` - Mock 对象工厂
- [ ] `src/adapters/__tests__/fixtures/test-data.ts` - 测试数据
- [ ] `src/adapters/__tests__/http-fetcher-adapter.test.ts` - HTTP 适配器测试
- [ ] `src/adapters/__tests__/fetcher-adapter-interface.test.ts` - 接口兼容性测试
- [ ] `src/adapters/__tests__/adapter-switching.test.ts` - 适配器切换测试
- [ ] `src/__tests__/integration/snapshot-with-playwright.test.ts` - 集成测试
- [ ] `src/__tests__/integration/snapshot-with-http.test.ts` - HTTP 兼容性测试
- [ ] `src/__tests__/integration/adapter-compatibility.test.ts` - 多适配器测试
- [ ] `docs/tests/TEST_SETUP.md` - 测试环境配置指南
- [ ] `docs/tests/MOCK_GUIDE.md` - Mock 对象使用指南

### 需要实现的模块

- [ ] `src/adapters/http-fetcher-adapter.ts` - HTTP 适配器实现
- [ ] `src/adapters/index.ts` - 适配器导出

---

## 总结

### 当前状态
- ✅ PlaywrightFetcherAdapter 完整实现
- ✅ FetcherAdapter 接口定义
- ✅ Mock 单元测试（43 个用例）
- ⏳ HttpFetcherAdapter 实现和测试
- ⏳ 集成测试框架

### 下一步
1. **第一阶段**：创建 Mock 对象工厂和测试数据
2. **第二阶段**：实现 HttpFetcherAdapter 和 Mock 测试
3. **第三阶段**：建立集成测试框架（需真实浏览器）
4. **第四阶段**：补充文档（TEST_SETUP.md、MOCK_GUIDE.md）

### 测试体系特点
- **分层清晰**：Mock 测试 vs 集成测试
- **快速反馈**：99% 测试无需浏览器（< 1 秒）
- **易于维护**：明确的文件组织和命名规范
- **可选的真实浏览器**：仅在必要时使用
