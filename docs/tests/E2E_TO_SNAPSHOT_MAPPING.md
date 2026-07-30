# E2E 测试基础设施与现有页面抓取功能映射分析

## 文档概述

本文档分析 `tests/e2e/` 下的 E2E 测试基础设施如何用于验证 `@web-clone/core` 的核心页面抓取（snapshot）功能。文档阐明每个 E2E 测试断言对应的 snapshot 管线阶段，以及如何利用现有测试框架扩展对新功能的验证。

**相关文档**：

- `docs/tests/SPA_E2E_TEST_DESIGN.md` — E2E 测试原始设计方案
- `docs/tests/TEST_STRUCTURE.md` — 通用测试项目结构指南
- `docs/tests/MOCK_GUIDE.md` — Mock 对象使用指南
- `skills/web-clone/references/architecture.md` — 管线架构说明

---

## 一、架构全景图

### 1.1 E2E 测试与 Snapshot 管线的对接方式

E2E 测试通过以下关键组件将 snapshot 管线完整纳入验证范围：

```
E2E Test (spa-crawl-e2e.test.ts)
  |
  ├── FixtureServer         → 提供真实框架的预构建静态页面
  ├── Playwright Browser    → 启动 headless Chromium
  └── runCrawl()            → 封装 snapshot() 调用
        |
        ├── PlaywrightFetcherAdapter(page, context)   → 浏览器适配器
        |     ├── fetchWithPage()      → page.goto() + SPA hydration 检测
        |     └── fetchWithContext()   → context.request.fetch() (子资源)
        |
        └── snapshot(options, adapter)              → @web-clone/core
              └── snapshotInternal()
                    ├── 1. fetchHtml            → adapter.fetch(url, { isMainDocument: true })
                    ├── 2. parseHtml            → HTML 解析 + 资源引用提取
                    ├── 3. extractCssAssets     → CSS url() / @import 递归发现
                    ├── 4. ResourceFilter       → 跳过黑名单扩展名
                    ├── 5. downloadAllAssets    → 并行下载子资源
                    ├── 6. postDownloadValidation → 完整性验证
                    ├── 7. assembleBundle       → 输出 bundle 目录
                    ├── 8. detectFramework      → 框架类型 + 置信度
                    └── 9. writeIssuesFiles     → 诊断日志
```

### 1.2 两条关键数据流

| 数据流 | 起点 | 终点 | 验证对象 |
|--------|------|------|---------|
| **主文档流** | `snapshot(options, adapter)` → `fetchHtml()` → `fetchWithPage()` → `page.goto()` | `SnapshotResult.html` | 浏览器渲染后的完整 DOM、SPA 水合状态、框架标记 |
| **子资源流** | `snapshot()` → `downloadAllAssets()` → `fetchWithContext()` → `context.request.fetch()` | `SnapshotResult.assets[]` | CSS/JS/图片/字体等静态资源下载完整性 |

---

## 二、E2E 测试断言与 Snapshot 管线阶段的映射

### 2.1 映射总表

每个 E2E 测试断言对应 snapshot 管线的一个或多个阶段。下表按测试断言分组，列举它们实际验证的管线阶段和输出字段：

| 测试断言 | SnapshotResult 字段 | 管线阶段 | 验证维度 |
|---------|-------------------|---------|---------|
| `assertValidHtml` | `result.html` → 写入 `outputDir/index.html` | 阶段 1 (fetchHtml) → 阶段 7 (assembleBundle) | HTML 结构完整性 |
| `assertContentCaptured` | `result.html` | 阶段 1 (fetchHtml) → `page.content()` | 浏览器渲染后 DOM 非空、实际内容存在 |
| `assertFrameworkDetection` | `result.frameworkDetection` `result.browserFramework` | 阶段 8 (detectFramework) + 适配器内 SPA hydration | 框架类型、置信度 |
| `assertSpaHydrationDetected` | `result.browserFramework.isHydrated` | 适配器内 `waitForSpaHydration()` | SPA 水合状态确认 |
| `assertBundleStructure` | `result.stats` | 阶段 7 (assembleBundle) | 输出目录文件结构 |
| `assertSubResourcesDownloaded` | `result.assets[]` `result.stats.fetched` | 阶段 2-5 (parseHtml → downloadAllAssets) | 子资源下载数量 |
| `assertAllCrawlsSuccessful` | `result.success` (CrawlResult 级别) | 全部阶段 | 无异常退出 |

