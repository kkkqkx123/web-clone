# SPA 框架页面拉取、转换与决策逻辑全面审查

> 对 web-clone 的 SPA 页面拉取、框架决策和页面转换三大模块的系统性审查报告。
> 涵盖架构合理性评估、决策逻辑分析、现存问题诊断和改进建议。

---

## 一、整体架构总览

web-clone 的 SPA 框架处理分为三个主要阶段，形成一条完整的流水线：

```
[页面拉取]                          [框架决策]                       [页面转换]
                                                                        │
浏览器适配器 ──→ browserFramework ──→ ┌── 合并决策 ──→ 策略匹配         │
(Playwright/Puppeteer)               │                 rewritePaths      │
                                     │                                   │
HTTP 适配器 ──→ 静态 HTML ──→ detectFramework() ──→ detection           │
                                                                        │
                                                                        ▼
                                                              convert() ──→ 组件提取
                                                                        ──→ 代码生成
```

### 1.1 三条管线的职责

| 管线 | 入口 | 核心模块 | 产出 |
|------|------|---------|------|
| 页面拉取 | `adapters/` | `spa-detector.ts`、`fetcher.ts` | 渲染后 HTML + 子资源 + 浏览器框架信息 |
| 框架决策 | `framework/` | `detector.ts`、`strategies/` | `FrameworkDetection` + 探针/路径改写 |
| 页面转换 | `transform/` + `codegen/` | `converter.ts`、`generator.ts` | `ComponentSpec` + 框架代码 |

### 1.2 涉及的文件清单

| 文件 | 所属包 | 职责 |
|------|--------|------|
| `packages/adapter-common/src/spa-detector.ts` | adapter-common | 浏览器端 SPA 水合检测（四阶段等待） |
| `packages/adapter-playwright/src/adapter.ts` | adapter-playwright | Playwright 浏览器适配器 |
| `packages/adapter-puppeteer/src/adapter.ts` | adapter-puppeteer | Puppeteer 浏览器适配器 |
| `packages/core/src/framework/detector.ts` | core | 静态框架检测（五维度分层） |
| `packages/core/src/framework/types.ts` | core | FrameworkType、PostSnapshotStrategy 类型 |
| `packages/core/src/framework/injector.ts` | core | 探针脚本注入器 |
| `packages/core/src/framework/strategies/*.ts` | core | 12 种框架策略（nuxt2/nuxt3/vue2/vue3/react18/nextjs/angular/sveltekit/vitepress/astro/static） |
| `packages/core/src/assembler.ts` | core | 快照组装主管线（含合并决策） |
| `packages/core/src/converter.ts` | core | 组件转换管线 |
| `packages/core/src/transform/component-analyzer.ts` | core | HTML 组件边界识别（SAX 流解析） |
| `packages/core/src/transform/css-analyzer.ts` | core | CSS 规则分组（BEM 命名） |
| `packages/core/src/transform/js-analyzer.ts` | core | JS 分析（Babel AST + 正则回退） |
| `packages/core/src/transform/correlator.ts` | core | 组件与 CSS/JS 关联 |
| `packages/core/src/transform/generator.ts` | core | 组件结构生成 |
| `packages/core/src/output/convert.ts` | core | 组件输出与代码生成组装 |
| `packages/codegen/src/framework-rules.ts` | codegen | 框架规则映射 + 模板转换 |
| `packages/codegen/src/*-generator.ts` | codegen | Vue/React/Angular/Svelte/jQuery 代码生成器 |

---

## 二、SPA 页面拉取实现分析

### 2.1 浏览器适配器架构

两个适配器均实现 `FetcherAdapter` 接口，核心分两个方法：

| 方法 | 用途 | Playwright | Puppeteer |
|------|------|-----------|-----------|
| `fetchWithPage(url)` | 获取主 HTML 文档 | `page.goto()` + `waitForSpaHydration()` | 同 Playwright |
| `fetchWithContext(url)` | 获取子资源 (CSS/JS/图片) | `context.request.fetch()` | HTTP + Cookie 手动转发 |

