# web-clone Skills Guide for AI Agents

## 项目概述

**web-clone** 是一个单次执行的网页快照工具，基于 MirrorKit 设计理念。它可以下载完整网页（HTML、CSS、JS、图片、字体、媒体），输出为单 HTML 文件或目录束，并可选择性地提取和分析组件结构，支持生成多框架代码（Vue/React/Angular/Svelte/jQuery）。

## 核心能力

### 1. 网页快照（Snapshot）

- **抓取 HTML** — 使用 `fetchWithTimeout` 获取页面，带 User-Agent 和超时
- **解析 HTML** — 提取 CSS/JS/图片/字体/媒体等资源引用（`linkedom` 解析）
- **递归 CSS 提取** — 下载外部 CSS，提取深层 `@import` 和 `url()` 引用
- **去重** — 基于 URL 去重
- **下载资源** — 并发 workers，带重试和校验
- **组装输出**:
  - **Bundle 模式** — 资源保存到 `assets/{css,js,img,fonts,data}/`，HTML 路径重写
  - **Single 模式** — CSS/JS 内联，图片/Font 转 base64 data URI

### 2. 组件提取（Component Extraction）

- **HTML 分析** — 识别组件边界（显式标记 → 语义标签 → 可选深度）
- **CSS 分析** — 提取 CSS 变量，BEM 分组，标记动态样式
- **JS 分析** — 提取状态变量、事件处理器、生命周期钩子、DOM 引用
- **关联分析** — 匹配 HTML 组件与 CSS 规则和 JS 逻辑，计算置信度分数
- **生成** — 生成组件规范、清单、迁移指南、审查报告

### 3. 框架代码生成（Framework CodeGen）

- 支持 Vue 3、React 18、Angular 17、Svelte 4、jQuery 3.7
- 可选 TypeScript、CSS Modules、完整项目模板（`__drafts__/`）
- 共享逻辑提取（API 客户端、工具函数、常量）

## 输入

```bash
npm run dev -- <url> [options]
npx tsx src/cli.ts <url> [options]
```

### 必选参数

| 参数 | 说明 |
|------|------|
| `<url>` | 目标页面 URL |

### 输出模式选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `-o, --output <path>` | `./snapshot` | 输出路径 |
| `-m, --mode <type>` | `bundle` | `single`（单 HTML 文件）或 `bundle`（目录束） |

### 下载选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--max-assets <n>` | `100` | 最大下载资源数 |
| `--concurrency <n>` | `6` | 并发数 |
| `--timeout <ms>` | `15000` | 超时（毫秒） |
| `--retry-count <n>` | `1` | 重试次数 |
| `--no-inline` | — | 禁用 data URI 内联 |
| `--pretty` | — | 美化 HTML |

### 组件提取选项

| 选项 | 说明 |
|------|------|
| `--extract-components` | 启用组件提取 |
| `--component-depth <n>` | 限制识别深度（默认无限制） |
| `--framework <hint>` | 框架提示：`vue`/`react`/`svelte` |
| `--extract-logic` | 是否提取 JS 逻辑（默认 true） |

### 框架代码生成选项

| 选项 | 说明 |
|------|------|
| `--codegen-framework <type>` | 生成框架代码：`vue`/`react`/`angular`/`svelte`/`jquery` |
| `--codegen-typescript` | 使用 TypeScript（默认 true） |
| `--codegen-css-modules` | 使用 CSS Modules（默认 false） |
| `--codegen-generate-drafts` | 生成完整项目模板到 `__drafts__/` |
| `--codegen-extract-shared` | 提取共享逻辑到 `shared/` |

## 输出

### Bundle 模式输出结构

```
output/
├── index.html                # 主快照 HTML
├── assets/
│   ├── css/, js/, img/, fonts/, data/
├── snapshot.json              # 资源清单与状态
├── manifest.json              # 资源校验信息
└── components/                # 组件提取结果（可选）
    ├── components/
    │   ├── Header/
    │   │   ├── template.html
    │   │   ├── style.css
    │   │   ├── manifest.json
    │   │   └── logic.original.json
    ├── index.json
    ├── README.md
    ├── MIGRATION.md
    └── REVIEW_REQUIRED.md     # 低置信度组件审查清单
```

### Single 模式输出

```
snapshot.html                  # 完整自包含 HTML
snapshot_components/           # 组件提取结果
```

## 系统架构

### 主流水线

```
URL → fetchHtml() → parseHtml() → 提取资源引用 → 递归CSS提取 → 去重 → downloadAllAssets() → 组装输出(bundle/single) → 可选: 组件提取
```

### 组件提取流水线

```
HTML分析 → CSS分析 → JS分析 → 关联分析 → 生成组件规范 → 写入输出
```

### 核心模块

| 模块 | 功能 |
|------|------|
| `src/cli.ts` | Commander CLI，正交选项设计 |
| `src/assembler.ts` | 主流水线编排 |
| `src/fetcher.ts` | HTTP 抓取，AbortController 超时，并发池，重试 |
| `src/converter.ts` | 组件提取流水线编排 |
| `src/validators.ts` | MIME 校验，魔数检查，内容完整性 |
| `src/parser/html-parser.ts` | HTML 解析，资源引用提取，`linkedom` |
| `src/parser/css-parser.ts` | CSS 解析，`@import`/`url()` 提取，`css-tree` |
| `src/parser/url-resolver.ts` | URL 解析（相对→绝对），srcset 解析 |
| `src/output/bundle.ts` | Bundle 模式组装，路径重写，防路径穿越 |
| `src/output/single-file.ts` | Single 模式组装，CSS/JS 内联，data URI |
| `src/output/convert.ts` | 组件输出写入，含框架代码生成 |
| `src/transform/component-analyzer.ts` | HTML 组件分析 |
| `src/transform/css-analyzer.ts` | CSS 分析，BEM 分组 |
| `src/transform/js-analyzer.ts` | JS 分析，Babel AST |
| `src/transform/correlator.ts` | 关联匹配，置信度计算 |
| `src/transform/generator.ts` | 组件规范生成 |
| `src/transform/framework-codegen/` | 多框架代码生成器 |

## 使用示例

### 基础快照

```bash
# Bundle 模式（默认）
npm run dev -- https://example.com -o ./site

# Single 模式
npm run dev -- https://example.com -o snapshot.html -m single
```

### 快照 + 组件提取

```bash
npm run dev -- https://example.com -o ./project -m bundle --extract-components
```

### 快照 + 组件提取 + 框架代码生成

```bash
npm run dev -- https://example.com -o ./project -m bundle \
  --extract-components \
  --codegen-framework vue \
  --codegen-typescript \
  --codegen-generate-drafts
```

## 注意事项

1. **正交选项设计**：输出模式（`-m single/bundle`）和组件提取（`--extract-components`）是正交的，可以任意组合
2. **组件深度限制**：`--component-depth` 默认无限制，启用后高深度组件置信度递减
3. **置信度评分**：HTML 检测 50% + CSS 匹配 30% + JS 逻辑 20%，低于 0.6 的标为需审查
4. **CSS/JS 来源合并**：优先使用内联 CSS/JS，回退到下载的资产
5. **路径安全**：Bundle 模式有路径穿越防护
6. **输出路径**：组件输出目录为 `{output}/components`（bundle 模式）或 `{output}_components`（single 模式）