# SPA 抓取能力 E2E 测试设计方案

## 一、现状分析

### 1.1 当前测试体系概览

web-clone 的测试分为三个层次，共 37 个测试文件：

| 层次 | 位置 | 测试方式 | 浏览器 | 覆盖场景 |
|------|------|---------|--------|---------|
| 单元测试 | `packages/*/src/__tests__/` | Mock + vitest | 无 | 各模块独立逻辑 |
| 集成测试 | `packages/*/src/__tests__/integration/` | 真实 Playwright + 本地服务器 | 有 | 完整管线 |
| CLI E2E | `apps/cli/src/__tests__/integration/` | tsx 执行 CLI + Python 服务器 | 无 | CLI 命令行 |

### 1.2 SPA 检测测试现状

#### 单元测试（`packages/adapter-common/src/__tests__/spa-detector.test.ts`）

该文件是 SPA 检测能力的核心测试，覆盖 14 个场景，但**全部使用 Mock 实现**：

```typescript
// 典型的 Mock 方式：用 vi.fn() 伪造浏览器行为
function createMockPage(evaluateReturn1, evaluateReturn2) {
  const mockEvaluate = vi.fn()
    .mockResolvedValueOnce(evaluateReturn1)    // 模拟 Phase 1: SSR 检测
    .mockResolvedValueOnce(evaluateReturn2);    // 模拟 Phase 2: 水合检测
  const mockWaitForFunction = vi.fn().mockResolvedValue(undefined);
  const mockWaitForTimeout = vi.fn().mockResolvedValue(undefined);

  return {
    evaluate: mockEvaluate,
    waitForFunction: mockWaitForFunction,
    waitForTimeout: mockWaitForTimeout,
  };
}
```

**覆盖的场景**：
1. Nuxt 3 SSR 页面 — 检测 `__NUXT__` + 等待 Vue 水合
2. Nuxt 2 SSR 页面 — 检测 `$nuxt.$mount`
3. Vue 3 SPA — 检测 `__VUE__` 全局变量
4. React SPA — 检测 `__REACT_DEVTOOLS_GLOBAL_HOOK__`
5. Angular SPA — 检测 `ng.probe`
6. Plain HTML — 无框架标记，快速返回
7. Next.js SPA — 检测 `__NEXT_DATA__`
8. SvelteKit SPA — 检测 `__sveltekit__`
9. Vue 2 SPA — 检测 `Vue.version.startsWith('2')`
10. Vue 未知版本 — 降级到 Vue 3 低置信度
11. Nuxt 低置信度 — 仅有 `#__nuxt` 无版本信号
12. Next.js DOM 启发式 — 仅有 `#__next` 无 `__NEXT_DATA__`
13. React DOM 启发式 — 仅有 `#root` 无 devtools hook
14. 超时处理 — 各阶段超时非致命

**问题**：Mock 测试假设了浏览器的返回值结构，但无法验证：
- 真实框架运行时中 `evaluate()` 返回的实际信号值
- 生产构建中开发工具标记（`__REACT_DEVTOOLS_GLOBAL_HOOK__`、`ng.probe`）缺失时的 DOM 启发式检测
- 实际 SPA 页面水合完成后的 DOM 结构与 Mock 设定是否一致
- `waitForFunction` 的回调在真实浏览器中是否真的会按预期返回 `true`

#### 集成测试（`packages/adapter-playwright/src/__tests__/integration/snapshot-with-real-content.test.ts`）

使用真实 Playwright 浏览器，但**仅覆盖了一个假的 SPA 场景**：

