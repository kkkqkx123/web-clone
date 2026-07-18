# 配置文件指南

## 概述

web-clone 支持通过 JSON 配置文件管理所有运行参数，避免在 CLI 中输入冗长的命令。配置文件采用分层合并策略，优先级从低到高依次为：

| 优先级 | 来源 | 说明 |
|--------|------|------|
| 0 (基础) | 代码内置默认值 | `packages/core/src/config/defaults.ts` |
| 1 | `~/.config/web-clone/config.json` | 全局用户配置（适用于所有项目） |
| 2 | `./web-clone.config.json` / `.web-clonerc` / `.web-clonerc.json` | 自动发现的项目配置（向上查找目录树） |
| 3 | `--config <path>` 显式指定 | 显式配置文件（替代自动发现） |
| 4 (最高) | CLI 参数 | 命令行直接传入的参数 |

> **注意**：`--config` 显式指定配置文件时，会**替代**自动发现的项目配置，但全局配置（`~/.config/web-clone/config.json`）仍然生效。

---

## 快速开始

### 1. 全局配置（适用于所有项目）

```bash
# 创建全局配置文件
mkdir -p ~/.config/web-clone
```

创建 `~/.config/web-clone/config.json`：

```json
{
  "defaults": {
    "concurrency": 8,
    "maxAssets": 200,
    "timeout": 30000
  }
}
```

### 2. 项目配置（自动发现）

在项目根目录创建 `web-clone.config.json`：

```json
{
  "resourcePreset": "no-media",
  "include": { "fonts": true },
  "defaults": { "output": "./snapshots", "mode": "bundle" }
}
```

### 3. 显式指定配置文件

```bash
# 使用 --config 指定配置文件
pnpm dev:cli -- https://example.com --config ./my-config.json

# 短选项
pnpm dev:cli -- https://example.com -c ./my-config.json
```

### 4. 运行快照

```bash
# 自动发现并使用项目配置 + CLI 覆盖
pnpm dev:cli -- https://example.com --output ./custom-out
```

---

## 配置文件格式

### 完整结构

```json
{
  "$schema": "https://example.com/schemas/web-clone-config.json",

  "//": "── 资源过滤 ──────────────────────────────────────",
  "resourcePreset": "default",
  "skipExtensions": [],
  "includeExtensions": [".wasm"],
  "excludeExtensions": [],
  "include": {
    "wasm": true,
    "bin": false,
    "video": false,
    "audio": false,
    "fonts": true,
    "documents": false,
    "archives": false
  },

  "//": "── 浏览器适配器配置 ──────────────────────────────",
  "browser": {
    "adapter": "playwright",
    "headless": true,
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "viewport": "1920x1080",
    "locale": "zh-CN",
    "waitForLoadState": "networkidle",
    "launchArgs": ["--disable-gpu"],
    "hybrid": false
  },

  "//": "── 组件提取 ──────────────────────────────────────",
  "extraction": {
    "enabled": true,
    "depth": 3,
    "framework": "react",
    "extractLogic": true,
    "memoryLimit": 1536
  },

  "//": "── 代码生成 ──────────────────────────────────────",
  "codegen": {
    "framework": "react",
    "typescript": true,
    "cssModules": true,
    "generateDrafts": false,
    "extractShared": true
  },

  "//": "── 服务器模式 ────────────────────────────────────",
  "server": {
    "enabled": false,
    "port": 8080,
    "proxy": true
  },

  "//": "── 全局默认值（可被 CLI 参数覆盖） ────────────────",
  "defaults": {
    "mode": "bundle",
    "maxAssets": 200,
    "concurrency": 8,
    "timeout": 30000,
    "retryCount": 3,
    "scanDepth": 2,
    "scanJs": true,
    "resourcePreset": "no-media",
    "includeFonts": true
  }
}
```

---

## 配置项详解

### 资源过滤