**架构合理性**：主文档通过浏览器渲染获取（需 JS 执行）、子资源通过浏览器上下文 API 获取（自动继承认证状态）的分离策略合理。Playwright 适配器在设计上有明显优势——`context.request.fetch()` 自动继承 Cookie、认证头，且保持在同一浏览器上下文中。

**Puppeteer 的降级限制**：Puppeteer 没有对应的 API，子资源获取退化为：

```
页面 Cookie → 拼 Cookie 头 → 原生 fetch() HTTP 请求
```

这会丢失以下浏览器上下文特性：
- Service Worker 拦截
- 自动认证头附加（Bearer token 等）
- 浏览器缓存机制
- 跨域 CDN 资源的 Cookie（`page.cookies(url)` 按 URL domain 过滤）

### 2.2 SPA 水合检测

位于 `packages/adapter-common/src/spa-detector.ts`，采用四阶段渐进式等待策略：

| 阶段 | 检测内容 | 超时 | 失败行为 |
|------|---------|------|---------|
| 1 | `page.evaluate()` 检测 12 种运行时信号 | 无独立超时 | 无（仅收集信息） |
| 2 | Nuxt/Vue SSR 等待 `__vue__` 挂载 | min(timeout/3, 5000ms) | 非致命，继续 |
| 3 | 框架就绪信号 OR 生产 DOM 稳定性 | min(timeout/2, 8000ms) | 非致命，继续 |
| 4 | 事件处理器绑定 | 500ms | 无（纯延迟） |

**阶段1 的信号矩阵**（`isSSRApp` 对象包含的检测项）：

```
hasNuxt         → window.__NUXT__
hasVue          → window.Vue || window.__VUE__
hasVue2         → Vue.version.startsWith('2') || (Vue.$mount && !Vue.createApp)
hasVue3         → __VUE__ || Vue.version.startsWith('3') || Vue.createApp
hasNextData     → window.__NEXT_DATA__
hasReactHook    → window.__REACT_DEVTOOLS_GLOBAL_HOOK__
hasSvelteKit    → window.__sveltekit__ || window.__SVELTEKIT__
hasAngular      → window.ng && window.ng.probe
appElement      → document.querySelector('#__nuxt') 存在
vueInstance     → #__nuxt 元素上有 __vue__ 属性
hasNextRoot     → #__next 存在
hasAppRoot      → #app 存在
hasReactRoot    → #root 存在
hasSvelteRoot   → #svelte 存在
hasAngularRoot  → [ng-app] 或 [ng-version] 存在
```

**阶段1 的版本区分逻辑**：

```
Nuxt:
  有 $nuxt.$mount → nuxt2 (0.95)
  有 __NUXT__     → nuxt3 (0.95)
  仅有 #__nuxt    → nuxt2 (0.50, 低置信度兜底)

Vue:
  有 Vue.version:2 或有 $mount 无 createApp → vue2 (0.80)
  有 __VUE__ 或有 Vue.version:3              → vue3 (0.80)
  仅有 Vue 全局变量但无法区分版本              → vue3 (0.60)

React:
  有 __REACT_DEVTOOLS_GLOBAL_HOOK__ → react18 (0.70)

Next.js:
  有 __NEXT_DATA__ → nextjs (0.95)

Angular:
  有 ng.probe       → angular (0.80)
  仅有 [ng-version] → angular (0.40)
```

**阶段3 的生产安全检测路径**（当开发工具标记不可用时）：

```
Next.js:    #__next 有子元素 && querySelectorAll('*').length > 3
Angular:    document.querySelector('[ng-version]')
Nuxt:       #__nuxt 有子元素 && querySelectorAll('*').length > 3
SvelteKit:  #svelte 有子元素
React:      #root 有子元素 && querySelectorAll('*').length > 2
            或 root 元素上有 __reactFiber$/__reactContainer$ 属性
Vue:        #app 有子元素 && querySelectorAll('*').length > 2
兜底:       body 有子元素 && 任一框架根元素有子元素
            || document.readyState === 'complete'
```

