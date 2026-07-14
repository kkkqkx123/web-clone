# 命令参考

> **PowerShell 用户注意**：`--` 需要加引号，见下方说明。
> **代理用户注意**：工具自动读取 `HTTPS_PROXY`/`HTTP_PROXY` 环境变量，见 [proxy.md](./proxy.md)。

## 入口命令

```bash
pnpm dev:cli -- <url> [options]               # 开发模式 (tsx)
pnpm --filter web-clone-cli snapshot -- <url>  # 通过 filter 运行
node apps/cli/dist/cli.js <url> [options]      # 编译后执行
```

编译后也可通过 bin 执行（需先 `pnpm build`）：

```bash
snapshot <url> [options]
```

## 脚本

| 命令 | 作用 |
|------|------|
| `pnpm build` | 构建所有包（turbo 并行编译） |
| `pnpm dev` | 所有包监听模式 |
| `pnpm dev:cli -- <url>` | 直接通过 tsx 运行快照 |
| `pnpm test` | 运行所有测试（turbo） |
| `pnpm test:unit` | 仅运行 `@web-clone/core` 单元测试 |
| `pnpm test:integration` | 仅运行 CLI 集成测试 |
| `pnpm clean` | 清理所有 dist 目录 |
| `pnpm --filter web-clone-cli lint` | 仅对 CLI 执行 lint |

### 子命令

| 命令 | 作用 |
|------|------|
| `pnpm dev:cli snapshot -- <url>` | 网页快照（默认命令） |
| `pnpm dev:cli inspect <url>` | 页面结构分析（大纲/定位/计数/Markdown） |
| `pnpm dev:cli query <url> <selector>` | 结构化数据提取（行提取/表格解析/过滤） |
| `pnpm dev:cli validate <output-dir>` | 验证已下载的快照目录完整性 |
| `pnpm dev:cli clean <output-dir>` | 清理损坏/零字节文件 |

## PowerShell 兼容性

在 **PowerShell** 中，`--` 是 stop-parsing 符号，会被 PowerShell 自身截获而不会传递给 npm。需加上引号：

```powershell
# ✅ 正确
pnpm dev:cli '--' "https://example.com" -o ./snapshot

# ❌ 错误，-- 会被 PowerShell 吃掉
pnpm dev:cli -- https://example.com -o ./snapshot
```

**推荐方案**：绕过 pnpm，直接使用 `npx tsx` 运行（不受 PowerShell 参数解析影响）：

```powershell
npx tsx apps/cli/src/cli.ts "https://example.com" -o ./snapshot
```

## CLI 选项

### 基础选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `<url>` | (必填) | 目标页面 URL，`--convert-local` 时可省略 |
| `-o, --output <path>` | `./snapshot` | 输出路径。`--convert-local` 且未指定时，默认使用本地路径 |
| `-m, --mode <type>` | `bundle` | 输出格式：`single`（单HTML文件）或 `bundle`（目录结构） |
| `--convert-local <path>` | - | 对已有本地 bundle/single 输出运行组件提取和代码生成，跳过 URL 拉取 |

### 下载和资源选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--max-assets <number>` | `100` | 最大下载资源数 |
| `--concurrency <number>` | `6` | 并发下载数 |
| `--timeout <ms>` | `15000` | 单资源超时（毫秒） |
| `--retry-count <number>` | `1` | 失败重试次数 |
| `--retry-initial-delay <ms>` | `200` | 重试初始退避延迟（毫秒） |
| `--retry-max-delay <ms>` | `2000` | 重试最大退避延迟（毫秒） |
| `--no-inline` | (内联) | 禁用 data URI 内联（仅 single 模式） |
| `--pretty` | (压缩) | 美化输出 HTML |
| `--strict-status-codes` | `false` | 要求所有资源返回 2xx 状态码（默认宽容模式：接受含有效内容的 4xx/5xx CSS/JS） |
| `--max-file-size <size>` | `50MB` | 单文件大小硬上限，支持 `50MB`、`10m`、`10485760` 等格式；`0` 为不限制 |

