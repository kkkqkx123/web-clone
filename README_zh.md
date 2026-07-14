# web-clone

**单次执行的网页快照工具** — 下载并打包完整网页快照，支持可选的组件结构提取和框架代码生成。

[English Documentation](./README.md)

## 功能特性

- **完整快照**：下载整个网页（HTML、CSS、JS、图片、字体、媒体资源）
- **灵活输出**：单一自包含 HTML 文件或分离资源的目录结构
- **组件提取**：分析并提取组件结构，包含状态/事件分析（可选）
- **框架代码生成**：从提取的组件生成 Vue/React/Angular/Svelte/jQuery 代码（可选）
- **浏览器自动化**：支持 Playwright 或 Puppeteer，适用于 SPA/SSR 应用
- **智能过滤**：资源预设和精细的包含/排除控制
- **递归发现**：扫描 JS/JSON 中的嵌入资源 URL（可选）
- **大小与预算限制**：文件大小硬上限、并发控制、内存预算
- **配置层级**：全局 `~/.config/web-clone/config.json` + 项目级 `web-clone.config.json` + CLI 参数
- **验证与清理**：检查快照完整性、删除损坏文件、重新下载缺失资源
- **页面诊断**：分析页面结构、定位文本、提取结构化数据（内置查询引擎）

## 安装

### CLI（全局安装）

通过 npm 全局安装 CLI 工具：

```bash
npm install -g @kkkqkx123/web-clone-cli
```

安装后，`snapshot` 命令即可全局使用：

```bash
snapshot https://example.com -o ./snapshot
```

### 库（项目中使用）

在您的 Node.js/TypeScript 项目中以库的方式使用 web-clone：

```bash
# 核心快照引擎
pnpm add @web-clone/core

# 可选：浏览器自动化适配器
pnpm add @web-clone/adapter-playwright
pnpm add @web-clone/adapter-puppeteer

# 可选：框架代码生成器
pnpm add @web-clone/codegen

# 可选：共享类型
pnpm add @web-clone/types
```

### 包一览

| 包名 | npm 作用域 | 说明 |
|------|-----------|------|
| `@kkkqkx123/web-clone-cli` | `@kkkqkx123`（个人） | CLI 应用，提供 `snapshot` 命令 |
| `@web-clone/core` | `@web-clone`（组织） | 核心快照引擎 |
| `@web-clone/adapter-common` | `@web-clone`（组织） | 共享 SPA 水合检测与自动化类型 |
| `@web-clone/adapter-playwright` | `@web-clone`（组织） | Playwright 浏览器自动化适配器 |
| `@web-clone/adapter-puppeteer` | `@web-clone`（组织） | Puppeteer 浏览器自动化适配器 |
| `@web-clone/codegen` | `@web-clone`（组织） | 框架代码生成器（Vue/React/Angular/Svelte/jQuery） |
| `@web-clone/types` | `@web-clone`（组织） | 共享 TypeScript 类型定义 |

## 快速开始

```bash
# 安装依赖
pnpm install

# 直接运行（无需编译）
pnpm dev:cli https://example.com -o ./snapshot

# 或先编译再运行
pnpm build
node apps/cli/dist/cli.js https://example.com -o ./snapshot
```

> **PowerShell 用户**：`pnpm dev:cli <url>` 可直接使用（CLI 已自动处理 `--` 传递问题）。如仍遇到问题，可将 `--` 加引号 —— `pnpm dev:cli '--' <url>`，或直接使用 `npx tsx apps/cli/src/cli.ts <url>`。
> **代理用户注意**：工具自动读取 `HTTPS_PROXY`/`HTTP_PROXY` 环境变量，见 [docs/proxy.md](docs/proxy.md)。

## CLI 使用

```bash
pnpm dev:cli <url> [options]                         # 快照（默认命令）
pnpm dev:cli inspect <url> [options]                    # 页面结构分析
pnpm dev:cli query <url> <selector> [options]           # 结构化数据提取
pnpm dev:cli validate <output-dir>                      # 验证快照完整性
pnpm dev:cli clean <output-dir> [options]               # 清理损坏文件
```