| 字段 | 类型 | 说明 |
|------|------|------|
| `resourcePreset` | `string` | 预设：`none` / `minimal` / `default` / `no-media` / `aggressive` |
| `skipExtensions` | `string[]` | 显式跳过列表（绕过 preset，最高优先级） |
| `includeExtensions` | `string[]` | 强制包含的扩展名 |
| `excludeExtensions` | `string[]` | 强制排除的扩展名 |
| `include.wasm` | `boolean` | 包含 `.wasm` 文件 |
| `include.bin` | `boolean` | 包含 `.bin` 文件 |
| `include.video` | `boolean` | 包含视频文件 |
| `include.audio` | `boolean` | 包含音频文件 |
| `include.fonts` | `boolean` | 包含字体文件 |
| `include.documents` | `boolean` | 包含文档文件 |
| `include.archives` | `boolean` | 包含压缩包文件 |

**预设参考**：

| 预设 | 跳过的扩展名 | 适用场景 |
|------|-------------|---------|
| `none` | (无) | 完整站点镜像 |
| `minimal` | 压缩包 | 快速快照 |
| `default` | 压缩包 + 安装包 + 文档 | 大多数站点（推荐） |
| `no-media` | default + 音视频 | 纯文本内容，最快 |
| `aggressive` | 仅保留关键 web 资源 | 最小化快照 |

### 浏览器适配器配置（`browser`）

| 字段 | 类型 | 对应 CLI 参数 | 说明 |
|------|------|---------------|------|
| `adapter` | `string` | `--adapter` | 适配器类型：`playwright` / `puppeteer` |
| `headless` | `boolean` | `--headed` / `--no-headed` | 是否无头模式 |
| `userAgent` | `string` | `--user-agent` | 自定义 User-Agent（避免反爬检测） |
| `viewport` | `string` | `--viewport` | 视口大小，格式 `"WIDTHxHEIGHT"` |
| `locale` | `string` | `--locale` | 浏览器语言，如 `"zh-CN"` |
| `waitForLoadState` | `string` | — | 页面加载等待策略：`load` / `domcontentloaded` / `networkidle` |
| `launchArgs` | `string[]` | `--launch-args` | 额外 Chromium 启动参数 |
| `hybrid` | `boolean` | `--hybrid` | 混合模式：浏览器渲染 HTML，HTTP 池下载资源 |

**推荐的反爬虫配置**（针对字节跳动等反爬站点）：

```json
{
  "browser": {
    "adapter": "playwright",
    "headless": true,
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "viewport": "1920x1080",
    "locale": "zh-CN",
    "waitForLoadState": "domcontentloaded"
  },
  "defaults": {
    "timeout": 60000
  }
}
```

### 组件提取（`extraction`）

| 字段 | 类型 | 对应 CLI 参数 | 说明 |
|------|------|---------------|------|
| `enabled` | `boolean` | `--extract-components` | 启用组件提取 |
| `depth` | `number` | `--component-depth` | 组件识别深度 |
| `framework` | `string` | `--framework` | 框架提示：`vue` / `react` / `svelte` |
| `filter` | `string` | `--component-filter` | 组件过滤表达式 |
| `extractLogic` | `boolean` | `--extract-logic` | 提取 JavaScript 逻辑 |
| `memoryLimit` | `number` | `--memory-limit` | 内存预算（MB） |

### 代码生成（`codegen`）

| 字段 | 类型 | 对应 CLI 参数 | 说明 |
|------|------|---------------|------|
| `framework` | `string` | `--codegen-framework` | 目标框架：`vue` / `react` / `angular` / `svelte` / `jquery` |
| `typescript` | `boolean` | `--codegen-typescript` | 使用 TypeScript |
| `cssModules` | `boolean` | `--codegen-css-modules` | 使用 CSS Modules（React） |
| `generateDrafts` | `boolean` | `--codegen-generate-drafts` | 生成完整项目模板 |
| `extractShared` | `boolean` | `--codegen-extract-shared` | 提取共享逻辑 |

### 服务器模式（`server`）

| 字段 | 类型 | 对应 CLI 参数 | 说明 |
|------|------|---------------|------|
| `enabled` | `boolean` | `--serve` | 生成服务器文件 |
| `port` | `number` | `--serve-port` | HTTP 服务器端口 |
| `proxy` | `boolean` | `--proxy` | 启用反向代理 |

