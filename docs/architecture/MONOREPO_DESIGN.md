# Monorepo 架构设计方案 — web-clone

**状态:** 设计阶段  
**日期:** 2026-07-13  
**版本:** v2.0-draft  
**上下文:** 基于 [MIGRATION_PLAN.md](./MIGRATION_PLAN.md) 执行反馈修正，适配器从合并包拆分为 adapter-common + adapter-playwright + adapter-puppeteer。

---

## 1. 问题陈述

### 1.1 当前架构现状

```
web-clone (单体包)
├── src/
│   ├── cli.ts                    # CLI 入口
│   ├── assembler.ts              # 核心快照逻辑
│   ├── fetcher.ts                # HTTP 请求
│   ├── adapters/
│   │   ├── http-fetcher-adapter.ts
│   │   ├── automation/
│   │   │   ├── playwright/       # Playwright 适配器（可选）
│   │   │   ├── puppeteer/        # Puppeteer 适配器（可选）
│   │   │   └── spa-detector.ts   # SPA 水合检测（被两个适配器共享）
│   │   └── index.ts              # 动态导出 loadPlaywrightAdapter()
│   ├── transform/
│   │   └── framework-codegen/    # Vue/React/Angular/Svelte/jQuery 代码生成器
│   └── parser/...
├── examples/
│   ├── playwright/               # 示例：用 Playwright 调用库
│   └── playwright-snapshot/      # 示例项目骨架
├── package.json                  # 一个 package.json 管理所有依赖
└── tsconfig.json
```

### 1.2 现有问题

| 问题 | 影响 | 严重度 |
|------|------|--------|
| **Playwright/Puppeteer 代码在核心库中** | 所有适配器代码混在一起，编译产物包含用户可能永远不用的代码 | 中 |
| **单一 package.json** | 用户安装 npm 包时，devDependencies 中的 Playwright/Puppeteer 虽然不会进入用户项目，但开发时版本管理混乱 | 中 |
| **CLI 无法直接使用浏览器适配器** | 用户需要写额外的 Node.js 脚本来用 Playwright，不能一行命令完成 | 高 |
| **代码生成器与核心紧耦合** | Vue/React/Angular/Svelte/jQuery 生成器的依赖（如 `@babel/parser`）必须和核心库一起安装 | 低-中 |
| **构建缓存缺失** | 每次 tsc 全量编译，大型项目增量构建慢 | 低 |
| **示例项目难以安装验证** | `examples/playwright-snapshot/` 仅是一个目录骨架，没有独立的 package.json 和安装流程 | 中 |

---

## 2. 方案分析

### 2.1 方案 A：保持单体，创建独立 Playwright 包（不引入 Monorepo）

```
web-clone (核心库)        @web-clone/playwright   用户项目
  (不变)                       (新 npm 包)
  - 核心快照逻辑                - 依赖 web-clone
  - HttpFetcherAdapter         - 依赖 playwright       → npm install web-clone @web-clone/playwright
  - CLI                        - 导出 PlaywrightFetcherAdapter   playwright
  - 代码生成器                  - 导出 waitForSpaHydration
```

**优点:**
- 改动最小
- 用户按需安装 `@web-clone/playwright`
- Playwright 版本完全由这个包管理

**缺点:**
- 仍然没有 monorepo 工具链（构建、测试、发布各自为政）
- Puppeteer 也要独立包 → 包数量膨胀但缺乏统一编排
- CLI 仍然无法直接使用 Playwright（除非 CLI 自身依赖 `@web-clone/playwright`）
- 跨包的 `spa-detector.ts` 共享困难（要么复制，要么提取为第三个包 `@web-clone/spa-detector`）
- 与现有的 `loadPlaywrightAdapter()` 动态导入模式冲突

### 2.2 方案 B：Monorepo + Turborepo

