# web-clone 优化方案索引

## 概述

**web-clone** 在处理大型 SPA（单页应用）页面时遇到了严重的性能和内存瓶颈。实验表明，在抓取 ModelScope 等大型 SPA 页面时，组件提取阶段因 `JavaScript heap out of memory` 崩溃。本系列方案系统性地分析所有瓶颈，并分阶段提出优化方案。

## 问题矩阵

| # | 瓶颈 | 所在模块 | 类型 | 严重程度 | 影响范围 |
|---|------|---------|------|---------|---------|
| 1 | `querySelectorAll('*')` 全 DOM 遍历 | `component-analyzer.ts` | 性能 | **P0-致命** | 组件提取阶段 OOM |
| 2 | `linkedom` 全 DOM 树内存占用 | `html-parser.ts` | 性能 | **P0-致命** | 整页解析内存爆炸 |
| 3 | Babel 解析 10MB JS Bundle | `js-analyzer.ts` | 性能 | **P1-严重** | 组件提取阶段内存/时间爆炸 |
| 4 | PostCSS 解析大型 CSS Bundle | `css-analyzer.ts` | 性能 | **P1-严重** | 组件提取阶段性能下降 |
| 5 | 并发下载数被硬编码为 1 | `fetcher.ts` | 性能 | **P1-严重** | 下载速度大幅下降 |
| 6 | `detectNestedComponents` O(n²) | `component-analyzer.ts` | 性能 | **P2-中等** | 组件嵌套检测性能退化 |
| 7 | 路由路径误判无扩展名 URL | `bundle.ts` | 正确性 | **P2-中等** | 输出文件名错误 |
| 8 | 同步顺序文件写入 | `assembler.ts` | 性能 | **P2-中等** | 大文件写入阻塞 |
| 9 | 大文件 Single 模式内联 | `single-file.ts` | 性能 | **P2-中等** | 大文件输出性能下降 |
| 10 | 缺少流式/增量处理 | 全流水线 | 性能 | **P3-较低** | 无法处理超大型页面 |
| **11** | `data-v-*` 组件检测覆盖不全 | `component-analyzer.ts` | **质量** | **P1-严重** | SSR 页面组件漏检 60%+ |
| **12** | 框架代码生成空 stub | `framework-codegen/*` | **质量** | **P2-中等** | 生成代码无法直接使用 |
| **13** | 流式 CSS 解析器多行选择器丢失 | `css-analyzer.ts` | **正确性** | **P2-中等** | CSS 规则关联错误 |
| **14** | `data-v-*` 同元素多属性只有第一个生效 | `component-analyzer.ts` | **质量** | **P2-中等** | 父子嵌套组件漏检 |
| **15** | 子组件树在输出层被切断 | `component-analyzer.ts` | **质量** | **P3-较低** | 三层以上嵌套组件丢失 |
| **16** | `correlateComponents` Map Key 碰撞致覆盖 | `correlator.ts` | **质量** | **P3-较低** | 同名子组件相互覆盖 |

## 优化方案一览

### 性能方向（原方案 01-08）

| 方案 | 对应问题 | 预估工作量 | 收益 |
|------|---------|-----------|------|
| [流式 DOM 分析器](01-streaming-dom-analyzer.md) | #1, #2 | 3-4 天 | 消除 OOM |
| [JS 智能预过滤](02-js-smart-filter.md) | #3 | 2-3 天 | 减少 90%+ JS 解析量 |
| [CSS 增量解析](03-css-incremental-parse.md) | #4 | 1-2 天 | 减少 80%+ CSS 解析量 |
| [并发下载修复与增强](04-concurrent-download-fix.md) | #5 | 0.5 天 | 下载速度 N 倍提升 |
| [组件检测算法优化](05-component-detection-opt.md) | #6 | 1 天 | 组件检测速度提升 10x+ |
| [URL 分类与命名优化](06-url-classification.md) | #7 | 0.5 天 | 修复文件名错误 |
| [异步写入与进度控制](07-async-write.md) | #8, #9 | 1 天 | 减少写入阻塞 |
| [内存预算与降级策略](08-memory-budget.md) | #1-#4 | 2 天 | 系统级防崩溃保障 |