### 资源过滤选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--skip-types <extensions>` | 见下方说明 | 跳过指定扩展名资源下载，逗号分隔，如 `.zip,.mp4`；空字符串禁用过滤 |
| `--resource-preset <name>` | `default` | 资源过滤预设：`none` \| `minimal` \| `default` \| `no-media` \| `aggressive`（`--skip-types` 优先） |
| `--include-wasm` | - | 包含 .wasm 文件 |
| `--include-bin` | - | 包含 .bin 文件 |
| `--include-video` | - | 包含视频文件（.mp4, .webm, .m3u8, .ts 等） |
| `--include-media` | - | 包含视频和音频文件 |
| `--include-fonts` | - | 包含字体文件（.woff, .woff2, .ttf, .otf） |
| `--include-all` | - | 包含所有文件类型（等价于 `--resource-preset none`） |
| `--exclude-images` | - | 排除图片文件 |
| `--exclude-css` | - | 排除 CSS 文件 |
| `--exclude-js` | - | 排除 JavaScript 文件 |

**资源过滤预设参考**：

| 预设 | 跳过的扩展名 | 适用场景 |
|------|-------------|----------|
| `none` | (无) | 完整站点镜像，包含 WASM、视频、字体 |
| `minimal` | 压缩包 | 典型网页快速快照 |
| `default` | 压缩包 + 安装包 + 文档 | 大多数站点安全选择（推荐） |
| `no-media` | 默认 + 视频 + 音频 | 纯文本优先，最快 |
| `aggressive` | 仅保留核心 web 资源 | 最小体积 |

**扩展名分组参考**：

| 分组 | 扩展名 |
|------|--------|
| `wasm` | `.wasm` |
| `bin` | `.bin` |
| `video` | `.mp4`, `.webm`, `.m3u8`, `.ts`, `.m4v`, `.mkv`, `.avi`, `.mov`, `.flv` |
| `audio` | `.mp3`, `.aac`, `.flac`, `.ogg`, `.wma`, `.wav` |
| `fonts` | `.woff`, `.woff2`, `.ttf`, `.otf`, `.eot` |
| `archives` | `.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.bz2` |
| `documents` | `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx` |
| `installers` | `.exe`, `.msi`, `.dmg`, `.apk`, `.deb`, `.rpm` |
| `images` | `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.avif`, `.svg`, `.ico`, `.bmp` |
| `css` | `.css` |
| `js` | `.js`, `.mjs`, `.cjs` |

### 递归扫描选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--scan-depth <n>` | `1` | 递归资源扫描深度（1=当前行为；2+ 扫描 JS/CSS/JSON 中的隐藏 URL） |
| `--scan-js` | `true` | 扫描 JS 文件中的嵌入 URL |
| `--scan-json` | `false` | 扫描 JSON 文件中的媒体 URL |

### 浏览器自动化选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--adapter <type>` | - | 浏览器自动化引擎：`playwright` \| `puppeteer`（需安装对应可选包） |
| `--hybrid` | - | 混合模式：浏览器渲染 HTML，HTTP 池下载资源（需配合 `--adapter`） |

Vue/Nuxt SSR 快照会自动注入 hydration 脚本（CLI 层优化），帮助本地打开时正确水合。

### 组件提取选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--extract-components` | (不提取) | 提取组件结构（与任何输出模式组合） |
| `--component-depth <n>` | (无限制) | 限制组件识别深度（仅与 `--extract-components` 配合） |
| `--framework <hint>` | - | 框架提示：`vue`、`react` 或 `svelte`（仅与 `--extract-components` 配合） |
| `--extract-logic` | `true` | 是否提取 JS 逻辑（仅与 `--extract-components` 配合） |
| `--component-filter <expr>` | - | 按表达式过滤组件，如 `"confidence >= 0.7 && type == 'stateful'"` |
| `--memory-limit <mb>` | `1536` | 组件提取的内存预算（MB） |

### 代码生成选项

