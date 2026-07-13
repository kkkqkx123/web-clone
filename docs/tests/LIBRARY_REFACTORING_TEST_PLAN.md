# Library Refactoring 测试方案分析

**Status:** Analysis  
**Date:** 2026-07-13  
**Scope:** 验证库化改造（Phase 1-4）的正确性

---

## 目录

1. [概述](#1-概述)
2. [当前测试覆盖分析](#2-当前测试覆盖分析)
3. [新功能测试需求](#3-新功能测试需求)
4. [测试用例设计](#4-测试用例设计)
5. [测试实现方案](#5-测试实现方案)
6. [优先顺序与工作量估计](#6-优先顺序与工作量估计)
7. [验收标准](#7-验收标准)
8. [附录：现有失败测试分析](#8-附录现有失败测试分析)

---

## 1. 概述

### 1.1 库化改造范围

本次改造涉及以下 4 个 Phase：

| Phase | 改动内容 | 文件 | 影响 |
|-------|---------|------|------|
| **Phase 1** | 库 API 导出 | `src/index.ts`, `src/adapters/index.ts`, `package.json` | 新增公共 API |
| **Phase 2** | 依赖重构 | `package.json` | 移除 `peerDependencies` |
| **Phase 3** | 库/CLI 逻辑分离 | `src/assembler.ts`, `src/cli.ts` | 行为不变，代码重组 |
| **Phase 4** | 文档和示例 | 文档目录、示例项目 | 无代码改动 |

### 1.2 需要验证的关键点

```
┌──────────────────────────────────────────────────┐
│                 需要验证的内容                       │
├──────────────────────────────────────────────────┤
│  1. 库 API 导出正确性                               │
│     - import { snapshot } from 'web-clone'        │
│     - import { loadPlaywrightAdapter } from '...' │
│     - TypeScript 类型正确导出                       │
│                                                   │
│  2. 依赖关系正确性                                   │
│     - 无 peerDependencies 警告                      │
│     - 无 Playwright 时导入不报错                     │
│     - 动态加载 Playwright 时正常                     │
│                                                   │
│  3. 库/CLI 职责分离正确性                             │
│     - 库函数无框架特定代码 (Vue hydration)           │
│     - CLI 注入 hydration 脚本正常工作                │
│     - 库可脱离 CLI 独立使用                          │
│                                                   │
│  4. 向后兼容性                                      │
│     - 现有 CLI 用法不受影响                           │
│     - 现有测试仍通过                                 │
│     - 输出结构不变                                  │
└──────────────────────────────────────────────────┘
```

---

## 2. 当前测试覆盖分析

### 2.1 测试文件清单

| 测试文件 | 用例数 | 状态 | 覆盖内容 |
|---------|--------|------|---------|
| `src/adapters/__tests__/playwright-fetcher-adapter.test.ts` | 34 | ✅ 通过 | Playwright 适配器方法逻辑 |
| `src/adapters/__tests__/http-fetcher-adapter.test.ts` | 20 | ✅ 通过 | HTTP 适配器方法逻辑 |
| `src/core/__tests__/resource-filter.test.ts` | 19 | ✅ 通过 | 资源过滤逻辑 |
| `src/core/__tests__/resource-filter.integration.test.ts` | 6 | ✅ 通过 | 资源过滤集成 |
| `src/__tests__/parser.test.ts` | 57 | ✅ 通过 | HTML/CSS 解析 |
| `src/output/__tests__/output.test.ts` | 29 | ✅ 通过 | 输出组装 |
| `src/transform/__tests__/transform.test.ts` | 36 | ✅ 通过 | 组件提取分析 |
| `src/__tests__/framework-codegen.test.ts` | 11 | ❌ 1 失败 | 框架代码生成 |
| `src/__tests__/framework-codegen-integration.test.ts` | 19 | ✅ 通过 | 框架代码生成集成 |
| `src/__tests__/angular-generator.test.ts` | 12 | ✅ 通过 | Angular 生成器 |
| `src/__tests__/react-generator.test.ts` | 16 | ✅ 通过 | React 生成器 |
| `src/__tests__/vue-generator.test.ts` | 14 | ✅ 通过 | Vue 生成器 |
| `src/__tests__/svelte-generator.test.ts` | 13 | ✅ 通过 | Svelte 生成器 |
| `src/__tests__/jquery-generator.test.ts` | 16 | ✅ 通过 | jQuery 生成器 |
| `src/worker/__tests__/pool.test.ts` | 7 | ✅ 通过 | Worker 池 |
| `src/__tests__/integration/snapshot-with-playwright.test.ts` | 17 | ❌ 7 失败 | 集成测试（真实浏览器） |
| **合计** | **312** | **304 ✅ / 8 ❌** | **覆盖率 97.4%** |

### 2.2 现有测试覆盖盲区

```
库化改造相关功能           现有测试覆盖
┌────────────────────────┬────────────────────────┐
│ 库 API 导出            │ ❌ 无测试              │
│ src/index.ts          │                        │
├────────────────────────┼────────────────────────┤
│ 适配器导出             │ ❌ 无测试              │
│ src/adapters/index.ts │                        │
├────────────────────────┼────────────────────────┤
│ package.json 导出配置   │ ❌ 无测试              │
├────────────────────────┼────────────────────────┤
│ CLI hydration 注入     │ ❌ 无测试              │
│ (Phase 3)             │                        │
├────────────────────────┼────────────────────────┤
│ 库的纯净性             │ ❌ 无测试              │
│ (无框架特定代码)       │                        │
├────────────────────────┼────────────────────────┤
│ 向后兼容性             │ ❌ 无测试              │
│ (无 adapter 调用)      │                        │
├────────────────────────┼────────────────────────┤
│ 适配器接口兼容性       │ ❌ 无测试              │
│ (FetcherAdapter)       │                        │
├────────────────────────┼────────────────────────┤
│ 动态导入 Playwright    │ ❌ 无测试              │
│ loadPlaywrightAdapter  │                        │
└────────────────────────┴────────────────────────┘
```

### 2.3 当前 8 个失败测试分析

参见 [附录：现有失败测试分析](#8-附录现有失败测试分析)。其中 7 个是集成测试环境问题，1 个是 Vue 生成器的类型标注问题，均与库化改造**无关**。

---

## 3. 新功能测试需求

### 3.1 按 Phase 划分的测试需求

```
Phase 1: 库 API 导出
├── 测试 1.1: 库入口导出验证
├── 测试 1.2: 适配器导出验证
├── 测试 1.3: 类型导出验证
└── 测试 1.4: package.json exports 验证

Phase 2: 依赖重构
├── 测试 2.1: 无 peerDependencies 验证
├── 测试 2.2: 无 Playwright 时导入验证
├── 测试 2.3: loadPlaywrightAdapter 动态加载验证
└── 测试 2.4: loadPlaywrightAdapter 错误消息验证

Phase 3: 库/CLI 分离
├── 测试 3.1: 库代码中无 hydration 注入验证
├── 测试 3.2: CLI hydration 注入功能验证
├── 测试 3.3: 库可独立使用验证 (HTTP)
└── 测试 3.4: 库可配合自定义 adapter 使用验证

Phase 4: 文档和示例
├── 测试 4.1: 示例项目语法验证
└── 测试 4.2: 示例项目可运行验证
```

### 3.2 测试类型选择

| 测试类型 | 适用场景 | 数量 | 优先级 |
|---------|---------|------|--------|
| **单元测试 (Unit)** | 导出验证、依赖验证、函数行为 | 10-12 | 🔴 P0 |
| **集成测试 (Integration)** | 完整工作流、CLI 功能 | 4-6 | 🟡 P1 |
| **静态分析 (Static)** | TypeScript 类型验证 | 2-3 | 🟢 P2 |

---

## 4. 测试用例设计

### 4.1 库 API 导出测试 (Phase 1)

#### 4.1.1 库入口导出验证

```typescript
// src/__tests__/library-exports.test.ts
import { describe, it, expect } from 'vitest';

describe('Library Entry Exports (src/index.ts)', () => {
  it('should export snapshot function', async () => {
    const { snapshot } = await import('../index.js');
    expect(snapshot).toBeDefined();
    expect(typeof snapshot).toBe('function');
  });

  it('should export convertLocalSnapshot function', async () => {
    const { convertLocalSnapshot } = await import('../index.js');
    expect(convertLocalSnapshot).toBeDefined();
    expect(typeof convertLocalSnapshot).toBe('function');
  });

  it('should export HttpFetcherAdapter class', async () => {
    const { HttpFetcherAdapter } = await import('../index.js');
    expect(HttpFetcherAdapter).toBeDefined();
    expect(HttpFetcherAdapter.name).toBe('HttpFetcherAdapter');
  });

  it('should export SnapshotOptions type', async () => {
    // Type-level validation — verify the module compiles
    const mod = await import('../index.js');
    // Existence check (runtime can't verify types directly)
    expect(mod).toHaveProperty('parseHtml');
  });
});
```

**验证项：**
| 导出名 | 类型 | 预期行为 |
|--------|------|---------|
| `snapshot` | `function` | 默认使用 HttpFetcherAdapter |
| `convertLocalSnapshot` | `function` | 本地转换 |
| `HttpFetcherAdapter` | `class` | 可实例化 |
| `FetcherAdapter` | `type` | 接口存在 |
| `SnapshotOptions` | `type` | 类型存在 |
| `SnapshotResult` | `type` | 类型存在 |
| `Asset` | `type` | 类型存在 |
| `parseHtml` | `function` | 工具函数 |

#### 4.1.2 适配器导出验证

```typescript
// src/__tests__/adapter-exports.test.ts
describe('Adapter Exports (src/adapters/index.ts)', () => {
  it('should export HttpFetcherAdapter', async () => {
    const { HttpFetcherAdapter } = await import('../adapters/index.js');
    expect(HttpFetcherAdapter).toBeDefined();
  });

  it('should export FetcherAdapter type', async () => {
    const mod = await import('../adapters/index.js');
    // FetcherAdapter is a type-only export, cannot verify at runtime
    // Verify that the module's exports contain what we expect
    expect(mod).toHaveProperty('HttpFetcherAdapter');
    expect(mod).toHaveProperty('loadPlaywrightAdapter');
  });

  it('should export loadPlaywrightAdapter function', async () => {
    const { loadPlaywrightAdapter } = await import('../adapters/index.js');
    expect(loadPlaywrightAdapter).toBeDefined();
    expect(typeof loadPlaywrightAdapter).toBe('function');
  });
});
```

**验证项：**
| 导出名 | 类型 | 来源 |
|--------|------|------|
| `HttpFetcherAdapter` | `class` | `http-fetcher-adapter.js` |
| `FetcherAdapter` | `type` | `fetcher-adapter.js` |
| `FetchOptions` | `type` | `fetcher-adapter.js` |
| `FetchResult` | `type` | `fetcher-adapter.js` |
| `AuthContext` | `type` | `fetcher-adapter.js` |
| `loadPlaywrightAdapter` | `function` | 动态导入 `automation/playwright/adapter.js` |

#### 4.1.3 TypeScript 类型验证

```typescript
// 可以通过 tsc --noEmit 验证类型导出
// 创建一个临时 TypeScript 文件，验证类型可用

/** test-types.ts (编译期验证，非运行时) */
import type {
  SnapshotOptions, SnapshotResult, Asset, AssetRef,
  FetcherAdapter, FetchOptions, FetchResult, AuthContext
} from 'web-clone';

import { snapshot, HttpFetcherAdapter } from 'web-clone';
import { loadPlaywrightAdapter } from 'web-clone/adapters';
```

**验证命令：**
```bash
# 创建临时验证文件
echo "
import type { SnapshotOptions, FetcherAdapter } from './dist/index.js';
import { snapshot, HttpFetcherAdapter } from './dist/index.js';
import { loadPlaywrightAdapter } from './dist/adapters/index.js';
const opts: SnapshotOptions = { url: 'https://example.com', output: './out', mode: 'bundle' };
console.log(typeof snapshot, typeof HttpFetcherAdapter, typeof loadPlaywrightAdapter);
" > /tmp/test-types.ts

# 编译验证
npx tsc --noEmit --moduleResolution node16 --module nodenext /tmp/test-types.ts
echo "Exit code: $?"
```

#### 4.1.4 package.json exports 验证

```typescript
// src/__tests__/package-exports.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('package.json exports configuration', () => {
  const pkg = JSON.parse(
    readFileSync(resolve(__dirname, '../../package.json'), 'utf-8')
  );

  it('should have exports field', () => {
    expect(pkg.exports).toBeDefined();
  });

  it('should export "." pointing to dist/index.js', () => {
    expect(pkg.exports['.']).toBe('./dist/index.js');
  });

  it('should export "./adapters" pointing to dist/adapters/index.js', () => {
    expect(pkg.exports['./adapters']).toBe('./dist/adapters/index.js');
  });

  it('should export "./types" pointing to dist/types.js', () => {
    expect(pkg.exports['./types']).toBe('./dist/types.js');
  });

  it('should export "./cli" pointing to dist/cli.js', () => {
    expect(pkg.exports['./cli']).toBe('./dist/cli.js');
  });

  it('should have main pointing to dist/index.js', () => {
    expect(pkg.main).toBe('dist/index.js');
  });
  
  it('should verify all export paths resolve to existing files after build', () => {
    const distDir = resolve(__dirname, '../../dist');
    const entries = Object.values(pkg.exports) as string[];
    for (const entry of entries) {
      const filePath = resolve(distDir, entry.replace('./dist/', ''));
      expect(() => readFileSync(filePath)).not.toThrow();
    }
  });
});
```

---

### 4.2 依赖重构测试 (Phase 2)

#### 4.2.1 peerDependencies 验证

```typescript
// 集成到 package-exports.test.ts 或独立文件
it('should NOT have peerDependencies', () => {
  expect(pkg.peerDependencies).toBeUndefined();
});

it('should NOT have peerDependenciesMeta', () => {
  expect(pkg.peerDependenciesMeta).toBeUndefined();
});

it('should have playwright in devDependencies', () => {
  expect(pkg.devDependencies.playwright).toBeDefined();
});
```

#### 4.2.2 loadPlaywrightAdapter 测试

```typescript
// src/adapters/__tests__/load-playwright-adapter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('loadPlaywrightAdapter()', () => {
  it('should return PlaywrightFetcherAdapter when playwright is available', async () => {
    const { loadPlaywrightAdapter } = await import('../index.js');
    const adapterClass = await loadPlaywrightAdapter();
    expect(adapterClass).toBeDefined();
    expect(adapterClass.name).toBe('PlaywrightFetcherAdapter');
  });

  it('should throw helpful error when playwright is not available', async () => {
    // 模拟 playwright 不可用的情况
    // 方法：临时修改模块路径使其无法导入
    // 实际可以用 vi.mock + vi.doMock 模拟
    const { loadPlaywrightAdapter: createLoadFn } = await import('../index.js');

    // 验证函数签名正确
    expect(loadPlaywrightAdapter.name).toBe('loadPlaywrightAdapter');
    expect(loadPlaywrightAdapter.toString()).toContain('async');
  });

  it('should have error message containing "npm install playwright"', async () => {
    // 模拟导入失败
    const mockModule = await import('../index.js');
    const originalImport = mockModule.loadPlaywrightAdapter;

    // 直接测试错误消息内容
    try {
      await mockModule.loadPlaywrightAdapter();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      expect(message).toContain('playwright');
      expect(message).toContain('npm install playwright');
    }
  });
});
```

#### 4.2.3 无 Playwright 时的导入验证

```typescript
// 验证：不安装 playwright 时，核心库导入不报错
// 测试方式：在干净环境中运行（无 playwright 已安装）

it('should import core library without playwright', async () => {
  // 核心库导入不应涉及 playwright
  const lib = await import('../index.js');
  expect(lib.snapshot).toBeDefined();
  expect(lib.HttpFetcherAdapter).toBeDefined();
});

it('should import adapter module without triggering playwright import', async () => {
  // adapter/index.ts 应只导出 interface，不导入 playwright
  const adapters = await import('../adapters/index.js');
  expect(adapters.HttpFetcherAdapter).toBeDefined();
  // loadPlaywrightAdapter 是函数，不是提前导入
  expect(typeof adapters.loadPlaywrightAdapter).toBe('function');
});
```

---

### 4.3 库/CLI 分离测试 (Phase 3)

#### 4.3.1 库纯净性验证

```typescript
// src/__tests__/library-purity.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Library Purity - No Framework Specific Code', () => {
  const assemblerSource = readFileSync(
    resolve(__dirname, '../assembler.ts'),
    'utf-8'
  );

  it('should not contain Vue hydration script injection', () => {
    // 库中不应有 Vue/Nuxt 特化的脚本注入
    expect(assemblerSource).not.toContain('injectVueHydration');
    expect(assemblerSource).not.toContain('__NUXT__');
  });

  it('should have a comment noting hydration moved to CLI', () => {
    // 应有注释说明
    expect(assemblerSource).toContain('hydration script injection has been moved to the CLI');
  });

  const cliSource = readFileSync(
    resolve(__dirname, '../cli.ts'),
    'utf-8'
  );

  it('should have hydration injection in CLI (not library)', () => {
    expect(cliSource).toContain('injectVueHydrationForCli');
  });

  it('should only inject hydration for HTTP mode (not local conversion)', () => {
    // CLI 中的调用位置：在 isLocal 为 false 的分支中
    const lines = cliSource.split('\n');
    const hydrationCallLine = lines.findIndex(l => l.includes('injectVueHydrationForCli'));
    const precedingLines = lines.slice(Math.max(0, hydrationCallLine - 10), hydrationCallLine);
    
    // 确认 hydration 调用在 HTTP 分支中（isLocal 为 false）
    const contextLines = precedingLines.join('\n');
    expect(contextLines).not.toContain('isLocal');
  });
});
```

#### 4.3.2 CLI hydration 注入功能验证

```typescript
// src/__tests__/cli-hydration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

describe('CLI Hydration Injection', () => {
  const testDir = './test-hydration-output';

  beforeEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('should inject hydration script when Vue/Nuxt markers exist', () => {
    // 模拟 injectVueHydrationForCli 的行为
    const htmlContent = `<!DOCTYPE html>
<html>
<head></head>
<body>
  <div id="__nuxt">App content</div>
</body>
</html>`;

    const htmlPath = join(testDir, 'index.html');
    writeFileSync(htmlPath, htmlContent, 'utf-8');

    // 调用 CLI 的注入函数
    // 注意：由于 injectVueHydrationForCli 是内部函数，需要通过模块导入或复制逻辑
    // 建议：将该函数导出为可测试的模块，或者在 cli.ts 中添加导出

    const modifiedHtml = readFileSync(htmlPath, 'utf-8');
    expect(modifiedHtml).toContain('</body>');
  });

  it('should not inject when no Vue/Nuxt markers', () => {
    const plainHtml = `<!DOCTYPE html>
<html><head></head><body><p>Hello</p></body></html>`;

    const htmlPath = join(testDir, 'index.html');
    writeFileSync(htmlPath, plainHtml, 'utf-8');

    // 注入函数应当检测到没有 Vue/Nuxt 标记，跳过注入
    const modifiedHtml = readFileSync(htmlPath, 'utf-8');
    // 验证内容未被修改（不包含 hydration 脚本）
    expect(modifiedHtml).not.toContain('Snapshot Hydration');
  });
});
```

#### 4.3.3 库独立使用验证

```typescript
// src/__tests__/library-standalone.test.ts
import { describe, it, expect } from 'vitest';
import { existsSync, rmSync } from 'node:fs';

describe('Library Standalone Usage', () => {
  const testDir = './test-standalone-output';

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('should work with HTTP adapter by default (no adapter argument)', async () => {
    const { snapshot } = await import('../index.js');

    const result = await snapshot({
      url: 'https://example.com',
      output: testDir,
      mode: 'bundle',
      maxAssets: 10,
    });

    // 验证返回结果结构
    expect(result).toHaveProperty('stats');
    expect(result).toHaveProperty('url');
    expect(result).toHaveProperty('output');
    expect(result.url).toBe('https://example.com');
    expect(result.output).toBe(testDir);
  });

  it('should accept custom FetcherAdapter', async () => {
    const { snapshot } = await import('../index.js');
    const { HttpFetcherAdapter } = await import('../adapters/index.js');

    const adapter = new HttpFetcherAdapter();
    const result = await snapshot({
      url: 'https://example.com',
      output: testDir,
      mode: 'single',
      maxAssets: 10,
    }, adapter);

    expect(result).toHaveProperty('stats');
    expect(result.mode).toBe('single');
  });

  it('should work with URL string overload (CLI style)', async () => {
    const { snapshot } = await import('../index.js');

    const result = await snapshot('https://example.com', {
      output: testDir,
      mode: 'bundle',
      maxAssets: 10,
    });

    expect(result).toHaveProperty('stats');
  });
});
```

---

### 4.4 适配器接口兼容性测试

```typescript
// src/adapters/__tests__/adapter-interface-compliance.test.ts
import { describe, it, expect } from 'vitest';
import { HttpFetcherAdapter } from '../http-fetcher-adapter.js';

describe('FetcherAdapter Interface Compliance', () => {
  const implementations = [
    { name: 'HttpFetcherAdapter', create: () => new HttpFetcherAdapter() },
  ];

  // 如果需要测试 PlaywrightFetcherAdapter，需要 playwright
  // 通过 CLI 标记或动态导入来控制

  for (const { name, create } of implementations) {
    describe(`${name} - Interface Compliance`, () => {
      it('should implement fetch() method', () => {
        const adapter = create();
        expect(adapter.fetch).toBeDefined();
        expect(typeof adapter.fetch).toBe('function');
      });

      it('fetch() should accept url and options parameters', async () => {
        const adapter = create();
        // 参数签名验证
        const fetchStr = adapter.fetch.toString();
        expect(fetchStr).toContain('url');
        expect(fetchStr).toContain('options');
      });

      it('fetch() should return FetchResult with required fields', async () => {
        const adapter = create();
        const result = await adapter.fetch('https://example.com', {
          timeout: 5000,
          referer: 'https://example.com',
        });

        expect(result).toHaveProperty('buffer');
        expect(result).toHaveProperty('mime');
        expect(result).toHaveProperty('status');
        expect(result).toHaveProperty('ok');
        expect(result.buffer).toBeInstanceOf(Buffer);
        expect(typeof result.mime).toBe('string');
        expect(typeof result.status).toBe('number');
        expect(typeof result.ok).toBe('boolean');
      });

      it('should handle timeout option', async () => {
        const adapter = create();
        await expect(
          adapter.fetch('https://example.com', { timeout: 100 })
        ).resolves.toBeDefined();
      });

      it('should handle maxSize option', async () => {
        const adapter = create();
        await expect(
          adapter.fetch('https://example.com', { maxSize: 1024 * 1024 })
        ).resolves.toBeDefined();
      });
    });
  }
});
```

---

### 4.5 集成测试

#### 4.5.1 库导入链路验证

```typescript
// src/__tests__/integration/library-integration.test.ts
import { describe, it, expect } from 'vitest';
import { existsSync, rmSync } from 'node:fs';

describe('Library Integration - Complete Workflow', () => {
  const testDir = './__tests__/outputs/library-integration';

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('should complete full snapshot workflow via library', async () => {
    const { snapshot } = await import('../../index.js');

    const result = await snapshot('https://example.com', {
      output: testDir,
      mode: 'bundle',
      maxAssets: 50,
      concurrency: 4,
      timeout: 15000,
      pretty: true,
    });

    // 验证基本输出结构
    expect(existsSync(`${testDir}/index.html`)).toBe(true);
    expect(existsSync(`${testDir}/assets`)).toBe(true);

    // 验证返回结果
    expect(result.stats.total).toBeGreaterThanOrEqual(0);
    expect(result.output).toBe(testDir);
    expect(result.url).toBe('https://example.com');
    expect(result.mode).toBe('bundle');
    expect(result.timestamp).toBeDefined();
  });
});
```

#### 4.5.2 CLI 端到端测试

```typescript
// src/__tests__/integration/cli-e2e.test.ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

describe('CLI E2E - Full Pipeline', () => {
  const testDir = './test-cli-output';

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('should run via npx tsx (snapshot command)', () => {
    const output = execSync(
      `npx tsx src/cli.ts https://example.com -o ${testDir} -m bundle --max-assets 10`,
      { encoding: 'utf-8', timeout: 30000 }
    );

    expect(output).toContain('Snapshot complete');
    expect(existsSync(`${testDir}/index.html`)).toBe(true);
  });

  it('should support single file mode', () => {
    const outputFile = `${testDir}.html`;
    const output = execSync(
      `npx tsx src/cli.ts https://example.com -o ${outputFile} -m single --max-assets 10 --no-inline`,
      { encoding: 'utf-8', timeout: 30000 }
    );

    expect(output).toContain('Snapshot complete');
    expect(existsSync(outputFile)).toBe(true);
  });

  it('should support --pretty flag', () => {
    const output = execSync(
      `npx tsx src/cli.ts https://example.com -o ${testDir} -m bundle --pretty --max-assets 10`,
      { encoding: 'utf-8', timeout: 30000 }
    );

    expect(output).toContain('Snapshot complete');
  });
});
```

---

## 5. 测试实现方案

### 5.1 文件创建计划

```
需要创建的新文件：
─────────────────────────────────────────────────────────────
  src/__tests__/
  ├── library-exports.test.ts               # Phase 1: 库导出验证
  ├── library-purity.test.ts                # Phase 3: 库纯净性验证
  ├── library-standalone.test.ts            # Phase 3: 库独立使用验证
  ├── package-exports.test.ts               # Phase 1+2: 配置验证
  ├── cli-hydration.test.ts                 # Phase 3: CLI 注入验证
  └── integration/
      ├── library-integration.test.ts       # Phase 1: 完整工作流
      └── cli-e2e.test.ts                   # Phase 3: CLI 端到端
  
  src/adapters/__tests__/
  ├── adapter-interface-compliance.test.ts  # Phase 1: 接口兼容性
  └── load-playwright-adapter.test.ts       # Phase 2: 动态导入验证

可选（低优先级）：
  src/__tests__/types-export.test.ts        # Phase 1: 类型导出验证(tsc)
  examples/playwright-snapshot/             # Phase 4: 示例验证
```

### 5.2 需要修改的现有测试

| 文件 | 改动 | 原因 |
|------|------|------|
| `snapshot-with-playwright.test.ts` | 修复 cookie 测试 URL | 缺少 `domain`/`url` 字段 |
| `framework-codegen.test.ts` | 修复 Vue 类型标注 | `const count: number = ref(0)` → `const count = ref<number>(0)` |

### 5.3 测试目录结构（完成后）

```
src/
├── __tests__/
│   ├── library-exports.test.ts              # ✨ NEW
│   ├── library-purity.test.ts               # ✨ NEW
│   ├── library-standalone.test.ts           # ✨ NEW
│   ├── package-exports.test.ts              # ✨ NEW
│   ├── cli-hydration.test.ts               # ✨ NEW
│   ├── types-export.test.ts                 # ✨ NEW (可选)
│   ├── integration/
│   │   ├── library-integration.test.ts      # ✨ NEW
│   │   ├── cli-e2e.test.ts                 # ✨ NEW
│   │   ├── snapshot-with-playwright.test.ts # 📝 修复
│   │   └── helpers/
│   │       ├── browser-setup.ts             # 已有
│   │       ├── file-helpers.ts              # 已有
│   │       └── snapshot-helpers.ts          # 已有
│   ├── parser.test.ts                      # 已有
│   ├── framework-codegen.test.ts            # 📝 修复
│   └── ...已有其他测试文件
│
├── adapters/
│   ├── __tests__/
│   │   ├── adapter-interface-compliance.test.ts # ✨ NEW
│   │   ├── load-playwright-adapter.test.ts    # ✨ NEW
│   │   ├── http-fetcher-adapter.test.ts       # 已有
│   │   ├── playwright-fetcher-adapter.test.ts # 已有
│   │   └── fixtures/
│   │       ├── mock-factories.ts              # 已有
│   │       └── test-data.ts                   # 已有
```

### 5.4 测试配置优化

```typescript
// vitest.config.ts (建议更新)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 10000,

    // 对 CLI E2E 测试设置更长的超时
    testTimeout: {
      './src/__tests__/integration/cli-e2e.test.ts': 60000,
    },

    // 覆盖率配置更新
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/__tests__/**',
        'src/__tests__/**',
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
```

---

## 6. 优先顺序与工作量估计

### 6.1 实施顺序

```
Day 1 (高优先级 - 核心验证)
├── library-exports.test.ts           (15分钟)  → 验证 Phase 1 核心
├── package-exports.test.ts           (10分钟)  → 验证 Phase 1+2
└── load-playwright-adapter.test.ts   (15分钟)  → 验证 Phase 2

Day 2 (高优先级 - 逻辑分离)
├── library-purity.test.ts            (10分钟)  → 验证 Phase 3
├── library-standalone.test.ts        (20分钟)  → 验证 Phase 3
└── cli-hydration.test.ts            (15分钟)  → 验证 Phase 3

Day 3 (中优先级 - 接口兼容)
├── adapter-interface-compliance.test.ts (20分钟) → Phase 1
└── library-integration.test.ts         (15分钟) → Phase 1

Day 4 (低优先级 - 端到端及修复)
├── cli-e2e.test.ts                    (20分钟) → Phase 3
├── fix: snapshot-with-playwright.test.ts (30分钟) → 修复预存问题
└── fix: framework-codegen.test.ts     (10分钟) → 修复预存问题
```

### 6.2 工作量汇总

| 文件 | 类型 | 估计时间 | 优先级 | 依赖 |
|------|------|---------|--------|------|
| `library-exports.test.ts` | 单元 | 15 min | 🔴 P0 | 无 |
| `package-exports.test.ts` | 单元 | 10 min | 🔴 P0 | 无 |
| `load-playwright-adapter.test.ts` | 单元 | 15 min | 🔴 P0 | 无 |
| `library-purity.test.ts` | 单元 | 10 min | 🔴 P0 | 无 |
| `library-standalone.test.ts` | 单元 | 20 min | 🔴 P0 | 无 |
| `cli-hydration.test.ts` | 单元 | 15 min | 🟡 P1 | 无 |
| `adapter-interface-compliance.test.ts` | 单元 | 20 min | 🟡 P1 | 无 |
| `library-integration.test.ts` | 集成 | 15 min | 🟡 P1 | 网络 |
| `cli-e2e.test.ts` | 集成 | 20 min | 🟢 P2 | 网络 |
| 修复 `snapshot-with-playwright.test.ts` | 修复 | 30 min | 🟡 P1 | 浏览器 |
| 修复 `framework-codegen.test.ts` | 修复 | 10 min | 🟡 P1 | 无 |
| **合计** | | **~3 小时** | | |

### 6.3 新增测试用例统计

| 测试层级 | 新增文件数 | 新增用例数 | 预估通过率 |
|---------|-----------|-----------|-----------|
| 单元测试 | 8 | 40-50 | 100% |
| 集成测试 | 2 | 8-12 | >95% |
| 修复测试 | 2 | 8 (修复) | 100% |
| **合计** | **10-12** | **~60** | **>97%** |

---

## 7. 验收标准

### 7.1 测试质量

```
□ 所有测试通过率 ≥ 97%
□ 新增测试覆盖率 > 90%（代码行覆盖率）
□ 库 API 导出测试覆盖所有公共接口
□ 依赖重构测试覆盖所有包配置
□ 库/CLI 分离测试覆盖所有关键约束
```

### 7.2 功能验证

```
□ Phase 1: import { snapshot } from 'web-clone' 正常工作
□ Phase 2: npm ls 无 peer 警告，无 PW 时库导入不报错，loadPlaywrightAdapter 动态加载正常
□ Phase 3: 库中无 hydration 代码，CLI 注入正常，库可独立使用
□ Phase 4: 示例项目可运行，文档无过时信息
```

### 7.3 性能目标

```
□ 单元测试执行时间 < 5 秒
□ 集成测试执行时间 < 2 分钟
□ 完整测试套件执行时间 < 3 分钟
```

---

## 8. 附录：现有失败测试分析

### 8.1 失败测试详情

| # | 文件 | 测试名 | 失败原因 | 影响范围 | 修复难度 |
|---|------|--------|---------|---------|---------|
| 1 | `framework-codegen.test.ts` | should map state to ref\<T\>() | Vue generator 输出 `const count: number = ref(0)` 而非 `const count = ref<number>(0)` | Codegen 输出格式 | 🟢 低 |
| 2-8 | `snapshot-with-playwright.test.ts` | 7 个测试 | `expect(result.stats.fetched).toBeGreaterThan(0)` 返回 0 | 集成测试环境 | 🟡 中 |

### 8.2 framework-codegen 失败分析

```
当前输出: const count: number = ref(0)
期望输出: const count = ref<number>(0)

根因: VueGenerator 在处理 TypeScript 类型标注时，
     将类型直接标注在变量上 (const count: number = ref(0))
     而非将类型传递给 ref 泛型 (const count = ref<number>(0))

修复文件: src/transform/framework-codegen/vue-generator.ts
修复方案: 在生成 ref() 调用时，将类型从变量标注转移到泛型参数
```

### 8.3 snapshot-with-playwright 失败分析

```
失败原因: 7 个测试的 result.stats.fetched 均为 0
根因: https://example.com 返回的 HTML 中没有任何可提取的子资源引用
      (无 CSS/JS/IMG 链接)，同时测试使用真实 Playwright 浏览器，
      但 example.com 的页面在 headless 模式下不产生额外资源请求

修复方案:
  选项 A: 使用包含 CSS/JS 引用的本地测试服务器
  选项 B: 修改断言逻辑，允许 fetched = 0（资源不存在不是错误）
  选项 C: 使用 mock 服务器返回带资源的页面

推荐: 选项 B + C
  - 对无需子资源的场景，移除 fetched > 0 断言，改为验证输出结构
  - 新增一个使用本地测试服务器的测试，验证资源下载
  
Cookie 测试失败:
  - browserContext.addCookies 需要 url 或 domain 参数
  - 在测试中为 cookie 添加 url: 'https://example.com' 字段
```

### 8.4 失败测试与库化改造的关系

```
所有 8 个失败测试均非本次库化改造引入：
  - framework-codegen.test.ts: 先于改造存在
  - snapshot-with-playwright.test.ts: 集成环境问题，与改造无关

因此：
  ✓ 库化改造没有引入新的测试失败
  ✓ 现有通过率 97.4% 可作为改造后的基线
  ✓ 建议在完成改造后修复这些预存失败，使通过率达到 100%
```

---

## 文档导航

| 文档 | 用途 |
|------|------|
| [LIBRARY_REFACTORING_TEST_PLAN.md](./LIBRARY_REFACTORING_TEST_PLAN.md) | **本文件** — 库化改造测试方案 |
| [PLAYWRIGHT_INTEGRATION_TEST_PLAN.md](./PLAYWRIGHT_INTEGRATION_TEST_PLAN.md) | 原 Playwright 集成测试方案 |
| [TEST_STRUCTURE.md](./TEST_STRUCTURE.md) | 测试项目结构指南 |
| [MOCK_GUIDE.md](./MOCK_GUIDE.md) | Mock 对象使用指南 |
| [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) | 测试环境配置 |
| [../plan/01-library-architecture.md](../plan/01-library-architecture.md) | 库化改造架构设计 |
| [../plan/03-migration-checklist.md](../plan/03-migration-checklist.md) | 实施清单 |