```
web-clone/
├── apps/
│   └── cli/                    ← CLI 应用
├── packages/
│   ├── core/                   ← @web-clone/core（核心快照逻辑）
│   ├── playwright-adapter/     ← @web-clone/playwright-adapter
│   ├── puppeteer-adapter/      ← @web-clone/puppeteer-adapter
│   ├── spa-detector/           ← @web-clone/spa-detector（共享工具）
│   ├── vue-generator/          ← @web-clone/vue-generator
│   ├── react-generator/        ← @web-clone/react-generator
│   └── (其他代码生成器...)
├── examples/
│   └── playwright-snapshot/    ← 独立示例（引用 workspace 包）
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

**优点:**
- 清晰的包边界：每个适配器/生成器独立版本、独立依赖
- CLI 可以依赖 `@web-clone/playwright-adapter`，实现 `--browser playwright` 标志
- Turborepo 缓存加速 CI
- `spa-detector` 作为独立包被 Playwright 和 Puppeteer 共享
- 示例项目可以直接 `pnpm add` workspace 包

**缺点:**
- 迁移工作量大
- 需要团队接受 pnpm + turborepo 工具链
- 初期配置复杂
- 包数量多需要规范管理

### 2.3 方案 C：混合方案 — Monorepo 但适度拆分（选定方案）

```
web-clone/
├── apps/
│   └── cli/
├── packages/
│   ├── core/                   ← @web-clone/core
│   ├── adapter-common/         ← @web-clone/adapter-common
│   ├── adapter-playwright/     ← @web-clone/adapter-playwright
│   ├── adapter-puppeteer/      ← @web-clone/adapter-puppeteer
│   └── codegen/                ← @web-clone/codegen
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

与 v1 方案 C 的区别：
- `browser-adapters/`（合并包）→ 拆分为 `adapter-common` + `adapter-playwright` + `adapter-puppeteer`
- 每个适配器包在其 `dependencies` 中声明各自的框架依赖（playwright / puppeteer），而非 `peerDependencies`
- `adapter-common` 零框架依赖，只共享 spa-detector 和通用的自动化选项类型

---

## 3. 推荐方案：方案 C（混合 Monorepo，适配器拆分版本）

### 3.1 选择理由

| 评估维度 | 方案 A (独立包) | 方案 B (细粒度 Monorepo) | 方案 C (混合 Monorepo) |
|----------|--------------|----------------------|----------------------|
| **迁移成本** | 低 | 高 | **中** |
| **包边界清晰度** | 中 | 高 | **高** |
| **依赖隔离** | 中 | 高 | **高** |
| **CLI 集成能力** | 低 | 高 | **高** |
| **构建缓存** | 无 | 有 | **有** |
| **维护复杂度** | 低 | 高部件管理 | **中** |
| **用户安装体积** | 按需 | 按需 | **按需** |
| **与现有架构兼容性** | 高 | 低 | **中高** |

**结论**: 方案 C（适配器拆分版本）在迁移成本与长期收益之间取得最佳平衡。相比 v1 的合并包方案，独立适配器包更彻底地解决了框架依赖混装问题。

### 3.2 推荐包结构

