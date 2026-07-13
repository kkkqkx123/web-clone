# ax 融合集成方案 — web-clone

**状态:** 分析/设计阶段
**日期:** 2026-07-13
**版本:** v1.0-draft
**上下文:** 基于 [ax-ref.txt](./ax-ref.txt) 架构设计文档和 `ref/ax-cli/` 的实际代码实现分析，制定具体的模块级融合方案。

---

## 1. ax 核心能力总结

通过阅读 `ref/ax-cli/src/` 源码，ax 的核心能力分为四大块：

| 能力 | ax CLI 命令 | 关键文件 | 成熟度 |
|------|-------------|----------|--------|
| **表达式语言** | `--where <expr>` | `expr.ts` | 成熟（有完整测试 `expr.test.ts`） |
| **结构化查询** | `--row`, `--table`, jq 路径 | `query.ts` | 成熟 |
| **页面发现** | `--outline`, `--locate` | `root.ts` (内联) | 成熟 |
| **HTTP 客户端** | fetch mode | `io.ts` | 成熟（流式、缓存、字符集探测） |
| **输出格式化** | `--limit`, `--budget`, `--json`, `--tsv` | `emit.ts`, `query.ts` | 成熟 |

### 1.1 值得复用的模块

**expr.ts** — 最小安全表达式语言（无 eval）
- Lexer → Parser → AST → Eval，完整管道
- 支持：`== != ~ !~ > >= < <= && || !`
- 支持 `/regex/flags` 和路径访问 `item.price`
- ~110 行纯函数，零依赖

**query.ts** — jq 子集路径查询
- `.key`, `["key"]`, `[0]`, `[]` 迭代
- `--pick` 字段投影
- `--shape` 结构摘要
- `--freq` 频率表
- `--tsv` 行输出

**emit.ts** — 安全的输出控制
- 默认 cap 50 条
- `--budget <tokens>` 令牌预算
- ANSI/OSC/CSI 控制字符剥离
- 永不静默截断（stderr 通知）

**io.ts** — 可靠的 HTTP 获取
- 流式 capped read（不缓冲整个 body）
- 字符集探测：BOM > Content-Type > `<meta charset>` > UTF-8
- 短 TTL 磁盘缓存（~2min）
- 读取超时 deadline（独立于 fetch AbortSignal）
- 敏感 URL 检测（自动跳过缓存）

---

## 2. 当前 web-clone 项目状态

### 已具备的能力

- 完整的网页快照能力（HTML 解析、CSS/JS 下载、资源重写）
- 组件提取与分析（`component-analyzer`, `css-analyzer`, `js-analyzer`）
- 浏览器自动化适配器（Playwright / Puppeteer）
- 框架代码生成（Vue/React/Angular/Svelte/jQuery）
- 输出验证与清理

### 缺少/薄弱的能力（ax 可补充）

| 能力缺口 | 当前状态 | ax 可提供 |
|----------|----------|-----------|
| **结构化查询** | 无快速从 HTML 提取结构化数据的能力 | `--row`, `--table`, jq 查询 |
| **安全过滤表达式** | 无任何表达式 DSL | `--where <expr>` 安全引擎 |
| **页面发现** | 无快速了解页面结构的机制 | `--outline`, `--locate`, `--count` |
| **输出预算控制** | 输出无令牌预算限制 | `--budget <tokens>`, `--limit` |
| **字符集探测** | 只用了简单的 UTF-8 解码 | BOM→Header→Meta 三级探测 |
| **流式获 body** | 直接 buffer 整个 body | 流式 capped read + deadline |
| **Markdown 转换** | 无 | `--md` 智能转 Markdown |
| **curl 兼容性** | 无 | `-X`, `-H`, `-d`, `-o`, `-u` 等 |

---

## 3. 融合方案

### 3.1 架构决策

**不创建新包，融入现有模块体系。**

理由：
- ax 的模块都很小（`expr.ts` ~110 行，`emit.ts` ~80 行，`query.ts` ~95 行可复用部分）
- 每个模块零外部依赖（仅 `io.ts` 依赖 `Bun`，需适配 Node.js）
- 创建新包会增加 Monorepo 复杂度，且这些功能是 `@web-clone/core` 的天然增强

### 3.2 模块映射

```
ax 模块                                web-clone 目标位置
─────────                              ──────────────────
src/lib/expr.ts          ────────→  packages/core/src/query/expr.ts
src/lib/query.ts         ────────→  packages/core/src/query/query-engine.ts  (部分)
src/lib/emit.ts          ────────→  packages/core/src/output/emit.ts
src/lib/io.ts            ────────→  packages/core/src/fetcher.ts  (增强)
src/commands/root.ts     ────────→  packages/core/src/query/html-query.ts  (发现逻辑)
  (--outline, --locate, --count, --md)
```