```typescript
// test-server.ts 中的 "SPA" 页面 — 仅是静态 HTML + window.__VUE__ = true
const TEST_SPA_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>SPA Test Page</title></head>
<body>
  <div id="app">
    <h1>Vue SPA</h1>
    <p>This page simulates a Vue.js SPA for SSR detection testing.</p>
    <img src="/image.svg" alt="test">
  </div>
  <script src="/script.js"></script>
  <script>
    window.__VUE__ = true;
  </script>
</body>
</html>`;
```

**问题**：
- 不是真实的 Vue 应用（没有 Vue 运行时、没有组件系统、没有响应式数据绑定）
- 没有框架构建产物（没有 webpack/vite 打包的 JS bundle）
- 不包含其他框架（React、Angular、Nuxt、Next.js、SvelteKit）
- 无法验证生产环境下的真实场景

#### CLI E2E 测试（`apps/cli/src/__tests__/integration/cli-e2e.test.ts`）

使用 Python HTTP 服务器提供静态 HTML 页面，但**不涉及任何 SPA 框架**：

```typescript
// 仅测试了一个简单的静态 HTML 页面
it('should run bundle mode via tsx', () => {
  const testUrl = `http://127.0.0.1:${serverPort}/test-page.html`;
  const output = execSync(
    `${TSX_PATH} ${CLI_PATH} ${testUrl} -o ${testDir} -m bundle --max-assets 10`,
    { encoding: 'utf-8', timeout: 60000 }
  );
  expect(output).toContain('complete');
  expect(existsSync(`${testDir}/index.html`)).toBe(true);
});
```

### 1.3 核心缺口总结

| 缺口 | 描述 | 影响 |
|------|------|------|
| 无真实框架验证 | 所有 SPA 检测测试基于 Mock，从未在真实框架应用中运行 | 检测逻辑可能对真实框架的生产构建输出失准 |
| 覆盖框架不全 | 仅对 Vue SPA 有假的集成测试，React/Angular/Nuxt/Next.js/SvelteKit 完全无集成测试 | 其他框架的检测能力未经实测验证 |
| 无端到端管线 | 没有从"构建 SPA → 部署 → 爬取 → 验证"的完整流程测试 | 无法保证管线在真实场景中端到端正确 |
| 无抓取结果归档 | 测试产出不持久化，无法做回归对比 | 无法追踪抓取质量随代码变更的变化 |
| 无生产构建场景 | 所有 Mock 假设 devtools 标记可用，未验证生产构建中 DOM 启发式检测 | 生产环境可能是测试盲区 |

---

## 二、E2E 测试方案设计

### 2.1 设计目标

1. **真实框架覆盖**：为每个支持的框架类型创建真实的最小 SPA 应用
2. **生产构建验证**：测试框架生产构建输出（开发标记可能缺失）
3. **端到端管线**：构建 fixture → 部署 → 爬取 → 验证
4. **结果可归档**：每次抓取结果输出到 `outputs/` 目录，支持人工检查和自动化回归对比
5. **轻量可执行**：fixture 构建后的产物作为静态资源提交，测试时无需安装框架构建工具

### 2.2 方案选型

#### 选项 A：测试时动态构建

每次运行测试时，在前置步骤中构建各框架的 fixture 项目。

- 优点：始终使用最新的框架版本，能发现框架升级引入的兼容性问题
- 缺点：耗时（每个框架构建 30s-2min），需要安装框架构建依赖，受网络环境影响

#### 选项 B：预构建静态 fixtures（选择此方案）

将各框架项目构建完成的产物作为静态资源提交到仓库。

- 优点：开箱即用，无需构建环境，测试启动快（仅启动 HTTP 服务），结果确定可重复
- 缺点：框架版本固定，需要手动更新

**选择方案 B 的理由**：
- E2E 测试的核心目标是验证 web-clone 的 SPA 抓取能力，非框架兼容性
- 预构建产物保证了测试的可重复性和速度
- 框架版本可以半年更新一次，通过 `build-fixtures.ts` 脚本自动化

### 2.3 目录结构

```
tests/e2e/
  fixtures/                          # 框架 fixture 源码 + 构建配置
    vue3-spa/                        # Vue 3 + Vite SPA
      src/
        App.vue
        main.ts
      index.html
      package.json
      vite.config.ts
    react18-spa/                     # React 18 + Vite SPA
      src/
        App.tsx
        main.tsx
      index.html
      package.json
      vite.config.ts
    angular-spa/                     # Angular SPA
      src/
        app/
          app.component.ts
          app.module.ts
        main.ts
      index.html
      package.json
      angular.json
      tsconfig.json
    sveltekit-ssr/                   # SvelteKit SSR (static adapter)
      src/
        routes/
          +page.svelte
      package.json
      svelte.config.js
      vite.config.ts
    nextjs-ssr/                      # Next.js SSR (static export)
      pages/
        index.tsx
      package.json
      next.config.js
      tsconfig.json
    nuxt3-ssr/                       # Nuxt 3 SSR (static generate)
      pages/
        index.vue
      package.json
      nuxt.config.ts
  builds/                            # 预构建的生产产物（提交到 Git）
    vue3-spa/
      index.html
      assets/
        index-xxxxxxxx.js
        index-xxxxxxxx.css
    react18-spa/
      index.html
      assets/
        index-xxxxxxxx.js
        index-xxxxxxxx.css
    angular-spa/
      index.html
      runtime-xxxxxxxx.js
      polyfills-xxxxxxxx.js
      main-xxxxxxxx.js
      styles-xxxxxxxx.css
    sveltekit-ssr/
      index.html
      _app/
        ...
    nextjs-ssr/
      index.html
      _next/
        ...
    nuxt3-ssr/
      index.html
      _nuxt/
        ...
  outputs/                           # 抓取结果（.gitignore）
    vue3-spa/
      index.html                     # web-clone 快照产物
      assets/                        # 下载的子资源
    react18-spa/
      ...
    angular-spa/
      ...
    sveltekit-ssr/
      ...
    nextjs-ssr/
      ...
    nuxt3-ssr/
      ...
    results.json                     # 汇总报告
  helpers/
    fixture-server.ts                # 本地 HTTP 服务器，按需启动各 fixture
    spider-runner.ts                 # 封装 web-clone snapshot() 调用
    assertion-utils.ts               # 公共断言（结构验证、框架检测、内容检查）
  build-fixtures.ts                  # 构建脚本：批量执行各框架的 npm run build
  spa-crawl-e2e.test.ts              # 主 E2E 测试文件
  vitest.config.ts                   # E2E 专用 vitest 配置（长超时、串行等）
