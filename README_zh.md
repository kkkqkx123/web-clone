# web-clone

**单次执行的网页快照工具** — 下载并打包完整网页快照，支持可选的组件结构提取。

[English Documentation](./README.md)

## 功能特性

- **完整快照**：下载整个网页（HTML、CSS、JS、图片、字体、媒体资源）
- **灵活输出**：单一自包含 HTML 文件或分离资源的目录结构
- **组件提取**：分析并提取组件结构，包含状态/事件分析（可选）
- **框架代码生成**：从提取的组件生成 Vue/React/Angular/Svelte/jQuery 代码（可选）
- **智能过滤**：默认跳过与网页渲染无关的资源（压缩包、安装包、文档、媒体等）
- **大小限制**：单文件硬上限，防止带宽浪费

## 快速开始

```bash
# 安装依赖
npm install

# 直接运行（无需编译）
npm run dev -- https://example.com -o ./snapshot

# 或先编译再运行
npm run build
node dist/cli.js https://example.com -o ./snapshot
```

## CLI 使用

```bash
npm run dev -- <url> [options]
npx tsx src/cli.ts <url> [options]
node dist/cli.js <url> [options]  # 编译后
```

### 基础选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `-o, --output <path>` | `./snapshot` | 输出路径 |
| `-m, --mode <type>` | `bundle` | 输出格式：`single`（单 HTML 文件）或 `bundle`（目录） |
| `--extract-components` | — | 提取组件结构（可与任何模式组合） |

### 下载选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--max-assets <n>` | `100` | 最大下载资源数 |
| `--concurrency <n>` | `6` | 并发下载数 |
| `--timeout <ms>` | `15000` | 单资源超时（毫秒） |
| `--retry-count <n>` | `1` | 失败重试次数 |
| `--skip-types <exts>` | 见下方说明 | 跳过指定扩展名，逗号分隔；`""` 禁用过滤 |
| `--max-file-size <size>` | `50MB` | 单文件大小硬上限；`0` 禁用限制 |
| `--no-inline` | — | 禁用 data URI 内联（仅 single 模式） |
| `--pretty` | — | 美化输出 HTML |

### 默认跳过的扩展名

默认情况下，以下扩展名会被跳过，避免浪费带宽下载与网页渲染无关的资源：

- **压缩包**：`.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.bz2`
- **安装包**：`.exe`, `.msi`, `.dmg`, `.apk`, `.deb`, `.rpm`
- **文档**：`.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`
- **视频**：`.ts`, `.m3u8`, `.m4v`, `.mkv`, `.avi`, `.mov`, `.flv`, `.mp4`, `.webm`
- **音频**：`.mp3`, `.aac`, `.flac`, `.ogg`, `.wma`, `.wav`
- **其它**：`.iso`, `.torrent`, `.wasm`, `.bin`

### 组件提取选项

| 选项 | 说明 |
|------|------|
| `--component-depth <n>` | 限制组件识别深度（默认：无限制） |
| `--framework <hint>` | 框架提示：`vue`, `react`, 或 `svelte` |
| `--extract-logic` | 是否提取 JS 逻辑（默认：`true`） |

### 框架代码生成选项

| 选项 | 说明 |
|------|------|
| `--codegen-framework <type>` | 生成框架代码：`vue`, `react`, `angular`, `svelte`, `jquery` |
| `--codegen-typescript` | 使用 TypeScript（默认：`true`） |
| `--codegen-css-modules` | React 使用 CSS Modules（默认：`false`） |
| `--codegen-generate-drafts` | 生成完整项目模板到 `__drafts__/` |
| `--codegen-extract-shared` | 提取共享逻辑到 `shared/` 目录 |

## 示例

### 基础快照

```bash
# Bundle 模式（默认）- 创建目录结构
npm run dev -- https://example.com -o ./site

# Single 模式 - 创建自包含 HTML 文件
npm run dev -- https://example.com -o snapshot.html -m single
```

### 快照 + 组件提取

```bash
# 提取组件到 bundle 中
npm run dev -- https://example.com -o ./project -m bundle --extract-components

# 提取组件到 single 模式快照
npm run dev -- https://example.com -o snapshot.html -m single --extract-components

# 指定框架和深度限制
npm run dev -- https://example.com --extract-components --framework vue --component-depth 5
```

### 高级用法

```bash
# 自定义跳过列表
npm run dev -- https://example.com --skip-types .zip,.mp4,.pdf

# 禁用类型过滤（下载所有类型）
npm run dev -- https://example.com --skip-types ""

# 限制单文件大小
npm run dev -- https://example.com --max-file-size 10MB

# 禁用大小限制
npm run dev -- https://example.com --max-file-size 0

# 完整示例：bundle + 组件 + React 代码生成
npm run dev -- https://example.com \
  -o ./project \
  -m bundle \
  --extract-components \
  --codegen-framework react \
  --codegen-typescript \
  --skip-types .zip,.exe \
  --max-file-size 20MB \
  --concurrency 8 \
  --pretty
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

快照流水线包含以下阶段：

1. **Fetch HTML** — 下载页面，带超时和 User-Agent
2. **Parse HTML** — 提取资源引用（CSS、JS、图片、字体、媒体）
3. **Recursive CSS Extraction** — 下载外部 CSS，提取嵌套的 `@import` 和 `url()` 引用
4. **Deduplicate** — 去重 URL
5. **Filter & Download** — 应用扩展名/大小过滤，并发下载剩余资源
6. **Assemble Output** — Bundle 模式写入文件；Single 模式内联所有内容

可选的组件提取流水线：
- 分析 HTML/CSS/JS 识别组件边界
- 关联组件与样式、逻辑
- 生成带置信度分数的组件规范
- 输出特定框架的代码（可选）

## 开发

```bash
# 安装依赖
npm install

# 编译 TypeScript
npm run build

# 无需编译直接运行
npm run dev -- <url>

# 运行测试
npm run test:run
```

## 许可证

MIT