**合理性评估**：整体设计合理。所有超时均为非致命，渐进式检测覆盖了开发环境和生产环境。阶段3 的生产 DOM 启发式是必要的补充——因为 `__REACT_DEVTOOLS_GLOBAL_HOOK__`、`ng.probe` 等 API 在生产构建中不存在。

---

## 三、框架决策逻辑分析

### 3.1 静态检测器 (`detectFramework`)

五维度优先级检测（可靠性从高到低）：

| 维度 | 检测方式 | 置信度 | 覆盖框架 |
|------|---------|--------|---------|
| 1 | 全局变量标记 | 0.95 | nuxt3 (`__NUXT__`)、nextjs (`__NEXT_DATA__`)、sveltekit (`__sveltekit__`) |
| 2 | HTML 标签 (`id`/`ng-version`/`ng-app`) | 0.4-0.6 | nuxt2、nextjs、angular、vitepress |
| 3 | Meta generator (`<meta name="generator">`) | 0.85-0.9 | vitepress、vuepress、astro、sveltekit |
| 4 | JS 内容模式扫描 | 0.7-0.8 | vue2、vue3、react18、angular、sveltekit |
| 5 | 通用挂载点 ID | 0.4-0.5 | 各框架兜底 |

**维度4 的检测模式列表**：

```typescript
// Vue 2
'new Vue({'        → vue2 (0.75)
'Vue.extend('       'Vue.component('

// Vue 3
'createSSRApp'      → vue3 (0.80)
'__VUE__'

// React 18
'hydrateRoot'       → react18 (0.70)
'__REACT_DEVTOOLS'  '__reactFiber$'  '__reactContainer$'

// Angular
'ng.probe'          → angular (0.70)
'platformBrowser'   'ɵcmp'  'ɵmod'  'ɵdir'  'ɵfac'

// SvelteKit
'@sveltejs/kit'     → sveltekit (0.70)
'__sveltekit'
```

**Vue 2 vs Vue 3 的判断顺序**：维度4 先检查 Vue 2 模式（`new Vue({`），如果同时存在 Vue 3 信号（`createSSRApp`），则优先判为 Vue 3。这个顺序是正确的——有些混合场景可能同时存在两套 API。

**合理性**：多维度检测设计合理，优先级体系正确。维度1-3 是精确匹配（特定字符串），维度4-5 是模式匹配。JS 模式扫描对压缩代码的命中率有限（如 `platformBrowser` 会被压缩器重命名），但补充的 `ɵcmp`/`ɵmod`/`ɵdir`/`ɵfac` 模式是 Angular AOT 编译后留下的稳定标记，提供了生产环境支持。

### 3.2 双管线合并逻辑

位于 `assembler.ts:666-681`：

```typescript
let detection = detectFramework(html, jsContents);
if (browserFramework && browserFramework.framework !== 'unknown') {
  const browserConfidence = browserFramework.confidence;
  if (browserConfidence > detection.confidence) {
    detection = {
      framework: browserFramework.framework as FrameworkType,
      confidence: browserFramework.confidence,
      appElement: browserFramework.appElement || detection.appElement || null,
      markers: [
        `browser:${browserFramework.framework}`,
        ...(browserFramework.isHydrated ? ['hydration-confirmed'] : []),
        ...detection.markers,
      ],
    };
  }
}
```

**合并优先级**：浏览器运行时检测优先（当置信度更高时），但使用严格 `>` 比较——当置信度相等时，静态检测占优。

**合理性**：双管线互补的设计合理——浏览器端能访问运行时全局变量（`__NUXT__`、`__VUE__` 等），静态端能扫描下载的 JS 文件内容进行模式匹配。合并后保留了两端的标记信息（markers），便于调试。

**潜在问题**：
- 使用 `>` 而非 `>=` 意味着置信度相同时（如 `0.80 === 0.80`），静态检测优先
- 浏览器检测通过 `window` 对象直接访问框架内部状态，理论上比静态文本扫描更可靠
- `as FrameworkType` 强制类型转换绕过了类型系统——虽然当前 spa-detector 已统一了类型，但映射关系是隐式的

### 3.3 策略注册表

`packages/core/src/framework/strategies/index.ts` 中 12 种策略按优先级有序排列：