### 基础选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `-o, --output <path>` | `./snapshot` | 输出路径 |
| `-m, --mode <type>` | `bundle` | 输出格式：`single`（单 HTML 文件）或 `bundle`（目录） |
| `--convert-local <path>` | — | 对已有快照运行组件提取和代码生成（跳过 URL 拉取） |

### 下载与性能

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--max-assets <n>` | `100` | 最大下载资源数 |
| `--concurrency <n>` | `6` | 并发下载数 |
| `--timeout <ms>` | `15000` | 单资源超时（毫秒） |
| `--retry-count <n>` | `1` | 失败重试次数 |
| `--retry-initial-delay <ms>` | `200` | 重试初始退避延迟 |
| `--retry-max-delay <ms>` | `2000` | 重试最大退避延迟 |
| `--max-file-size <size>` | `50MB` | 单文件大小上限；`0` 禁用 |
| `--no-inline` | (内联) | 禁用 data URI 内联（仅 single 模式） |
| `--pretty` | (压缩) | 美化输出 HTML |
| `--strict-status-codes` | `false` | 严格要求所有资源返回 2xx 状态码 |

### 资源过滤

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--resource-preset <name>` | `default` | 预设：`none` \| `minimal` \| `default` \| `no-media` \| `aggressive` |
| `--skip-types <exts>` | (按预设) | 显式跳过列表（覆盖预设）；`""` 禁用 |
| `--include-wasm` | — | 包含 `.wasm` 文件 |
| `--include-bin` | — | 包含 `.bin` 文件 |
| `--include-video` | — | 包含视频文件 |
| `--include-media` | — | 包含视频 + 音频文件 |
| `--include-fonts` | — | 包含字体文件 |
| `--include-all` | — | 包含所有文件类型 |
| `--exclude-images` | — | 排除图片文件 |
| `--exclude-css` | — | 排除 CSS 文件 |
| `--exclude-js` | — | 排除 JavaScript 文件 |

### 递归扫描

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--scan-depth <n>` | `1` | 递归扫描深度（2+ 扫描 JS/JSON 中的嵌入 URL） |
| `--scan-js` | `true` | 扫描 JS 文件中的嵌入 URL |
| `--scan-json` | `false` | 扫描 JSON 文件中的媒体 URL |

### 浏览器自动化

| 选项 | 说明 |
|------|------|
| `--adapter <type>` | 浏览器引擎：`playwright` \| `puppeteer` |
| `--hybrid` | 浏览器渲染 HTML + HTTP 池下载资源（需配合 `--adapter`） |

### 组件提取

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--extract-components` | — | 开启组件提取 |
| `--component-depth <n>` | 无限制 | 限制组件识别深度 |
| `--framework <hint>` | — | 框架提示：`vue`、`react` 或 `svelte` |
| `--extract-logic` | `true` | 提取 JS 逻辑 |
| `--component-filter <expr>` | — | 按表达式过滤，如 `"confidence >= 0.7"` |
| `--memory-limit <mb>` | `1536` | 提取的内存预算（MB） |

### 框架代码生成

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--codegen-framework <type>` | — | 目标框架：`vue` \| `react` \| `angular` \| `svelte` \| `jquery` |
| `--codegen-typescript` | `true` | 生成 TypeScript 代码 |
| `--codegen-css-modules` | `false` | React 使用 CSS Modules |
| `--codegen-generate-drafts` | — | 在 `__drafts__/` 生成完整项目模板 |
| `--codegen-extract-shared` | — | 提取共享逻辑到 `shared/` |

### 诊断子命令

```
# 页面结构分析
pnpm dev:cli inspect <url> [--outline | --locate <text> | --count <sel> | --md]

# 结构化数据提取
pnpm dev:cli query <url> <selector> [--row <spec> | --table | --attr <n> | --json]

# 验证快照完整性
pnpm dev:cli validate <output-dir>

