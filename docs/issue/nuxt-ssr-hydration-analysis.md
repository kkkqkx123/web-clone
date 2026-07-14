# Nuxt SSR 快照水合失败分析报告

> 目标页面：`https://fanyi.pdf365.cn/?agent=zhihu`
> 快照命令：`pnpm dev:cli https://fanyi.pdf365.cn/?agent=zhihu --adapter playwright --max-assets 500`
> 报告日期：2026-07-14

## 现象

快照生成的 HTML 中，语言选择下拉框等 Vue 交互组件呈静态状态，点击无法展开。控制台报错如下：

```
Uncaught SyntaxError: Unexpected token '<'
down_tip.3593252.svg:1  Failed to load resource: net::ERR_FILE_NOT_FOUND
vip.7ed2012.svg:1  Failed to load resource: net::ERR_FILE_NOT_FOUND
gift.277061f.png:1  Failed to load resource: net::ERR_FILE_NOT_FOUND
b02411f.js:1  Failed to load resource: net::ERR_FILE_NOT_FOUND

ChunkLoadError: Loading chunk 41 failed.
(error: file:///D:/project/cli/web-clone/apps/cli/snapshot/assets/js/_nuxt/b02411f.js)
    at f.e (14014a2.js:1:1438)
    at component (d1ef0fc.js:2:949654)
    at d1ef0fc.js:2:345066
    at _ (d39b266.js:2:227876)
    ...

index.html:1 Unsafe attempt to load URL file:///...
  'file:' URLs are treated as unique security origins.
```

## 根因分析

### 根因 1（首要）：动态 chunk 缺失 —— chunk 41 (b02411f.js) 未下载

webpack 运行时 `14014a2.js` 中定义了 chunk 映射表：

```javascript
f.p + "" + {
    3: "692284f",  4: "2d4adf4",  5: "aa8f39b",  6: "f146420",
    7: "088af38",  8: "25a79d9",  9: "9bdeb27", 10: "740b7da",
    11: "f7a7cd7", 12: "a55f626", 13: "a5e2f06", 14: "c2877c0",
    15: "c9c71ec", 16: "157c09c", 17: "e979361", 18: "43e65e5",
    19: "4dd387d", 20: "5d596fe", 21: "42c235a", 22: "d4e17d1",
    23: "548553f", 24: "115c2ac", 25: "0269440", 26: "16daf77",
    27: "47280d9", 28: "a37af48", 29: "5c6e70b", 30: "c4c9da0",
    31: "a227bde", 32: "4ab7c1d", 33: "87c791a", 34: "6e61735",
    36: "979e4f6", 37: "d6af0dc", 38: "86e0558", 39: "668be03",
    40: "4ac8a55", 41: "b02411f", 42: "d8b86cf"
}[e] + ".js"
```

控制台报错 `ChunkLoadError: Loading chunk 41 failed`，对应文件 `b02411f.js`。该 chunk **不在快照的 `assets/js/_nuxt/` 目录中**，因为：

- 默认 `--scan-depth 1` 只扫描 HTML 中的直接引用
- `b02411f.js` 是 Nuxt 的**异步加载 chunk**，仅通过 webpack 运行时动态加载，HTML 中无直接 `<script src>` 引用
- 快照流水线未对已下载的 JS 文件进行递归扫描来发现动态引用

**结果**：语言选择器等 Vue 异步组件所在 chunk 加载失败，导致组件无法初始化，下拉框保持 `display:none` 静态状态。

### 根因 2（辅助）：HTML 文件被当作 JS 加载导致语法错误

```
Uncaught SyntaxError: Unexpected token '<'
```

快照中以下 `<script>` 标签加载的是 HTML 内容，非 JavaScript：

| 资源 | 类型 | 问题 |
|------|------|------|
| `assets/js/web_auto_login_v2/index.html` | text/html | 被 `<script async src="...">` 加载 |
| `assets/js/api/getCookies/index.html` | text/html | 被 `<script src="...">` 加载 |
| `assets/js/getCookiesV2/index.html` | text/html | 被 `<script src="...">` 加载 |

虽然这些是 `async` 脚本不影响主线程，但语法错误会污染控制台，且可能影响依赖这些脚本的 Vue 插件初始化。

### 根因 3（辅助）：CSS 引用的资源路径错误

```
down_tip.3593252.svg:1  Failed to load resource: net::ERR_FILE_NOT_FOUND
vip.7ed2012.svg:1  Failed to load resource: net::ERR_FILE_NOT_FOUND
gift.277061f.png:1  Failed to load resource: net::ERR_FILE_NOT_FOUND
```

这些资源位于 `assets/img/_nuxt/img/` 目录下，但 HTML/CSS 中引用的路径为 `/ _nuxt/img/xxx.svg`。路径修复（`fixPathsForFileProtocol`）将其转换为 `./assets/img/_nuxt/img/xxx.svg`，但实际文件路径为 `assets/img/_nuxt/img/`（相对于 `index.html`）——去掉了 `./` 前缀，导致加载 404。

