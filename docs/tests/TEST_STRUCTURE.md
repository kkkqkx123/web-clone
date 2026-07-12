# 测试项目结构指南

## 概述

本文档详细说明如何组织 Playwright 集成测试项目结构，确保测试代码清晰、易于维护和扩展。

---

## 1. 完整目录结构

```
web-clone/
├── src/
│   ├── adapters/
│   │   ├── __tests__/                          # Mock 单元测试区域
│   │   │   ├── fixtures/                       # 测试数据和工厂
│   │   │   │   ├── mock-factories.ts          # Mock 对象创建工厂
│   │   │   │   ├── test-data.ts               # 常用测试数据集
│   │   │   │   └── README.md                  # Fixtures 说明文档
│   │   │   │
│   │   │   ├── snapshots/                      # Mock 快照（可选）
│   │   │   │   └── *.json                     # 测试数据快照
│   │   │   │
│   │   │   ├── playwright-fetcher-adapter.test.ts      # ✅ 已完成
│   │   │   ├── http-fetcher-adapter.test.ts             # ⏳ 待实现
│   │   │   ├── fetcher-adapter-interface.test.ts        # ⏳ 待实现
│   │   │   ├── adapter-switching.test.ts                # ⏳ 待实现
│   │   │   └── README.md                      # 单元测试说明
│   │   │
│   │   ├── playwright-fetcher-adapter.ts      # ✅ 实现
│   │   ├── http-fetcher-adapter.ts            # ⏳ 待实现
│   │   ├── fetcher-adapter.ts                 # ✅ 接口
│   │   ├── index.ts                           # 导出
│   │   └── README.md
│   │
│   ├── __tests__/                             # 集成测试区域（需真实浏览器）
│   │   ├── integration/                       # 集成测试组
│   │   │   ├── helpers/                       # 集成测试辅助函数
│   │   │   │   ├── browser-setup.ts           # 浏览器启动/关闭
│   │   │   │   ├── snapshot-helpers.ts        # 快照验证工具
│   │   │   │   └── file-helpers.ts            # 文件系统工具
│   │   │   │
│   │   │   ├── snapshots/                     # 预期输出数据
│   │   │   │   ├── example-static.json
│   │   │   │   ├── example-spa.json
│   │   │   │   └── example-authenticated.json
│   │   │   │
│   │   │   ├── snapshot-with-playwright.test.ts       # ⏳ 待实现
│   │   │   ├── snapshot-with-http.test.ts             # ⏳ 待实现
│   │   │   ├── adapter-compatibility.test.ts          # ⏳ 待实现
│   │   │   ├── authenticated-pages.test.ts            # ⏳ 可选
│   │   │   └── README.md                     # 集成测试说明
│   │   │
│   │   └── cleanup.ts                         # 测试后清理脚本
│   │
│   ├── assembler.ts
│   ├── cli.ts
│   ├── types.ts
│   └── ...其他源文件
│
├── docs/
│   ├── tests/
│   │   ├── PLAYWRIGHT_INTEGRATION_TEST_PLAN.md    # ✅ 主测试计划
│   │   ├── TEST_STRUCTURE.md                      # ✅ 本文档
│   │   ├── MOCK_GUIDE.md                          # ⏳ Mock 使用指南
│   │   ├── BROWSER_INTEGRATION_GUIDE.md           # ⏳ 浏览器集成指南
│   │   └── TEST_SETUP.md                          # ⏳ 环境配置
│   └── ...其他文档
│
├── e2e/ (可选)
│   ├── real-website.test.ts
│   └── fixtures/
│
├── package.json
├── vitest.config.ts (或 vitest.config.js)
├── tsconfig.json
└── .gitignore
```

---

## 2. 各层级详细说明

### 2.1 单元测试层（Mock 为主）

**位置**：`src/adapters/__tests__/`

#### 职责
- 使用 Mock 对象测试适配器方法
- 快速验证单个方法逻辑
- 无需真实浏览器
- 无需网络访问

#### 文件说明

**`mock-factories.ts`** - Mock 对象工厂
```typescript
// 创建可重用的 Mock 对象
export function createMockPage() { ... }
export function createMockContext() { ... }
export const MOCK_RESULTS = { ... }
```
**用途**：减少测试代码重复，保证 Mock 一致性

