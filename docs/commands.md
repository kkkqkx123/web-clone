# 命令参考

> **PowerShell 用户注意**：`--` 需要加引号，见下方说明。
> **代理用户注意**：工具自动读取 `HTTPS_PROXY`/`HTTP_PROXY` 环境变量，见 [proxy.md](./proxy.md)。

## 入口命令

```bash
npm run dev -- <url> [options]
npm run snapshot -- <url> [options]
npx tsx src/cli.ts <url> [options]
```

编译后也可通过 bin 执行（需先 `npm run build`）：

```bash
node dist/cli.js <url> [options]
```

## 脚本

| 命令 | 作用 |
|------|------|
| `npm run build` | TypeScript 编译到 `dist/` |
| `npm run dev -- <url>` | 直接通过 tsx 运行快照 |
| `npm run snapshot -- <url>` | 同上，别名 |

## PowerShell 兼容性

在 **PowerShell** 中，`--` 是 stop-parsing 符号，会被 PowerShell 自身截获而不会传递给 npm。需加上引号：

```powershell
# ✅ 正确
npm run dev '--' "https://example.com" -o ./snapshot

# ❌ 错误，-- 会被 PowerShell 吃掉
npm run dev -- https://example.com -o ./snapshot
```

**推荐方案**：绕过 npm，直接使用 `npx tsx` 运行（不受 PowerShell 参数解析影响）：

```powershell
npx tsx src/cli.ts "https://example.com" -o ./snapshot
```

## CLI 选项

### 基础选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `<url>` | (必填) | 目标页面 URL，`--convert-local` 时可选 |
| `-o, --output <path>` | `./snapshot` | 输出路径。`--convert-local` 且未指定此选项时，默认使用本地路径 |
| `-m, --mode <type>` | `bundle` | 输出格式：`single`（单HTML文件）或 `bundle`（目录结构） |
| `--convert-local <path>` | - | 对已有本地 bundle/single 输出运行组件提取和代码生成，跳过 URL 拉取

### 下载和资源选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--max-assets <number>` | `100` | 最大下载资源数 |
| `--concurrency <number>` | `6` | 并发下载数 |
| `--timeout <ms>` | `15000` | 单资源超时（毫秒） |
| `--retry-count <number>` | `1` | 失败重试次数 |
| `--no-inline` | (内联) | 禁用 data URI 内联（仅 single 模式） |
| `--pretty` | (压缩) | 美化输出 HTML |
| `--skip-types <extensions>` | 见下方说明 | 跳过指定扩展名的资源下载，逗号分隔，如 `.zip,.mp4,.ts`；空字符串禁用过滤 |
| `--max-file-size <size>` | `50MB` | 单文件大小硬上限，支持 `50MB`、`10m`、`10485760` 等格式；`0` 为不限制 |

**默认跳过的扩展名**：
- 压缩包：`.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.bz2`
- 安装包：`.exe`, `.msi`, `.dmg`, `.apk`, `.deb`, `.rpm`
- 文档：`.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`
- 视频：`.ts`, `.m3u8`, `.m4v`, `.mkv`, `.avi`, `.mov`, `.flv`, `.mp4`, `.webm`
- 音频：`.mp3`, `.aac`, `.flac`, `.ogg`, `.wma`, `.wav`
- 其它：`.iso`, `.torrent`, `.wasm`, `.bin`

### 组件提取选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--extract-components` | (不提取) | 提取组件结构（与任何输出模式组合） |
| `--component-depth <n>` | (无限制) | 限制组件识别深度；不指定时识别所有深度的组件（仅与 --extract-components 配合） |
| `--framework <hint>` | - | 框架提示：`vue`、`react` 或 `svelte`（仅与 --extract-components 配合） |
| `--extract-logic` | `true` | 是否提取 JS 逻辑（仅与 --extract-components 配合） |
| `-h, --help` | - | 显示帮助 |

## 示例

### 基础快照

```bash
# 生成目录束（默认）
npm run dev -- https://example.com -o ./site

# 生成单文件
npm run dev -- https://example.com -o snapshot.html -m single

# 美化 HTML
npm run dev -- https://example.com --pretty
```