```
web-clone/
├── apps/
│   └── cli/                            # CLI 应用
│       ├── package.json                  → name: "web-clone-cli"
│       │   dependencies:
│       │     "@web-clone/core": "workspace:*"
│       │     "@web-clone/codegen": "workspace:*"
│       │   optionalDependencies:
│       │     "@web-clone/adapter-playwright": "workspace:*"
│       │     "@web-clone/adapter-puppeteer": "workspace:*"
│       ├── tsconfig.json
│       ├── src/
│       │   ├── cli.ts                   ← 当前 src/cli.ts
│       │   ├── config/                  ← 当前 src/config/*
│       │   └── ...
│       └── README.md
│
├── packages/
│   ├── core/                            # 核心库
│   │   ├── package.json                  → name: "@web-clone/core"
│   │   │   dependencies:
│   │   │     "@babel/parser": "^8.0.4"
│   │   │     "chalk": "^5.6.2"
│   │   │     ...
│   │   │   peerDependencies:
│   │   │     "@web-clone/codegen": "workspace:*"   # optional
│   │   │     jsdom: "^29.0.0"                      # optional
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                 # 公共导出
│   │   │   ├── assembler.ts
│   │   │   ├── fetcher.ts
│   │   │   ├── types.ts
│   │   │   ├── validators.ts
│   │   │   ├── parser/                  # html-parser, css-parser, url-resolver
│   │   │   ├── output/                  # bundle, single-file, convert
│   │   │   ├── core/                    # resource-filter, path-fixer
│   │   │   ├── memory-budget.ts
│   │   │   ├── converter.ts
│   │   │   ├── worker/
│   │   │   └── adapters/
│   │   │       ├── fetcher-adapter.ts   # 接口定义（不移出）
│   │   │       ├── http-fetcher-adapter.ts
│   │   │       └── index.ts             ← 仅导出 HttpFetcherAdapter 及接口类型
│   │   └── README.md
│   │
│   ├── adapter-common/                  # 共享适配器工具
│   │   ├── package.json                  → name: "@web-clone/adapter-common"
│   │   │   dependencies:
│   │   │     "@web-clone/core": "workspace:*"
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                 # 导出 waitForSpaHydration
│   │   │   ├── spa-detector.ts          ← 当前 src/adapters/automation/spa-detector.ts
│   │   │   └── automation-options.ts    ← 当前 src/adapters/automation/options.ts
│   │   └── README.md
│   │
│   ├── adapter-playwright/             # Playwright 适配器
│   │   ├── package.json                  → name: "@web-clone/adapter-playwright"
│   │   │   dependencies:
│   │   │     "@web-clone/core": "workspace:*"
│   │   │     "@web-clone/adapter-common": "workspace:*"
│   │   │     "playwright": "^1.58.2"
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                 # 导出 PlaywrightFetcherAdapter
│   │   │   ├── adapter.ts               ← 当前 src/adapters/automation/playwright/adapter.ts
│   │   │   └── options.ts               ← 当前 src/adapters/automation/playwright/options.ts
│   │   └── README.md
│   │
│   ├── adapter-puppeteer/              # Puppeteer 适配器
│   │   ├── package.json                  → name: "@web-clone/adapter-puppeteer"
│   │   │   dependencies:
│   │   │     "@web-clone/core": "workspace:*"
│   │   │     "@web-clone/adapter-common": "workspace:*"
│   │   │     "puppeteer": "^25.3.0"
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                 # 导出 PuppeteerFetcherAdapter
│   │   │   ├── adapter.ts               ← 当前 src/adapters/automation/puppeteer/adapter.ts
│   │   │   └── options.ts               ← 当前 src/adapters/automation/puppeteer/options.ts
│   │   └── README.md
│   │
│   └── codegen/                         # 代码生成器包
│       ├── package.json                  → name: "@web-clone/codegen"
│       │   dependencies:
│       │     "@web-clone/core": "workspace:*"
│       │     "@babel/parser": "^8.0.4"
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts
│       │   ├── framework-rules.ts
│       │   ├── base-generator.ts
│       │   ├── vue-generator.ts
│       │   ├── react-generator.ts
│       │   ├── angular-generator.ts
│       │   ├── svelte-generator.ts
│       │   ├── jquery-generator.ts
│       │   ├── shared-logic-extractor.ts
│       │   └── config-generator.ts
│       └── README.md
│
├── examples/
│   └── playwright-snapshot/
│
├── docs/
│   ├── ref/
│   │   ├── pnpm-workspace.yaml
│   │   └── turbo.json
│   └── architecture/
│       ├── MONOREPO_DESIGN.md
│       └── MIGRATION_PLAN.md
│
├── pnpm-workspace.yaml
├── turbo.json
├── package.json                         # 根（仅 devDeps + scripts）
├── tsconfig.base.json
└── vitest.workspace.ts
```