# 清理损坏/零字节文件
pnpm dev:cli clean <output-dir> [--dry-run] [--re-download]
```

完整选项参考见 [docs/commands.md](docs/commands.md)。

## 示例

### 基础快照

```bash
# Bundle 模式（默认）— 目录结构，资源分离存储
pnpm dev:cli https://example.com -o ./site

# Single 模式 — 自包含 HTML 文件
pnpm dev:cli https://example.com -o snapshot.html -m single
```

### 浏览器自动化

```bash
# Playwright（SPA/SSR 站点）
pnpm dev:cli https://spa-site.com --adapter playwright

# 混合模式：浏览器渲染 + HTTP 池下载
pnpm dev:cli https://spa-site.com --adapter playwright --hybrid
```

### 组件提取

```bash
# 提取组件结构
pnpm dev:cli https://example.com --extract-components

# 指定框架和深度限制
pnpm dev:cli https://example.com --extract-components --framework vue --component-depth 5

# 生成框架代码
pnpm dev:cli https://example.com --extract-components --codegen-framework react
```

### 资源过滤

```bash
# 使用预设
pnpm dev:cli https://example.com --resource-preset no-media

# 精细控制
pnpm dev:cli https://example.com --include-video --include-fonts --exclude-images

# 包含所有文件类型
pnpm dev:cli https://example.com --include-all
```

### 递归扫描

```bash
pnpm dev:cli https://example.com --scan-depth 3 --scan-json
```

### 本地转换（无需重新拉取）

```bash
pnpm dev:cli --convert-local ./project --codegen-framework vue
```

### 页面诊断

```bash
# 结构大纲
pnpm dev:cli inspect https://example.com --outline

# 查找包含文本的元素
pnpm dev:cli inspect https://example.com --locate "搜索"

# 提取表格数据
pnpm dev:cli query https://example.com 'table' --table --where 'Stars >= 100' --json

# 验证和清理
pnpm dev:cli validate ./output
pnpm dev:cli clean ./output --dry-run
```

### 完整示例

```bash
pnpm dev:cli https://example.com \
  -o ./project \
  -m bundle \
  --extract-components \
  --framework react \
  --component-depth 4 \
  --max-assets 200 \
  --concurrency 8 \
  --pretty \
  --resource-preset no-media \
  --max-file-size 20MB \
  --codegen-framework react \
  --codegen-typescript \
  --codegen-extract-shared
```

## 输出结构

### Bundle 模式

```
output/
├── index.html                  # 主快照 HTML
├── assets/
│   ├── css/                    # 样式表
│   ├── js/                     # JavaScript 文件
│   ├── img/                    # 图片
│   ├── fonts/                  # 字体文件
│   └── data/                   # 其它数据（媒体等）
├── snapshot.json               # 资源清单与状态
├── manifest.json               # 资源校验信息
└── components/                 # （如果 --extract-components）
    ├── components/
    │   ├── Header/
    │   │   ├── template.html
    │   │   ├── style.css
    │   │   ├── manifest.json
    │   │   └── logic.original.json
    │   └── Footer/
    ├── index.json
    ├── README.md
    ├── MIGRATION.md
    └── REVIEW_REQUIRED.md      # 低置信度组件审查清单
```

### Single 模式

```
snapshot.html                   # 自包含 HTML 文件
snapshot_components/            # （如果 --extract-components）
├── components/
├── index.json
├── README.md
└── MIGRATION.md
```

## 架构

### 快照流水线

1. **Fetch HTML** — 下载页面，带超时和 User-Agent 头
2. **Parse HTML** — 提取资源引用（CSS、JS、图片、字体、媒体）
3. **递归 CSS 提取** — 下载外部 CSS，提取 `@import` 和 `url()` 引用
4. **递归 JS/JSON 扫描**（可选） — 扫描 JS/JSON 中的嵌入资源 URL
5. **去重** — 去除重复 URL
6. **过滤与下载** — 应用扩展名/大小过滤，并发下载剩余资源
7. **组装输出** — Bundle 模式写入文件；Single 模式内联所有内容

### 组件提取流水线（可选）

1. **HTML 分析** — 识别组件边界（语义标签、深度）
2. **CSS 分析** — 提取变量，按组件（BEM）分组规则
3. **JS 分析** — 提取状态变量、事件处理器、生命周期钩子
4. **关联** — 将 HTML 组件与 CSS 规则和 JS 逻辑匹配
5. **代码生成**（可选） — 生成 Vue/React/Angular/Svelte/jQuery 代码

## 库 API

web-clone 也可作为库在您自己的 Node.js/TypeScript 项目中使用：

```bash
pnpm add @web-clone/core
# 可选：pnpm add @web-clone/adapter-playwright @web-clone/codegen
```

```typescript
import { snapshot } from '@web-clone/core';
import { PlaywrightFetcherAdapter } from '@web-clone/adapter-playwright';

