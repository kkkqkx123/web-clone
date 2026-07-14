# URL 处理分析报告

> 分析日期：2026-07-14
> 分析范围：`@web-clone/core` 包，涵盖 URL 发现、下载、改写全流程

---

## 一、概述

`web-clone` 是一个将网页快照为单文件或目录的工具。URL 处理贯穿整个管道：

```
发现（扫描 HTML/CSS/JS） → 解析（resolveUrl） → 过滤（resource-filter）
→ 下载（downloadAllAssets） → 改写（assembleSingleFile / assembleBundle）
```

当前设计架构清晰，层面分离合理，但存在若干实现缺口。

---

## 二、管道详解

### 2.1 URL 发现阶段

| 源 | 文件 | 扫描目标 |
|----|------|----------|
| HTML 标签 | `html-parser.ts` | `<link href>`、`<script src>`、`<img src>`、`<source src>`、`<video src>`、`<audio src>`、`srcset` |
| 内联 `<style>` | `html-parser.ts` → `css-parser.ts` | CSS `url()`、`@import` |
| 外部 CSS | `css-parser.ts` | CSS `url()`、`@import`（递归） |
| JS 字符串 | `recursive-scanner.ts` (`extractJsUrls`) | 绝对 URL 字符串、`fetch()`/`import()`/`require()` 参数、`src=`/`href=` 赋值、`new URL()` |
| JSON 结构 | `recursive-scanner.ts` (`extractJsonUrls`) | JSON 值中类 URL 字符串 |

### 2.2 URL 解析（`url-resolver.ts`）

`resolveUrl(raw, baseUrl)`:
- 相对路径 → 解析为绝对 URL
- 协议相对 `//` → 以 baseUrl 的协议解析
- `data:`/`blob:`/`javascript:`/`mailto:` → 返回 `null`（丢弃）
- 非 `http:`/`https:` 协议 → 返回 `null`

### 2.3 资源过滤（`resource-filter.ts`）

默认跳过扩展名：`.zip`、`.pdf`、`.mp4`、`.exe`、`.wasm` 等。

### 2.4 下载（`fetcher.ts`）

- CSS/JS → 保存 `textContent`（原始文本）
- 其他（img/font/media）→ 若 `inline` 模式，创建 `dataUri`（base64 data URL）

### 2.5 输出改写

#### 单文件模式（`assembleSingleFile`）

| 原始引用 | 改写方式 |
|----------|----------|
| `<link rel="stylesheet">` | → `<style>` 内联，内部 `url()` → data URI |
| `<script src>` | → 内联 JS 文本 |
| `<img src>` | → data URI |
| `<img srcset>` / `<source srcset>` | → data URI |
| `<style>` 内联 | → `url()` 改为 data URI |
| 失败资源 | → 移除 `src`/`href` |
| `<a href>` | ❌ **不改写** |
| `<video>`/`<audio>` | ❌ **不改写** |

#### 目录模式（`assembleBundle`）

| 原始引用 | 改写方式 |
|----------|----------|
| `<link rel="stylesheet">` | → `assets/css/xxx.css` |
| `<script src>` | → `assets/js/xxx.js` |
| `<img src>` | → `assets/img/xxx.png` |
| `<img srcset>` | → 相对路径 |
| 路由路径 `<a href>` | → `path/to/index.html` |
| 失败资源 | → 移除 `src`/`href` |
| CSS 内容中的 `url()` | ❌ **不改写**（仍指向远程） |
| 外部 `<a href>` | ❌ **不改写** |

---

## 三、问题清单

### P0 — 严重缺陷（导致离线功能异常）

#### 问题 ⑦：目录模式 CSS 内容中 `url()` 不重写

**文件**: `packages/core/src/output/bundle.ts` — `assembleBundle()`

**现象**: 下载的 CSS 文件写入磁盘后，其内部的 `url(https://example.com/font.woff2)` 仍指向远程地址，离线打开时无法加载字体/背景图等资源。

**根因**: `assembleBundle()` 构建了 `assetMap`（originUrl → localPath），但只用于重写 DOM 元素（`<link>`、`<script>`、`<img>`），未对 CSS 文件内容中的 `url()` 引用进行重写。

**影响范围**: 所有使用目录模式（`--mode bundle`）的 CSS 外部资源引用。

---

### P1 — 功能缺失（体验降级）

#### 问题 ⑤：JS 动态 URL 发现盲区

**文件**: `packages/core/src/discovery/recursive-scanner.ts`

**现象**: SPA 框架（Vue/React/Angular）通过运行时拼接的 URL（如 `new URL(\`./chunk-${hash}.js\`, import.meta.url)`）加载的代码分割资源无法被发现。

**根因**: 静态正则扫描仅匹配字符串字面量，无法处理 JS 模板字符串或运行时拼接。

**影响范围**: 现代 SPA 网站的代码分割资源（chunk）、动态加载的图片等。

---

#### 问题 ①：同站点导航链接未改写

**文件**: `packages/core/src/output/bundle.ts`

**现象**: `<a href="/about">` 指向同一站点其他页面的链接未被改写为本地路径，离线模式下点击会跳转到远程网站（或无法加载）。

**根因**: 仅对路由路径（route-path）资产对应的 `<a href>` 进行重写，对已知的页面级链接不做处理。

**影响范围**: 多页面 SPA 站点的导航链接。