```
nuxt3     → markers.includes('__NUXT__')
nextjs    → framework === 'nextjs' || markers.includes('__NEXT_DATA__')
vitepress → framework === 'vitepress' || generator:vitepress || VPContent
astro     → framework === 'astro' || generator:astro
nuxt2     → framework === 'nuxt2'
vue2      → framework === 'vue2'
vue3      → framework === 'vue3'
sveltekit → framework === 'sveltekit' || __SVELTEKIT__ || __sveltekit
react18   → framework === 'react18' || __REACT_DEVTOOLS
angular   → framework === 'angular' || markers.includes('angular')
static    → always (兜底)
```

匹配规则：首个 `matches()` 返回 `true` 的策略获胜，后续策略不尝试。

**策略职责**：

| 职责 | 说明 | 所有策略 | 仅 Nuxt 3 |
|------|------|---------|-----------|
| `rewritePaths()` | 修复框架内部路径（如 `assetsPath`） | 仅 Nuxt 3 有实现 | 改写 `window.__NUXT__.assetsPath` |
| `generateProbeScript()` | 生成探针脚本（注入 `</body>` 前） | 仅 Nuxt 2 有功能性重挂载 | 其余仅 console 轮询诊断 |
| `alwaysInject` | 是否始终注入（不受 `debugProbe` 控制） | 仅 Nuxt 2 为 `true` | 功能性探针必须始终执行 |

**合理性**：有序列表代替数值优先级的做法消除了"优先级数值有数学意义"的误解。12 种策略覆盖了主流 SPA 框架，新增框架只需添加策略文件。

---

## 四、页面转换实现分析

### 4.1 组件提取管线 (`converter.ts`)

三阶段流水线：

```
[Phase 1: 并行分析]
  analyzeHtml()    → componentRoots[], dynamicPoints
  analyzeCss()     → variables{}, rules[], componentStyles{}
  analyzeJs()      → state[], methods[], events[], lifecycles{}

[Phase 2: 关联]
  correlateComponents() → CorrelatedComponent{}

[Phase 3: 生成]
  generateComponentStructure() → ComponentSpec{}
```

**Phase 1 的内存预算降级策略**：

| 策略 | HTML | CSS | JS |
|------|------|-----|-----|
| `normal` | 全量解析 | 全量解析 | 全量解析 |
| `streaming` | 限制 50000 标签 | - | - |
| `head` | - | 截断前 500KB | 截断前 1MB |
| `skip` | 跳过组件提取 | 跳过 CSS | 跳过 JS |

**HTML 分析 (component-analyzer.ts)**：
- SAX 式流解析器（`StreamingHtmlAnalyzer`），替换了 linkedom 的完整 DOM 解析
- 内存从 1GB+ 降到 <10MB
- 五级组件边界检测优先级：P1 (`data-component`) > P2 (语义标签) > P3 (`data-v-*`) > P4 (class+id+深度) > P5 (框架感知)

**JS 分析 (js-analyzer.ts)**：
- 分层策略：<100KB 全量 Babel AST+快速扫描; <1MB 预过滤后 Babel; <5MB 截断后 Babel; >5MB 快速扫描回退
- 提取内容：状态变量、方法、事件处理器、DOM ref、生命周期钩子

### 4.2 代码生成管线

**框架类型桥接** (`framework-rules.ts`)：

```
vue2/vue3/nuxt2/nuxt3/vitepress → vue
react18/nextjs                   → react
angular                          → angular
sveltekit                        → svelte
astro/static/unknown             → null (不生成)
```

**Vue API 风格自动选择**：

```
vue2/nuxt2        → Options API
vue3/nuxt3 及其他  → Composition API (默认)
```

**代码生成三件套**：
- `base-generator.ts`：模板处理（`data-binding` → `{{ }}` / `{ }`、`data-event` → `@click` / `onClick`、`data-condition` → `v-if` / `{&&}`）
- `vue-generator.ts` / `react-generator.ts` / `angular-generator.ts` / `svelte-generator.ts` / `jquery-generator.ts`：各框架代码生成器
- `shared-logic-extractor.ts`：跨组件共享逻辑提取