```

### 2.4 核心模块设计

#### 2.4.1 Fixture Server（`helpers/fixture-server.ts`）

轻量 HTTP 服务器，负责提供预构建 fixture 的静态文件：

```typescript
/**
 * 为每个框架 fixture 返回独立的 URL
 *
 * 使用方式：
 *   const server = await startFixtureServer();
 *   const vueUrl = server.getFixtureUrl('vue3-spa');   // http://127.0.0.1:PORT/vue3-spa/
 *   const reactUrl = server.getFixtureUrl('react18-spa');
 */
export interface FixtureServer {
  getFixtureUrl(fixtureName: string): string;
  close(): Promise<void>;
}

export async function startFixtureServer(
  buildsDir: string
): Promise<FixtureServer>;
```

实现要点：
- 基于 Node.js `http` 模块（零外部依赖）
- 支持 MIME 类型自动检测（特别是 Angular 和 Next.js 的特殊文件类型）
- 端口随机分配，避免冲突

#### 2.4.2 Spider Runner（`helpers/spider-runner.ts`）

封装 web-clone 的爬取调用，统一输出格式：

```typescript
export interface CrawlResult {
  /** 目标框架名称 */
  framework: string;
  /** 目标 URL */
  url: string;
  /** 是否成功 */
  success: boolean;
  /** SPA 检测结果 */
  spaDetection: SpaDetectionResult | null;
  /** 框架检测摘要 */
  frameworkDetection: {
    detected: string;
    expected: string;
    match: boolean;
    confidence: number;
  } | null;
  /** 输出目录 */
  outputDir: string;
  /** 快照统计 */
  stats: {
    totalAssets: number;
    mode: 'bundle' | 'single';
  } | null;
  /** 错误信息 */
  error?: string;
  /** 耗时 (ms) */
  duration: number;
}