---

## 4. 关键文件配置

### 4.1 根 `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### 4.2 根 `turbo.json`

直接参考 `docs/ref/turbo.json`，与 v1 一致。

### 4.3 根 `package.json`

```json
{
  "name": "web-clone-monorepo",
  "private": true,
  "packageManager": "pnpm@10.8.0",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "clean": "turbo run clean",
    "typecheck": "turbo run typecheck",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "turbo": "^2.5.0",
    "typescript": "^5.9.3",
    "eslint": "^10.7.0",
    "@eslint/js": "^10.0.1",
    "typescript-eslint": "^8.63.0",
    "vitest": "^4.1.10",
    "@vitest/coverage-v8": "^4.1.10",
    "prettier": "^3.6.0",
    "jsdom": "^29.1.1"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### 4.4 `packages/core/package.json`

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
    "./types": "./dist/types.js"
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
    "@web-clone/codegen": {
      "optional": true
    },
    "jsdom": {
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

### 4.5 `packages/adapter-common/package.json`

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
  "dependencies": {
    "@web-clone/core": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^26.1.1"
  }
}
```

### 4.6 `packages/adapter-playwright/package.json`

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

### 4.7 `packages/adapter-puppeteer/package.json`

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

### 4.8 `packages/codegen/package.json`

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

### 4.9 `apps/cli/package.json`

```json
{
  "name": "web-clone-cli",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "snapshot": "dist/cli.js"
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

---

## 5. 依赖关系图谱

```
apps/cli
  ├── @web-clone/core            (workspace:*)
  ├── @web-clone/codegen         (workspace:*)
  ├── @web-clone/adapter-playwright  (optional)
  └── @web-clone/adapter-puppeteer   (optional)

packages/adapter-playwright
  ├── @web-clone/core            (workspace:*)
  ├── @web-clone/adapter-common  (workspace:*)
  └── playwright                 (hard dependency)

packages/adapter-puppeteer
  ├── @web-clone/core            (workspace:*)
  ├── @web-clone/adapter-common  (workspace:*)
  └── puppeteer                  (hard dependency)

packages/adapter-common
  ├── @web-clone/core            (workspace:*)
  └── (无自动化框架依赖)

packages/codegen
  ├── @web-clone/core            (workspace:*)
  ├── @babel/parser
  ├── @babel/traverse
  └── @babel/types

packages/core
  ├── @babel/parser              (js-analyzer 所需)
  ├── chalk
  ├── css-tree
  ├── postcss
  ├── @web-clone/codegen         (optional peer — convert.ts 需要)
  └── jsdom                      (optional peer — html-parser 需要)