**`test-data.ts`** - 测试数据集
```typescript
// 存储常用的测试数据
export const TEST_URLS = { ... }
export const TEST_HEADERS = { ... }
export const TEST_COOKIES = [ ... ]
```
**用途**：集中管理测试数据，便于维护和复用

**`*.test.ts`** - 测试文件
```typescript
// 每个待测模块对应一个测试文件
// 例如：http-fetcher-adapter.test.ts 对应 http-fetcher-adapter.ts
```

#### 文件命名规范
```
✓ <模块名>.test.ts    例如：http-fetcher-adapter.test.ts
✓ fixtures/          例如：fixtures/mock-factories.ts
✓ snapshots/         例如：snapshots/expected-output.json
```

#### 示例测试结构
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPage, MOCK_RESULTS } from './fixtures/mock-factories';
import { TEST_URLS } from './fixtures/test-data';
import { HttpFetcherAdapter } from '../http-fetcher-adapter';

describe('HttpFetcherAdapter', () => {
  let mockPage;
  let adapter;

  beforeEach(() => {
    mockPage = createMockPage();
    adapter = new HttpFetcherAdapter();
  });

  describe('fetch()', () => {
    it('should fetch resource with timeout', async () => {
      // 测试逻辑
    });
  });
});
```

### 2.2 集成测试层（需要真实浏览器）

**位置**：`src/__tests__/integration/`

#### 职责
- 使用真实 Playwright 浏览器
- 验证适配器与快照管道交互
- 验证输出文件结构
- 测试完整工作流

#### 文件说明

**`helpers/browser-setup.ts`** - 浏览器生命周期管理
```typescript
// 启动、关闭、复用浏览器
export async function setupBrowser() { ... }
export async function teardownBrowser() { ... }
```

**`helpers/snapshot-helpers.ts`** - 快照验证工具
```typescript
// 验证输出结构、文件内容等
export function validateBundleStructure() { ... }
export function validateSingleFileFormat() { ... }
```

**`helpers/file-helpers.ts`** - 文件系统工具
```typescript
// 文件操作辅助函数
export function readSnapshot() { ... }
export function compareSnapshots() { ... }
```

**`snapshots/*.json`** - 预期输出数据
```json
{
  "name": "example-static",
  "expectedStructure": { ... }
}
```

**`*.test.ts`** - 集成测试文件
```typescript
// 测试适配器与快照管道的交互
// 例如：snapshot-with-playwright.test.ts
```

#### 文件命名规范
```
✓ <功能名>.test.ts           例如：snapshot-with-playwright.test.ts
✓ helpers/<功能>.ts          例如：helpers/browser-setup.ts
✓ snapshots/<场景>.json      例如：snapshots/example-static.json
```

#### 示例集成测试结构
```typescript
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupBrowser } from './helpers/browser-setup';
import { validateBundleStructure } from './helpers/snapshot-helpers';

describe('Integration: snapshot() with PlaywrightFetcherAdapter', () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await setupBrowser();
  });

  afterAll(async () => {
    await browser.close();
  });

  describe('Bundle mode', () => {
    it('should create bundle with correct structure', async () => {
      // 测试逻辑
      const result = await snapshot({ ... }, adapter);
      
      // 使用辅助函数验证
      await validateBundleStructure('./test-output');
      
      expect(result.stats.fetched).toBeGreaterThan(0);
    });
  });
});
```

### 2.3 文档层

**位置**：`docs/tests/`

#### 文件说明

| 文件 | 用途 |
|------|------|
| `PLAYWRIGHT_INTEGRATION_TEST_PLAN.md` | 总体测试计划（已完成） |
| `TEST_STRUCTURE.md` | 项目结构指南（本文件） |
| `MOCK_GUIDE.md` | Mock 对象使用指南（待创建） |
| `BROWSER_INTEGRATION_GUIDE.md` | 真实浏览器集成指南（待创建） |
| `TEST_SETUP.md` | 测试环境配置（待创建） |

---

## 3. 测试文件组织原则

### 3.1 何时创建新文件

**创建新测试文件的条件**：
- ✅ 测试新模块 → 创建 `<module>.test.ts`
- ✅ 超过 500 行 → 拆分为多个文件
- ✅ 不同关注点 → 拆分为不同文件

**不应该创建新文件的情况**：
- ❌ 简单补充测试 → 添加到现有文件
- ❌ 辅助函数 → 放入 `fixtures/`
- ❌ 测试数据 → 放入 `test-data.ts`

### 3.2 文件大小指南

```
小 (< 200 行)：单个测试文件或 fixtures
中 (200-500 行)：多个相关测试用例
大 (> 500 行)：应该拆分为多个文件
```

### 3.3 导入路径最佳实践

```typescript
// ❌ 坏的做法：相对路径过长
import { createMockPage } from '../../__tests__/fixtures/mock-factories';

// ✅ 好的做法：清晰的相对路径
import { createMockPage } from './fixtures/mock-factories';

// ✅ 很好的做法：使用 TypeScript 路径别名（如已配置）
import { createMockPage } from '@/adapters/__tests__/fixtures/mock-factories';
```

---

## 4. 依赖关系图

### 4.1 Mock 单元测试依赖

```
playwright-fetcher-adapter.test.ts
  ├── fixtures/mock-factories.ts
  ├── fixtures/test-data.ts
  └── ../playwright-fetcher-adapter.ts

http-fetcher-adapter.test.ts
  ├── fixtures/mock-factories.ts
  ├── fixtures/test-data.ts
  └── ../http-fetcher-adapter.ts
```

### 4.2 集成测试依赖

```
snapshot-with-playwright.test.ts
  ├── helpers/browser-setup.ts
  ├── helpers/snapshot-helpers.ts
  ├── snapshots/example-*.json
  ├── ../../assembler.ts
  └── ../../adapters/playwright-fetcher-adapter.ts
```

---

## 5. 测试数据管理

### 5.1 Mock 结果管理

**位置**：`src/adapters/__tests__/fixtures/mock-factories.ts`

```typescript
export const MOCK_RESULTS = {
  // 基础响应
  html: () => ({
    buffer: Buffer.from('<html>...</html>'),
    mime: 'text/html',
    status: 200,
    ok: true,
  }),
  
  css: () => ({
    buffer: Buffer.from('body {}'),
    mime: 'text/css',
    status: 200,
    ok: true,
  }),
  
  // 错误响应
  error404: () => ({
    buffer: Buffer.from('Not Found'),
    mime: 'text/html',
    status: 404,
    ok: false,
  }),
  
  // 自定义响应
  custom: (overrides) => ({
    buffer: Buffer.from('...'),
    mime: 'text/plain',
    status: 200,
    ok: true,
    ...overrides,
  }),
};
```

### 5.2 预期快照管理

**位置**：`src/__tests__/integration/snapshots/`

```json
{
  "name": "example-static",
  "url": "https://example.com",
  "mode": "bundle",
  "expectedStructure": {
    "files": [
      "index.html",
      "assets/css/main.css",
      "assets/js/app.js"
    ],
    "validations": {
      "htmlHasDoctype": true,
      "cssInlined": false,
      "jsInlined": false
    }
  },
  "metadata": {
    "lastUpdated": "2024-01-15",
    "maintainer": "team"
  }
}
```

---

## 6. 测试生命周期

### 6.1 Mock 单元测试生命周期

```
beforeAll
  ↓
beforeEach (为每个测试创建新 Mock)
  ↓
it() (执行单个测试)
  ↓
afterEach (清理)
  ↓
[循环回 beforeEach 直到所有 it() 完成]
  ↓
afterAll
```

### 6.2 集成测试生命周期

```
beforeAll (启动浏览器 - 仅一次)
  ↓
beforeEach (创建新 context/page)
  ↓
it() (执行测试 - 使用真实浏览器)
  ↓
afterEach (关闭 context)
  ↓
[循环回 beforeEach 直到所有 it() 完成]
  ↓
afterAll (关闭浏览器)
```

### 6.3 最佳实践

**Mock 单元测试**：
```typescript
describe('HttpFetcherAdapter', () => {
  let adapter;

  beforeEach(() => {
    // 为每个测试创建新实例
    adapter = new HttpFetcherAdapter();
  });

  // 不需要 afterEach，Mock 自动清理
});
```

**集成测试**：
```typescript
describe('Integration tests', () => {
  let browser;
  let context;

  beforeAll(async () => {
    // 共享浏览器实例（昂贵资源）
    browser = await chromium.launch();
  });

  beforeEach(async () => {
    // 每个测试新建 context（轻量级）
    context = await browser.newContext();
  });

  afterEach(async () => {
    // 清理 context
    await context.close();
  });

  afterAll(async () => {
    // 关闭浏览器
    await browser.close();
  });
});
```

---

## 7. 配置文件

### 7.1 vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Mock 单元测试配置
    globals: true,
    environment: 'node',
    
    // 超时设置
    testTimeout: 5000,           // 单元测试：5秒
    hookTimeout: 10000,          // Hook：10秒
    
    // 并发设置
    threads: true,
    maxThreads: 4,
    minThreads: 1,
    
    // 覆盖率
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/__tests__/**',
      ],
    },
  },
});
```

**用于集成测试的配置** (可选 `vitest.config.integration.ts`):
```typescript
export default defineConfig({
  test: {
    testTimeout: 30000,    // 集成测试：30秒
    globals: true,
    // 集成测试不使用线程化
    threads: false,
    // 集成测试顺序执行
    singleThread: true,
  },
});
```

### 7.2 package.json 脚本

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:unit": "vitest run src/adapters/__tests__",
    "test:integration": "vitest run src/__tests__/integration --timeout 30000",
    "test:all": "npm run test:unit && npm run test:integration",
    "test:coverage": "vitest run --coverage",
    "test:debug": "vitest --inspect-brk --inspect --single-thread",
    "test:clean": "rm -rf ./test-* ./coverage"
  }
}
```

---

## 8. 快速参考

### 8.1 添加新的 Mock 单元测试

**步骤**：

1. 创建测试文件
```bash
touch src/adapters/__tests__/my-adapter.test.ts
```

2. 引入 fixtures
```typescript
import { createMockPage, MOCK_RESULTS } from './fixtures/mock-factories';
import { TEST_URLS, TEST_HEADERS } from './fixtures/test-data';
```

3. 编写测试
```typescript
describe('MyAdapter', () => {
  beforeEach(() => {
    // 设置
  });

  it('should do something', async () => {
    // 测试
  });
});
```

4. 运行测试
```bash
npm run test:unit -- my-adapter.test.ts
```

### 8.2 添加新的集成测试

**步骤**：

1. 创建测试文件
```bash
touch src/__tests__/integration/my-feature.test.ts
```

2. 设置浏览器
```typescript
import { chromium } from 'playwright';
import { setupBrowser } from './helpers/browser-setup';

describe('My feature', () => {
  let browser;

  beforeAll(async () => {
    browser = await setupBrowser();
  });

  afterAll(async () => {
    await browser.close();
  });
});
```

3. 编写测试
```typescript
it('should work', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // 测试逻辑
  
  await context.close();
});
```

4. 运行测试
```bash
npm run test:integration -- my-feature.test.ts
```

---

## 9. 常见问题

### Q1：Mock 单元测试和集成测试的区别？

| 方面 | Mock 单元测试 | 集成测试 |
|------|--------------|---------|
| 浏览器 | ❌ Mock | ✅ 真实 |
| 网络 | ❌ Mock | ✅ 真实 |
| 速度 | ⚡ 快（< 1秒） | 🐢 慢（30秒+） |
| 维护 | ✓ 简单 | ⚠️ 复杂 |
| 调试 | ✓ 容易 | ⚠️ 困难 |

### Q2：何时应该写集成测试？

✅ 必须有集成测试：
- 验证与真实浏览器的交互
- 验证完整的快照输出

❌ 可以只有 Mock 测试：
- 单个方法的逻辑
- 参数验证
- 错误处理

### Q3：如何快速调试测试？

**Mock 单元测试**：
```bash
PWDEBUG=1 npm run test -- --grep "test name"
```

**集成测试**：
```bash
PWDEBUG=1 npm run test:integration
```

### Q4：如何跳过某些测试？

```typescript
// 跳过单个测试
it.skip('should do something', () => { ... });

// 仅运行某个测试
it.only('should do something', () => { ... });

// 标记为待实现
it.todo('should do something in future');
```

---

## 10. 总结

### 关键要点

✅ **分层清晰**
- Mock 单元测试（快速，无依赖）
- 集成测试（全面，需浏览器）

✅ **易于维护**
- 统一的 fixtures 和测试数据
- 清晰的命名约定
- 明确的文件组织

✅ **高效开发**
- 快速的 Mock 测试反馈
- 可选的真实浏览器验证

✅ **可扩展**
- 新测试易于添加
- 新 Mock 易于创建
- 新 fixtures 易于共享