### 组件提取

```bash
# 提取组件，输出到 ./snapshot/components/
npm run dev -- https://example.com --extract-components

# 提取组件到 bundle 中（生成 ./site/index.html + ./site/components/）
npm run dev -- https://example.com -o ./site -m bundle --extract-components

# 提取组件到单文件模式中（生成 snapshot.html + snapshot_components/）
npm run dev -- https://example.com -o snapshot.html -m single --extract-components

# 指定框架和组件深度
npm run dev -- https://example.com --extract-components --framework vue --component-depth 5 -o ./output

# 禁用逻辑提取（仅提取模板和样式）
npm run dev -- https://example.com --extract-components --extract-logic false
```

### 本地转换（无需重新拉取）

```bash
# 对已有 bundle 输出运行组件提取 + Vue 代码生成
npm run dev -- --convert-local ./output --codegen-framework vue

# 指定不同的输出目录
npm run dev -- --convert-local ./output -o ./alt --codegen-framework react

# 对 single 模式输出运行
npm run dev -- --convert-local snapshot.html --codegen-framework vue

# 完整选项：本地转换 + 组件深度 + 生成项目模板
npm run dev -- --convert-local ./output \
  --codegen-framework vue \
  --component-depth 4 \
  --codegen-generate-drafts \
  --codegen-extract-shared
```

### 高级选项

```bash
# 控制并发与资源数
npm run dev -- https://example.com --concurrency 4 --max-assets 50

# 禁用内联 + 美化 + 提取组件
npm run dev -- https://example.com --no-inline --pretty --extract-components

# 跳过指定类型资源（使用自定义列表）
npm run dev -- https://example.com --skip-types .zip,.mp4,.pdf

# 禁用资源类型过滤（下载所有类型）
npm run dev -- https://example.com --skip-types ""

# 限制单文件最大大小
npm run dev -- https://example.com --max-file-size 10MB

# 禁用文件大小限制
npm run dev -- https://example.com --max-file-size 0

# 完整示例：生成 bundle 并提取组件
npm run dev -- https://example.com \
  -o ./project \
  -m bundle \
  --extract-components \
  --framework react \
  --component-depth 4 \
  --max-assets 200 \
  --concurrency 8 \
  --pretty \
  --skip-types .zip,.exe \
  --max-file-size 20MB
```

## 输出模式

### `single`

单一 HTML 文件，CSS/JS 内联，图片/Font 转为 base64 data URI。

```
snapshot.html              # 完整的自包含 HTML 文件
snapshot_components/       # （如果 --extract-components）
├── components/
├── index.json
├── README.md
└── MIGRATION.md
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
    ├── Header/
    ├── Footer/
    ├── index.json
    ├── README.md
    └── MIGRATION.md
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

## 常见组合场景

### 场景 1：完整项目备份 + 组件分析

```bash
npm run dev -- https://app.example.com \
  -o ./backup \
  -m bundle \
  --extract-components \
  --framework vue
```

**输出**：
- `./backup/index.html` - 完整可访问的快照
- `./backup/assets/` - 分离的资源文件
- `./backup/components/` - Vue 兼容的组件结构

### 场景 2：轻量级快照 + 组件结构

```bash
npm run dev -- https://example.com \
  -o snapshot.html \
  -m single \
  --extract-components \
  --no-inline
```

**输出**：
- `snapshot.html` - 单文件快照
- `snapshot_components/` - 组件结构（可单独传送和审查）

### 场景 3：仅提取组件（不生成快照）

> 支持。使用 `--convert-local` 对已有快照运行组件提取和代码生成，无需重新拉取页面。

```bash
# 对已有 bundle 输出运行组件提取 + Vue 代码生成
npm run dev -- --convert-local ./snapshot --codegen-framework vue

# 对已有 bundle 输出运行组件提取，指定输出到其他路径
npm run dev -- --convert-local ./snapshot -o ./alt --codegen-framework react

# 对已有 single 输出运行组件提取
npm run dev -- --convert-local snapshot.html --codegen-framework vue
```

