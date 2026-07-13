# 分阶段迁移实施计划 — Monorepo 方案 C

**状态:** 就绪  
**日期:** 2026-07-13  
**基准:** [MONOREPO_DESIGN.md](./MONOREPO_DESIGN.md) 方案 C（混合 Monorepo）

---

## 目录

1. [目标包结构](#1-目标包结构)
2. [阶段总览](#2-阶段总览)
3. [Phase 0：基础设施搭建](#3-phase-0基础设施搭建)
4. [Phase 1：packages/core + packages/codegen 迁移](#4-phase-1packagescore--packagescodegen-迁移)
5. [Phase 2：适配器包迁移](#5-phase-2适配器包迁移)
   - [Phase 2a：packages/adapter-common](#5a-phase-2apackagesadapter-common)
   - [Phase 2b：packages/adapter-playwright](#5b-phase-2bpackagesadapter-playwright)
   - [Phase 2c：packages/adapter-puppeteer](#5c-phase-2cpackagesadapter-puppeteer)
6. [Phase 3：apps/cli 迁移](#6-phase-3appscli-迁移)
7. [Phase 4：清理与验证](#7-phase-4清理与验证)
8. [附录 A：完整配置文件](#8-附录-a完整配置文件)
9. [附录 B：依赖版本对照表](#9-附录-b依赖版本对照表)

---

## 1. 目标包结构

```
D:/project/cli/web-clone/
├── apps/
│   └── cli/                      # CLI 应用
│       ├── package.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       └── src/
│           ├── cli.ts
│           └── config/
│               ├── cli-adapter.ts
│               ├── cli-helper.ts
│               └── index.ts
├── packages/
│   ├── core/                     # @web-clone/core
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── index.ts
│   │       ├── assembler.ts
│   │       ├── fetcher.ts
│   │       ├── converter.ts
│   │       ├── types.ts
│   │       ├── validators.ts
│   │       ├── memory-budget.ts
│   │       ├── parser/           # html-parser, css-parser, url-resolver
│   │       ├── output/           # bundle, single-file, convert
│   │       ├── core/             # resource-filter, path-fixer
│   │       ├── worker/           # pool
│   │       ├── transform/        # component-analyzer, css-analyzer, js-analyzer, correlator, generator
│   │       │   └── types.ts
│   │       ├── config/           # defaults, normalize, schema
│   │       └── adapters/
│   │           ├── fetcher-adapter.ts   # FetcherAdapter 接口（所有适配器共享）
│   │           ├── http-fetcher-adapter.ts
│   │           └── index.ts
│   │
│   ├── adapter-common/           # @web-clone/adapter-common
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── index.ts
│   │       ├── spa-detector.ts
│   │       └── automation-options.ts
│   │
│   ├── adapter-playwright/       # @web-clone/adapter-playwright
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── index.ts
│   │       ├── adapter.ts
│   │       └── options.ts
│   │
│   ├── adapter-puppeteer/        # @web-clone/adapter-puppeteer
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── index.ts
│   │       ├── adapter.ts
│   │       └── options.ts
│   │
│   └── codegen/                  # @web-clone/codegen
│       ├── package.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       └── src/
│           ├── index.ts
│           ├── base-generator.ts
│           ├── config-generator.ts
│           ├── framework-rules.ts
│           ├── shared-logic-extractor.ts
│           ├── vue-generator.ts
│           ├── react-generator.ts
│           ├── angular-generator.ts
│           ├── svelte-generator.ts
│           └── jquery-generator.ts
├── examples/
│   └── playwright-snapshot/
│       ├── package.json
│       └── src/
├── docs/
│   ├── ref/
│   │   ├── pnpm-workspace.yaml   # 已有
│   │   └── turbo.json            # 已有
│   └── architecture/
│       ├── MONOREPO_DESIGN.md
│       └── MIGRATION_PLAN.md     # 本文件
├── pnpm-workspace.yaml
├── turbo.json
├── package.json                  # 根 workspace
├── tsconfig.base.json
├── vitest.workspace.ts
├── eslint.config.js
├── .gitignore
└── README.md
```

> **与旧版关键区别：**
> - `browser-adapters/` 拆分为 `adapter-common/` + `adapter-playwright/` + `adapter-puppeteer/`
> - 每个框架适配器包各自声明自己的框架依赖（playwright / puppeteer）
> - `adapter-common/` 只包含共享逻辑（spa-detector, automation-options），不依赖任何自动化框架

---

## 2. 阶段总览

| Phase | 内容 | 预计工时 | 前置条件 |
|-------|------|---------|---------|
| **Phase 0** | 基础设施：根配置、pnpm、turbo | 1h | 无 |
| **Phase 1** | packages/core + packages/codegen 迁移 | 3h | Phase 0 |
| **Phase 2a** | packages/adapter-common 迁移 | 0.5h | Phase 1 |
| **Phase 2b** | packages/adapter-playwright 迁移 | 0.5h | Phase 2a |
| **Phase 2c** | packages/adapter-puppeteer 迁移 | 0.5h | Phase 2a |
| **Phase 3** | apps/cli 代码迁移 | 2h | Phase 1~2 |
| **Phase 4** | 清理 .gitignore、文档、测试 | 1h | Phase 0~3 |

分阶段原则：**每完成一个 Phase 都可运行 `pnpm install && pnpm build` 并通过**。

---

## 3. Phase 0：基础设施搭建

**目标:** 在根目录创建 monorepo 骨架，验证 pnpm + turbo 链路通畅。

### 3.1 操作清单

- [ ] 安装 pnpm（如未安装）：`npm install -g pnpm`
- [ ] 创建根 package.json
- [ ] 创建 pnpm-workspace.yaml（仅声明 `packages: ["apps/*", "packages/*"]`，无多余配置）
- [ ] 创建 turbo.json
- [ ] 创建 tsconfig.base.json
- [ ] 创建 vitest.workspace.ts
- [ ] 更新 .gitignore

### 3.2 根 package.json

```json
{
  "name": "web-clone-monorepo",
  "version": "1.0.0",
  "private": true,
  "packageManager": "pnpm@10.8.0",
  "description": "Monorepo for web-clone snapshot tool",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "dev:cli": "pnpm --filter web-clone-cli dev",
    "test": "turbo run test",
    "test:run": "turbo run test",
    "test:unit": "pnpm --filter @web-clone/core test:unit",
    "test:integration": "pnpm --filter web-clone-cli test:integration",
    "test:all": "pnpm test:unit && pnpm test:integration",
    "test:coverage": "turbo run test:coverage",
    "test:clean": "pnpm --filter web-clone-cli test:clean",
    "lint": "turbo run lint",
    "lint:fix": "pnpm --recursive lint:fix",
    "clean": "turbo run clean",
    "typecheck": "turbo run typecheck",
    "format": "prettier --write \"**/*.{ts,js,json,md}\"",
    "snapshot": "pnpm dev:cli --"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@vitest/coverage-v8": "^4.1.10",
    "eslint": "^10.7.0",
    "prettier": "^3.6.0",
    "turbo": "^2.5.0",
    "typescript": "^5.9.3",
    "typescript-eslint": "^8.63.0",
    "vitest": "^4.1.10",
    "jsdom": "^29.1.1",
    "tsx": "^4.23.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### 3.3 pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### 3.4 turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "stream",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "test:coverage": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "test:unit": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "test:integration": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "outputs": []
    },
    "clean": {
      "cache": false
    },
    "typecheck": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "typecheck:tests": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "prebuild": {
      "cache": false
    },
    "postbuild": {
      "cache": false
    }
  }
}
```

### 3.5 tsconfig.base.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "lib": ["ES2022", "DOM"]
  }
}
```

### 3.6 vitest.workspace.ts

```typescript
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/*',
  'apps/*',
]);
```

### 3.7 .gitignore（更新后）

```gitignore
# Dependencies
node_modules/

# Environment
.env
.env.local
.env.*

# Logs and temp files
*.log
*.tmp

# Build artifacts
dist/
build/
target/

# Package manager locks for sub-projects (root only)
# pnpm-lock.yaml stays tracked

# download
snapshot
snapshot-test

# Test outputs
__tests__/outputs/
coverage/

# Editor
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
```

### 3.8 验证命令

```bash
pnpm install                     # 安装根依赖
pnpm turbo build                 # 空构建（验证 turbo 链路）
pnpm turbo test                  # 空测试（验证 vitest workspace）
```

---

## 4. Phase 1：packages/core + packages/codegen 迁移

**目标:** 将核心逻辑从 `src/` 移动（`mv`）到 `packages/core/`，同时将 framework-codegen 移动到 `packages/codegen/`。convert.ts 依赖 codegen，因此必须在同一阶段处理。

### 4.1 操作原则

```
重要：所有文件操作使用 git mv（保留 git 历史），而非 cp。
禁止复制文件再调整——必须移动源文件，再修正导入路径。
```

### 4.2 移动清单

#### 从 `src/` → `packages/core/src/`（git mv）

| 源路径 | 说明 |
|--------|------|
| `src/index.ts` | 核心导出入口 |
| `src/assembler.ts` | 快照编排 |
| `src/fetcher.ts` | HTTP 请求 |
| `src/converter.ts` | 组件转换 |
| `src/types.ts` | 类型定义 |
| `src/validators.ts` | 资源校验 |
| `src/memory-budget.ts` | 内存预算 |
| `src/parser/*` | HTML/CSS 解析器 |
| `src/output/*` | 输出组装（含 convert.ts） |
| `src/core/*` | 资源过滤、路径修复 |
| `src/worker/*` | 并发池 |
| `src/transform/*`（不含 framework-codegen/） | 组件分析引擎 |
| `src/config/defaults.ts` | 默认配置 |
| `src/config/normalize.ts` | 配置规范化 |
| `src/config/schema.ts` | 配置模式 |
| `src/adapters/fetcher-adapter.ts` | FetcherAdapter 接口 |
| `src/adapters/http-fetcher-adapter.ts` | HTTP 适配器实现 |
| `src/adapters/index.ts` | 适配器导出（移除 loadPlaywrightAdapter / loadPuppeteerAdapter） |

#### 从 `src/transform/framework-codegen/` → `packages/codegen/src/`（git mv）

| 源路径 | 说明 |
|--------|------|
| `src/transform/framework-codegen/*.ts` | 全部 10 个代码生成器文件 |

#### 不移入任何 package、留在原位置等 Phase 3 处理的文件

- `src/cli.ts` → Phase 3 移入 `apps/cli`
- `src/config/cli-adapter.ts` → Phase 3 移入 `apps/cli`
- `src/config/cli-helper.ts` → Phase 3 移入 `apps/cli`
- `src/config/index.ts` → Phase 3 移入 `apps/cli`
- `src/adapters/automation/*` → Phase 2a/2b/2c 移入 adapter-* 包

> **为什么 framework-codegen 放在 Phase 1 而不是 Phase 3？**
> 因为 `src/output/convert.ts` 硬依赖 `framework-codegen/` 的 `codeGenerator`、`ConfigGenerator`、`SharedLogicExtractor`。如果 core 和 codegen 分属不同 Phase，convert.ts 要么无法编译，要么需要引入动态导入增加复杂度。将两者放在同一阶段移动，convert.ts 可以立即通过 `@web-clone/codegen` 包名引用，保持静态导入。

### 4.3 需要修改的导入路径

#### packages/core/src/——相对路径不变

移动后，`packages/core/src/` 内部文件保持相同的目录结构，所有 `./` 和 `../` 相对导入路径不变。

唯一例外：`src/adapters/index.ts` 原导出 `loadPlaywrightAdapter()` 和 `loadPuppeteerAdapter()`（动态导入 `./automation/playwright/adapter.js`）。移动后 automation/ 不复存在，**需删除这两个函数**。它们将迁移到独立的 adapter-* 包中。

#### packages/codegen/src/——改为 @web-clone/core

所有文件中原 `from '../../types.js'` 改为 `from '@web-clone/core'`（因为 types.ts 已移至 `@web-clone/core`）。

### 4.4 packages/core/package.json

```json
{
  "name": "@web-clone/core",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./adapters": "./dist/adapters/index.js",
    "./types": "./dist/types.js",
    "./config": "./dist/config/schema.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:unit": "vitest run src/__tests__",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "clean": "rm -rf dist coverage"
  },
  "dependencies": {
    "@babel/parser": "^8.0.4",
    "@babel/traverse": "^8.0.4",
    "@babel/types": "^8.0.4",
    "chalk": "^5.6.2",
    "css-tree": "^3.2.1",
    "global-agent": "^4.1.3",
    "http-proxy-agent": "^9.1.0",
    "https-proxy-agent": "^9.1.0",
    "node-fetch-native": "^1.6.7",
    "ora": "^9.4.1",
    "postcss": "^8.5.17"
  },
  "peerDependencies": {
    "@web-clone/codegen": "workspace:*",
    "jsdom": "^29.0.0"
  },
  "peerDependenciesMeta": {
    "jsdom": {
      "optional": true
    },
    "@web-clone/codegen": {
      "optional": true
    }
  },
  "devDependencies": {
    "@types/babel__parser": "^7.1.5",
    "@types/babel__traverse": "^7.28.0",
    "@types/css-tree": "^2.3.11",
    "@types/jsdom": "^28.0.3",
    "@types/node": "^26.1.1",
    "jsdom": "^29.1.1"
  }
}
```

> **为什么 @web-clone/codegen 是 optional peer?**
> `converter.ts` 中 `codeGenerator`/`ConfigGenerator`/`SharedLogicExtractor` 仅在 `options.frameworkCodegen?.framework` 有值时使用。core 内置的 HTTP 快照逻辑可以完全不依赖 codegen。将其声明为 optional peer 使得未安装 codegen 的用户不会报错，同时已安装的用户获得静态类型检查。

### 4.5 packages/core/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "src/**/__tests__/**/*.ts", "src/**/*.test.ts"]
}
```

### 4.6 packages/core/vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/__tests__/**',
        'src/**/*.d.ts',
      ],
    },
  },
});
```

### 4.7 packages/codegen/package.json

```json
{
  "name": "@web-clone/codegen",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./vue": "./dist/vue-generator.js",
    "./react": "./dist/react-generator.js",
    "./angular": "./dist/angular-generator.js",
    "./svelte": "./dist/svelte-generator.js",
    "./jquery": "./dist/jquery-generator.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "clean": "rm -rf dist coverage"
  },
  "dependencies": {
    "@web-clone/core": "workspace:*",
    "@babel/parser": "^8.0.4",
    "@babel/traverse": "^8.0.4",
    "@babel/types": "^8.0.4"
  },
  "devDependencies": {
    "@types/babel__parser": "^7.1.5",
    "@types/babel__traverse": "^7.28.0",
    "@types/node": "^26.1.1"
  }
}
```

### 4.8 packages/codegen/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "src/**/__tests__/**/*.ts", "src/**/*.test.ts"]
}
```

### 4.9 packages/codegen/vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/__tests__/**',
        'src/**/*.d.ts',
      ],
    },
  },
});
```

### 4.10 packages/codegen/src/index.ts 修改

在原文件末尾添加 re-export：

```typescript
// 原有的导出
export class FrameworkCodeGenerator { ... }
export const codeGenerator = new FrameworkCodeGenerator();

// 新增 re-export（供 convert.ts 使用）
export { ConfigGenerator } from './config-generator.js';
export { SharedLogicExtractor } from './shared-logic-extractor.js';
```

### 4.11 packages/core/src/output/convert.ts 修改

将文件头部的导入：

```typescript
// Before:
import { codeGenerator } from '../transform/framework-codegen/index.js';
import { ConfigGenerator } from '../transform/framework-codegen/config-generator.js';
import { SharedLogicExtractor } from '../transform/framework-codegen/shared-logic-extractor.js';

// After:
import { codeGenerator, ConfigGenerator, SharedLogicExtractor } from '@web-clone/codegen';
```

### 4.12 验证命令

```bash
cd packages/core
pnpm install
pnpm build                        # 确认 compile 通过

cd ../codegen
pnpm install
pnpm build                        # 确认 compile 通过

cd ../..
pnpm build                        # turbo 并行构建，验证依赖顺序
```

---

## 5. Phase 2：适配器包迁移

**目标:** 将 `src/adapters/automation/` 中的适配器代码按职责拆分到三个独立包，各自声明自己的自动化框架依赖。

### 设计原则

```
adapter-common      — 共享工具（spa-detector, 自动化选项类型），零框架依赖
adapter-playwright  — Playwright 适配器，只依赖 playwright
adapter-puppeteer   — Puppeteer 适配器，只依赖 puppeteer
```

依赖关系：

```
adapter-playwright ──→ adapter-common ──→ core
adapter-puppeteer  ──→ adapter-common ──→ core
```

---

### 5a. Phase 2a：packages/adapter-common

**目标:** 将共享的 SPA 水合检测和自动化选项类型移动到独立包。

#### 操作清单

| 操作 | 命令 |
|------|------|
| 移动 | `git mv src/adapters/automation/spa-detector.ts packages/adapter-common/src/` |
| 移动 | `git mv src/adapters/automation/options.ts packages/adapter-common/src/automation-options.ts` |

> 建议将 `options.ts` 重命名为 `automation-options.ts`，避免与各适配器自己的 `options.ts` 混淆。

#### 需要修改的导入路径

`spa-detector.ts` 中原导入 `from '../../types.js'` → 改为 `from '@web-clone/core'`
`automation-options.ts` 无项目内引用，无需修改。

#### packages/adapter-common/package.json

```json
{
  "name": "@web-clone/adapter-common",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "clean": "rm -rf dist coverage"
  },
  "dependencies": {
    "@web-clone/core": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^26.1.1"
  }
}
```

#### packages/adapter-common/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

#### packages/adapter-common/vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
    },
  },
});
```

#### packages/adapter-common/src/index.ts

```typescript
export { waitForSpaHydration } from './spa-detector.js';
export type { SpaPageLike, SpaDetectorOptions } from './spa-detector.js';
```

---

### 5b. Phase 2b：packages/adapter-playwright

**目标:** Playwright 适配器独立包，只依赖 playwright。

#### 操作清单

| 操作 | 命令 |
|------|------|
| 移动 | `git mv src/adapters/automation/playwright/adapter.ts packages/adapter-playwright/src/` |
| 移动 | `git mv src/adapters/automation/playwright/options.ts packages/adapter-playwright/src/` |
| 删除 | `git rm src/adapters/automation/playwright/index.ts`（内容合并入 adapter-playwright/src/index.ts） |

#### 需要修改的导入路径

`adapter.ts` 中：

| 原导入 | 新导入 |
|--------|--------|
| `from '../../fetcher-adapter.js'` → | `from '@web-clone/core'` |
| `from '../spa-detector.js'` → | `from '@web-clone/adapter-common'` |
| `from './options.js'` → | 不变 |

#### packages/adapter-playwright/package.json

```json
{
  "name": "@web-clone/adapter-playwright",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "clean": "rm -rf dist coverage"
  },
  "dependencies": {
    "@web-clone/core": "workspace:*",
    "@web-clone/adapter-common": "workspace:*",
    "playwright": "^1.58.2"
  },
  "devDependencies": {
    "@types/node": "^26.1.1"
  }
}
```

> **playwright 放在 dependencies 而非 peerDependencies：**
> 因为 adapter-playwright 本身就是一个 Playwright 专用包，用户安装它就是为了使用 Playwright。播放器引擎是它的核心功能，不是可选项。

#### packages/adapter-playwright/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

#### packages/adapter-playwright/vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
    },
  },
});
```

#### packages/adapter-playwright/src/index.ts

```typescript
export { PlaywrightFetcherAdapter } from './adapter.js';
export type { PlaywrightAdapterOptions, PlaywrightWaitUntil } from './options.js';
```

---

### 5c. Phase 2c：packages/adapter-puppeteer

**目标:** Puppeteer 适配器独立包，只依赖 puppeteer。

#### 操作清单

| 操作 | 命令 |
|------|------|
| 移动 | `git mv src/adapters/automation/puppeteer/adapter.ts packages/adapter-puppeteer/src/` |
| 移动 | `git mv src/adapters/automation/puppeteer/options.ts packages/adapter-puppeteer/src/` |
| 删除 | `git rm src/adapters/automation/puppeteer/index.ts`（内容合并入 adapter-puppeteer/src/index.ts） |

#### 需要修改的导入路径

`adapter.ts` 中：

| 原导入 | 新导入 |
|--------|--------|
| `from '../../fetcher-adapter.js'` → | `from '@web-clone/core'` |
| `from '../spa-detector.js'` → | `from '@web-clone/adapter-common'` |
| `from './options.js'` → | 不变 |

#### packages/adapter-puppeteer/package.json

```json
{
  "name": "@web-clone/adapter-puppeteer",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "clean": "rm -rf dist coverage"
  },
  "dependencies": {
    "@web-clone/core": "workspace:*",
    "@web-clone/adapter-common": "workspace:*",
    "puppeteer": "^25.3.0"
  },
  "devDependencies": {
    "@types/node": "^26.1.1"
  }
}
```

#### packages/adapter-puppeteer/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

#### packages/adapter-puppeteer/vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
    },
  },
});
```

#### packages/adapter-puppeteer/src/index.ts

```typescript
export { PuppeteerFetcherAdapter } from './adapter.js';
export type { PuppeteerAdapterOptions, PuppeteerWaitUntil } from './options.js';
```

### 5d. Phase 2 验证命令

```bash
# 构建所有适配器包
pnpm --filter @web-clone/adapter-common build
pnpm --filter @web-clone/adapter-playwright build
pnpm --filter @web-clone/adapter-puppeteer build