### 2.2 详细映射分析

#### 2.2.1 `assertValidHtml` — 验证 HTML 结构完整性

**对应管线阶段**：阶段 1 (fetchHtml) → 阶段 7 (assembleBundle)

**验证路径**：
```
snapshot() → fetchHtml() → adapter.fetch(url, { isMainDocument: true })
  → PlaywrightFetcherAdapter.fetchWithPage()
    → page.goto(url, { waitUntil: 'networkidle' })
    → page.content()  // 获取渲染后的完整 HTML
  → assembleBundle()  // 写入 outputDir/index.html
  → assertValidHtml(htmlPath)
    → 检查 <!DOCTYPE html>, <html>, <head>, <body>
```

**实际验证内容**：
- `<!DOCTYPE html>` — 浏览器是否返回了标准 HTML 文档
- `<html>` / `</html>` — 文档根元素完整性
- `<head>` — 元数据区域存在（框架构建产物必需）
- `<body>` — 内容区域存在（SPA 渲染目标容器）

**关键意义**：这验证了 `page.content()` 返回的是完整的渲染后 DOM 树，不是原始的简短 `<script>` 标签。

#### 2.2.2 `assertContentCaptured` — 验证内容实际被捕获

**对应管线阶段**：阶段 1 (fetchHtml) → `page.content()`

**验证路径**：
```
page.goto() → waitForLoadState('networkidle') → waitForSpaHydration()
  → page.content()  // 此时 SPA 应已完成水合，DOM 中包含渲染内容
  → assertContentCaptured(htmlPath)
    → 文本内容 > 100 字符（排除空白骨架、Loading 状态）
    → HTML 闭合标签 >= 3 个（确保有多元素结构）
```

**实际验证内容**：
- SPA 的 JavaScript 是否在浏览器中成功执行
- 水合完成后 DOM 中是否有框架渲染的可见内容
- 框架构建产物的 `index.html` 是否包含实际页面结构（非仅 `<div id="app"></div>`）

**关键意义**：这是区分"静态 HTML 骨架"与"完整渲染 SPA"的核心断言。对于纯 CSR 页面（如 Angular SPA），此断言确保 Web Clone 的浏览器适配器正确等待了框架初始化。

#### 2.2.3 `assertFrameworkDetection` — 验证框架类型检测

**对应管线阶段**：阶段 8 (detectFramework)

**验证路径**：
```
snapshotInternal()
  → detectFramework(html, jsContents)
    // HTML 层面检测
    → #__nuxt → Nuxt 3
    → #__next / __NEXT_DATA__ → Next.js
    → __NUXT__ → Nuxt 2/3
    → svelte-* class → SvelteKit
    → _nghost-* / _ngcontent-* → Angular
    // JS 层面检测
    → extractJsFromAssets(assets) → 用户代码 + 框架代码
    → window.__VUE__ → Vue 3
    → __reactFiber$ → React 18
    → ng.probe → Angular (开发模式)
  → result.frameworkDetection = { framework, confidence, appElement, markers }

// 在 E2E 中提取
runCrawl() → extractBrowserFramework(result)
  → result.browserFramework = { framework, confidence, isHydrated }
runCrawl() → extractFrameworkMatch(result, expected, spa)
  → result.frameworkMatch = { detected, expected, match, confidence }
```

**实际验证内容**：
- 6 种框架（Vue 3 SPA、React 18 SPA、Angular SPA、SvelteKit SSR、Next.js SSR、Nuxt 3 SSR）的正确检测
- 置信度是否达到各框架设定的最小阈值

**关键意义**：框架检测是 Web Clone 后续进行组件提取和代码生成的前提。此断言确保检测模块 `packages/core/src/framework/detector.ts` 在真实框架构建产物的生产环境中正确工作——这补上了 Mock 单元测试 `spa-detector.test.ts` 的验证盲区。

#### 2.2.4 `assertSpaHydrationDetected` — 验证 SPA 水合检测

**对应管线阶段**：适配器内 `waitForSpaHydration()`