> 所有选项均需配合 `--extract-components` 使用。

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--codegen-framework <type>` | - | 生成框架代码：`vue` \| `react` \| `angular` \| `svelte` \| `jquery` |
| `--codegen-typescript` | `true` | 生成的代码使用 TypeScript |
| `--codegen-css-modules` | `false` | React 使用 CSS Modules |
| `--codegen-generate-drafts` | - | 在 `__drafts__/` 生成完整项目模板（需 `--codegen-framework`） |
| `--codegen-extract-shared` | - | 提取共享逻辑到 `shared/` 目录 |

### 诊断子命令选项

#### `inspect`（页面分析）

```
pnpm dev:cli inspect <url> [options]
```

| 选项 | 说明 |
|------|------|
| `--outline` | 显示结构大纲（tag.class 频率） |
| `--locate <text>` | 查找哪些选择器包含指定文本 |
| `--count <selector>` | 统计匹配 CSS 选择器的元素数量 |
| `--md` | 将页面转换为 Markdown |
| `--json` | JSON 格式输出（用于 `--locate`） |
| `--limit <n>` | 限制输出条目数（默认 50） |
| `--all` | 显示所有结果，不限制 |
| `--budget <n>` | 输出上限（~N tokens） |

#### `query`（结构化数据提取）

```
pnpm dev:cli query <url> <selector> [options]
```

| 选项 | 说明 |
|------|------|
| `--row <spec>` | 结构化行提取：`name=selector, name2=sel@attr` |
| `--table` | 解析 HTML 表格为结构化行 |
| `--where <expr>` | 过滤行，如 `"age >= 18"` |
| `--attr <name>` | 提取单个属性 |
| `--count` | 仅统计匹配元素数 |
| `--html` | 提取 inner HTML |
| `--json` | JSON 格式输出 |
| `--tsv` | TSV 格式输出 |
| `--limit <n>` | 限制输出条目数（默认 50） |
| `--all` | 显示所有结果，不限制 |
| `--budget <n>` | 输出上限（~N tokens） |

#### `validate`（快照验证）

```
pnpm dev:cli validate <output-dir>
```

验证已下载的快照目录完整性：检查零字节文件、损坏文件、缺失资源引用。

#### `clean`（快照清理）

```
pnpm dev:cli clean <output-dir> [options]
```

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--dry-run` | `false` | 仅预览要删除的文件，不实际删除 |
| `--no-zero-byte` | (移除) | 跳过零字节文件移除 |
| `--no-corrupted` | (移除) | 跳过损坏文件移除 |
| `--re-download` | `false` | 重新下载被移除的资源（读取 snapshot.json 中的原始 URL） |

## 示例

### 基础快照

```bash
# 生成目录束（默认）
pnpm dev:cli -- https://example.com -o ./site

# 生成单文件
pnpm dev:cli -- https://example.com -o snapshot.html -m single

# 美化 HTML
pnpm dev:cli -- https://example.com --pretty
```

### 浏览器自动化快照

```bash
# 使用 Playwright 渲染 SPA 页面
pnpm dev:cli -- https://spa-site.com --adapter playwright

# 使用 Puppeteer
pnpm dev:cli -- https://spa-site.com --adapter puppeteer

# 混合模式：Playwright 渲染 HTML，HTTP 池下载资源
pnpm dev:cli -- https://spa-site.com --adapter playwright --hybrid
```

### 组件提取

```bash
# 提取组件，输出到 ./snapshot/components/
pnpm dev:cli -- https://example.com --extract-components

# 提取组件到 bundle 中
pnpm dev:cli -- https://example.com -o ./site -m bundle --extract-components

# 提取组件到单文件模式中
pnpm dev:cli -- https://example.com -o snapshot.html -m single --extract-components

# 指定框架和组件深度
pnpm dev:cli -- https://example.com --extract-components --framework vue --component-depth 5 -o ./output

# 禁用逻辑提取（仅提取模板和样式）
pnpm dev:cli -- https://example.com --extract-components --extract-logic false

# 按置信度过滤组件
pnpm dev:cli -- https://example.com --extract-components --component-filter "confidence >= 0.7 && type == 'stateful'"
```

### 代码生成

```bash
# 提取组件并生成 Vue 代码
pnpm dev:cli -- https://example.com --extract-components --codegen-framework vue

# 生成 React 代码（JS + CSS Modules）
pnpm dev:cli -- https://example.com --extract-components --codegen-framework react --codegen-css-modules

# 生成完整项目模板
pnpm dev:cli -- https://example.com --extract-components --codegen-framework vue --codegen-generate-drafts

# 提取共享逻辑
pnpm dev:cli -- https://example.com --extract-components --codegen-framework react --codegen-extract-shared
```