export interface CrawlOptions {
  /** 目标 URL */
  url: string;
  /** 输出目录 */
  outputDir: string;
  /** 期望的框架类型 */
  expectedFramework?: SpaDetectionResult['framework'];
  /** 超时 (ms)，默认 60000 */
  timeout?: number;
}

export async function runCrawl(
  options: CrawlOptions
): Promise<CrawlResult>;
```

#### 2.4.3 Assertion Utils（`helpers/assertion-utils.ts`）

公共断言函数，统一各框架的验证标准：

```typescript
/**
 * 验证 bundle 模式输出目录结构
 * - 必须存在 index.html
 * - 必须存在 assets/ 目录
 */
export function assertBundleStructure(outputDir: string): void;

/**
 * 验证 index.html 包含有效的 HTML 结构
 * - 包含 <!DOCTYPE html>
 * - 包含 <html> / </html>
 * - 包含 <head>
 * - 包含 <body>
 */
export function assertValidHtml(htmlPath: string): void;

/**
 * 验证页面内容非空（不是空白页或加载骨架）
 * - body 内有实际文本内容（> 50 字符）
 * - 至少包含 3 个以上的 HTML 元素
 */
export function assertContentCaptured(htmlPath: string): void;

/**
 * 验证框架检测结果
 * - 检测到的框架与期望一致
 * - 置信度 >= 阈值
 */
export function assertFrameworkDetection(
  result: CrawlResult,
  expected: string,
  minConfidence?: number
): void;

/**
 * 验证子资源被成功下载
 * - 外部 CSS/JS 引用被替换为本地路径
 * - 图片等资源被保存
 */
export function assertSubResourcesDownloaded(
  htmlPath: string,
  outputDir: string
): void;
```

### 2.5 测试用例设计

主测试文件 `spa-crawl-e2e.test.ts` 包含以下测试组：

```
SPA 抓取 E2E
├── Vue 3 SPA
│   ├── 应正确检测框架为 vue3
│   ├── 应捕获完整的 hydrated DOM 内容
│   ├── 应下载并重写子资源路径
│   └── 应输出有效的 bundle 结构
├── React 18 SPA
│   ├── 应正确检测框架为 react18（含 __reactFiber$ 等生产信号）
│   ├── 应捕获完整的 hydrated DOM 内容
│   ├── 应下载并重写子资源路径
│   └── 应输出有效的 bundle 结构
├── Angular SPA
│   ├── 应正确检测框架为 angular（含 _nghost-* 生产信号）
│   ├── 应捕获完整的 hydrated DOM 内容
│   ├── 应下载并重写子资源路径
│   └── 应输出有效的 bundle 结构
├── SvelteKit SSR
│   ├── 应正确检测框架为 sveltekit
│   ├── 应捕获完整的 hydrated DOM 内容
│   └── 应输出有效的 bundle 结构
├── Next.js SSR
│   ├── 应正确检测框架为 nextjs（含 __NEXT_DATA__）
│   ├── 应捕获完整的 hydrated DOM 内容
│   └── 应输出有效的 bundle 结构
├── Nuxt 3 SSR
│   ├── 应正确检测框架为 nuxt3（含 __NUXT__）
│   ├── 应捕获完整的 hydrated DOM 内容
│   └── 应输出有效的 bundle 结构
└── 汇总报告
    └── 应将所有抓取结果输出到 outputs/results.json