**验证路径**：
```
PlaywrightFetcherAdapter.fetchWithPage()
  → page.goto(url, { waitUntil: 'networkidle' })
  → waitForSpaHydration(page, { timeout })
    // Phase 1: SSR 信号检测 (page.evaluate)
    → __NUXT__, __NEXT_DATA__, __sveltekit__...
    // Phase 2: SPA 水合检测 (page.evaluate + waitForFunction)
    → Vue.__vue_app__, __vue_app__
    → React __reactFiber$ / __reactContainer$
    → Angular ng.getComponent / getAllAngularRootElements
    // Phase 3: DOM 启发式检测
    → #__nuxt, #__next, [data-sveltekit-*], _nghost-*
    // Phase 4: 通用渲染检测
    → 文本长度增长监控
  → browserFramework = { framework, confidence, appElement, isHydrated }
```

**实际验证内容**：
- `spaDetection.markers` 非空 — 至少检测到一个框架信号
- `spaDetection.confidence > 0` — 有有效的检测输出
- `spaDetection.isHydrated` — 水合状态标记存在

**关键意义**：水合检测是 Web Clone 确保 SPA 页面已完整渲染的关键步骤。`waitForSpaHydration` 的 4 阶段渐进式检测（SSR 信号 → SPA 运行时 → DOM 启发式 → 通用渲染）需要真实浏览器的 `evaluate()` 和 `waitForFunction()` 才能有效验证——Mock 测试无法覆盖这部分。

#### 2.2.5 `assertBundleStructure` — 验证 bundle 输出结构

**对应管线阶段**：阶段 7 (assembleBundle)

**验证路径**：
```
snapshotInternal()
  → assembleBundle(outputDir, html, assets, ...)
    → 写入 outputDir/index.html
    → 写入 outputDir/assets/ 下的子资源文件
    → 更新 HTML 中的路径引用为本地路径
  → assertBundleStructure(outputDir)
    → existsSync(outputDir) === true
    → existsSync(join(outputDir, 'index.html')) === true
```

**实际验证内容**：
- 输出目录被正确创建
- `index.html` 被正确写入
- 路径重写正确（CSS/JS/IMG 引用从远程 URL 替换为 `assets/xxx`）

**关键意义**：验证 `assembleBundle()` 函数对整个管线产物的正确组装——包括 HTML 写入、资源文件写入、路径替换。这确保 Web Clone 的输出是可直接在本地打开的完整页面。

#### 2.2.6 `assertSubResourcesDownloaded` — 验证子资源下载

**对应管线阶段**：阶段 2-5 (parseHtml → downloadAllAssets)

**验证路径**：
```
snapshotInternal()
  → parseHtml(html, url)
    → 提取 <link href="...">, <script src="...">, <img src="..."> 等
  → extractCssAssets(inlineStyles) → url(), @import 引用
  → ResourceFilter → 跳过黑名单扩展名
  → downloadAllAssets(refs, options, adapter)
    → context.request.fetch(url)  // 浏览器上下文的 API 请求
    → 返回 Asset[] = { originUrl, localPath, dataUri, type, status, size }
  → assertSubResourcesDownloaded(outputDir)
    → existsSync(join(outputDir, 'assets/')) === true
    → readdirSync('assets/').length > 0
```

**实际验证内容**：
- 子资源（CSS/JS/图片）被成功下载
- `assets/` 目录存在且非空
- 下载的资源被保存为本地文件

**关键意义**：验证完整的资源下载管线——从 HTML/CSS 解析提取引用，到并行下载，到本地存储。`context.request.fetch()` 自动继承浏览器 Cookie 和认证信息，这是 `HttpFetcherAdapter` 无法模拟的浏览器上下文优势。

#### 2.2.7 `assertAllCrawlsSuccessful` — 验证无异常退出

**对应管线阶段**：全部阶段

**验证路径**：
```
allResults = [
  CrawlResult { framework: 'vue3-spa', success: true, stats: {...}, spaDetection: {...} },
  CrawlResult { framework: 'react18-spa', success: true, ... },
  // ... 全部 6 个
]
→ assertAllCrawlsSuccessful(allResults)
  → 检查 failures = results.filter(r => !r.success) 长度为 0
```

**实际验证内容**：
- 全部 6 个框架的完整抓取管线均无异常退出
- 没有超时（60s timeout）、导航失败、适配器错误等