**合理性**：自动桥接检测结果到代码生成减少用户操作步骤，Vue API 风格自动选择是合理的优化。但 `FRAMEWORK_TO_CODEGEN` 的映射过于粗粒度（所有 Vue 类框架统一映射为 `vue`），丢失了框架专有特性的生成能力。

---

## 五、现存问题分析

以下问题按严重程度分为 P0（影响核心功能）、P1（影响检测准确率）、P2（影响转换质量）、P3（能力空白）。

### 5.1 已修复的问题

以下问题在项目迭代中已得到修复（对比设计文档初稿）：

| 问题 | 原始状态 | 当前状态 |
|------|---------|---------|
| `FrameworkType` 缺少 `vue2`/`nuxt2` | 仅有 `vue3`、无版本区分 | 已添加 `vue2`、`nuxt2` |
| SPA 检测 `framework` 类型粗粒度 | `nuxt`/`vue`/`react`（与 FrameworkType 不一致） | 已统一为 `nuxt3`/`nuxt2`/`vue3`/`vue2`/`react18`/`nextjs`/`angular`/`sveltekit` |
| SPA 检测与 `waitForLoadState` 耦合 | 条件门控（仅 networkidle/load 时执行） | Playwright 适配器已解耦 |
| React Fiber 节点检测缺失 | 仅检查 `__REACT_DEVTOOLS_GLOBAL_HOOK__` | spa-detector Phase3 已添加 `__reactFiber$`/`__reactContainer$` |
| 检测到代码生成割裂 | 无自动映射 | 已添加 `FRAMEWORK_TO_CODEGEN` 映射表 |
| `dataUri` 中的 JS 未被 detector 利用 | 仅收集 `textContent` | 已同时支持 `textContent` 和 `dataUri` (base64 解码) |
| Nuxt 2 功能性探针被 `debugProbe` 锁定 | 仅在 `debugProbe=true` 时注入 | 已添加 `alwaysInject` 标志，Nuxt 2 始终注入 |
| Vue 2 版本区分代码丢失 | spa-detector 直接硬编码 `vue3` | 已添加 `Vue.version` 和 API 检测逻辑 |
| SvelteKit 全局变量命名错误 | `__SVELTEKIT__` (全大写) | 已修复为 `__sveltekit__` (全小写) |

### 5.2 仍存在的问题

#### 问题 1：Puppeteer 适配器 SPA 检测仍与 `waitForLoadState` 耦合

**严重程度**：P0
**位置**：`packages/adapter-puppeteer/src/adapter.ts`
**文件行数**：大约在第 221 行附近

**现状**：Playwright 适配器已解耦——`waitForSpaHydration()` 无条件调用。Puppeteer 适配器仍沿用了旧的条件门控，当用户设置 `waitForLoadState: 'domcontentloaded'` 时完全跳过 SPA 检测。

**影响**：使用 Puppeteer 适配器 + `domcontentloaded` 配置的快照丢失浏览器端框架检测信息，下游 `assembler.ts` 合并逻辑退化为纯静态检测。

**修复建议**：移除 Puppeteer 适配器中 `waitForSpaHydration` 调用的条件判断，与 Playwright 适配器行为一致。

---

#### 问题 2：合并逻辑使用严格 `>` 比较

**严重程度**：P1
**位置**：`packages/core/src/assembler.ts:669`

**现状**：`if (browserConfidence > detection.confidence)` 使用严格大于比较。当浏览器检测与静态检测置信度相等时（例如 `0.80 === 0.80`），静态检测结果优先。

**影响**：在置信度相同的边缘情况下，放弃了更可靠的浏览器运行时检测数据（通过 `window` 对象直接访问框架内部状态）。

**修复建议**：改为 `>=` 比较，置信度相等时优先采纳浏览器检测结果。

---

#### 问题 3：Angular 生产环境检测覆盖不足

**严重程度**：P1
**位置**：
- `packages/core/src/framework/detector.ts:113-120`
- `packages/adapter-common/src/spa-detector.ts:174-179`

