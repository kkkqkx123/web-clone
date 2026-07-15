# 调试脚本使用指南

三个调试脚本，覆盖从页面分析到快照验证的完整链路。

## 快速导航

| 脚本 | 用途 | 适用场景 |
|------|------|---------|
| [`analyze-page.mjs`](#1-analyze-pagemjs--静态html分析) | 静态 HTML 结构分析 | 快速了解页面类型、外部资源、内联内容 |
| [`analyze-rendered.mjs`](#2-analyze-renderedmjs--playwright渲染分析) | Playwright 渲染分析 | SPA 页面调试、网络请求捕获、动态内容验证 |
| [`compare-snapshot.mjs`](#3-compare-snapshotmjs--快照完整性检查) | 快照输出完整性检查 | 验证快照是否丢失内容 |

---

## 1. `analyze-page.mjs` — 静态 HTML 分析

分析目标页面的原始 HTML（不执行 JS），识别页面类型和资源结构。

### 用法

```bash
# 有代理（如 GitHub Pages 被墙）
HTTPS_PROXY=http://127.0.0.1:7890 node scripts/analyze-page.mjs https://example.com

# 无代理
node scripts/analyze-page.mjs https://example.com
```

### 输出内容

```
  External assets: 3 (2 scripts, 1 CSS, 0 images)
  Inline JS:       1 blocks (62 KB)
  Inline CSS:      1 blocks (14 KB)
  Page type:       📄 Single-file (self-contained, no external assets)
  Browser needed:  ❌ No (HTTP mode is sufficient)
```

或：

```
  External assets: 12 (4 scripts, 3 CSS, 5 images)
  Inline JS:       0 blocks (0 KB)
  Inline CSS:      0 blocks (0 KB)
  Page type:       📄 Static HTML
  Browser needed:  ❌ No (HTTP mode is sufficient)
```

或：

```
  External assets: 1 (0 scripts, 0 CSS, 0 images)
  Inline JS:       1 blocks (63344 bytes)
  Inline CSS:      1 blocks (14728 bytes)
  Dynamic:        createElement, innerHTML, fetch()
  Page type:       ⚡ SPA (dynamic content via JS)
  Browser needed:  ✅ Yes (use --adapter playwright)
```

### 判断依据

| 页面类型 | 特征 | 推荐模式 |
|---------|------|---------|
| **单文件** | 0 外部资源，有内联 JS/CSS | HTTP 模式即可 |
| **静态 HTML** | 有外部资源，无内联动态 JS | HTTP 模式即可 |
| **SPA** | 内联脚本含 `createElement`/`innerHTML`/`fetch()` | 使用 `--adapter playwright` |

---

## 2. `analyze-rendered.mjs` — Playwright 渲染分析

使用 Playwright 渲染页面（执行 JavaScript），捕获所有网络请求和最终 DOM。

### 前置条件

Playwright 环境需已配置，验证方式：

```bash
pnpm browsers:check:playwright
```

输出应显示 `✅ Browser launched successfully`。

### 用法

```bash
# 有代理
HTTPS_PROXY=http://127.0.0.1:7890 node scripts/analyze-rendered.mjs https://example.com

# 无代理
node scripts/analyze-rendered.mjs https://example.com --no-proxy
```

### 输出内容

```
🌐 Network requests:
  Total: 1, Unique: 1
  [document] 1:
    200 https://example.com/

📄 Rendered HTML: 87.0 KB
  Saved to: scripts/debug-rendered.html

📦 DOM resource references: 0

📊 Summary:
  Request count:    1 total, 1 unique
  Failed requests:  0
  Rendered HTML:    87.0 KB
  DOM resources:    0 external references
```

### 适用场景

- **SPA 页面**：验证 JS 执行后是否加载了额外资源
- **代理调试**：确认浏览器能否通过代理访问目标页面
- **动态内容**：对比静态 HTML 和渲染后的 DOM 差异

---

## 3. `compare-snapshot.mjs` — 快照完整性检查

比较原始页面与快照输出，检查元素数量、脚本内容、样式等是否一致。

### 用法

```bash
# 先获取原始页面做 baseline
HTTPS_PROXY=http://127.0.0.1:7890 node scripts/analyze-page.mjs https://example.com
# 这会生成 scripts/debug-page.html

# 运行快照
HTTPS_PROXY=http://127.0.0.1:7890 pnpm dev:cli https://example.com

# 对比
node scripts/compare-snapshot.mjs scripts/debug-page.html apps/cli/snapshot/index.html

# 对比 Playwright 渲染后的快照
node scripts/compare-snapshot.mjs scripts/debug-rendered.html apps/cli/snapshot/index.html
```

### 输出内容

```
📏 Size:
  Original: 80.3 KB (82230 bytes)
  Snapshot: 80.4 KB (82377 bytes)
  Delta:    +0.1 KB

🔢 Element counts:
  ✅ All element counts match

🔍 Content checks:
  ✅ SVG elements: 1 (match)
  ✅ Inline scripts: 1 (match)
  ✅ Inline styles: 1 (match)
  ✅ i18n attributes: 23 (match)
  ✅ SVG marker references: 5 (match)
  ✅ JS innerHTML calls: 15 (match)
  ✅ JS createElement calls: 5 (match)

📜 Script content:
  Original: 61.9 KB
  Snapshot: 61.9 KB
  ✅ No HTML entity encoding (clean serialization)

🎨 Style content:
  ✅ Styles identical: true

════════════════════════════════════════════════════════
  ✅ Snapshot integrity check PASSED
════════════════════════════════════════════════════════
```

### 检查项说明

| 检查项 | 意义 |
|--------|------|
| **元素数量** | 所有 HTML 标签计数是否一致 |
| **SVG 元素** | SVG 是否被正确保留（`XMLSerializer` 会丢失 SVG） |
| **脚本实体编码** | 脚本中 `&` 是否被错误编码为 `&amp;` |
| **样式一致性** | 内联样式内容是否完全一致 |
| **JS 结构** | 关键 JS 语法（`function`、`const` 等）是否完整 |

---

## 推荐调试流程

```
1. 分析页面结构
   → node scripts/analyze-page.mjs <url>

2. 判断是否需要 Playwright
   → 如果 "Browser needed: ✅ Yes"，用 analyze-rendered 进一步分析

3. 运行快照
   → pnpm dev:cli <url> [--adapter playwright]

4. 验证快照完整性
   → node scripts/compare-snapshot.mjs scripts/debug-page.html apps/cli/snapshot/index.html
```

## 常见问题

### 代理问题

```
analyze-page.mjs: Timeout
analyze-rendered.mjs: net::ERR_CONNECTION_RESET
```

原因：目标网站被墙，需要代理。设置 `HTTPS_PROXY` 环境变量后重试。

### Playwright 找不到浏览器

```
analyze-rendered.mjs: browserType.launch: Executable doesn't exist
```

原因：`PLAYWRIGHT_BROWSERS_PATH` 未设置或路径不正确。运行 `pnpm browsers:check:playwright` 诊断。

### 快照检查失败

```
❌ SVG elements: original=1 snapshot=0
❌ HTML entity encoding detected: &amp;=479
```

原因：`serializeDocument` 使用了 `XMLSerializer`（XML 序列化器）而非 `outerHTML`（HTML 序列化器）。
检查 `packages/core/src/output/bundle.ts` 和 `single-file.ts` 中的 `serializeDocument` 函数。