# 全量 turbo 构建
pnpm build
```

---

## 6. Phase 3：apps/cli 迁移

**目标:** 将 CLI 应用迁移到独立 app，依赖各 package。

### 6.1 操作清单

| 操作 | 命令 |
|------|------|
| 移动 | `git mv src/cli.ts apps/cli/src/` |
| 移动 | `git mv src/config/cli-adapter.ts apps/cli/src/config/` |
| 移动 | `git mv src/config/cli-helper.ts apps/cli/src/config/` |
| 移动 | `git mv src/config/index.ts apps/cli/src/config/` |

#### cli.ts 需要修改的导入路径

| 原导入 | 新导入 |
|--------|--------|
| `from './assembler.js'` | `from '@web-clone/core'` |
| `from './config/index.js'` | 不变（同包内） |
| `from './types.js'` | `from '@web-clone/core'` |

#### config/index.ts 需要修改的导入路径

| 原导入 | 新导入 |
|--------|--------|
| `from './schema.js'` | `from '@web-clone/core'` |
| `from './defaults.js'` | `from '@web-clone/core'` |
| `from './normalize.js'` | `from '@web-clone/core'` |

### 6.2 apps/cli/package.json

```json
{
  "name": "web-clone-cli",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "snapshot": "dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts",
    "snapshot": "tsx src/cli.ts",
    "test": "vitest run",
    "test:integration": "vitest run src/__tests__/integration --timeout 60000",
    "test:coverage": "vitest run --coverage",
    "test:clean": "rm -rf ./test-* ./coverage",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "clean": "rm -rf dist coverage",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@web-clone/core": "workspace:*",
    "@web-clone/codegen": "workspace:*",
    "chalk": "^5.6.2",
    "commander": "^15.0.0"
  },
  "optionalDependencies": {
    "@web-clone/adapter-playwright": "workspace:*",
    "@web-clone/adapter-puppeteer": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^26.1.1",
    "tsx": "^4.23.0"
  }
}
```

> **适配器包放在 optionalDependencies：**
> CLI 默认使用 HTTP 模式，浏览器适配器仅当用户传入 `--browser` 标志时才按需动态加载。
> 这样用户无需安装 playwright/puppeteer 即可使用基本功能。

### 6.3 apps/cli/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "src/**/__tests__/**/*.ts", "src/**/*.test.ts"]
}
```