**现状**：维度4 的 Angular 检测依赖 `ng.probe`（仅 dev 环境存在）和 `platformBrowser`（会被生产构建压缩器重命名）。新增的 `ɵcmp`/`ɵmod`/`ɵdir`/`ɵfac` 后缀提供了部分改进，但 Angular 17+ 的 standalone components API 可能减少这些模式的使用频率。

spa-detector 中 Angular 的 runtime 检测同样依赖开发工具标记：
```
hasAngular: w.ng !== undefined && w.ng.probe !== undefined
```
生产环境中 `ng.probe` 不可用，仅能回退到 DOM 启发式（`[ng-version]` 属性，置信度 0.40）。

**影响**：生产环境 Angular 应用的检测置信度偏低，可能影响下游策略匹配和探针注入。

**修复建议**：
- 在 spa-detector 中增加 Angular 生产环境检测标记（如 `window['ɵcomp']`、`<script src>` URL 中的 `polyfills`/`main` chunk 模式）
- 在 detector.ts 维度4 中增加 Angular 17+ standalone API 标记

---

#### 问题 4：Nuxt 2/3 混淆风险（维度5 回退）

**严重程度**：P1
**位置**：`packages/core/src/framework/detector.ts:130-131`

**现状**：当 `id="__nuxt"` DOM 节点存在但未检测到 `window.__NUXT__` 全局变量时，返回 `nuxt2`（置信度 0.5）：

```typescript
if (hasNuxtApp) {
  return { framework: 'nuxt2', confidence: 0.5, appElement: '#__nuxt', markers };
}
```

Nuxt 3 SSR 输出同样包含 `#__nuxt` 挂载点。如果 `window.__NUXT__` 的初始化脚本在独立的 JS payload 文件中且未被首轮 `jsContents` 覆盖（例如 `scanDepth=1` 默认配置），Nuxt 3 页面会被误判为 Nuxt 2。

**影响**：Nuxt 2 策略会主动调用 `$nuxt.$mount()`，在 Nuxt 3 页面中可能造成 JavaScript 错误。

**修复建议**：回退到 `nuxt2` 之前，扫描 HTML 中是否存在 Nuxt 3 特有的 payload 内联脚本模式：
```
<script>window.__NUXT__=(function(
```
如果存在则判定为 `nuxt3` 而非 `nuxt2`。

---

#### 问题 5：P2 语义标签假阳性

**严重程度**：P2
**位置**：`packages/core/src/transform/component-analyzer.ts`（P2 优先级检测）

**现状**：所有 `<section>`、`<article>`、`<header>`、`<footer>`、`<nav>`、`<main>` 标签被无条件识别为组件根。在典型营销页面中产生大量假阳性：

```html
<section><h2>Features</h2><div>...</div></section>
<section><h2>Pricing</h2><div>...</div></section>
<section><h2>FAQ</h2><div>...</div></section>
```
三个纯布局用的 `<section>` 全被识别为独立组件。

**影响**：组件列表中混入大量非组件结构，降低提取质量。

**修复建议**：对语义标签增加上下文判断：
- `<nav>` 和 `<header>` 始终保留
- `<section>` 和 `<article>` 仅在包含标题 (h1-h6) + 至少一个交互元素 (button/input/a/form) 时识别为组件
- `<footer>` 仅在不作 `<body>` 的最后一个 `<footer>` 时识别

---

#### 问题 6：P4 嵌套判断仅用 `startOffset`

**严重程度**：P2
**位置**：`packages/core/src/transform/component-analyzer.ts`（`StreamingHtmlAnalyzer.isCandidateContaining` 方法）

**现状**：嵌套判断仅比较起始偏移量：

```
return parent.startOffset < targetOffset;
```

未使用闭合标签位置（`endOffset`）做范围检查。

**影响**：可能将位于同一父元素内的兄弟节点误判为父子关系。

**修复建议**：在标签扫描时记录每个候选的闭合标签位置，嵌套判断改为范围比较：
```
return parent.startOffset < child.startOffset && parent.endOffset > child.endOffset;
```

---