**关键意义**：这确保了 snapshot 管线在真实场景下不会因框架差异而崩溃——每个框架的 DOM 结构、资源组织方式、渲染行为都不同，但管线必须对所有框架统一工作。

### 2.3 现有测试未覆盖的管线阶段

| 管线阶段 | 是否被 E2E 覆盖 | 说明 |
|---------|--------------|------|
| 阶段 1: fetchHtml | 是 | 通过 adapter.fetch() 完整路径验证 |
| 阶段 2: parseHtml | 是 | 通过资源下载和路径重写间接验证 |
| 阶段 3: CSS @import 递归 | 否 | 当前 fixture 无 @import 链，可添加 |
| 阶段 4: ResourceFilter | 否 | 未配置 skipExtensions，需要专项用例 |
| 阶段 5: downloadAllAssets | 是 | 通过 assertSubResourcesDownloaded 验证 |
| 阶段 6: postDownloadValidation | 否 | 当前 fixture 无损坏资源场景 |
| 阶段 7: assembleBundle | 是 | 通过 assertBundleStructure 验证 |
| 阶段 8: detectFramework | 是 | 通过 assertFrameworkDetection 验证 |
| 阶段 9: 递归扫描 (scanDepth > 1) | 否 | 未启用多轮扫描，需要专项用例 |
| 阶段 10: 混合模式 (hybrid) | 否 | 未启用 hybrid 参数 |
| 阶段 11: 组件提取 (extractComponents) | 否 | 未启用 extractComponents |
| 阶段 12: single-file 模式 | 否 | 当前只测试 bundle 模式 |
| 阶段 13: 认证上下文 (getAuthContext) | 否 | 当前 fixture 无认证需求 |
| SPA hydration 检测 | 是 | 通过 assertSpaHydrationDetected 验证 |

---

## 三、E2E 测试覆盖的框架类型与 Snapshot 管线的交互差异

### 3.1 三类框架的不同代码路径

Web Clone 在处理不同类型的框架页面时，走不同的检测和渲染路径。E2E 测试覆盖了全部三类：

| 框架类型 | E2E Fixture | 页面渲染方式 | Snapshot 管线关键路径 |
|---------|------------|------------|---------------------|
| **纯 CSR SPA** | Vue 3 SPA, React 18 SPA, Angular SPA | 浏览器执行 JS 后渲染 DOM | `page.goto()` + `waitForSpaHydration()` 核心路径，检测信号来自 JS 运行时 |
| **SSR + CSR 水合** | SvelteKit SSR, Next.js SSR, Nuxt 3 SSR | SSR 预渲染 HTML + 浏览器水合 | 同时走 SSR 信号检测（HTML 中的 `__NUXT__`/`__NEXT_DATA__`）和 SPA 水合检测 |
| **静态 HTML** | (未覆盖) | 无 JS 渲染 | 仅走 HTTP 适配器的 `fetch()` 路径 |

### 3.2 各框架对 Snapshot 管线的特殊意义

| 框架 | 关键验证点 | 管线验证的独特场景 |
|------|----------|-----------------|
| **Vue 3 SPA** | `window.__VUE__` 运行时信号 | Vite 构建产物的 hash 文件名路径重写验证 |
| **React 18 SPA** | `__reactFiber$` 生产信号 | React 的 Concurrent Mode 渲染时机验证 |
| **Angular SPA** | `_nghost-*` / `_ngcontent-*` DOM 属性 | zone.js 驱动的变更检测完成时机，以及 Angular 的多文件 bundle 结构 |
| **SvelteKit SSR** | `window.__sveltekit__` SSR 信号 | Static adapter 的 `/_app/` 绝对路径修复验证 |
| **Next.js SSR** | `window.__NEXT_DATA__` SSR 信号 | Static export 的 `/_next/` 内部路径处理 |
| **Nuxt 3 SSR** | `window.__NUXT__` SSR payload | Nuxt 的 `__NUXT__` JSON payload 和 `#__nuxt` 容器 |

### 3.3 Confidence 阈值设定的原因

各框架置信度阈值基于其生产构建中可用信号的质量：