```

### 2.6 各框架 Fixture 设计要求

每个 fixture 的最小化要求：

| 框架 | 必需元素 | 子资源 | 期望检测信号 | 检测置信度 |
|------|---------|--------|-------------|-----------|
| Vue 3 SPA | `<div id="app">` 含渲染内容 | CSS、JS、IMG | `window.__VUE__` | >= 0.80 |
| React 18 SPA | `<div id="root">` 含渲染内容 | CSS、JS、IMG | `__reactFiber$` 或 `__reactContainer$` (生产) | >= 0.70 |
| Angular SPA | `<app-root>` 含渲染内容 | CSS、JS、IMG | `_nghost-*` / `_ngcontent-*` (生产) | >= 0.60 |
| SvelteKit SSR | `<div id="svelte">` 含渲染内容 | CSS、JS | `window.__sveltekit__` | >= 0.95 |
| Next.js SSR | `<div id="__next">` 含渲染内容 | CSS、JS、IMG | `window.__NEXT_DATA__` | >= 0.95 |
| Nuxt 3 SSR | `<div id="__nuxt">` 含渲染内容 | CSS、JS | `window.__NUXT__` | >= 0.95 |

每个 fixture 页面内容要求：
- **至少 3 个可见的 HTML 元素**（标题、段落、图片/按钮等），确保不是空白骨架
- **至少 1 个外部 CSS 文件**
- **至少 1 个外部 JS bundle**
- **至少 1 个图片资源**（SVG 内联或 PNG 外链）
- **文本内容 > 100 字符**（确保内容被捕获的断言有意义）

### 2.7 构建脚本（`build-fixtures.ts`）

自动化构建所有 fixture 的脚本：

```bash
# 构建所有框架 fixture
npx tsx tests/e2e/build-fixtures.ts

# 构建单个框架
npx tsx tests/e2e/build-fixtures.ts --framework vue3-spa
```

脚本职责：
1. 遍历 `tests/e2e/fixtures/` 下的每个框架目录
2. 执行 `npm install` + `npm run build`
3. 将构建产物复制到 `tests/e2e/builds/<framework>/` 下
4. 输出构建报告

### 2.8 vitest 配置

E2E 测试需要专用配置，不同于单元测试：

```typescript
// tests/e2e/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 90000,      // 每个测试最多 90 秒
    hookTimeout: 30000,      // beforeAll/afterAll 30 秒
    threads: false,          // 串行执行（避免浏览器冲突）
    singleThread: true,
    retry: 0,                // 不重试（失败即失败，方便定位）
    reporters: ['default', 'json'],
    outputFile: {
      json: './tests/e2e/outputs/test-results.json',
    },
  },
});
```

### 2.9 CI/CD 集成

在 CI 环境中运行 E2E 测试：

```bash
# 安装依赖（含 Playwright 浏览器）
pnpm install
npx playwright install chromium --with-deps

# 构建项目
pnpm build

# 运行 E2E 测试
pnpm --filter @web-clone/e2e test

# 输出抓取结果（用于后续回归对比）
ls -la tests/e2e/outputs/
```

### 2.10 `.gitignore` 配置

```
# E2E 测试输出（运行时生成，不提交）
tests/e2e/outputs/

