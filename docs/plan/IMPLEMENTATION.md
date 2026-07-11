# web-clone v2.0 实现方案

**版本**：2.0  
**日期**：2026-07-11  
**状态**：执行中

---

## 概述

本文档说明如何在现有的Phase 1和Phase 2代码基础上，完成v2.0版本的实现。

关键变化：
- 保留Phase 1/2的适配器代码（内部实现）
- 在assembler.ts中创建三个API函数
- 修改导出策略（隐藏内部细节）

---

## 第一部分：Phase 1/2代码的现状

### 现有代码清单

```
src/adapters/
├── fetcher-adapter.ts                    ✓ 已完成
├── http-fetcher-adapter.ts               ✓ 已完成
├── playwright-fetcher-adapter.ts         ✓ 已完成
├── index.ts                              ✓ 已完成
└── __tests__/
    ├── http-fetcher-adapter.test.ts      ✓ 已完成
    └── playwright-fetcher-adapter.test.ts ✓ 已完成
```

### 代码质量评估

| 组件 | 状态 | 修改需求 |
|------|------|---------|
| FetcherAdapter接口 | ✓ 优秀 | 保留（标记为内部） |
| HttpFetcherAdapter | ✓ 优秀 | 保留（标记为内部） |
| PlaywrightFetcherAdapter | ✓ 优秀 | 保留（导出给高级用户） |
| 单元测试 | ✓ 完整 | 保留 |
| 导出策略 | ⚠ 需调整 | **修改** |

---

## 第二部分：代码修改方案

### 修改项1：src/adapters/index.ts

**当前状态**：导出所有接口和类

**修改方案**：只导出用户需要的部分

```typescript
/**
 * 适配器层导出
 * 
 * 注意：FetcherAdapter 和 HttpFetcherAdapter 是内部实现，
 * 不在这里导出。PlaywrightFetcherAdapter 是公开API。
 */

// 仅导出Playwright相关
export { PlaywrightFetcherAdapter } from './playwright-fetcher-adapter.js';
export type { PlaywrightAdapterOptions } from './playwright-fetcher-adapter.js';

// 注：FetcherAdapter等内部接口在assembler.ts中import使用
```

### 修改项2：src/types.ts

**当前状态**：导出所有adapter类型

**修改方案**：只保留用户需要的类型

```typescript
// 删除这些导出：
// export type { FetcherAdapter, FetchOptions, FetchResult, AuthContext }

// 保留这些导出：
export { PlaywrightFetcherAdapter } from './adapters/playwright-fetcher-adapter.js';
export type { PlaywrightAdapterOptions } from './adapters/playwright-fetcher-adapter.js';

// ... 其他现有类型保留
```

### 修改项3：src/assembler.ts

**当前状态**：只有一个snapshot()函数

**修改方案**：添加三个API函数

```typescript
// 内部导入（不导出）
import { FetcherAdapter } from './adapters/fetcher-adapter.js';
import { HttpFetcherAdapter } from './adapters/http-fetcher-adapter.js';
import { PlaywrightFetcherAdapter } from './adapters/playwright-fetcher-adapter.js';
import type { PlaywrightAdapterOptions } from './adapters/playwright-fetcher-adapter.js';

// ============================================
// 公开 API 函数
// ============================================

/**
 * 基础快照 - 使用HTTP直接拉取
 * @public
 */
export async function snapshot(
  url: string,
  options: SnapshotOptions
): Promise<SnapshotResult> {
  const httpAdapter = new HttpFetcherAdapter();
  return snapshotInternal(url, options, httpAdapter);
}

/**
 * Playwright快照 - 支持认证、Cookie、JS执行
 * @public
 */
export async function snapshotWithPlaywright(
  url: string,
  options: SnapshotOptions,
  playwrightOptions?: PlaywrightSnapshotOptions
): Promise<SnapshotResult> {
  const {
    browserLaunchOptions,
    contextOptions,
    setupAuth,
    adapterOptions,
  } = playwrightOptions || {};

  const browser = await chromium.launch(browserLaunchOptions);
  const context = await browser.newContext(contextOptions);

  try {
    // 可选：执行自定义认证
    if (setupAuth) {
      const page = await context.newPage();
      await setupAuth(page, context);
      await page.close();
    }

    const page = await context.newPage();
    const adapter = new PlaywrightFetcherAdapter(page, context, adapterOptions);

    try {
      return await snapshotInternal(url, options, adapter);
    } finally {
      await adapter.dispose();
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

/**
 * 使用自己的浏览器上下文进行快照
 * 适合需要对浏览器生命周期完全控制的场景
 * @public
 */
export async function snapshotWithBrowserContext(
  url: string,
  options: SnapshotOptions,
  browserContext: BrowserContext
): Promise<SnapshotResult> {
  const page = await browserContext.newPage();
  const adapter = new PlaywrightFetcherAdapter(page, browserContext);

  try {
    return await snapshotInternal(url, options, adapter);
  } finally {
    await adapter.dispose();
  }
}

// ============================================
// 内部函数
// ============================================

/**
 * 内部核心管道（不导出）
 * 由三个公开API共享
 * @internal
 */
async function snapshotInternal(
  url: string,
  options: SnapshotOptions,
  adapter: FetcherAdapter
): Promise<SnapshotResult> {
  // ... 现有的snapshot()逻辑
}
```