| 框架 | 阈值 | 原理 |
|------|------|------|
| Vue 3 SPA | 0.60 | `window.__VUE__` 可能因 tree-shaking 缺失，依赖 DOM 启发式 |
| React 18 SPA | 0.50 | `__reactFiber$` 是生产内建属性，但需遍历所有 DOM 节点 |
| Angular SPA | 0.50 | `_nghost-*` DOM 属性在生产构建中始终存在 |
| SvelteKit SSR | 0.70 | `__sveltekit__` + `data-sveltekit-*` 多重信号交叉验证 |
| Next.js SSR | 0.70 | `__NEXT_DATA__` JSON payload 是 Next.js 标准输出 |
| Nuxt 3 SSR | 0.70 | `__NUXT__` JSON payload 是 Nuxt 3 标准输出 |

---

## 四、E2E 测试产物的用途

### 4.1 运行时输出

每次 E2E 测试运行生成以下产物：

```
tests/e2e/outputs/
  ├── vue3-spa/              # Vue 3 SPA 的 Web Clone 快照产物
  │   ├── index.html         # 完整的独立 HTML 文件
  │   └── assets/            # 下载的子资源（路径已改写为本地相对路径）
  ├── react18-spa/
  ├── angular-spa/
  ├── sveltekit-ssr/
  ├── nextjs-ssr/
  ├── nuxt3-ssr/
  ├── results.json           # 结构化的 CrawlResult[] 汇总
  └── test-results.json      # vitest JSON reporter 输出
```

### 4.2 results.json 数据结构

```typescript
[
  {
    framework: "vue3-spa",
    url: "http://127.0.0.1:<port>/vue3-spa/",
    success: true,
    spaDetection: {
      framework: "vue3",
      appElement: "#app",
      isHydrated: true,
      markers: ["window.__VUE__", "__vue_app__"],
      confidence: 0.85
    },
    frameworkMatch: {
      detected: "vue3",
      expected: "vue3",
      match: true,
      confidence: 0.85
    },
    outputDir: "tests/e2e/outputs/vue3-spa",
    stats: {
      totalAssets: 5,
      fetchedAssets: 5,
      failedAssets: 0,
      skippedAssets: 0,
      totalBytes: 245678,
      htmlBytes: 32000
    },
    duration: 8234
  }
  // ... 其余 5 个框架
]
```

### 4.3 产物的实际用途

| 产物 | 用途 | 使用场景 |
|------|------|---------|
| `outputs/<framework>/index.html` | 手动检查 Web Clone 对真实框架的输出质量 | 代码变更后的人工回归检查 |
| `outputs/<framework>/assets/` | 验证子资源下载和路径重写正确性 | 资源管线变更验证 |
| `outputs/results.json` | 自动化回归对比的基准数据 | CI 中与上一次运行结果对比 |
| `outputs/test-results.json` | CI 测试报告的数据源 | 生成测试通过率趋势图 |
| `results.json` 中的 `duration` | 性能回归检测 | 发现管线性能退化 |

### 4.4 回归对比方案

可以将 `results.json` 作为基准（baseline），后续每次运行与基准对比：

```
基准值来源：首次全量 E2E 测试通过的 results.json
对比维度：
  ├── frameworkMatch.accuracy     — 框架检测准确率是否下降
  ├── spaDetection.confidence     — 置信度是否下降（检测退化）
  ├── stats.fetchedAssets         — 下载资源数量是否减少（丢失资源）
  ├── stats.failedAssets           — 失败资源数是否增加（回归）
  └── duration                     — 耗时是否显著增加（性能退化）
```

---

## 五、扩展现有 E2E 测试覆盖新功能

### 5.1 扩展流程

当需要为新的 snapshot 功能添加 E2E 测试时，按以下流程操作：

```
1. 确定验证目标
   ├── 哪个管线阶段？(如 ResourceFilter、recursive scanning、single-file mode)
   └── 需要什么类型的 fixture？(是否需要特殊配置的页面？)

2. 创建或修改 fixture
   ├── 简单场景：修改现有 fixture (如添加 @import 的 CSS 文件)
   └── 复杂场景：在 tests/e2e/fixtures/ 下新建 fixture 项目

3. 添加或修改测试用例
   ├── 在 spa-crawl-e2e.test.ts 的 FIXTURES 数组中注册
   ├── 添加对应的 describe 组
   └── 在 assertion-utils.ts 中添加新的断言函数

4. 构建并运行
   ├── npx tsx tests/e2e/build-fixtures.ts --framework my-fixture
   └── pnpm test:e2e
```