### 6.4 apps/cli/vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/__tests__/**',
        'src/**/*.d.ts',
      ],
    },
  },
});
```

### 6.5 apps/cli/src/cli.ts `--browser` 标志

```typescript
#!/usr/bin/env node

import { snapshot, convertLocalSnapshot } from '@web-clone/core';
import { fromCommander, DEFAULTS, type CommanderOpts } from './config/index.js';
import type { SnapshotOptions, SnapshotResult } from '@web-clone/core';

program
  .option('--browser <type>', 'Browser automation engine: playwright | puppeteer')

if (opts.browser && !isLocal) {
  if (opts.browser === 'playwright') {
    try {
      const { PlaywrightFetcherAdapter } = await import('@web-clone/adapter-playwright');
      // 使用适配器...
    } catch {
      console.error(chalk.yellow('Install: pnpm add @web-clone/adapter-playwright'));
    }
  } else if (opts.browser === 'puppeteer') {
    try {
      const { PuppeteerFetcherAdapter } = await import('@web-clone/adapter-puppeteer');
      // 使用适配器...
    } catch {
      console.error(chalk.yellow('Install: pnpm add @web-clone/adapter-puppeteer'));
    }
  }
}
```

### 6.6 验证命令

```bash
cd apps/cli
pnpm install
pnpm build
pnpm dev -- https://example.com -o ./test-snapshot
pnpm test:integration
```

---

## 7. Phase 4：清理与验证

**目标:** 清理旧的 `src/` 目录，更新文档，全链路验证。

### 7.1 操作清单

- [ ] 验证 `src/` 目录已空（所有文件已 `git mv` 到对应 package）
- [ ] 删除空的 `src/` 目录
- [ ] 删除旧的 `src/adapters/automation/` 目录
- [ ] 删除旧的 `src/transform/framework-codegen/` 目录
- [ ] 删除旧的 `package-lock.json`（根目录用 pnpm-lock.yaml）
- [ ] 更新 README.md
- [ ] 更新 AGENTS.md
- [ ] 更新 workflows 和 CI 配置

### 7.2 全链路验证命令

```bash
# 1. 从零开始
rm -rf node_modules dist
pnpm install