# Fixture 构建临时文件
tests/e2e/fixtures/*/node_modules/
tests/e2e/fixtures/*/dist/
tests/e2e/fixtures/*/.next/
tests/e2e/fixtures/*/.nuxt/
tests/e2e/fixtures/*/.output/
tests/e2e/fixtures/*/.svelte-kit/
```

---

## 三、实现计划

### 3.1 阶段划分

| 阶段 | 内容 | 优先级 | 预估工作量 |
|------|------|--------|-----------|
| Phase 1 | 基础设施：fixture-server、spider-runner、assertion-utils、vitest 配置 | 高 | 1-2 天 |
| Phase 2 | Vue 3 SPA + React 18 SPA fixture 及完整 E2E 测试 | 高 | 1-2 天 |
| Phase 3 | Angular SPA + SvelteKit SSR fixture 及测试 | 中 | 1 天 |
| Phase 4 | Next.js SSR + Nuxt 3 SSR fixture 及测试 | 中 | 1-2 天 |
| Phase 5 | 汇总报告、CI 集成、build-fixtures.ts | 低 | 1 天 |

### 3.2 文件清单

实施顺序如下（标注了每个文件的依赖关系）：

```
Phase 1 (基础设施):
  1. tests/e2e/helpers/fixture-server.ts        # 无依赖
  2. tests/e2e/helpers/spider-runner.ts          # 依赖 @web-clone/core、adapter-playwright
  3. tests/e2e/helpers/assertion-utils.ts        # 无依赖
  4. tests/e2e/vitest.config.ts                  # 无依赖

Phase 2 (Vue + React):
  5. tests/e2e/fixtures/vue3-spa/               # Vue 3 + Vite 最小项目
  6. tests/e2e/builds/vue3-spa/                 # vue3-spa 构建产物
  7. tests/e2e/fixtures/react18-spa/            # React 18 + Vite 最小项目
  8. tests/e2e/builds/react18-spa/              # react18-spa 构建产物
  9. tests/e2e/spa-crawl-e2e.test.ts            # 主测试文件（先只含 Vue + React）

Phase 3 (Angular + SvelteKit):
  10. tests/e2e/fixtures/angular-spa/
  11. tests/e2e/builds/angular-spa/
  12. tests/e2e/fixtures/sveltekit-ssr/
  13. tests/e2e/builds/sveltekit-ssr/

Phase 4 (Next.js + Nuxt):
  14. tests/e2e/fixtures/nextjs-ssr/
  15. tests/e2e/builds/nextjs-ssr/
  16. tests/e2e/fixtures/nuxt3-ssr/
  17. tests/e2e/builds/nuxt3-ssr/

Phase 5 (工具脚本 + CI):
  18. tests/e2e/build-fixtures.ts
  19. 更新根 package.json scripts
  20. 更新 .gitignore
  21. CI 配置
```

---

## 四、风险与缓解

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|---------|
| Playwright 浏览器未安装 | 高 | 测试无法运行 | 在 vitest 配置中检查浏览器可用性，给出明确安装指引 |
| 框架构建产物过大（Angular） | 中 | 仓库体积膨胀 | 设置 Git LFS，或对 Angular 使用最小化配置（仅 `main.js` + `polyfills.js`） |
| 框架版本升级导致 fixture 不兼容 | 中 | 构建失败 | 锁定 fixture 的 `package.json` 版本号；升级时走 `build-fixtures.ts` 自动化流程 |
| Next.js/Nuxt SSR 构建依赖特定工具链 | 中 | 构建失败 | 对 SSR 框架使用 `static export` / `generate` 模式，仅输出静态文件 |
| CI 环境中缺少系统依赖（Chromium 的共享库） | 中 | 测试无法运行 | 安装 Playwright 时使用 `--with-deps` 参数自动安装系统依赖 |

---

## 五、验收标准

E2E 测试套件满足以下条件即视为完成：

1. 覆盖全部 6 个框架类型（Vue 3、React 18、Angular、SvelteKit、Next.js、Nuxt 3）
2. 每个框架的 fixture 包含 >= 3 个 HTML 元素 + >= 1 个外部 CSS + >= 1 个外部 JS + >= 1 个图片
3. 框架检测准确率 100%（检测结果与实际框架一致）
4. 所有测试输出目录包含有效的 `index.html`
5. 所有 `index.html` 中文本内容 > 100 字符
6. 抓取结果自动写入 `tests/e2e/outputs/` 目录
7. `pnpm test:e2e` 命令可一键运行
8. 在未安装框架构建工具的环境中，仅依赖预构建产物即可运行测试