### 3.3 新增/修改文件清单

```
packages/core/src/
├── query/                              ← 新增目录
│   ├── expr.ts                         ← 移植 ax expr.ts（安全表达式语言）
│   ├── query-engine.ts                 ← 移植 ax query.ts（结构化数据查询）
│   └── html-query.ts                   ← 移植 ax root.ts 中的发现逻辑（outline/locate/md/table）
├── output/
│   └── emit.ts                         ← 新增，移植 ax emit.ts（预算控制 + 输出格式化）
├── fetcher.ts                          ← 增强：流式读取 + 字符集探测 + 超时 deadline
└── index.ts                            ← 新增导出

apps/cli/src/
├── cli.ts                              ← 新增子命令：inspect / query
└── config/
    └── index.ts                        ← 新增选项定义
```

---

## 4. 详细改造方案

### 4.1 `packages/core/src/query/expr.ts` — 安全表达式语言

**移植 `ref/ax-cli/src/lib/expr.ts`**（约 110 行，纯函数，零依赖）

```typescript
// 直接移植，仅调整 import（将 fail() 替换为 throw new QueryError）
export function compileWhere(src: string): (ctx: unknown) => boolean
```

**测试文件**: `packages/core/src/__tests__/query/expr.test.ts`
**参考**: `ref/ax-cli/test/expr.test.ts`

**改动点**:
- 将 `fail()` → `throw new QueryError()`
- 移除 Bun-specific 依赖（无）

### 4.2 `packages/core/src/query/query-engine.ts` — 结构化数据查询

**移植 `ref/ax-cli/src/lib/query.ts`** 中对 web-clone 有意义的部分：

```typescript
export function runQuery(root: unknown, path: string | undefined): unknown  // jq 路径查询
export function typeOf(v: unknown): string                                 // 类型推断
export function toTsv(result: unknown): string[]                           // TSV 序列化
export function emitQueryResult(result: unknown, flags): Promise<void>     // 统一输出
```

**不移植**:
- `shapeOf()` — 过于 ax 特化，web-clone 不需要 agent 上下文结构摘要
- `queryFlagDefs` — web-clone 使用 Commander 定义选项

**改动点**:
- `emitQueryResult()` 中的 `process.stdout.write` → 返回 string

### 4.3 `packages/core/src/query/html-query.ts` — 页面发现逻辑

**移植 `ref/ax-cli/src/commands/root.ts`** 中的发现功能（约 250 行关键逻辑）：

```typescript
export interface OutlineEntry {
  signature: string;    // tag.class
  count: number;
}

export interface LocateHit {
  selector: string;
  match: string;
}

// 核心 API（基于 JSDOM，而非 linkedom）
export function inspectStructure(doc: Document, options?: { minCount?: number; topN?: number }): OutlineEntry[]
export function locateElement(doc: Document, text: string, scope?: ParentNode): LocateHit[]
export function countElements(doc: Document, selector: string): number
export function tableToRows(table: Element): { headers: string[]; rows: Record<string, string | null>[] }
export function toMarkdown(doc: Document): string
```

**关键设计决策**: 使用 **JSDOM**（web-clone 已有依赖）而非 linkedom（ax 所用）

**所需辅助函数移植**（来自 `root.ts`）:
- `signature(el)` — 生成 `tag.class` 签名
- `selectorPath(el)` — 生成 CSS 选择器路径
- `parseRowSpec(spec)` — 解析 `--row` 格式
- `collapse(s)` — 合并空白
- `inlineToMd(el)` — 内联 Markdown 转换
- `rowStats(rows)` — 行提取统计

### 4.4 `packages/core/src/output/emit.ts` — 格式化输出控制

**移植 `ref/ax-cli/src/lib/emit.ts`**：

```typescript
export type EmitOptions = {
  limit?: number;    // 默认 50
  all?: boolean;     // 不限制
  budget?: number;   // 令牌预算
};

export function emitLines(items: string[], opts?: EmitOptions): string[]
export function emitJson(value: unknown, opts?: EmitOptions): string
export function sanitizeLine(s: string): { text: string; removed: number }
```

**改动点**:
- 将 `process.stdout.write` → 返回格式化后的 string
- 将 `process.stderr.write` → 返回 `note` 信息（由调用方决定输出方式）

### 4.5 `packages/core/src/fetcher.ts` — 增强 HTTP 客户端

**参考 `ref/ax-cli/src/lib/io.ts`** 中的以下技术增强当前 fetcher：