# 2. 构建所有包
pnpm build

# 3. 类型检查
pnpm typecheck

# 4. 运行所有测试
pnpm test

# 5. CLI 端到端测试
pnpm snapshot -- https://example.com -o ./test-snapshot --pretty

# 6. 清理
pnpm clean
```

### 7.3 根 README.md 更新要点

```markdown
# web-clone

**Monorepo** — see [docs/architecture/MONOREPO_DESIGN.md](docs/architecture/MONOREPO_DESIGN.md)

## Quick Start

```bash
pnpm install
pnpm dev:cli -- https://example.com
```

## Packages

| Package | Description |
|---------|-------------|
| `@web-clone/core` | Core snapshot logic, HTTP adapter, types |
| `@web-clone/adapter-common` | Shared SPA hydration detection & automation types |
| `@web-clone/adapter-playwright` | Playwright browser automation adapter |
| `@web-clone/adapter-puppeteer` | Puppeteer browser automation adapter |
| `@web-clone/codegen` | Framework code generators (Vue/React/Angular/Svelte/jQuery) |
| `web-clone-cli` | CLI application |
```

---

## 8. 附录 A：完整配置文件

### 8.1 根 eslint.config.js（更新后）

```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'node_modules/',
      'coverage/',
      '**/dist/',
      '**/node_modules/',
      '**/coverage/',
      'test-results/',
      'outputs/',
      'snapshot/',
      'eslint.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-console': 'off',
      'prefer-const': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-var-requires': 'error',
      '@typescript-eslint/no-empty-interface': 'warn',
      '@typescript-eslint/no-empty-function': 'warn',
      '@typescript-eslint/ban-ts-comment': ['warn', {
        'ts-expect-error': 'allow-with-description',
        'ts-ignore': 'allow-with-description',
        'ts-nocheck': 'allow-with-description',
        'ts-check': 'allow-with-description',
      }],
    },
  },
);
```

### 8.2 Root `.prettierrc`（新增）

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 120,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

---

## 9. 附录 B：依赖版本对照表

所有版本号与 `docs/ref/` 参考配置及当前 `package.json` 对齐：

| 依赖 | 版本 | 所在包 |
|------|------|--------|
| `turbo` | `^2.5.0` | 根 devDeps |
| `typescript` | `^5.9.3` | 根 devDeps |
| `vitest` | `^4.1.10` | 根 devDeps |
| `@vitest/coverage-v8` | `^4.1.10` | 根 devDeps |
| `eslint` | `^10.7.0` | 根 devDeps |
| `typescript-eslint` | `^8.63.0` | 根 devDeps |
| `@eslint/js` | `^10.0.1` | 根 devDeps |
| `jsdom` | `^29.1.1` | 根 devDeps / core devDeps |
| `tsx` | `^4.23.0` | 根 devDeps / cli devDeps |
| `@types/node` | `^26.1.1` | 各包 devDeps |
| `@types/jsdom` | `^28.0.3` | core devDeps |
| `@types/css-tree` | `^2.3.11` | core devDeps |
| `chalk` | `^5.6.2` | core / cli deps |
| `commander` | `^15.0.0` | cli deps |
| `css-tree` | `^3.2.1` | core deps |
| `postcss` | `^8.5.17` | core deps |
| `global-agent` | `^4.1.3` | core deps |
| `http-proxy-agent` | `^9.1.0` | core deps |
| `https-proxy-agent` | `^9.1.0` | core deps |
| `node-fetch-native` | `^1.6.7` | core deps |
| `ora` | `^9.4.1` | core deps |
| `@babel/parser` | `^8.0.4` | core / codegen deps |
| `@babel/traverse` | `^8.0.4` | core / codegen deps |
| `@babel/types` | `^8.0.4` | core / codegen deps |
| `@types/babel__parser` | `^7.1.5` | core / codegen devDeps |
| `@types/babel__traverse` | `^7.28.0` | core / codegen devDeps |
| `playwright` | `^1.58.2` | adapter-playwright deps |
| `puppeteer` | `^25.3.0` | adapter-puppeteer deps |
| `@web-clone/core` | `workspace:*` | 所有子包 |
| `@web-clone/adapter-common` | `workspace:*` | adapter-playwright / adapter-puppeteer |
| `@web-clone/codegen` (optional peer) | `workspace:*` | core |

---

## 附录 C：eslint 在每个包中的配置

每个子包不需要重复创建 `eslint.config.js`。turbo 会在根目录执行 lint 时自动遍历子包。如果需要在子包中单独运行 `pnpm lint`，可在子包配置：

```json
// 子包 package.json
"scripts": {
  "lint": "eslint src/ --config ../../eslint.config.js"
}
```

---

## 附录 D：发布流程

```bash
# 发布 core
pnpm --filter @web-clone/core publish --access public

