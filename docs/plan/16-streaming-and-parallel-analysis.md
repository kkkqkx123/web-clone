# 流式执行与多 Worker 并行分析报告

## 概述

分析当前项目中哪些功能需要流式执行、哪些需要多 Worker 并行，以及是否应将相应逻辑独立为独立模块。

---

## 一、当前状态盘点

### 已实现流式处理

| 功能 | 位置 | 实现方式 |
|------|------|----------|
| 网络下载流式读取 | `fetcher.ts:54-76` | `ReadableStream` + `ReadableStreamDefaultReader` 边下载边检查大小 |
| HTML 流式解析 | `transform/component-analyzer.ts:69-112` | `StreamingHtmlAnalyzer` 类，SAX 风格正则扫描 |
| CSS 分级解析 | `transform/css-analyzer.ts:22-37` | <100KB 全量 postcss / 100KB-1MB 流式状态机 / >1MB 仅提取变量 |
| JS 分级解析 | `transform/js-analyzer.ts:28-143` | <100KB 全量 Babel / 100KB-1MB 预过滤 / 1MB-5MB 截断 / >5MB 快速扫描 |

### 已实现多 Worker 并行

| 功能 | 位置 | 实现方式 |
|------|------|----------|
| 资产下载 | `fetcher.ts:213-231` | `runPool` 并发下载（`options.concurrency` 控制） |
| 资产文件写入 | `assembler.ts:125-146` | `runPool` 并发写入（固定 5 个 worker） |

### 当前仍为串行的关键路径

```
snapshot() 主流程:
  fetchHtml (1 次 HTTP 请求)
  parseHtml (同步)
  CSS 递归下载 (for...of 循环，串行!) ← 瓶颈
  downloadAllAssets (并行 ✅)
  assembleBundle/assembleSingleFile (同步)
  convert() 组件提取:
    analyzeHtml (同步)
    analyzeCss (同步)     ← 可并行
    analyzeJavaScript (同步)  ← 可并行
    correlateComponents (同步)
    generateComponentStructure (同步)
  assembleConvert (同步)
```

---

## 二、需要流式执行的功能分析

### 2.1 已满足

当前所有适合流式处理的场景都已经实现：

- **网络下载**: 流式读取 + 实时大小检查，避免大文件下载耗尽内存
- **HTML 解析**: SAX 风格流式扫描，避免构建完整 DOM 树
- **CSS/JS 分析**: 分级策略，根据大小自动降级

### 2.2 不需要新增流式处理

| 候选 | 分析 | 结论 |
|------|------|------|
| `converter` 的 HTML/CSS/JS 分析 | 这三者都是内存中的 CPU 密集型操作，不是 I/O 密集型，流式无法带来收益 | 不需要 |
| CSS 递归下载 | 每个 CSS 文件是一次 HTTP 请求，需要的是并行而非流式 | 不需要 |
| 组件代码生成 | 内存中的同步操作，处理的是已完全加载的数据 | 不需要 |

**结论**: 流式处理已经覆盖了所有合适的场景，无需新增。

---

## 三、需要多 Worker 并行的功能分析

### 3.1 可并行化但尚未并行的关键路径

#### P1 — CSS 递归下载（高优先级）