**类型定义**：
```typescript
interface PlaywrightSnapshotOptions {
  browserLaunchOptions?: import('playwright').LaunchOptions;
  contextOptions?: import('playwright').BrowserContextOptions;
  setupAuth?: (
    page: import('playwright').Page,
    context: import('playwright').BrowserContext
  ) => Promise<void>;
  adapterOptions?: PlaywrightAdapterOptions;
}
```

### 修改项4：src/index.ts

**新增或修改**（如果已存在）：

```typescript
/**
 * web-clone 库入口
 * 导出三个主要API和相关类型
 */

// 核心API
export {
  snapshot,
  snapshotWithPlaywright,
  snapshotWithBrowserContext,
  convertLocalSnapshot,  // 保持现有
} from './assembler.js';

// 导出需要的类型
export type {
  SnapshotOptions,
  SnapshotResult,
  SnapshotMode,
  Asset,
  AssetRef,
  ComponentSpec,
  // ... 其他现有类型
} from './types.js';

// 导出Playwright相关
export { PlaywrightFetcherAdapter } from './adapters/index.js';
export type { PlaywrightAdapterOptions } from './adapters/index.js';

// 导出一些工具函数（可选）
export { parseHtml } from './parser/html-parser.js';
export { extractCssAssets } from './parser/css-parser.js';
```

---

## 第三部分：代码修改清单

### 需要修改的文件

| 文件 | 修改类型 | 优先级 | 估计时间 |
|------|---------|--------|---------|
| src/adapters/index.ts | 修改导出 | P0 | 15分钟 |
| src/types.ts | 修改导出 | P0 | 15分钟 |
| src/assembler.ts | 添加3个函数 + 重构核心逻辑 | P0 | 2-3小时 |
| src/index.ts | 新增或修改 | P0 | 30分钟 |
| src/cli.ts | 检查（可能无需改） | P1 | 30分钟 |

### 无需修改的文件