#### 问题 7：递归扫描后不重新检测框架

**严重程度**：P2
**位置**：`packages/core/src/assembler.ts:484-626`（递归扫描）、`assembler.ts:666`（框架检测调用）

**现状**：多轮递归资源扫描（round 2+）可能发现新的 JS 文件，但框架检测仅在管线末尾执行一次，使用的是首轮 HTML + 首轮 JS 内容。

**影响**：首轮检测为 `unknown` 的页面，即使后续下载的 JS 包含框架标记，也无法更新检测结果。

**修复建议**：在递归扫描完成后，如果发现了新的 JS 文件且首轮检测结果为 `unknown` 或低置信度，使用新下载的 JS 内容重新执行 `detectFramework`。

---

#### 问题 8：`cleanAttributes` 过度删除 `data-*` 属性

**严重程度**：P2
**位置**：`packages/codegen/src/framework-rules.ts:319-325`

**现状**：

```typescript
cleanAttributes: (html: string): string => {
  return html
    .replace(/\s*data-binding="[^"]*"/g, '')
    .replace(/\s*data-event="[^"]*"/g, '')
    .replace(/\s*data-condition="[^"]*"/g, '')
    .replace(/\s*data-snapshot-[\w-]+(?:="[^"]*")?/g, '');
},
```

代码审查显示当前实现**已经正确**——它只删除工具注入的 4 类特定属性，不再使用全量 `data-*` 正则。14 号设计文档中提到的 `/data-[\w-]+(?:="[^"]*")?/g` 已被替换。

**结论**：此问题已修复。保留此条目以记录状态变更。

---

#### 问题 9：CSS Modern 方案分析能力缺失

**严重程度**：P3
**位置**：`packages/core/src/transform/css-analyzer.ts`

**现状**：CSS 分析使用 BEM 命名规则（`block__element--modifier`）进行规则分组。以下现代 CSS 方案的组件分组能力为零：

| 方案 | 具体问题 |
|------|---------|
| CSS Modules | 类名被 hash（`.Header_hash1a2b3c`），BEM 分组失效 |
| CSS-in-JS | styled-components/emotion 生成的随机类名无规律 |
| Tailwind CSS | utility-first 类名（`flex items-center gap-4`）无组件语义 |
| `@scope` / `@layer` | CSS 级联层/作用域标记被忽略 |

**影响**：使用现代 CSS 方案的页面，CSS 规则无法按组件分组，生成的组件代码中样式部分缺失或错误。

**修复建议**：
- 优先级1：解析 source map 文件（`.css.map`），通过映射还原原始类名进行分组
- 优先级2：无 source map 时，按 DOM 语义块分组（识别 hero banner、card grid、form group 等布局模式）
- 优先级3：对 `data-v-*` 哈希类的分组（已有）扩展到支持 CSS Modules 的 hash 模式检测

---

#### 问题 10：Nuxt 2/3 codegen 输出不分版本

**严重程度**：P4
**位置**：`packages/codegen/src/framework-rules.ts:18-31`

**现状**：`FRAMEWORK_TO_CODEGEN` 将所有 Vue 类框架统一映射为 `vue`：

```typescript
vue2: 'vue', vue3: 'vue', nuxt2: 'vue', nuxt3: 'vue', vitepress: 'vue'
```

虽然 Vue API 风格做了区分（Options vs Composition），但 Nuxt 专有特性在生成的代码中完全丢失：
- Nuxt 2：`asyncData`、`$nuxt` 上下文对象、`<nuxt-link>`、`<nuxt-child>`
- Nuxt 3：`useFetch`/`useAsyncData` composables、`<NuxtLink>`、`<NuxtPage>`、auto-imports

**影响**：生成的 Vue 组件无法直接在 Nuxt 项目中使用，需要开发者手动改写。

**修复建议**：在 Vue generator 中根据 `frameworkDetection.framework` 判断：
- `nuxt2` → 生成 `asyncData` + Options API + `$nuxt` 上下文引用
- `nuxt3` → 生成 `useFetch`/`useAsyncData` + Composition API + `<script setup>`
- `vue2`/`vue3` → 保持当前的通用 Vue 模板