// HTTP 快照
const result = await snapshot('https://example.com', {
  output: './snapshot',
  mode: 'bundle',
});

// 浏览器自动化快照
const adapter = new PlaywrightFetcherAdapter(page, context);
const result = await snapshot({ url: 'https://spa-site.com', ... }, adapter);
```

完整 API 参考见 [docs/library.md](docs/library.md)。

## 配置层级

web-clone 支持多层配置合并（优先级从低到高）：

| 优先级 | 位置 | 说明 |
|--------|------|------|
| 0 | 内置默认值 | `packages/core/src/config/defaults.ts` |
| 1 | `~/.config/web-clone/config.json` | 全局用户配置 |
| 2 | `./web-clone.config.json` / `.web-clonerc` | 项目级配置 |
| 3 | CLI 参数 | 最高优先级 |

配置文件格式详见 [examples/config-examples/config-README.md](examples/config-examples/config-README.md)。

## 平台说明

### PowerShell

`pnpm dev:cli <url>` 可直接使用 —— CLI 已自动过滤 pnpm 传递的 `"--"` 字面量。如仍遇到问题：

```powershell
# 将 -- 加引号以避免 PowerShell 截获：
pnpm dev:cli '--' "https://example.com" -o ./snapshot
# 或绕过 pnpm 直接使用 tsx：
npx tsx apps/cli/src/cli.ts "https://example.com" -o ./snapshot
```

### 代理

工具自动读取 `HTTPS_PROXY` / `HTTP_PROXY` 环境变量，详见 [docs/proxy.md](docs/proxy.md)。

## 开发

```bash
# 安装依赖
pnpm install

# 构建所有包（turbo 并行编译）
pnpm build

# 无需编译直接运行
pnpm dev:cli <url>

# 监听模式（所有包）
pnpm dev

# 运行测试
pnpm test                # turbo run test
pnpm test:unit           # @web-clone/core 单元测试
pnpm test:integration    # CLI 集成测试

# 清理构建产物
pnpm clean
```

## 项目结构

```
├── apps/cli/                     # CLI 应用（Commander）
├── packages/
│   ├── core/                     # @web-clone/core — 快照引擎
│   ├── adapter-common/           # 共享 SPA 水合检测
│   ├── adapter-playwright/       # Playwright 浏览器适配器
│   ├── adapter-puppeteer/        # Puppeteer 浏览器适配器
│   └── codegen/                  # 框架代码生成器
├── docs/                         # 文档
├── examples/                     # 使用示例
│   ├── config-examples/          # 配置文件示例
│   └── playwright/               # Playwright 集成示例
└── pnpm-workspace.yaml           # Monorepo 配置
```

## 文档

| 文档 | 说明 |
|------|------|
| [docs/commands.md](docs/commands.md) | 完整 CLI 命令参考 |
| [docs/library.md](docs/library.md) | 库 API 参考（所有包） |
| [docs/proxy.md](docs/proxy.md) | 代理配置 |
| [docs/COMPONENT_TRANSFORM.md](docs/COMPONENT_TRANSFORM.md) | 组件提取详情 |
| [docs/architecture/MONOREPO_DESIGN.md](docs/architecture/MONOREPO_DESIGN.md) | Monorepo 架构 |

## 许可证

MIT

## 🤝 致谢与社区

本项目永久感谢 [LINUX DO](https://linux.do/) 社区的支持与推广。