```

**关键设计点：**

- **`@web-clone/codegen` 作为 core 的 optional peer**：只有启用 `--extract-components` 时需要，纯 HTTP 快照场景不依赖 codegen。
- **`adapter-*` 不自带 jsdom**：Playwright/Puppeteer 运行在真实浏览器上下文中，不需要 DOM 模拟。只有 core 的 HTTP 模式需要 jsdom。
- **每个 adapter-* 包硬依赖自己的自动化框架**：用户安装 `@web-clone/adapter-playwright` 时自动拉取 playwright，无需手动安装 peer dependency。
- **`@babel/*` 在 core 和 codegen 中都存在**：js-analyzer.ts 在 core 中使用 `@babel/parser` 解析 JavaScript AST。虽然 codegen 也使用 babel，但两者是独立用途，互不依赖。

---

## 6. 适配器拆分设计：为何不采用合并包？

### 6.1 分析

| 方案 | 描述 |
|------|------|
| **合并包** `@web-clone/browser-adapters` | Playwright + Puppeteer + spa-detector 在一个包 |
| **拆分包** `adapter-common` + `adapter-playwright` + `adapter-puppeteer` | 按框架拆分，共享逻辑独立为公共包 |

v1 选择了合并包，通过 `peerDependenciesMeta.optional` 避免强制安装。但在实际迁移中暴露了问题：

1. **`peerDependencies` 的弱点**：pnpm 的 strict-peer-dependencies 模式下，peer 缺失会报错；即使设为可选，用户仍需手动处理 peer 安装提示。
2. **依赖版本管理**：Playwright 和 Puppeteer 各有自己的发布节奏，放在同一个包中导致版本号难以统一管理。
3. **`devDependencies` 引入的间接污染**：为编译测试必须在 devDependencies 中同时安装两个框架，开发环境仍被两套重型依赖拖慢。

### 6.2 决策：采用拆分包

**理由：**

1. **每个适配器包独立版本**：Playwright API 变化快（月更），Puppeteer 更新节奏不同。独立包可以让各自独立发版，不相互阻塞。

2. **用户零安装心智负担**：
   ```bash
   # 合并包方案：
   pnpm add @web-clone/browser-adapters   # 无 playwright — 需要额外处理 peer dep
   pnpm add @web-clone/browser-adapters playwright   # 多一步，且版本要手动匹配
   
   # 拆分包方案：
   pnpm add @web-clone/adapter-playwright  # playwright 自动安装，版本锁定
   ```

3. **CLI 中仅需用户按需安装**：
   ```bash
   # HTTP 模式 — 零额外安装
   npx web-clone https://example.com
   
   # Playwright 模式 — 只多一个包
   pnpm add @web-clone/adapter-playwright
   npx web-clone https://spa-site.com --browser playwright
   ```

4. **`spa-detector` 作为 `adapter-common`**：零框架依赖，Playwright 和 Puppeteer 适配器都依赖它。一个包管理共享逻辑，不额外膨胀。

### 6.3 与 v1 的对比

| 维度 | v1 合并包 | v2 拆分包 |
|------|----------|----------|
| 包数量 | 3 个（core, browser-adapters, codegen） | 6 个（core, adapter-common, adapter-playwright, adapter-puppeteer, codegen, cli） |
| playwright 依赖方式 | peer (optional) | hard dependency |
| puppeteer 依赖方式 | peer (optional) | hard dependency |
| 版本管理 | 两个框架共用版本号 | 各自独立版本号 |
| 用户安装 | `pnpm add @web-clone/browser-adapters playwright` | `pnpm add @web-clone/adapter-playwright` |
| 共享逻辑 | 同包内 spa-detector | `adapter-common` 包 |

### 6.4 CLI `--browser` 标志设计

```typescript
// apps/cli/src/cli.ts
program
  .option('--browser <type>', 'Use browser automation: playwright | puppeteer (requires respective package)')

if (opts.browser) {
  if (opts.browser === 'playwright') {
    try {
      const { PlaywrightFetcherAdapter } = await import('@web-clone/adapter-playwright');
      const adapter = new PlaywrightFetcherAdapter(page, context);
      // ...
    } catch {
      console.error(chalk.yellow('Install: pnpm add @web-clone/adapter-playwright'));
    }
  } else if (opts.browser === 'puppeteer') {
    try {
      const { PuppeteerFetcherAdapter } = await import('@web-clone/adapter-puppeteer');
      const adapter = new PuppeteerFetcherAdapter(page);
      // ...
    } catch {
      console.error(chalk.yellow('Install: pnpm add @web-clone/adapter-puppeteer'));
    }
  }
}
```

---

## 7. 迁移步骤

详见 [MIGRATION_PLAN.md](./MIGRATION_PLAN.md)，共 4 个 Phase：

| Phase | 内容 | 关键操作 |
|-------|------|---------|
| **Phase 0** | 基础设施搭建 | 根配置、pnpm、turbo |
| **Phase 1** | core + codegen 迁移 | 移动核心代码 + framework-codegen |
| **Phase 2a** | adapter-common 迁移 | 移动 spa-detector、options |
| **Phase 2b** | adapter-playwright 迁移 | 移动 Playwright 适配器 |
| **Phase 2c** | adapter-puppeteer 迁移 | 移动 Puppeteer 适配器 |
| **Phase 3** | CLI 迁移 | 移动 cli.ts + config 文件 |
| **Phase 4** | 清理验证 | 删除空 src/，全链路测试 |

核心迁移原则：
- 所有文件操作使用 `git mv`（保留 git 历史）
- 每完成一个 Phase 都可 `pnpm install && pnpm build` 通过
- 迁移完成后旧的 `src/` 目录应完全清空

---

## 8. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| **迁移期破坏测试** | 中 | 高 | 保持原分支可运行，新建 feature 分支迁移；迁移完成前不合并 main |
| **pnpm => npm 生态差异** | 中 | 中 | 保留 `package-lock.json` 到迁移完成再切换 |
| **循环依赖** | 低 | 高 | 严格保持单向依赖：`core → adapter-common → adapter-*`，`core → codegen` |
| **turbo 配置调试耗时** | 中 | 低 | 先使用 `--filter` 逐步验证，再启用全局缓存 |
| **jsdom peer dep 冲突** | 低 | 中 | core 的 peerDependencies 设宽松范围 `^29.0.0` |

---

## 9. 版本策略

### 9.1 版本对齐

| 包 | 初始版本 | 发布策略 |
|----|---------|---------|
| `@web-clone/core` | 1.0.0 | 与 CLI 同步 |
| `@web-clone/adapter-common` | 1.0.0 | 随适配器 API 更新 |
| `@web-clone/adapter-playwright` | 1.0.0 | 独立版本，随 Playwright API 更新 |
| `@web-clone/adapter-puppeteer` | 1.0.0 | 独立版本，随 Puppeteer API 更新 |
| `@web-clone/codegen` | 1.0.0 | 独立版本，随语言版本更新 |
| `web-clone-cli` (可选发布) | 1.0.0 | 跟随 core 版本 |

### 9.2 向后兼容

- `@web-clone/core` 保持与当前 `web-clone` npm 包相同的导出接口（`snapshot`, `convertLocalSnapshot`, `HttpFetcherAdapter`, `types`）
- 现有通过 `web-clone/adapters` 的导入（`loadPlaywrightAdapter()`）在迁移后移入各自的 adapter-* 包，core 中不再保留
- 发布时使用 `deprecated` 标签提示迁移

---

## 10. 与现有架构的兼容性

### 10.1 核心 API 不改变

- `snapshot(url, options, adapter?)` 签名保持不变
- `SnapshotOptions` 类型保持不变
- `FetcherAdapter` 接口保持不变

### 10.2 适配器加载方式变化

```typescript
// 当前写法（用户项目）
import { loadPlaywrightAdapter } from 'web-clone/adapters';

// 迁移后写法
import { PlaywrightFetcherAdapter } from '@web-clone/adapter-playwright';

// ⚠️ 注意：不再需要动态加载，因为 adapter-playwright 已声明 playwright 为 hard dependency
```

### 10.3 现有 CLI 用法不受影响

- `npm run dev -- https://example.com` 继续工作（默认 HTTP）
- `npm run build` 继续工作
- `npm test` 继续工作

---

## 11. 附录：关键命令速查

```bash
# 安装
pnpm install

# 构建所有包
pnpm build                          # turbo run build

# 仅构建特定包
pnpm --filter @web-clone/core build

# 运行测试
pnpm test                           # turbo run test

# 添加依赖
pnpm --filter @web-clone/core add chalk

# 添加 dev 依赖
pnpm --filter @web-clone/core add -D typescript

# 清理
pnpm clean                          # turbo run clean

# 发布包
pnpm --filter @web-clone/core publish

# CLI 本地测试
pnpm --filter web-clone-cli dev -- https://example.com
pnpm --filter web-clone-cli dev -- https://spa-site.com --browser playwright
```