### 本地转换

```bash
# 对已有 bundle 输出运行组件提取 + Vue 代码生成
pnpm dev:cli -- --convert-local ./output --codegen-framework vue

# 指定不同的输出目录
pnpm dev:cli -- --convert-local ./output -o ./alt --codegen-framework react

# 对 single 模式输出运行
pnpm dev:cli -- --convert-local snapshot.html --codegen-framework vue

# 完整选项：本地转换 + 组件深度 + 生成项目模板
pnpm dev:cli -- --convert-local ./output \
  --codegen-framework vue \
  --component-depth 4 \
  --codegen-generate-drafts \
  --codegen-extract-shared
```

### 高级资源过滤

```bash
# 跳过指定类型资源
pnpm dev:cli -- https://example.com --skip-types .zip,.mp4,.pdf

# 使用预设
pnpm dev:cli -- https://example.com --resource-preset no-media

# 禁用所有过滤
pnpm dev:cli -- https://example.com --include-all

# 精细控制：包含视频和字体，排除图片
pnpm dev:cli -- https://example.com --include-video --include-fonts --exclude-images

# 递归扫描 JS 和 JSON 中的隐藏 URL
pnpm dev:cli -- https://example.com --scan-depth 3 --scan-json
```

### 诊断子命令

```bash
# 页面结构分析
pnpm dev:cli inspect https://example.com
pnpm dev:cli inspect https://example.com --outline
pnpm dev:cli inspect https://example.com --locate "Search"
pnpm dev:cli inspect https://example.com --count '.card'
pnpm dev:cli inspect https://example.com --md
pnpm dev:cli inspect https://example.com --md --budget 2000

# 结构化数据提取
pnpm dev:cli query https://example.com '.card' --row 'title=a, href=a@href' --json
pnpm dev:cli query https://example.com 'table' --table --where 'Stars >= 100'
pnpm dev:cli query https://example.com '.item' --count
pnpm dev:cli query https://example.com '.item' --html

# 快照验证
pnpm dev:cli validate ./output

# 快照清理
pnpm dev:cli clean ./output --dry-run
pnpm dev:cli clean ./output --re-download
```

### 完整示例

```bash
# 完整示例：生成 bundle + 资源过滤 + 组件提取 + React 代码生成
pnpm dev:cli -- https://example.com \
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

## 输出模式

### `single`

单一 HTML 文件，CSS/JS 内联，图片/Font 转为 base64 data URI。

```
snapshot.html              # 完整的自包含 HTML 文件
snapshot_components/       # （如果 --extract-components）
├── components/
│   ├── Header/
│   ├── Footer/
│   └── [其他组件]/
├── index.json
├── README.md
├── MIGRATION.md
└── REVIEW_REQUIRED.md     # 低置信度审查清单
```

### `bundle`

目录结构，资源分离存储。

```
output/
├── index.html           # 主页面（资源路径重写为相对路径）
├── assets/
│   ├── css/
│   ├── js/
│   ├── img/
│   ├── fonts/
│   └── data/
├── snapshot.json        # 资源清单与状态
├── manifest.json        # 资源校验信息
└── components/          # （如果 --extract-components）
    ├── components/
    │   ├── Header/
    │   ├── Footer/
    │   └── [其他组件]/
    ├── index.json
    ├── README.md
    ├── MIGRATION.md
    └── REVIEW_REQUIRED.md     # 低置信度审查清单
```

### 组件提取 (`--extract-components`)

与 `single` 或 `bundle` 配合使用，生成组件结构分析：

```
output/components/                     # 提取的组件（或 {output}_components/）
├── index.json                         # 全局索引
├── README.md                          # 项目说明
├── MIGRATION.md                       # 迁移指南
├── REVIEW_REQUIRED.md                 # 低置信度审查清单（如有）
└── components/
    ├── Header/
    │   ├── template.html              # 组件 HTML
    │   ├── style.css                  # 组件样式
    │   ├── logic.original.json        # 原始 JS 逻辑 (可选)
    │   └── manifest.json              # 组件元数据
    ├── Footer/
    └── [其他组件]/