---

#### 问题 11：JS 分析的模块导入理解缺失

**严重程度**：P3
**位置**：`packages/core/src/transform/js-analyzer.ts`

**现状**：Babel AST 解析能提取变量声明、函数定义，但对框架 DSL 的理解有限：
- `import { ref } from 'vue'` 创建的 `ref()` 响应式变量被当作普通 `const` 变量
- 无法区分函数内的局部 `const` 和模块级的响应式状态
- JSX/TSX 组件模板未被结构化解析

**影响**：状态变量提取的准确性有限，部分内部变量被错误标记为组件状态。

**修复建议**：在 Babel AST 分析中增加 Vue/React 导入模式识别：
- 跟踪 `from 'vue'` / `from 'react'` 的 import binding，标记对应 API 创建的变量
- 对 JSX 文件启用 `acorn-jsx` 插件做完整的 JSX 树解析

---

## 六、问题汇总

| 优先级 | 编号 | 问题 | 所属模块 | 核心影响 |
|--------|------|------|---------|---------|
| P0 | 1 | Puppeteer 适配器 SPA 检测耦合 | 页面拉取 | 非 networkidle 配置丢失浏览器框架检测 |
| P1 | 2 | 合并逻辑使用严格 `>` 比较 | 框架决策 | 置信度相等时放弃更可靠的运行时数据 |
| P1 | 3 | Angular 生产环境检测覆盖不足 | 框架决策 | 生产 Angular 应用检测置信度低 |
| P1 | 4 | Nuxt 2/3 混淆风险 | 框架决策 | Nuxt 3 被误判为 Nuxt 2 时注入错误探针 |
| P2 | 5 | P2 语义标签假阳性 | 组件转换 | 大量非组件结构混入输出 |
| P2 | 6 | P4 嵌套判断仅用 startOffset | 组件转换 | 组件父子关系错误 |
| P2 | 7 | 递归扫描后不重新检测框架 | 框架决策 | 新发现的框架 JS 不被利用 |
| P3 | 9 | CSS Modern 方案分组失败 | 组件转换 | CSS Modules/Tailwind 无法关联到组件 |
| P3 | 11 | JS 模块导入分析不均 | 组件转换 | 响应式变量被错误分类 |
| P4 | 10 | Nuxt 2/3 codegen 不分版本 | 代码生成 | 生成的 Vue 代码缺少 Nuxt 专有 API |

---

## 七、改进路线图

### 第一阶段：修复核心功能缺陷（P0）

1. **同步 Puppeteer 适配器**：移除 `waitForSpaHydration` 调用的条件门控（参考 Playwright 适配器已完成的修复）

### 第二阶段：提升检测准确率（P1）

2. **合并逻辑改 `>=`**：置信度相等时优先采纳浏览器运行时检测
3. **Angular 生产环境增强**：补充 Angular 17+ standalone API 标记
4. **Nuxt 2/3 混淆缓解**：维度5 回退前扫描 HTML 中的 Nuxt 3 payload 脚本模式

### 第三阶段：改善转换质量（P2）

5. **语义标签上下文判断**：section/article 仅在有标题+交互元素时识别为组件
6. **P4 嵌套判断补全**：记录 `endOffset` 做范围比较
7. **递归扫描后增量重检**：新 JS 文件纳入框架检测

### 第四阶段：增强能力覆盖（P3/P4）

8. **CSS Modern 方案支持**：source map 解析 → DOM 语义块分组
9. **Nuxt codegen 版本感知**：为 nuxt2/nuxt3 生成专用 API 模板
10. **JS 分析导入感知**：追踪框架 import binding 并标记响应式变量

---

**关联文档**：
- `14-framework-pipeline-improvement.md` — 框架管线改进方案（架构问题 + 分阶段改进）
- `15-spa-framework-deep-analysis.md` — SPA 框架代码级深度分析（本文档的补充）
- `09-framework-hydration-architecture.md` — 框架水合架构设计方案
- `10-framework-module-gap-analysis.md` — 框架模块差距分析

**最后更新**：2026-07-27