**文件**: [assembler.ts:178-197](file:///workspace/web-clone/src/assembler.ts#L178-L197)

**当前代码**:
```typescript
for (const ref of cssRefs) {
  try {
    const result = await fetchWithTimeout(ref.url, ...);
    // ...
  } catch (e: any) { ... }
}
```

**问题**: CSS 文件的递归下载完全串行。一个页面可能有几十个 CSS 文件（尤其是使用 CDN 组件库的页面），每个都需要先下载再解析 `@import` 和 `url()` 引用，串行执行导致总等待时间 = 所有 CSS 文件下载时间之和。

**分析**: 这个场景与 `downloadAllAssets` 完全相同——都是独立的 HTTP 请求，天然适合并行。而且 CSS 文件之间没有依赖关系（`@import` 已经在 `extractCssAssets` 中递归处理），所以可以安全并行。

**方案**: 使用 `runPool` 替代 `for...of` 循环，并行下载 CSS 文件。

#### P2 — HTML/CSS/JS 三阶段分析（中优先级）

**文件**: [converter.ts:27-55](file:///workspace/web-clone/src/converter.ts#L27-L55)

**当前代码**:
```typescript
const htmlAnalysis = analyzeHtml(html, htmlOptions);   // Step 1
let cssAnalysis = analyzeCss(css);                      // Step 2 (depends on nothing)
let jsAnalysis = analyzeJavaScript(js, ...);            // Step 3 (depends on nothing)
```

**分析**: HTML、CSS、JS 分析三者完全独立，当前却串行执行。虽然每步都是 CPU 密集型的同步操作（无法通过 `runPool` 获得真正的并行），但至少可以通过 `Promise.all` 实现非阻塞并发，让事件循环在分析之间有机会处理其他任务。

**方案**: 使用 `Promise.all` + `setTimeout` 让出事件循环，或将分析函数包装为 Promise。

#### P3 — 框架代码生成（低优先级）

**文件**: [output/convert.ts:47-53](file:///workspace/web-clone/src/output/convert.ts#L47-L53)

**当前代码**:
```typescript
result.components.forEach((comp) => {
  // ...
  if (options.frameworkCodegen?.framework) {
    const generated = codeGenerator.generateComponent(comp, options.frameworkCodegen);
    // ...
  }
});
```

**分析**: 每个组件的代码生成是独立的 CPU 操作。对于有几十个组件的大页面，遍历生成各框架代码可能耗时。但每个组件生成通常在几毫秒内完成，收益有限。

**方案**: 可使用 `runPool` 并行化，但优先级较低。

### 3.2 并行化收益矩阵

| 候选 | 并行收益 | 风险 | 优先级 |
|------|----------|------|--------|
| CSS 递归下载 | 高 — 将 O(n) 串行等待变为 O(1) 并发 | 低 — 与 `downloadAllAssets` 模式相同 | **高** |
| HTML/CSS/JS 分析 | 中 — 节省分析时间，但 CPU 密集 | 低 — 三者完全独立 | **中** |
| 框架代码生成 | 低 — 单组件生成很快 | 低 | **低** |

---

## 四、模块独立性分析

### 4.1 当前模块边界

```
src/
├── worker/           # 并发原语（已独立）
│   ├── pool.ts       #   runPool 通用 worker pool
│   └── __tests__/    #   单元测试
├── fetcher.ts        # 下载逻辑（强依赖 worker/pool）
├── parser/           # 解析模块（无外部依赖）
│   ├── html-parser.ts
│   ├── css-parser.ts
│   └── url-resolver.ts
├── output/           # 输出模块（无外部依赖）
│   ├── single-file.ts
│   ├── bundle.ts
│   └── convert.ts
├── transform/        # 组件分析/转换
│   ├── component-analyzer.ts
│   ├── css-analyzer.ts
│   ├── js-analyzer.ts
│   ├── correlator.ts
│   ├── generator.ts
│   └── framework-codegen/
├── assembler.ts      # 编排器（依赖所有模块）
├── converter.ts      # 转换流水线（依赖 transform）
└── memory-budget.ts  # 内存预算（独立）
```

### 4.2 是否应该抽取独立模块

#### worker/ 目录——已独立，边界清晰

`src/worker/pool.ts` 已经是一个通用并发工具，没有外部依赖，有完整单元测试。符合"独立子目录"的要求。

```typescript
// 使用方：fetcher.ts, assembler.ts
import { runPool } from './worker/pool.js';
```

**结论**: ✅ 维持现状，不需要改动。

#### 是否应该创建 `src/stream/` 目录？

候选内容包括：
- 流式下载包装器（从 `fetcher.ts` 提取）
- 流式 HTML 解析器（从 `component-analyzer.ts` 提取）
- 流式 CSS 解析器（从 `css-analyzer.ts` 提取）

**分析**:
- 流式下载与 `fetch` 逻辑紧密耦合，提取后反而增加参数传递复杂度
- 流式 HTML 解析器是 `StreamingHtmlAnalyzer` 类，在 `component-analyzer.ts` 内部使用，对外暴露的是 `analyzeHtml()` 函数，已经封装良好
- CSS 分级解析在 `css-analyzer.ts` 内部通过 `analyzeCss()` 统一入口暴露，已经封装良好

**结论**: ❌ 不需要创建 `src/stream/` 目录。现有流式实现已经在其所属模块中良好封装。

#### 是否应该将 CSS 递归下载抽取为独立模块？

CSS 递归下载逻辑目前在 `assembler.ts` 中，逻辑包括：
1. 遍历 CSS 引用
2. 下载每个 CSS 文件
3. 解析 CSS 提取子引用
4. 将子引用追加到资产列表

**分析**: 这个逻辑与 `assembler.ts` 的编排流程紧密耦合（需要修改 `allRefs` 数组），抽取后需要传递大量上下文。且抽取后仍需要 `fetcher.ts` 和 `parser/css-parser.ts` 的配合。

**结论**: ❌ 不需要抽取独立模块，但应使用 `runPool` 并行化。

#### 是否应该将 converter 的分析阶段并行化抽取？

converter 的三阶段分析（HTML/CSS/JS）是独立的，但抽取为一个"并行分析管道"会增加复杂度，且收益有限（CPU 密集操作在单线程中无法真正并行）。

**结论**: ❌ 不需要抽取独立模块，简单使用 `Promise.all` 即可。

### 4.3 模块独立性总结

| 模块 | 是否独立 | 建议 |
|------|----------|------|
| `src/worker/` | ✅ 已独立 | 维持现状 |
| `src/parser/` | ✅ 已独立 | 维持现状 |
| `src/output/` | ✅ 已独立 | 维持现状 |
| `src/transform/` | ✅ 已独立 | 维持现状 |
| `src/fetcher.ts` | 依赖 worker/pool | 维持现状，依赖合理 |
| `src/assembler.ts` | 依赖所有模块 | 维持现状（编排器理应依赖所有模块） |
| `src/converter.ts` | 依赖 transform | 维持现状 |
| `src/memory-budget.ts` | ✅ 已独立 | 维持现状 |

**核心结论**: 当前模块边界合理，无需新增独立模块。`src/worker/` 作为唯一的并发工具目录，边界清晰，职责明确。

---

## 五、修改方案

### 5.1 高优先级：CSS 递归下载并行化

**文件**: `assembler.ts:178-197`

**方案**: 将 `for...of` 串行循环改为 `runPool` 并发下载。

```typescript
// 当前（串行）：
for (const ref of cssRefs) {
  const result = await fetchWithTimeout(ref.url, ...);
  // ...
}

// 改为（并行）：
const cssTasks = cssRefs.map(ref => () => fetchWithTimeout(ref.url, ...));
const cssResults = await runPool(cssTasks, { concurrency: 5 });
```

**注意**: 需要确保 `allRefs` 的修改（递归发现的子引用）是线程安全的。由于 JavaScript 单线程特性，`push` 操作不会出现竞态条件。

### 5.2 中优先级：converter 分析阶段并行化

**文件**: `converter.ts:27-55`

**方案**: 将 HTML/CSS/JS 分析包装为 Promise，使用 `Promise.all` 并发执行。

```typescript
const [htmlAnalysis, cssAnalysis, jsAnalysis] = await Promise.all([
  Promise.resolve().then(() => analyzeHtml(html, htmlOptions)),
  Promise.resolve().then(() => { /* CSS 分级策略 */ }),
  Promise.resolve().then(() => { /* JS 分级策略 */ }),
]);
```

### 5.3 低优先级：框架代码生成并行化

**文件**: `output/convert.ts:47-53`

**方案**: 使用 `runPool` 并行生成各组件框架代码。当前优先级较低，可暂不实施。

---

## 六、修改计划

| 步骤 | 内容 | 优先级 | 预计影响 |
|------|------|--------|----------|
| 1 | CSS 递归下载使用 `runPool` 并行化 | 高 | 显著减少 CSS 下载等待时间 |
| 2 | converter 分析阶段 `Promise.all` 并行化 | 中 | 减少分析阶段总耗时 |
| 3 | 验证编译和测试 | 必选 | 确保无回归 |