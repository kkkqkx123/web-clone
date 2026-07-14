# web-clone 分发方案设计

> **Language**: 简体中文  
> **Date**: 2026-07-14  
> **Status**: Design  
> **版本**: v1.0

---

## 目录

1. [项目现状分析](#1-项目现状分析)
2. [分发模型总览](#2-分发模型总览)
3. [npm 库包分发方案](#3-npm-库包分发方案)
4. [CLI 工具分发方案](#4-cli-工具分发方案)
5. [构建产物优化](#5-构建产物优化)
6. [包结构改进建议](#6-包结构改进建议)
7. [发布流程设计](#7-发布流程设计)
8. [实施计划](#8-实施计划)

---

## 1. 项目现状分析

### 1.1 当前包结构

```
web-clone-monorepo/                          # 根包 (private, 不发布)
├── packages/
│   ├── core/                    @web-clone/core            # 快照引擎核心
│   ├── adapter-common/          @web-clone/adapter-common  # 适配器共享类型
│   ├── adapter-playwright/      @web-clone/adapter-playwright  # Playwright 适配器
│   ├── adapter-puppeteer/       @web-clone/adapter-puppeteer   # Puppeteer 适配器
│   └── codegen/                 @web-clone/codegen         # 框架代码生成器
└── apps/
    └── cli/                     web-clone-cli              # CLI 应用 (bin: snapshot)
```

### 1.2 依赖关系图

```
包间依赖 (目前):
  @web-clone/core  ←  @web-clone/adapter-common (dep)
  @web-clone/core  ←  @web-clone/codegen (dep)
  @web-clone/adapter-common  ←  @web-clone/adapter-playwright (dep)
  @web-clone/adapter-common  ←  @web-clone/adapter-puppeteer (dep)
  @web-clone/core  ←  web-clone-cli (dep)
  @web-clone/codegen  ←  web-clone-cli (dep)

运行时依赖:
  core: @babel/parser, css-tree, postcss, node-fetch-native, chalk⚠, ora⚠, ...
  codegen: @babel/parser, @babel/traverse, @babel/types
  adapter-playwright: playwright
  adapter-puppeteer: puppeteer
  cli: commander, chalk, @web-clone/core, @web-clone/codegen
```

### 1.3 现有问题清单

| # | 问题 | 影响 | 严重性 |
|---|------|------|--------|
| 1 | `@web-clone/core` 依赖了 `chalk`、`ora` (UI 库) | 库的使用者会引入不需要的依赖 | 🔴 P0 |
| 2 | 所有包均无 `"files"` 字段 | `npm publish` 可能发布多余文件 | 🟡 P1 |
| 3 | 所有 `@web-clone/*` 包无 `"publishConfig"` | 默认 scoped 包为 private，发布会失败 | 🔴 P0 |
| 4 | 缺少 `license`、`repository`、`homepage` 元数据 | npm 页面信息不完整 | 🟢 P2 |
| 5 | 所有包无 `"engines"` 限制 | 不兼容的 Node 版本可能被安装 | 🟡 P1 |
| 6 | 构建产物为 tsc 单文件输出，CLI 无 bundling | CLI 启动时文件 I/O 较多 | 🟢 P2 |
| 7 | 版本号统一为 `1.0.0`，无发布版本管理 | 无法做版本关联 | 🟡 P1 |
| 8 | `adapter-common` 依赖 `@web-clone/core` 但可能仅需类型 | 不必要的运行时依赖链 | 🟡 P1 |

---

## 2. 分发模型总览

### 2.1 总体架构

```
                    ┌─────────────────────────────────────┐
                    │          npm 分发策略总览              │
                    ├─────────────────────────────────────┤
                    │                                     │
                    │  库包 (Library)                      │
                    │    @web-clone/core                  │
                    │    @web-clone/codegen               │
                    │    @web-clone/adapter-*             │
                    │    → pnpm add @web-clone/core      │
                    │                                     │
                    │  CLI 工具 (Application)              │
                    │    web-clone-cli                     │
                    │    → npx web-clone-cli <url>        │
                    │    → npm i -g web-clone-cli         │
                    │                                     │
                    └─────────────────────────────────────┘
```

### 2.2 分发矩阵

| 包名 | npm 可见名称 | 类型 | 安装方式 | 使用者 |
|------|-------------|------|---------|--------|
| `@web-clone/core` | @web-clone/core | 库 (Library) | `npm i @web-clone/core` | 开发者 (程序化调用) |
| `@web-clone/codegen` | @web-clone/codegen | 库 (Library) | `npm i @web-clone/codegen` | 开发者 (代码生成) |
| `@web-clone/adapter-common` | @web-clone/adapter-common | 库 (Library) | `npm i @web-clone/adapter-common` | 适配器开发者 |
| `@web-clone/adapter-playwright` | @web-clone/adapter-playwright | 库 (Library) | `npm i @web-clone/adapter-playwright` | Playwright 用户 |
| `@web-clone/adapter-puppeteer` | @web-clone/adapter-puppeteer | 库 (Library) | `npm i @web-clone/adapter-puppeteer` | Puppeteer 用户 |
| `web-clone-cli` | web-clone-cli | CLI 工具 | `npm i -g web-clone-cli` / `npx web-clone-cli` | 终端用户 |

> **关于 CLI 包名**：当前 `name: "web-clone-cli"` 和 `bin: { snapshot: "..." }`。
> 保留 `web-clone-cli` 作为 npm 包名（已检查未被占用）。
> 全局安装后运行 `snapshot <url>`，或通过 `npx web-clone-cli <url>`。

### 2.3 用户场景流程图

```
场景 A: 终端用户（最常用）
  npm i -g web-clone-cli
  snapshot https://example.com -o ./output

场景 B: 一次性使用
  npx web-clone-cli https://example.com -o ./output

场景 C: 程序化调用（简单 HTTP）
  npm i @web-clone/core
  import { snapshot } from '@web-clone/core'
  await snapshot('https://example.com', { output: './out', mode: 'bundle' })

场景 D: 程序化调用（带 Playwright）
  npm i @web-clone/core @web-clone/adapter-playwright playwright
  import { snapshot } from '@web-clone/core'
  import { PlaywrightFetcherAdapter } from '@web-clone/adapter-playwright'
  // 用户自行管理 playwright 实例

场景 E: 代码生成
  npm i @web-clone/core @web-clone/codegen
  import { FrameworkCodeGenerator } from '@web-clone/codegen'
  new FrameworkCodeGenerator().generateComponents(specs, { framework: 'vue' })
```

---

## 3. npm 库包分发方案

### 3.1 @web-clone/core — 核心库

**定位**：web-clone 的基石。所有程序化使用场景的入口。

**当前问题**：
- 包含了 `chalk` (UI 颜色) 和 `ora` (终端 spinner) 作为运行时依赖
- 这些仅在 CLI 场景需要，库使用者不需要

**改进措施**：

```diff
// package.json
{
  "name": "@web-clone/core",
  "version": "1.0.0",
  "type": "module",
+ "files": ["dist/", "README.md", "LICENSE"],
+ "publishConfig": { "access": "public" },
+ "license": "MIT",
+ "repository": {
+   "type": "git",
+   "url": "https://github.com/kkkqkx123/web-clone.git"
+ },
+ "homepage": "https://github.com/kkkqkx123/web-clone#readme",
+ "keywords": ["webpage", "snapshot", "archive", "scraper", "cli"],
+ "engines": { "node": ">=20.0.0" },
  "exports": {
    ".": "./dist/index.js",
    "./adapters": "./dist/adapters/index.js",
    "./types": "./dist/types.js",
    "./config": "./dist/config/schema.js"
  },
  "dependencies": {
-   "chalk": "^5.6.2",     // 移到 CLI
-   "ora": "^9.4.1",       // 移到 CLI
    "@babel/parser": "^8.0.4",
    "css-tree": "^3.2.1",
    "node-fetch-native": "^1.6.7",
    "postcss": "^8.5.17"
    // ... 保留非 UI 依赖
  }
}
```

**导出结构**（已验证，当前已较完整）：
```
@web-clone/core
├── .                       → snapshot(), SnapshotOptions, HttpFetcherAdapter, ...
├── ./adapters              → FetcherAdapter interface, HttpFetcherAdapter
├── ./types                 → 核心类型定义
└── ./config                → 配置 schema 和默认值
```

### 3.2 @web-clone/codegen — 代码生成器

**定位**：可选的工具包。仅在用户需要将快照转换为框架代码时使用。

**当前状态**：导出较为完善。建议增加 metadata。

```json
{
  "name": "@web-clone/codegen",
  "version": "1.0.0",
  "files": ["dist/", "README.md", "LICENSE"],
  "publishConfig": { "access": "public" },
  "license": "MIT",
  "keywords": ["vue", "react", "angular", "svelte", "code-generator"],
  "engines": { "node": ">=20.0.0" },
  "exports": {
    ".": "./dist/index.js",
    "./vue": "./dist/vue-generator.js",
    "./react": "./dist/react-generator.js",
    "./angular": "./dist/angular-generator.js",
    "./svelte": "./dist/svelte-generator.js",
    "./jquery": "./dist/jquery-generator.js"
  }
}
```

### 3.3 @web-clone/adapter-common — 适配器共享模块

**定位**：非常轻量（仅 ~50 行代码），提供 `waitForSpaHydration()` 和类型。

**当前问题**：依赖了 `@web-clone/core`，但实际只使用了类型定义。如果 `waitForSpaHydration()` 运行时未使用 core 的任何功能，应考虑移除该运行时依赖。

```
// 建议：检查 spa-detector.ts 是否真的 import 了 core 的运行时代码。
// 如果是仅导入类型 (type import)，则无需依赖 @web-clone/core。
// 这样 adapter-common 可以成为零运行时依赖的纯类型包。
```

```json
{
  "name": "@web-clone/adapter-common",
  "version": "1.0.0",
  "files": ["dist/", "README.md", "LICENSE"],
  "publishConfig": { "access": "public" },
  "license": "MIT",
  "engines": { "node": ">=20.0.0" }
}
```

### 3.4 @web-clone/adapter-playwright & @web-clone/adapter-puppeteer

**定位**：浏览器自动化适配器。仅在用户使用 Playwright/Puppeteer 时安装。

**关键设计原则**：这两个包应**只作为 devDependencies** 使用 `playwright`/`puppeteer`。

```json
{
  "name": "@web-clone/adapter-playwright",
  "version": "1.0.0",
  "files": ["dist/", "README.md", "LICENSE"],
  "publishConfig": { "access": "public" },
  "license": "MIT",
  "engines": { "node": ">=20.0.0" },
  "dependencies": {
    "@web-clone/core": "^1.0.0",
    "@web-clone/adapter-common": "^1.0.0"
  },
  "devDependencies": {
    "playwright": "^1.58.2"       // 仅用于开发测试
  }
  // ✅ 无 peerDependencies — 用户在自己的项目中安装 playwright
}
```

**用户项目中的安装方式**：
```bash
npm install @web-clone/core @web-clone/adapter-playwright playwright
```

---

## 4. CLI 工具分发方案

### 4.1 包配置

`apps/cli/package.json`（当前配置基本正确，仅需补充 metadata）：

```json
{
  "name": "web-clone-cli",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "snapshot": "dist/cli.js"
  },
  "files": ["dist/", "README.md", "LICENSE"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/kkkqkx123/web-clone.git"
  },
  "keywords": ["web-clone", "snapshot", "webpage", "archive", "cli"],
  "engines": { "node": ">=20.0.0" },
  "dependencies": {
    "@web-clone/core": "^1.0.0",
    "@web-clone/codegen": "^1.0.0",
    "chalk": "^5.6.2",          // ✅ 仅 CLI 需要
    "commander": "^15.0.0"
  },
  "optionalDependencies": {
    "@web-clone/adapter-playwright": "^1.0.0",
    "@web-clone/adapter-puppeteer": "^1.0.0"
  }
}
```

### 4.2 使用方式

| 方式 | 命令 | 适用场景 |
|------|------|---------|
| 全局安装 | `npm i -g web-clone-cli && snapshot <url>` | 频繁使用 |
| 直接运行 | `npx web-clone-cli <url>` | 一次性使用 |
| 本地项目 | `npm i -D web-clone-cli && npx snapshot <url>` | CI/CD 中使用 |

### 4.3 CLI 启动流程优化

当前 CLI 使用 `tsc` 编译为分散的文件。建议调研以下优化：

```
当前: dist/cli.js → import dist/commands/xxx.js → 多个文件 I/O
建议: 使用 bundler (esbuild/tsup) 打包为单文件
      优势: 启动更快、部署更简单
      成本: 需要额外构建配置

是否必须: 对于 v1.0，tsc 输出足够，后续优化
```

**决策**：v1.0 保留 `tsc` 输出，启动时间 ~200ms 对 CLI 工具可接受。

---

## 5. 构建产物优化

### 5.1 当前产物分析

所有包目前使用 `tsc` 直接编译：

```
tsconfig 关键配置:
  target: ES2022
  module: ES2022          → ESM 输出
  moduleResolution: bundler
  declaration: true       → 生成 .d.ts
  declarationMap: true    → 生成 .d.ts.map
  sourceMap: true         → 生成 .js.map
```

产物示例（core 包）：
```
dist/
├── index.js + index.d.ts + index.js.map
├── assembler.js + assembler.d.ts + assembler.js.map
├── types.js + types.d.ts + types.js.map
├── adapters/
│   ├── index.js + index.d.ts + index.js.map
│   ├── fetcher-adapter.js + ...
│   └── http-fetcher-adapter.js + ...
├── config/
│   ├── schema.js + ...
│   └── defaults.js + ...
├── parser/
│   ├── html-parser.js + ...
│   └── css-parser.js + ...
└── ...
```

### 5.2 构建策略评估

| 策略 | 优势 | 劣势 | 推荐度 |
|------|------|------|--------|
| ✅ `tsc` (当前) | 零额外依赖，类型精准 | 文件分散，无 tree-shaking 优化 | 库包推荐 |
| `tsup` (esbuild) | 单文件输出，启动快 | 额外构建工具，可能丢失类型 | CLI 可选 |
| `rollup` | 精细化 tree-shaking | 配置复杂 | 不推荐 |
| `microbundle` | 简单易用 | 灵活性差 | 不推荐 |

### 5.3 库包构建优化建议

对于 `@web-clone/*` 库包，`tsc` 输出是最佳选择：

- ✅ 保留源文件结构，便于调试
- ✅ 类型声明与源码一一对应
- ✅ 消费者 bundler (webpack/vite/esbuild) 可以进行 tree-shaking
- ❌ **需要补充**：`sideEffects: false` 在 package.json 中

```diff
// packages/core/package.json
{
+  "sideEffects": false,   // 告知 bundler 所有模块无副作用，可以 tree-shake
}
```

### 5.4 CLI 构建优化

CLI 当前使用 `tsc`：**可接受，v1.0 保持现状**。

可选的后续优化（v1.1+）：
```bash
# 使用 tsup 打包 CLI 为单文件
pnpm add -D tsup -F web-clone-cli
```

```json
// apps/cli/package.json
{
  "scripts": {
    "build": "tsup src/cli.ts --format esm --outDir dist --clean",
    "build:legacy": "tsc"  // 保留旧方式
  }
}
```

---

## 6. 包结构改进建议

### 6.1 需要立即修复的问题 (P0)

#### 6.1.1 添加 `publishConfig` 到所有 @web-clone/* 包

```json
// 每个 @web-clone/* 包的 package.json
{
  "publishConfig": {
    "access": "public"
  }
}
```

**原因**：npm 默认 scoped packages (`@scope/name`) 为 private，不加此项会导致 `npm publish` 失败。

#### 6.1.2 添加 `files` 字段到所有可发布包

```json
{
  "files": ["dist/", "README.md", "LICENSE"]
}
```

**原因**：确保只发布必要的文件，防止 `node_modules/`、`src/`、`tests/` 等被发布。

#### 6.1.3 从 `@web-clone/core` 移除 UI 依赖

将 `chalk` 和 `ora` 从 core 的 `dependencies` 移到 CLI 的 `dependencies`。

**原因**：库的使用者不需要终端颜色和 spinner。这些是纯 UI 能力。

#### 6.1.4 添加 LICENSE 文件

根目录添加 `LICENSE` (MIT) 文件，所有包通过 `"license": "MIT"` 指向。

### 6.2 建议修复的问题 (P1)

#### 6.2.1 添加 metadata 到所有包

每个 `package.json` 补充：

```json
{
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/kkkqkx123/web-clone.git"
  },
  "homepage": "https://github.com/kkkqkx123/web-clone#readme",
  "bugs": {
    "url": "https://github.com/kkkqkx123/web-clone/issues"
  },
  "keywords": ["web-clone", ...],
  "engines": {
    "node": ">=20.0.0"
  }
}
```

#### 6.2.2 添加 `sideEffects: false`

所有纯功能库包（core, adapter-common, codegen）添加 `"sideEffects": false`。

#### 6.2.3 优化 adapter-common 的依赖

检查 `spa-detector.ts` 是否真的需要在运行时 `import` `@web-clone/core`。

```typescript
// 如果 spa-detector.ts 中只有 type import:
// import type { ... } from '@web-clone/core';  // ✅ 仅类型导入
// 而非:
// import { something } from '@web-clone/core'; // ❌ 运行时导入

// 如果是类型导入，可以将 @web-clone/core 从 dependencies 移到 devDependencies
```

### 6.3 建议优化的点 (P2)

#### 6.3.1 统一版本号管理

建议使用 [changesets](https://github.com/changesets/changesets) 或 syncpack 统一管理版本。

**当前问题**：所有包独立 version: `"1.0.0"`，发布时需确保 `@web-clone/*` 间版本匹配。

**方案 A：Changesets（推荐）**
```bash
pnpm add -D @changesets/cli -w
pnpm changeset init
```

自动管理版本提升和 changelog 生成，确保 monorepo 中互相依赖的包版本一致。

**方案 B：手动管理**
- 所有 `@web-clone/*` 包保持相同版本号
- 使用 `"workspace:*"` 指向最新
- 发布前手动同步版本

#### 6.3.2 发布前验证脚本

在根 `package.json` 中添加预发布验证：

```json
{
  "scripts": {
    "publish:verify": "pnpm build && pnpm test && pnpm lint",
    "publish:pack": "pnpm -r pack --dry-run",
    "publish:all": "pnpm publish -r --access public"
  }
}
```

---

## 7. 发布流程设计

### 7.1 首次发布流程

```bash
# 1. 验证构建和测试
pnpm build && pnpm test

# 2. 检查发布内容（dry-run）
pnpm -r pack --dry-run

# 3. 登录 npm（如未登录）
npm login

# 4. 逐个发布（确保 @web-clone/core 第一个，因为其他包依赖它）
cd packages/core && npm publish
cd packages/adapter-common && npm publish
cd packages/codegen && npm publish
cd packages/adapter-playwright && npm publish
cd packages/adapter-puppeteer && npm publish
cd apps/cli && npm publish
```

cli包为个人作用域，其余为web-clone组织作用域

### 7.2 版本更新策略

```
@web-clone/* 包的版本关联：
  - 所有 @web-clone/* 保持同步版本号 (major.minor.patch)
  - 例如：@web-clone/core@1.1.0, @web-clone/codegen@1.1.0, ...
  - web-clone-cli 版本可以与库版本不同（但推荐一致）

版本升级触发条件：
  - MAJOR: 破坏性 API 更改
  - MINOR: 新增功能，向后兼容
  - PATCH: Bug 修复，无 API 变更
```

### 7.3 CI/CD 发布配置

```yaml
# .github/workflows/publish.yml (示例)
name: Publish to npm

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'

      - run: pnpm install
      - run: pnpm build
      - run: pnpm test

      # 发布所有可发布包（仅非 private 包）
      - run: pnpm publish -r --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## 8. 实施计划

### Phase 1: 包元数据完善（1-2 天）

| 任务 | 包 | 优先级 |
|------|-----|--------|
| 添加 `publishConfig.access: public` | 所有 `@web-clone/*` | P0 |
| 添加 `files: ["dist/", ...]` | 所有发布包 | P0 |
| 添加 `license`、`repository`、`homepage` | 所有发布包 | P1 |
| 添加 `keywords`、`engines` | 所有发布包 | P1 |
| 创建根目录 `LICENSE` (MIT) 文件 | 仓库根 | P1 |

### Phase 2: 依赖清理（1-2 天）

| 任务 | 涉及文件 | 优先级 |
|------|---------|--------|
| 从 `@web-clone/core` 移除 `chalk`、`ora` | `packages/core/package.json` | P0 |
| 将 `chalk` 加入 CLI 依赖 | `apps/cli/package.json` | P0 |
| 检查 `adapter-common` 是否可移除对 `@web-clone/core` 的运行时依赖 | `packages/adapter-common/src/spa-detector.ts` | P1 |
| 添加 `sideEffects: false` 到库包 | `packages/*/package.json` | P1 |

### Phase 3: 构建产物配置（1 天）

| 任务 | 涉及文件 | 优先级 |
|------|---------|--------|
| 确认所有 tsc 配置生成正确的 `.d.ts` + `.js` | 各 `tsconfig.json` | P0 |
| 验证各包 `exports` 指向的 dist 文件存在 | 各 `package.json` | P0 |
| 运行 `pnpm -r pack --dry-run` 验证产物清单 | CI/手动 | P1 |

### Phase 4: 发布与验证（1 天）

| 任务 | 优先级 |
|------|--------|
| npm 账号登录 & 权限确认 | P0 |
| 按依赖顺序发布: core → adapter-common → codegen → adapter-* → cli | P0 |
| 验证 `npm i @web-clone/core` 安装成功 | P0 |
| 验证 `npx web-clone-cli --help` 可用 | P0 |
| 验证 `npm i -g web-clone-cli && snapshot --help` 可用 | P0 |

---

## 附录

### A. 发布顺序依赖图

```
发布顺序（严格）:
  1. @web-clone/core          ← 被所有其他包依赖
  2. @web-clone/adapter-common ← 被 adapter-playwright/puppeteer 依赖
  3. @web-clone/codegen        ← 被 cli 依赖
  4. @web-clone/adapter-playwright  ← 被 cli (optional) 依赖
  5. @web-clone/adapter-puppeteer   ← 被 cli (optional) 依赖
  6. web-clone-cli             ← 应用层，最后发布
```

### B. 各包发布内容清单

```
@web-clone/core@1.0.0 发布内容:
  dist/          ✅ ESM + .d.ts + sourcemap
  README.md      ✅（需确保存在）
  LICENSE        ✅（指向根 LICENSE 或自带）
  package.json   ✅
  ❌ 不包含: src/, __tests__/, node_modules/, tsconfig.json

@web-clone/codegen@1.0.0 发布内容:
  dist/          ✅
  README.md      ✅
  LICENSE        ✅
  package.json   ✅

@web-clone/adapter-common@1.0.0 发布内容:
  dist/          ✅
  README.md      ✅
  LICENSE        ✅
  package.json   ✅

@web-clone/adapter-playwright@1.0.0 发布内容:
  dist/          ✅
  README.md      ✅
  LICENSE        ✅
  package.json   ✅

@web-clone/adapter-puppeteer@1.0.0 发布内容:
  dist/          ✅
  README.md      ✅
  LICENSE        ✅
  package.json   ✅

web-clone-cli@1.0.0 发布内容:
  dist/          ✅
  README.md      ✅
  LICENSE        ✅
  package.json   ✅
```

### C. 常用命令速查

```bash
# 构建所有包
pnpm build

# 本地模拟发布（查看产物）
pnpm -r pack --dry-run

# 生成压缩包
pnpm -r pack

# 发布所有非 private 包
pnpm publish -r --access public

# 发布指定包
pnpm --filter @web-clone/core publish --access public

# 验证已发布的包
npm info @web-clone/core
npx web-clone-cli --help
```

### D. 更新包名称约定说明

```
npm 包名            | 作用域  | 可见性     | 安装方式
@web-clone/core     | 组织级  | public     | npm i @web-clone/core
@web-clone/codegen  | 组织级  | public     | npm i @web-clone/codegen
web-clone-cli       | 全局    | public     | npm i -g web-clone-cli

注意：@web-clone 组织需要在 npm 上创建。
替代方案（如不创建组织）：
  - 使用个人 scope: @your-name/web-clone-core
  - 或扁平命名: web-clone-core, web-clone-codegen, web-clone-cli
  - 或单一包: @web-clone/web-clone (不推荐，会增大安装体积)
```

---

> **文档变更记录**
>
> | 日期 | 变更内容 | 负责人 |
> |------|---------|--------|
> | 2026-07-14 | 初稿 | - |