```

**manifest.json 结构**:

```json
{
  "name": "Header",
  "type": "presentational",
  "path": "components/Header",
  "children": [],
  "state": {
    "isOpen": {
      "type": "boolean",
      "initial": false,
      "bindings": [],
      "confidence": 0.85
    }
  },
  "events": {
    "handleClick": {
      "event": "click",
      "handler": "handleClick",
      "selector": ".menu-button"
    }
  },
  "migration": {
    "priority": "high",
    "effort": "2h",
    "suggestions": [
      "Extract state to reactive refs",
      "Map event handlers to component methods"
    ],
    "todos": []
  }
}
```

**组件类型**:
- `stateful`: 有状态和事件的组件（高优先级）
- `presentational`: 只有样式或部分逻辑的组件（中优先级）
- `unknown`: 无法确定类型的组件（低优先级）

### 代码生成 (`--codegen-framework`)

代码生成输出会附加到 `components/` 目录下：

```
output/components/
├── __generated__/              # 生成的框架组件（--codegen-framework）
│   ├── Header.vue              # 示例：Vue 单文件组件
│   ├── Footer.jsx              # 示例：React JSX
│   └── ...
├── __drafts__/                 # 完整项目模板（--codegen-generate-drafts）
│   ├── package.json
│   ├── src/
│   │   ├── App.vue
│   │   ├── main.ts
│   │   └── components/
│   └── ...
└── shared/                     # 共享逻辑（--codegen-extract-shared）
    ├── utils.ts
    └── types.ts
```

支持框架：**Vue** | **React** | **Angular** | **Svelte** | **jQuery**

## 配置层级

web-clone 支持从多个层级合并配置（优先级从低到高）：

| 优先级 | 位置 | 说明 |
|--------|------|------|
| 0 | 内置默认值 | `packages/core/src/config/defaults.ts` |
| 1 | `~/.config/web-clone/config.json` | 全局用户配置（适用于所有项目） |
| 2 | `./web-clone.config.json` | 项目级配置（最近祖先目录） |
| 2 | `.web-clonerc` / `.web-clonerc.json` | 替代配置文件（JSON 格式） |
| 3 | CLI 参数 | 最高优先级，覆盖所有配置 |

详见 [examples/config-examples/config-README.md](../examples/config-examples/config-README.md)。

## Vue/Nuxt Hydration 注入

当使用 HTTP 模式快照 Vue/Nuxt SSG 站点时，CLI 会自动检测并在输出 HTML 中注入 hydration 脚本：

- 检测 `#__nuxt` 或 `#app` 挂载点
- 自动尝试触发 Vue 客户端水合
- 支持 Nuxt 2.x / 3.x 和裸 Vue
- 仅在 HTTP 模式下注入（浏览器模式已有完整渲染）
- 对非 Vue 站点无影响

## 常见组合场景

### 场景 1：完整项目备份 + 组件分析 + 代码生成

```bash
pnpm dev:cli -- https://app.example.com \
  -o ./backup \
  -m bundle \
  --extract-components \
  --framework vue \
  --codegen-framework vue \
  --codegen-extract-shared
```

**输出**：
- `./backup/index.html` — 完整可访问的快照
- `./backup/assets/` — 分离的资源文件
- `./backup/components/` — 组件结构 + 生成的 Vue 代码

### 场景 2：轻量级快照 + 组件结构

```bash
pnpm dev:cli -- https://example.com \
  -o snapshot.html \
  -m single \
  --extract-components
```

**输出**：
- `snapshot.html` — 单文件快照
- `snapshot_components/` — 组件结构（可单独传送和审查）

### 场景 3：SPA 应用快照

```bash
# 使用 Playwright 渲染 SPA 页面
pnpm dev:cli -- https://spa-app.com --adapter playwright

# 使用 Puppeteer
pnpm dev:cli -- https://spa-app.com --adapter puppeteer
```

### 场景 4：仅提取组件（不重新拉取）

```bash
# 对已有 bundle 输出运行组件提取
pnpm dev:cli -- --convert-local ./snapshot --codegen-framework vue

# 对已有 single 输出运行组件提取
pnpm dev:cli -- --convert-local snapshot.html --codegen-framework react
```