- src/adapters/fetcher-adapter.ts ✓
- src/adapters/http-fetcher-adapter.ts ✓
- src/adapters/playwright-fetcher-adapter.ts ✓
- src/adapters/__tests__/*.test.ts ✓
- src/parser/* ✓
- src/output/* ✓
- src/transform/* ✓
- src/validators.ts ✓
- src/fetcher.ts ✓

---

## 第四部分：修改细节 - assembler.ts

### 4.1 现有snapshot()函数的重构

**当前**（假设）：
```typescript
export async function snapshot(
  options: SnapshotOptions
): Promise<SnapshotResult> {
  // ... 核心逻辑
}
```

**修改为**：
```typescript
export async function snapshot(
  url: string,
  options: SnapshotOptions
): Promise<SnapshotResult> {
  const httpAdapter = new HttpFetcherAdapter();
  return snapshotInternal(url, options, httpAdapter);
}
```

**注意**：如果现有代码的options包含url字段，需要调整。

### 4.2 提取snapshotInternal()

把现有的核心逻辑提取为`snapshotInternal()`：

```typescript
async function snapshotInternal(
  url: string,
  options: SnapshotOptions,
  adapter: FetcherAdapter
): Promise<SnapshotResult> {
  // 1. 获取 HTML
  const html = await fetchHtml(url, options, adapter);
  if (!html) {
    throw new Error(`Failed to fetch HTML from ${url}`);
  }

  // 2. 解析资源引用
  const refs = parseHtml(html, url);

  // 3. 递归提取 CSS
  const cssRefs = await extractCssAssets(refs, adapter, options);

  // 4. 去重
  const allRefs = dedupe([...refs, ...cssRefs]);

  // 5. 下载资源
  const assets = await downloadAllAssets(allRefs, adapter, options);

  // 6. 组装输出
  return assembleOutput(html, assets, options);
}
```

### 4.3 修改核心函数以使用adapter

需要确保以下函数接收并使用adapter：

- `fetchHtml(url, options, adapter)` - 使用adapter.fetch()
- `extractCssAssets(refs, adapter, options)` - 使用adapter.fetch()
- `downloadAllAssets(refs, adapter, options)` - 使用adapter.fetch()

这些函数**可能已经做了**（如果Phase 1/2已经完成）。

---

## 第五部分：测试修改方案

### 单元测试

不需要修改现有的adapter测试（Phase 1/2）。

新增一个测试文件来验证三个API函数：

**src/__tests__/api.test.ts**:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  snapshot,
  snapshotWithPlaywright,
  snapshotWithBrowserContext,
} from '../assembler.js';

describe('web-clone API', () => {
  describe('snapshot()', () => {
    it('should work with HTTP adapter (backward compatible)', async () => {
      const result = await snapshot('https://example.com', {
        output: './test-snapshot',
        mode: 'bundle',
        // ... 其他选项
      });
      
      expect(result).toBeDefined();
      expect(result.stats).toBeDefined();
    });
  });

  describe('snapshotWithPlaywright()', () => {
    it('should use Playwright for snapshot', async () => {
      // 这个测试需要mock Playwright对象
      // 可能无法在简单的单元测试中完成
    });
  });

  describe('snapshotWithBrowserContext()', () => {
    it('should use provided BrowserContext', async () => {
      // 这个测试需要mock Playwright对象
    });
  });
});
```

### 集成测试

在 `tests/e2e/` 中创建简单的集成测试：

```typescript
// tests/e2e/api-integration.test.ts
import { snapshot, snapshotWithPlaywright } from 'web-clone';

describe('API integration', () => {
  it('snapshot() should fetch and snapshot a public page', async () => {
    // 可选：使用真实网站测试
  });

  it('snapshotWithPlaywright() should handle auth', async () => {
    // 可选：使用测试网站或mock服务器
  });
});
```

---

## 第六部分：向后兼容性检查

### CLI验证

CLI调用`snapshot()`时，需要确保传入的参数兼容：

**cli.ts中可能的代码**：
```typescript
// 如果原来这样调用：
const result = await snapshot(options);

// 需要改为：
const result = await snapshot(options.url, options);
```

或者，如果options中没有url字段，需要从别处获取。

### 库用户兼容性

检查是否有用户直接调用过`snapshot(options)`的形式。如果有，需要：

1. 创建一个兼容层（检查参数类型）
2. 发布v2.0时在CHANGELOG中说明破坏性变更
3. 提供迁移指南

---

## 第七部分：实现步骤（推荐顺序）

### 步骤1：修改导出策略（30分钟）

1. 修改 `src/adapters/index.ts` - 只导出Playwright相关
2. 修改 `src/types.ts` - 隐藏内部类型

**验证**：编译正常，无新的导入错误

### 步骤2：重构assembler.ts（2-3小时）

1. 提取`snapshotInternal()`函数
2. 修改现有的`snapshot()`以调用`snapshotInternal()`
3. 添加`snapshotWithPlaywright()`函数
4. 添加`snapshotWithBrowserContext()`函数

**验证**：单元测试通过

### 步骤3：创建或更新库入口（30分钟）

1. 创建或修改 `src/index.ts`
2. 导出三个API和相关类型

**验证**：能正常import

### 步骤4：验证CLI兼容性（30分钟）

1. 检查 `src/cli.ts` 的调用
2. 必要时调整参数传递
3. 测试CLI命令

**验证**：`npm run dev -- <url>` 正常工作

### 步骤5：编写集成测试（1小时）

1. 为三个API编写基本测试
2. 验证向后兼容性

**验证**：所有测试通过

---

## 第八部分：性能和资源

### 预期工作量

| 任务 | 时间 | 优先级 |
|------|------|--------|
| 修改导出 | 0.5小时 | P0 |
| 重构assembler | 2-3小时 | P0 |
| 创建入口 | 0.5小时 | P0 |
| CLI验证 | 0.5小时 | P1 |
| 集成测试 | 1小时 | P1 |
| **总计** | **4-5小时** | |

### 风险评估

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| CLI兼容性破坏 | 中 | 高 | 提前测试 |
| 参数传递错误 | 低 | 中 | 单元测试 |
| 类型错误 | 低 | 中 | TypeScript检查 |

---

## 第九部分：检查清单

实现完成后，检查以下项目：

- [ ] `src/adapters/index.ts` 修改完成
- [ ] `src/types.ts` 修改完成  
- [ ] `src/assembler.ts` 添加三个API函数
- [ ] `src/index.ts` 创建或修改
- [ ] `src/cli.ts` 兼容性验证
- [ ] TypeScript编译无错误
- [ ] 所有现有测试通过
- [ ] 新增集成测试通过
- [ ] CLI命令能正常运行
- [ ] 代码文档完整

---

## 第十部分：下一步

完成本阶段后：

1. **Phase 3完成** ✓
   - 三个API函数已实现
   - 向后兼容性已验证
   - 代码已重构

2. **后续工作**（可选）
   - 更新README文档
   - 添加使用示例
   - 发布npm包
   - 收集用户反馈

---

**最后更新**：2026-07-11  
**状态**：准备实施  
**下一步**：开始修改代码
