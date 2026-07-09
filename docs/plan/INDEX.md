# 大型 SPA 页面优化方案

## 概述

**web-clone** 在处理大型 SPA（单页应用）页面时遇到了严重的性能和内存瓶颈。实验表明，在抓取 ModelScope 等大型 SPA 页面时，组件提取阶段因 `JavaScript heap out of memory` 崩溃。本计划系统性地分析所有瓶颈，并分阶段提出优化方案。

## 问题矩阵

| # | 瓶颈 | 所在模块 | 严重程度 | 影响范围 |
|---|------|---------|---------|---------|
| 1 | `querySelectorAll('*')` 全 DOM 遍历 | `component-analyzer.ts` | **P0-致命** | 组件提取阶段 OOM |
| 2 | `linkedom` 全 DOM 树内存占用 | `html-parser.ts` | **P0-致命** | 整页解析内存爆炸 |
| 3 | Babel 解析 10MB JS Bundle | `js-analyzer.ts` | **P1-严重** | 组件提取阶段内存/时间爆炸 |
| 4 | PostCSS 解析大型 CSS Bundle | `css-analyzer.ts` | **P1-严重** | 组件提取阶段性能下降 |
| 5 | 并发下载数被硬编码为 1 | `fetcher.ts` | **P1-严重** | 下载速度大幅下降 |
| 6 | `detectNestedComponents` O(n²) | `component-analyzer.ts` | **P2-中等** | 组件嵌套检测性能退化 |
| 7 | 路由路径误判无扩展名 URL | `bundle.ts` | **P2-中等** | 输出文件名错误 |
| 8 | 同步顺序文件写入 | `assembler.ts` | **P2-中等** | 大文件写入阻塞 |
| 9 | 大文件 Single 模式内联 | `single-file.ts` | **P2-中等** | 大文件输出性能下降 |
| 10 | 缺少流式/增量处理 | 全流水线 | **P3-较低** | 无法处理超大型页面 |

## 优化方案一览

| 方案 | 对应问题 | 预估工作量 | 收益 |
|------|---------|-----------|------|
| [流式 DOM 分析器](file:///workspace/web-clone/docs/plan/01-streaming-dom-analyzer.md) | #1, #2 | 3-4 天 | 消除 OOM |
| [JS 智能预过滤](file:///workspace/web-clone/docs/plan/02-js-smart-filter.md) | #3 | 2-3 天 | 减少 90%+ JS 解析量 |
| [CSS 增量解析](file:///workspace/web-clone/docs/plan/03-css-incremental-parse.md) | #4 | 1-2 天 | 减少 80%+ CSS 解析量 |
| [并发下载修复与增强](file:///workspace/web-clone/docs/plan/04-concurrent-download-fix.md) | #5 | 0.5 天 | 下载速度 N 倍提升 |
| [组件检测算法优化](file:///workspace/web-clone/docs/plan/05-component-detection-opt.md) | #6 | 1 天 | 组件检测速度提升 10x+ |
| [URL 分类与命名优化](file:///workspace/web-clone/docs/plan/06-url-classification.md) | #7 | 0.5 天 | 修复文件名错误 |
| [异步写入与进度控制](file:///workspace/web-clone/docs/plan/07-async-write.md) | #8, #9 | 1 天 | 减少写入阻塞 |
| [内存预算与降级策略](file:///workspace/web-clone/docs/plan/08-memory-budget.md) | #1-#4 | 2 天 | 系统级防崩溃保障 |

## 推荐实施顺序

```
Phase 1 (P0 修复)         →  Phase 2 (P1 修复)       →  Phase 3 (P2/P3 增强)
                                                                        
 [01] 流式 DOM 分析器       [03] CSS 增量解析           [06] URL 分类优化
 [04] 并发下载修复           [05] 组件检测优化            [07] 异步写入
 [08] 内存预算与降级                                                  [02] JS 智能预过滤
```

### Phase 1 — 防崩溃底线（P0）
- **[01 流式 DOM 分析器](file:///workspace/web-clone/docs/plan/01-streaming-dom-analyzer.md)** — 替换 `linkedom` + `querySelectorAll('*')`，消除 OOM 根源
- **[04 并发下载修复](file:///workspace/web-clone/docs/plan/04-concurrent-download-fix.md)** — 修正并发数 bug，立即可见效
- **[08 内存预算与降级](file:///workspace/web-clone/docs/plan/08-memory-budget.md)** — 系统级防崩溃保护网

### Phase 2 — 性能恢复（P1）
- **[03 CSS 增量解析](file:///workspace/web-clone/docs/plan/03-css-incremental-parse.md)** — 避免全量 CSS 解析
- **[05 组件检测算法优化](file:///workspace/web-clone/docs/plan/05-component-detection-opt.md)** — 消除 O(n²) 复杂度

### Phase 3 — 体验增强（P2/P3）
- **[06 URL 分类优化](file:///workspace/web-clone/docs/plan/06-url-classification.md)** — 修复文件名错误
- **[07 异步写入](file:///workspace/web-clone/docs/plan/07-async-write.md)** — 减少大文件写入阻塞
- **[02 JS 智能预过滤](file:///workspace/web-clone/docs/plan/02-js-smart-filter.md)** — 减少 JS 解析量

## 关键设计原则

1. **渐进增强**：核心快照流程（snapshot）不应受组件提取影响。组件提取失败不应导致快照丢失。
2. **内存预算**：所有操作应有内存上限，超过时主动降级而非崩溃。
3. **流式优先**：避免将整个文档加载到内存中处理，优先使用流式/分块处理。
4. **可配置降级**：用户应能通过 CLI 参数控制资源消耗与功能完整性之间的权衡。