### 根因 4（环境）：`file://` 协议安全限制

```
'file:' URLs are treated as unique security origins.
```

浏览器将 `file://` 视为唯一安全来源，会限制某些 API（如 `fetch`、`XMLHttpRequest`、`import()`）的使用。虽然 `<script src="file://...">` 标签加载通常不受限，但 webpack 动态创建 `<script>` 标签加载 chunk 时，某些浏览器可能施加额外限制。

## 流水线缺陷定位

### 缺陷 1：缺乏递归 JS 扫描

**文件**：`packages/core/src/assembler.ts` 第 293-463 行

`scanDepth` 默认值为 1，只扫描 HTML 中直接引用的资源。Nuxt 的异步 chunk 只存在于 webpack 运行时内的 chunk 映射表中，不直接出现在 HTML 中。即使 `scanDepth > 1`，JS 扫描仅提取 `extractJsUrls` 中的 URL 字面量，而 chunk 映射表是动态的 `{...}[e] + ".js"` 表达式，无法通过静态扫描提取。

```typescript
// assembler.ts 第 341 行
const scanDepth = options.scanDepth ?? 1; // 默认 1
```

### 缺陷 2：HTML 内容被误判为 JS 资源

**文件**：`packages/core/src/parser/html-parser.ts` 第 21-23 行

```typescript
script: [
    { sel: 'script[src]', attr: 'src', type: 'js' },
],
```

所有 `<script src>` 标签都被标记为 `type: 'js'`，但没有检查实际 MIME 类型。`web_auto_login_v2` 等路由返回的是 HTML，但被当作 JS 下载和保留。

### 缺陷 3：路径修复双重修改

**文件**：`packages/core/src/output/path-fixer.ts` 第 64-81 行

`fixScriptPaths` 将 `/_nuxt/14014a2.js` → `./assets/js/_nuxt/14014a2.js`（带 `./` 前缀）。

随后 `assembleBundle` 又通过 `data-origin-url` 定位元素，将 `src` 改为 `assets/js/_nuxt/14014a2.js`（不带 `./` 前缀）。

**双重修改**虽然最终路径仍正确，但增加了复杂度，且 JSDOM 序列化时可能引入微妙的 HTML 差异，影响 Vue 水合。

## 修复建议

### 建议 1：增加 webpack chunk 映射表扫描

在 `assembler.ts` 中，对下载的 JS 文件扫描 webpack 运行时 chunk 映射模式：

```typescript
// 检测 webpack chunk 映射表
const CHUNK_MAP_RE = /\{\s*\d+\s*:\s*["'][^"']+["']\s*(?:,\s*\d+\s*:\s*["'][^"']+["'])+\s*\}/;
```

提取 chunk 文件名并作为额外资源下载。这需要新增一个 `scanWebpackChunks` 函数，或在现有递归扫描中增加 webpack 模式识别。

### 建议 2：过滤非 JS 内容的脚本标签

在 `html-parser.ts` 中，对 `<script src>` 标签的 URL 进行后缀检查：

```typescript
script: [
    { sel: 'script[src]', attr: 'src', type: 'js', filter: (url: string) => 
        url.endsWith('.js') || url.endsWith('.mjs') || url.endsWith('.cjs') },
],
```

对于非 JS 后缀的脚本，保留其 `src` 但不将其标记为需要下载的 JS 资源。

### 建议 3：统一路径修复逻辑

合并 `fixPathsForFileProtocol` 和 `assembleBundle` 的路径修改逻辑，避免同一元素被修改多次。建议在 `assembleBundle` 中一次性完成路径转换，移除 `fixPathsForFileProtocol` 中的重复修改。

### 建议 4：增加 `--scan-depth` 默认值

将默认 `scanDepth` 从 1 改为 2，并增强 JS 扫描逻辑以提取 webpack chunk 映射。

### 建议 5：添加 `--serve` 模式

新增内置 HTTP 服务器模式，避免 `file://` 协议的安全限制：

```bash
pnpm dev:cli <url> --serve
```

在本地启动一个 HTTP 服务器来提供快照文件，解决 `file://` 唯一安全来源限制。

## 相关文件

| 文件 | 说明 |
|------|------|
| `packages/core/src/assembler.ts` | 主流水线，扫描/下载/组装 |
| `packages/core/src/parser/html-parser.ts` | HTML 解析与资源发现 |
| `packages/core/src/output/path-fixer.ts` | 路径修复（file:// 兼容） |
| `packages/core/src/output/bundle.ts` | Bundle 模式组装 |
| `packages/core/src/output/single-file.ts` | Single-file 模式组装 |
| `apps/cli/src/cli.ts` | CLI 入口与 Vue 水合脚本注入 |