### 5.2 扩展示例

#### 示例 1：添加 CSS @import 递归发现测试

**目标**：验证阶段 3 (CSS @import 递归) 正确工作

**方案**：
- 在现有 fixture 的 `index.html` 中添加一个含 `@import url("nested.css")` 的 `<style>` 标签
- 添加断言：检查 `nested.css` 是否被下载并内联

**实现**：
```typescript
// 在 assertion-utils.ts 中添加
export function assertCssImportResolved(outputDir: string): void {
  const htmlContent = readFileSync(join(outputDir, 'index.html'), 'utf-8');
  // @import url("nested.css") 应被解析为内联内容
  expect(htmlContent).not.toMatch(/@import\s+url/);
}
```

#### 示例 2：添加 single-file 模式测试

**目标**：验证 `mode: 'single'` 输出正确

**方案**：
- 修改 `crawlFixture()` 接受 `mode` 参数
- 添加新测试组，使用 `mode: 'single'`
- 断言输出是单个 HTML 文件（无不含 assets/ 目录）

**实现**：
```typescript
// 在 assertion-utils.ts 中添加
export function assertSingleFileMode(outputDir: string): void {
  const htmlPath = join(outputDir, 'index.html');
  expect(existsSync(htmlPath)).toBe(true);
  // single-file 模式下不应有 assets/ 目录
  const assetsDir = join(outputDir, 'assets');
  expect(existsSync(assetsDir)).toBe(false);
  // 验证 CSS/JS 被内联（data: URI 或 <style>/<script>）
  const content = readFileSync(htmlPath, 'utf-8');
  expect(content.match(/<style/g)?.length || 0).toBeGreaterThan(0);
}
```

#### 示例 3：添加混合模式 (hybrid) 测试

**目标**：验证 `hybrid: true` 正确工作（浏览器获取 HTML + HTTP 池下载资源）

**方案**：
- 添加 `crawlFixtureHybrid()` 函数，传入 `hybrid: true`
- 验证资源下载的适配器选择逻辑

#### 示例 4：添加递归扫描 (scanDepth > 1) 测试

**目标**：验证阶段 9 (递归资源扫描) 正确工作

**方案**：
- 创建 fixture，在 JS 文件中嵌入额外的图片 URL
- 添加 `scanDepth: 2` 的爬取测试
- 断言第二轮扫描发现的资源被下载

#### 示例 5：添加组件提取 (extractComponents) 测试

**目标**：验证阶段 11 (组件提取) 正确工作

**方案**：
- 对现有 fixture 添加 `extractComponents: true`
- 验证输出目录包含组件文件

### 5.3 新功能测试的优先级建议

| 功能 | 优先级 | 原因 |
|------|--------|------|
| single-file 模式 | 高 | CLI 核心功能，当前完全无覆盖 |
| CSS @import 递归 | 中 | 常见场景，现有 Mock 测试覆盖不足 |
| 递归扫描 (scanDepth) | 中 | 复杂页面场景，需要验证 |
| 混合模式 (hybrid) | 中 | 关键混合适配功能 |
| 组件提取 | 低 | 当前非默认启用功能 |
| 认证上下文 | 低 | 需要真实认证环境 |

---

## 六、与现有测试层的协同关系

### 6.1 三层测试金字塔

```
        ┌─────────────┐
        │  E2E 测试    │ ← tests/e2e/spa-crawl-e2e.test.ts
        │  真实浏览器   │    6 框架 × 全管线
        │  真实页面    │
        ├─────────────┤
        │  集成测试    │ ← packages/*/__tests__/integration/
        │  真实浏览器   │    Playwright + 本地测试服务器
        │  简化页面    │
        ├─────────────┤
        │  单元测试    │ ← packages/*/__tests__/
        │  Mock 对象   │    vi.fn() 模拟浏览器行为
        │  隔离逻辑    │
        └─────────────┘
```

### 6.2 各层级的分工

| 层级 | 验证内容 | 不验证内容 |
|------|---------|-----------|
| **单元测试** (Mock) | `detectFramework` 算法逻辑、单个方法的参数处理、错误路径 | 真实浏览器行为、真实框架页面 |
| **集成测试** | Playwright 适配器的 `fetch()` 方法、与本地测试服务器的交互 | 多种真实框架的完全覆盖 |
| **E2E 测试** | 6 种真实框架的生产构建产物、完整 snapshot 管线 | 异常边界情况（网络超时、损坏资源等） |