### 质量方向（新增方案 09-11）

| 方案 | 对应问题 | 预估工作量 | 收益 |
|------|---------|-----------|------|
| [组件检测覆盖度与嵌套子树提升](09-component-detection-coverage.md) | #11, #14, #15, #16 | 1-2 天 | SSR 组件检测率从 30% → 80%+ |
| [框架代码生成质量改进](10-codegen-quality.md) | #12 | 1-2 天 | 生成代码可编译、含逻辑骨架 |
| [流式 CSS 解析器多行选择器修复](11-css-streaming-selector.md) | #13 | 0.5 天 | CSS 规则 100% 正确关联 |

## 推荐实施顺序

```
Phase 1 (P0 性能)     →  Phase 2 (P1 性能+质量)  →  Phase 3 (P2/P3 增强)
                               
 [01] 流式 DOM 分析器     [03] CSS 增量解析           [06] URL 分类优化
 [04] 并发下载修复         [05] 组件检测优化            [07] 异步写入
 [08] 内存预算与降级       [09] 组件检测覆盖度          [02] JS 智能预过滤
                          [10] 框架代码生成质量        
                          [11] CSS 流式选择器修复       
```

### Phase 0 — 速赢修复（当前已修复）
- ISSUE-01: `srcset` 路径替换（`bundle.ts`）
- ISSUE-02: CSS 变量误解析 BEM 选择器（`css-analyzer.ts`）
- ISSUE-03: `dynamicStyles` 冗余无值（`css-analyzer.ts`）
- ISSUE-04/05: `data-v-*` 检测 + class/id 启发式（`component-analyzer.ts`）
- ISSUE-06: 失败资源保留原始路径（`bundle.ts`）

### Phase 1 — 防崩溃底线（P0）
- **[01 流式 DOM 分析器](01-streaming-dom-analyzer.md)** — 替换 `linkedom` + `querySelectorAll('*')`，消除 OOM 根源
- **[04 并发下载修复](04-concurrent-download-fix.md)** — 修正并发数 bug，立即可见效
- **[08 内存预算与降级](08-memory-budget.md)** — 系统级防崩溃保护网

### Phase 2 — 性能恢复 + 质量提升（P1）
- **[03 CSS 增量解析](03-css-incremental-parse.md)** — 避免全量 CSS 解析
- **[05 组件检测算法优化](05-component-detection-opt.md)** — 消除 O(n²) 复杂度
- **[09 组件检测覆盖度提升](09-component-detection-coverage.md)** — SSR 页面组件检测率大幅提升
- **[10 框架代码生成质量改进](10-codegen-quality.md)** — 生成可用的组件骨架代码
- **[11 流式 CSS 选择器修复](11-css-streaming-selector.md)** — 多行选择器正确关联

### Phase 3 — 体验增强（P2/P3）
- **[06 URL 分类优化](06-url-classification.md)** — 修复文件名错误
- **[07 异步写入](07-async-write.md)** — 减少大文件写入阻塞
- **[02 JS 智能预过滤](02-js-smart-filter.md)** — 减少 JS 解析量

## 关键设计原则

1. **渐进增强**：核心快照流程（snapshot）不应受组件提取影响。组件提取失败不应导致快照丢失。
2. **内存预算**：所有操作应有内存上限，超过时主动降级而非崩溃。
3. **流式优先**：避免将整个文档加载到内存中处理，优先使用流式/分块处理。
4. **可配置降级**：用户应能通过 CLI 参数控制资源消耗与功能完整性之间的权衡。
5. **质量左移**：在优化性能的同时，确保组件检测的召回率和生成代码的可用性。