| 增强点 | ax 实现 | 迁移方式 |
|--------|---------|----------|
| **流式 capped read** | `readBodyCapped()` | 新增函数，不破坏现有 `fetchWithTimeout` |
| **字符集探测** | `decodeBody()` (BOM→Header→Meta→UTF-8) | 替换现有 `buffer.toString('utf8')` |
| **读取超时 deadline** | `readWithDeadline()` | 增强现有的 `AbortSignal.timeout` |
| **短 TTL 缓存** | 文件系统缓存 (2min) | 新增可选功能 |

```typescript
// 新增，不修改现有 API
export async function fetchWithCappedBody(
  url: string,
  options: { maxBytes?: number; timeoutMs?: number }
): Promise<{ text: string; capped: boolean; encoding: string }>

export function decodeResponseBody(bytes: Uint8Array, contentType: string | null): string
```

**不移植**:
- `readSource()` — Bun-specific（`Bun.stdin`, `Bun.file`）
- `cacheWrite()` / `sweepExpired()` — web-clone 面向一次执行快照，无须缓存

---

## 5. CLI 子命令设计

### 5.1 `inspect` 子命令 — 页面发现

```bash
pnpm dev:cli inspect <url> [options]

# 示例
pnpm dev:cli inspect https://example.com                     # 快速摘要：结构签名
pnpm dev:cli inspect https://example.com --outline           # 结构轮廓（tag.class 频率）
pnpm dev:cli inspect https://example.com --locate "Search"   # 查找文本所在的选择器
pnpm dev:cli inspect https://example.com --count '.card'     # 计数匹配的元素
pnpm dev:cli inspect https://example.com --md                # 转为 Markdown 阅读
pnpm dev:cli inspect https://example.com --budget 2000       # 限制输出令牌数
```

**实现位置**: `apps/cli/src/commands/inspect.ts`

### 5.2 `query` 子命令 — 结构化提取

```bash
pnpm dev:cli query <url> <selector> [options]

# 示例
pnpm dev:cli query https://example.com '.card' --row 'title=a, href=a@href'
pnpm dev:cli query https://example.com 'table' --table --where 'Stars >= 100'
pnpm dev:cli query https://example.com '.item' --attr 'data-id' --json
pnpm dev:cli query https://example.com '.item' --count
pnpm dev:cli query https://example.com '.item' --html
```

**实现位置**: `apps/cli/src/commands/query.ts`

### 5.3 与现有 snapshot 命令的集成

```bash
# 阶段式工作流（推荐）：
pnpm dev:cli inspect https://example.com --outline           # 步骤1：了解页面结构
pnpm dev:cli query https://example.com '.product-card' --row 'title=.name, price=.price'  # 步骤2：提取数据
pnpm dev:cli -- https://example.com -o ./snapshot            # 步骤3：全量快照

# 一步到位（支持管道理念）：
pnpm dev:cli inspect https://example.com --outline --json | pnpm dev:cli -- $(jq ...) -o ./snapshot
```

---

## 6. 实施路线图

### Phase 0：模块移植（预估工作量：小）

| 任务 | 文件 | 预计工时 | 依赖 |
|------|------|----------|------|
| 移植 expr.ts | `packages/core/src/query/expr.ts` | 0.5天 | 无 |
| 移植 query-engine.ts | `packages/core/src/query/query-engine.ts` | 0.5天 | expr.ts |
| 移植 emit.ts | `packages/core/src/output/emit.ts` | 0.5天 | 无 |
| 移植 html-query.ts | `packages/core/src/query/html-query.ts` | 1天 | JSDOM API（已有） |
| 编写单元测试 | 对应 `__tests__/query/` | 1天 | 上述模块 |

### Phase 1：fetcher 增强（预估工作量：中）

| 任务 | 文件 | 预计工时 | 依赖 |
|------|------|----------|------|
| 移植流式 capped read | `packages/core/src/fetcher.ts` | 1天 | 现 fetcher 结构 |
| 移植字符集探测 | `packages/core/src/fetcher.ts` | 0.5天 | 无 |
| 新增 fetchWithCappedBody | `packages/core/src/fetcher.ts` | 0.5天 | 上述两者 |
| 编写测试 | `__tests__/fetcher.test.ts` | 1天 | - |

### Phase 2：CLI 子命令（预估工作量：中）

| 任务 | 文件 | 预计工时 | 依赖 |
|------|------|----------|------|
| inspect 子命令 | `apps/cli/src/commands/inspect.ts` | 1天 | html-query.ts |
| query 子命令 | `apps/cli/src/commands/query.ts` | 1天 | query-engine.ts |
| CLI 集成测试 | `apps/cli/src/__tests__/` | 1天 | - |
| 更新 README 和帮助文档 | 文档 | 0.5天 | - |