### 6.3 E2E 测试补充了单元测试的盲区

单元测试 `spa-detector.test.ts` 使用 `vi.fn()` 模拟 `page.evaluate()` 的返回值。但这无法验证：

1. **生产构建中信号的实际值**：`__reactFiber$` 在 React production build 中的实际键名格式
2. **DOM 启发式检测的准确性**：`_nghost-*` 在 Angular production build 中的真实属性名
3. **信号缺失时的降级路径**：devtools hook 缺失时 DOM 启发式的实际表现
4. **`waitForFunction` 的实际行为**：生产环境中 SPA 初始化完成时，回调何时返回 `true`

E2E 测试通过真实浏览器执行完整的框架 production build，填补了这些盲区。

---

## 七、在 CI/CD 中的集成方案

### 7.1 CI 运行流程

```
CI Pipeline:
  ├── pnpm install
  ├── npx playwright install chromium --with-deps
  ├── pnpm build                    # 构建 @web-clone/core 及所有依赖包
  ├── pnpm test:e2e                  # 运行 E2E 测试
  │     ├── 启动 FixtureServer
  │     ├── 启动 Playwright Browser
  │     ├── 依次抓取 6 个框架 → 写入 outputs/
  │     ├── 生成 results.json
  │     └── 生成 test-results.json
  └── (可选) 对比 regression baseline
        └── diff outputs/results.json with baseline/results.json
```

### 7.2 回归检测脚本（建议）

```bash
#!/bin/bash
# scripts/e2e-regression-check.sh

BASELINE="tests/e2e/baseline/results.json"
CURRENT="tests/e2e/outputs/results.json"

# 检查框架检测是否全部通过
PASSED=$(jq '[.[] | select(.frameworkMatch.match == true)] | length' "$CURRENT")
TOTAL=6
if [ "$PASSED" -ne "$TOTAL" ]; then
  echo "ERROR: Framework detection regression: $PASSED/$TOTAL passed"
  exit 1
fi

# 检查置信度是否下降
for framework in vue3-spa react18-spa angular-spa sveltekit-ssr nextjs-ssr nuxt3-ssr; do
  CURRENT_CONF=$(jq ".[] | select(.framework == \"$framework\") | .frameworkMatch.confidence" "$CURRENT")
  BASELINE_CONF=$(jq ".[] | select(.framework == \"$framework\") | .frameworkMatch.confidence" "$BASELINE")
  if awk "BEGIN {exit !($CURRENT_CONF < $BASELINE_CONF - 0.1)}"; then
    echo "WARNING: Confidence drop for $framework: $CURRENT_CONF vs baseline $BASELINE_CONF"
  fi
done

echo "E2E regression check passed."
```

---

## 八、总结

### 8.1 核心发现

1. **E2E 测试覆盖了 snapshot 管线的 7/13 个阶段**：HTML 获取、HTML 解析、子资源下载、输出组装、框架检测、SPA 水合检测、全管线异常检测

2. **未覆盖的 6 个阶段**：CSS @import 递归、ResourceFilter、完整性验证、递归扫描、混合模式、组件提取 — 这些可通过扩展现有测试框架逐步覆盖

3. **E2E 测试填补了 Mock 单元测试的关键盲区**：真实框架的生产构建产物验证、真实浏览器的 `evaluate()` / `waitForFunction()` 行为、生产环境下框架信号的实际存在性

4. **E2E 测试产物具有长期价值**：`results.json` 可作为回归基准，`outputs/` 下的快照产物可用于人工质量审查

### 8.2 建议下一步

1. **建立 baseline**：首次全量测试通过后，将 `results.json` 保存为 `tests/e2e/baseline/results.json`
2. **添加 single-file 模式测试**：当前优先级最高的缺失覆盖
3. **CI 集成**：在 CI pipeline 中添加 `pnpm test:e2e` 步骤
4. **路径后处理增强**：`build-fixtures.ts` 的路径修复逻辑目前适用于 SSR 框架，后续框架升级可能需要调整
5. **Fixture 版本管理**：每半年运行 `build-fixtures.ts` 全量重建一次 fixture 产物