### 全局默认值（`defaults`）

`defaults` 字段支持所有 `SnapshotOptions` 中的选项，以及部分额外选项：

| 额外字段 | 类型 | 对应 CLI 参数 | 说明 |
|----------|------|---------------|------|
| `adapter` | `string` | `--adapter` | 浏览器适配器类型 |
| `headless` | `boolean` | `--headed` | 无头模式 |
| `userAgent` | `string` | `--user-agent` | User-Agent |
| `viewport` | `string` | `--viewport` | 视口大小 |
| `locale` | `string` | `--locale` | 语言设置 |
| `launchArgs` | `string[]` | `--launch-args` | 启动参数 |
| `hybrid` | `boolean` | `--hybrid` | 混合模式 |
| `serve` | `boolean` | `--serve` | 生成服务器文件 |
| `servePort` | `number` | `--serve-port` | 服务器端口 |
| `run` | `boolean` | `--run` | 启动服务器 |
| `proxy` | `boolean` | `--proxy` | 反向代理 |
| `convertLocal` | `string` | `--convert-local` | 本地转换路径 |

---

## 配置合并示例

### 分层合并

```bash
# 全局配置 (~/.config/web-clone/config.json) 设置：
#   { "resourcePreset": "minimal", "defaults": { "concurrency": 4 } }

# 项目配置 (web-clone.config.json) 设置：
#   { "include": { "wasm": true }, "defaults": { "concurrency": 8, "maxAssets": 200 } }

# CLI 调用：
pnpm dev:cli -- https://example.com --include-video -o ./out

# 实际生效的配置：
#   resourcePreset: "minimal"（来自全局）
#   concurrency: 8（CLI 未设置，项目配置覆盖全局）
#   maxAssets: 200（来自项目配置）
#   includeExtensions: [".wasm", ".mp4", ...]（wasm 来自项目 + video 来自 CLI）
#   output: "./out"（CLI 覆盖）
```

### 显式配置文件覆盖

```bash
# 使用 --config 显式指定配置文件
# 此时自动发现的项目配置被跳过，但全局配置仍然生效

pnpm dev:cli -- https://example.com -c ./special-config.json
```

---

## 使用场景示例

### 场景 1：反爬虫优化配置

```json
{
  "browser": {
    "adapter": "playwright",
    "headless": true,
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "viewport": "1920x1080",
    "locale": "zh-CN",
    "waitForLoadState": "domcontentloaded"
  },
  "defaults": {
    "timeout": 60000
  }
}
```

### 场景 2：调试配置

```json
{
  "browser": {
    "adapter": "playwright",
    "headless": false,
    "viewport": "1920x1080",
    "locale": "zh-CN",
    "waitForLoadState": "domcontentloaded"
  },
  "defaults": {
    "timeout": 90000
  }
}
```

### 场景 3：批量处理配置

```json
{
  "browser": {
    "adapter": "playwright",
    "headless": true,
    "viewport": "1920x1080"
  },
  "defaults": {
    "mode": "bundle",
    "maxAssets": 200,
    "concurrency": 8,
    "timeout": 30000,
    "retryCount": 3,
    "resourcePreset": "no-media",
    "includeFonts": true
  },
  "extraction": {
    "enabled": true,
    "framework": "react"
  }
}
```

### 场景 4：组件提取 + 代码生成

```json
{
  "extraction": {
    "enabled": true,
    "depth": 3,
    "framework": "react",
    "extractLogic": true
  },
  "codegen": {
    "framework": "react",
    "typescript": true,
    "cssModules": true
  }
}
```

---

## 项目根目录示例文件

项目根目录下有一个完整的示例配置文件 `web-clone.config.example.json`，包含所有配置项及注释，可作为参考模板。

---

## 相关文档

- [CLI 使用说明](./commands.md) — 所有 CLI 参数和子命令
- [CLI 使用参考 (英文)](../skills/web-clone/references/cli-usage.md) — CLI 详细参考
- [配置示例](../skills/web-clone/assets/config-examples/config-README.md) — 更多配置示例文件