# 发布 adapter-common
pnpm --filter @web-clone/adapter-common publish --access public

# 发布 adapter-playwright
pnpm --filter @web-clone/adapter-playwright publish --access public

# 发布 adapter-puppeteer
pnpm --filter @web-clone/adapter-puppeteer publish --access public

# 发布 codegen
pnpm --filter @web-clone/codegen publish --access public

# 发布 CLI（通常只在 homebrew 或 npm 上发布）
pnpm --filter web-clone-cli publish
```

---

## 附录 E：导入路径变更速查表

执行迁移时，每个文件需要的 import 修改：

| 文件 | 原导入 | 改后导入 |
|------|--------|---------|
| `packages/codegen/src/*.ts` | `from '../../types.js'` | `from '@web-clone/core'` |
| `packages/core/src/output/convert.ts` | `from '../transform/framework-codegen/*'` | `from '@web-clone/codegen'` |
| `packages/core/src/adapters/index.ts` | `export async function loadPlaywrightAdapter ...` | **删除**（移到 adapter-playwright） |
| `packages/core/src/adapters/index.ts` | `export async function loadPuppeteerAdapter ...` | **删除**（移到 adapter-puppeteer） |
| `packages/adapter-common/src/spa-detector.ts` | `from '../../types.js'` | `from '@web-clone/core'` |
| `packages/adapter-playwright/src/adapter.ts` | `from '../../fetcher-adapter.js'` | `from '@web-clone/core'` |
| `packages/adapter-playwright/src/adapter.ts` | `from '../spa-detector.js'` | `from '@web-clone/adapter-common'` |
| `packages/adapter-puppeteer/src/adapter.ts` | `from '../../fetcher-adapter.js'` | `from '@web-clone/core'` |
| `packages/adapter-puppeteer/src/adapter.ts` | `from '../spa-detector.js'` | `from '@web-clone/adapter-common'` |
| `apps/cli/src/cli.ts` | `from './assembler.js'` | `from '@web-clone/core'` |
| `apps/cli/src/cli.ts` | `from './types.js'` | `from '@web-clone/core'` |
| `apps/cli/src/config/index.ts` | `from './schema.js'` | `from '@web-clone/core'` |
| `apps/cli/src/config/index.ts` | `from './defaults.js'` (仅 type) | `from '@web-clone/core'` |
| `apps/cli/src/config/index.ts` | `from './normalize.js'` | `from '@web-clone/core'` |

---

*本计划由 [MONOREPO_DESIGN.md](./MONOREPO_DESIGN.md) 方案 C 派生，所有配置与 `docs/ref/` 参考文件对齐。*