### Phase 3：组件提取增强（可选）

| 任务 | 文件 | 预计工时 | 依赖 |
|------|------|----------|------|
| 表达式引擎用于组件过滤 | `component-analyzer.ts` + `expr.ts` | 0.5天 | expr.ts |
| Markdown 导出组件文档 | `output/convert.ts` + `toMarkdown()` | 0.5天 | html-query.ts |

### 总预估：约 8-10 人日

---

## 7. 关键技术决策

### 7.1 JSDOM 还是 linkedom？

| 维度 | JSDOM（√ 选用） | linkedom |
|------|----------------|----------|
| 已有 | web-clone 已安装 `jsdom` (optional peer dep) | 需新加依赖 |
| API 兼容性 | W3C 标准 DOM API | W3C 标准子集 |
| script 执行 | 支持 | 部分支持 |
| 性能 | 较慢 | 更快（~2x） |
| 测试覆盖 | web-clone 现有测试均基于 JSDOM | 需新测试套件 |

**决策**: 使用 JSDOM。web-clone 已有的 `parseHtml()` 就是基于 JSDOM 实现的，保持统一避免两套 DOM 实现。

### 7.2 输出方式：console 还是返回 string？

ax 的设计是直写 `process.stdout` / `process.stderr`，但 web-clone 遵循"Library First"原则。

**决策**: Library 层函数返回 string/object，CLI 层负责输出。
```
Library API (返回数据)
    ↓
CLI 层 (console.log / process.stdout.write)
```

### 7.3 缓存策略：是否需要 ax 的磁盘缓存？

ax 的磁盘缓存针对"重复探索同 URL"场景（CI 中多次 `--outline` 试探）。

**决策**: 当前不移植缓存。web-clone 的本质是一次性执行（snapshot 模式），重复访问同 URL 的场景不常见。如后续发现性能瓶颈，可引入内存 LRU 缓存而非磁盘缓存。

### 7.4 表达式引擎的应用场景

`expr.ts` 不仅能用于 `--where` 过滤，还能在以下场景发挥作用：

1. **组件筛选**: `--extract-components --filter "confidence >= 0.7 && type == 'stateful'"`
2. **资源过滤**: `--resource-filter "size < 1MB && !url ~ /cdn\./"`
3. **断言引擎**: CLI 退出码判断 `--assert "signature:.product-card > 10"`（见 ax-ref.txt 场景一）

---

## 8. 与 ax-ref.txt 架构设计的对齐

本方案与 `ax-ref.txt` 中的"三层架构"保持一致：

| ax-ref.txt 层 | 本方案实现 |
|---------------|-----------|
| **探索模块** (源自 ax) | `packages/core/src/query/html-query.ts` — `inspectStructure`, `locateElement` |
| **克隆模块** (源自 web-clone) | 不变，保持现有 `assembler.ts` |
| **组件分析模块** | 不变，保持现有 `transform/` |
| **Core Engine** | 增强：fetcher 字符集探测 + 流式读取 |

---

## 9. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| **JSDOM 的 querySelector 行为与 linkedom 有差异** | 中 | 中 | 为 html-query.ts 编写独立的 JSDOM 测试套件 |
| **流式 fetcher 改动破坏现有 snapshot 流程** | 低 | 高 | 新增函数而非修改现有 `fetchWithTimeout`，从零集成 |
| **输出预算控制增加 CLI 复杂度** | 低 | 低 | 默认不启用（向后兼容），用户通过 `--budget` 显式启用 |
| **表达式引擎被滥用** | 低 | 中 | 纯函数设计，无副作用路径（`expr.ts` 的 `evalNode` 不访问外部状态） |

---

## 10. 总结

本方案将 ax 的四个核心能力（表达式语言、结构化查询、页面发现、输出控制）融入 web-clone 现有架构，通过：

1. **新增 `query/` 模块目录** — 零外部依赖，纯函数实现
2. **增强 fetcher** — 流式读取 + 字符集探测
3. **新增 CLI 子命令** — `inspect` + `query`，扩展 web-clone 的使用场景
4. **保持 Library First** — 所有功能先作为 TypeScript API 暴露

融合后的 web-clone 将从一个"只做快照的工具"升级为"既能发现/分析/提取，又能快照/审查"的全链路网页自动化基础设施。

> **关键原则**: 不破坏现有 API，不引入新的第三方依赖，逐步增强而非重写。