---

### P2 — 正确性隐患

#### 问题 ⑥：srcset URL 百分比编码匹配失败

**文件**: `packages/core/src/output/bundle.ts` — `assembleBundle()` 的 srcset 重写

**现象**: 浏览器在 `srcset` 属性中会对 URL 进行百分比编码（如 `image.png?w=200` 可能变为 `image.png%3Fw%3D200`），而 `originUrl` 是未编码的，导致正则匹配失败。

**根因**: 使用 `escRegex(a.originUrl)` 直接匹配，未考虑编码差异。

**影响范围**: 使用 `srcset` 响应式图片的页面。

#### 问题 ②：字符串替换误伤风险

**文件**: `packages/core/src/output/single-file.ts` — `rewriteUrls()`

**现象**: 全局字符串替换 `.split(original).join(replacement)` 可能将 URL 文本在非 URL 上下文中替换（如 JS 注释中出现相同 URL 文本）。

**影响范围**: 低概率，但可能导致 JS 执行异常。

---

### P3 — 边缘情况

#### 问题 ③：单文件模式媒体文件未处理

**文件**: `packages/core/src/output/single-file.ts` — `assembleSingleFile()`

**现象**: `<video>`/`<audio>` 的 `src` 在单文件模式下不被改写，仍指向远程 URL。

**根因**: 媒体文件体积大，不适合内联为 data URI，且无降级处理。

#### 问题 ⑧：协议相对 URL 处理不一致

**文件**: `packages/core/src/parser/url-resolver.ts` vs `packages/core/src/discovery/recursive-scanner.ts`

**现象**: `resolveUrl()` 使用 `new URL(raw, baseUrl)` 处理 `//` 协议相对 URL，而 `recursive-scanner.ts` 的 `normalizeUrl()` 手动补 `https:` 前缀，行为不同。

---

## 四、修改方案

### 修复 1：目录模式 CSS 内容 URL 重写（P0）

**目标**: 在 `assembleBundle()` 中，对 CSS 资产的 `textContent` 进行 `url()` 重写，将远程 URL 替换为相对路径。

**方案**:
1. 利用已有的 `assetMap`（originUrl → localPath）
2. 对每个 CSS 资产，计算从 CSS 文件位置到目标资源的相对路径
3. 使用 `css-parser.ts` 中已有的 `rewriteCssUrls()` 函数进行替换
4. 修改后的内容保存在 `asset.textContent` 中，由 `writeAssets()` 写入磁盘

**文件**: `packages/core/src/output/bundle.ts`

### 修复 2：srcset URL 编码兼容（P2）

**目标**: 在 `assembleBundle()` 的 srcset 重写中，增加对百分比编码 URL 的兼容处理。

**方案**: 除了匹配原始 `originUrl`，同时尝试匹配经过 `encodeURI` 编码的版本。

**文件**: `packages/core/src/output/bundle.ts`

### 修复 3：JS 动态 URL 发现（P1）

**目标**: 在浏览器适配器层增加网络请求拦截，捕获运行时实际发出的请求。

**方案**: 在 Playwright/Puppeteer 适配器中，通过 `page.on('request')` 事件拦截并记录所有发出的 HTTP 请求，作为 `extractJsUrls` 的补充。

**文件**: `packages/core/src/adapters/fetcher-adapter.ts`（接口变更）
`packages/adapter-playwright/src/adapter.ts`
`packages/adapter-puppeteer/src/adapter.ts`

### 修复 4：同站点导航链接改写（P1）

**目标**: 在目录模式下，将对已知同站点页面的 `<a href>` 改写为本地路径。

**方案**: 在 `assembleBundle()` 中，遍历所有 `<a href>`，如果链接指向的 URL 与已下载的某个资产匹配，则改写为本地路径（不限于 route-path 资产）。

**文件**: `packages/core/src/output/bundle.ts`

---

## 五、优先级建议

| 优先级 | 修复 | 工作量 | 影响范围 |
|--------|------|--------|----------|
| P0 | CSS 内容 URL 重写 | 小（< 20 行） | 所有目录模式快照 |
| P2 | srcset 编码兼容 | 小（< 5 行） | 使用 srcset 的页面 |
| P1 | 同站点导航链接 | 中（~50 行） | 多页面 SPA 站点 |
| P1 | JS 动态 URL 发现 | 大（跨包修改） | 现代 SPA 站点 |
| P3 | 其他 | 小 | 边缘情况 |

---

## 六、附录：相关文件清单

| 文件 | 角色 |
|------|------|
| `packages/core/src/parser/url-resolver.ts` | URL 解析与规范化 |
| `packages/core/src/parser/html-parser.ts` | HTML 中的 URL 发现 |
| `packages/core/src/parser/css-parser.ts` | CSS 中的 URL 发现与重写 |
| `packages/core/src/discovery/recursive-scanner.ts` | JS/JSON 中的 URL 发现 |
| `packages/core/src/fetcher.ts` | 资源下载与 data URI 生成 |
| `packages/core/src/resource-filter.ts` | 资源过滤规则 |
| `packages/core/src/assembler.ts` | 主调度逻辑 |
| `packages/core/src/output/single-file.ts` | 单文件模式组装 |
| `packages/core/src/output/bundle.ts` | 目录模式组装 |
| `packages/core/src/output/path-fixer.ts` | 绝对路径修复 |