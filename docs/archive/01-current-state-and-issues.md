# 当前状态与已知问题

> 快照命令：`pnpm dev:cli https://fanyi.pdf365.cn/?agent=zhihu --adapter playwright --max-assets 500`
> 输出目录：`apps/cli/snapshot/`
> 归档日期：2026-07-14

## 已完成的工作

### 已修复

1. **webpack 动态 chunk 缺失** — `extractWebpackChunks` 改用两阶段匹配（先整体匹配 chunk map 对象 `{...}[e] + ".js"`，再提取所有 hex hash），chunk 41 `b02411f.js`（语言选择器组件）已可正常下载。

2. **递归扫描未执行** — Commander 的 `--scan-depth` 默认值 `'1'` 覆盖了 `DEFAULTS.scanDepth = 2`，已移除 Commander 默认值，并在 `cli-adapter.ts` 增加 `else` 分支确保默认值生效。

### 现状

- 递归扫描运行 depth 2，发现 122 个新资源，总计 231 个资源（5.7 MB）
- 所有 43 个 webpack chunk 均下载到 `assets/js/_nuxt/`
- Vue 语言选择器组件可正常初始化（不再报 `ChunkLoadError`）
- 控件交互功能（下拉框展开/收起）需在浏览器中验证

---

## 现有问题

### 问题 1：CSS 中绝对路径引用未重写（P0）

**状态**：未修复

**现象**：快照的 CSS 文件中，所有 `url()` 引用仍使用原始绝对路径 `/_nuxt/xxx`，未重写为相对于 CSS 文件位置的本地路径。浏览器加载 CSS 时，按 `/_nuxt/xxx` 请求资源，导致 404。

**根因**：

`packages/core/src/parser/css-parser.ts` 的 `rewriteCssUrls` 函数使用 `urlMap` 替换 CSS 中的 URL。`urlMap` 的 key 是**完整 URL**（如 `https://fanyi.pdf365.cn/_nuxt/fonts/element-icons.313f7da.woff`），但 CSS 文件内容中使用的是**绝对路径**（如 `/_nuxt/fonts/element-icons.313f7da.woff`）。字符串替换时找不到匹配项，因此所有 CSS 中的 `url()` 引用保持原样。

**涉及文件**：
- `packages/core/src/parser/css-parser.ts` — `rewriteCssUrls` 函数
- `packages/core/src/output/bundle.ts` — `assembleBundle` 中的 CSS 重写逻辑

**具体数据**：

CSS 文件 `a74860b.css` 中的绝对路径引用（共 44 处，均未重写）：

| 引用路径 | 实际下载位置 |
|----------|-------------|
| `/_nuxt/fonts/element-icons.313f7da.woff` | `assets/fonts/_nuxt/fonts/...` |
| `/_nuxt/fonts/element-icons.4520188.ttf` | `assets/fonts/_nuxt/fonts/...` |
| `/_nuxt/img/tab-bg.355c20a.svg` | `assets/img/_nuxt/img/...` |
| `/_nuxt/img/down_tip.3593252.svg` | `assets/img/_nuxt/img/...` |
| `/_nuxt/img/vip.7ed2012.svg` | `assets/img/_nuxt/img/...` |
| `/_nuxt/img/gift.277061f.png` | `assets/img/_nuxt/img/...` |
| `/_nuxt/img/bg.7a9537d.svg` | `assets/img/_nuxt/img/...` |
| ... 共 37 处 img + 2 处 fonts + 5 处其他 | 均已下载到对应目录 |

**修复方向**：

在 `rewriteCssUrls` 中增加对绝对路径的替换。从 `originUrl` 提取路径部分（`/` 之后），构造绝对路径到本地相对路径的映射，一并替换。

```typescript
// 在现有完整 URL 替换之后，增加绝对路径替换
for (const [originUrl, localRelPath] of urlMap) {
  const urlObj = new URL(originUrl);
  const absolutePath = urlObj.pathname;  // /_nuxt/fonts/xxx.woff
  // 计算从 CSS 目录到目标文件的相对路径
  // 替换 CSS 中的绝对路径引用
}
```

### 问题 2：实时 API 请求跨域（P2）

**现象**：Nuxt 水合后，Vue 组件发起实时 API 请求到原始服务器（如 `https://fanyi.pdf365.cn/help/latest?limit=3`），因 CORS 策略被浏览器拦截。

**根因**：快照仅捕获页面静态资源，无法拦截/代理运行时 API 请求。这是 SSR 快照的固有限制。

**修复方向**：在 `--serve` 模式下增加反向代理功能，将 API 请求转发到原始服务器并添加 CORS 头。

### 问题 3：`--serve` 模式缺少缓存控制（P3）

**现象**：所有文件请求都返回 `200 OK`，未实现 `304 Not Modified` / `ETag` / `If-Modified-Since`。

**影响**：低优先级，不影响功能，仅影响性能。

---

## 项目结构参考

```
apps/cli/snapshot/              ← 快照输出目录
├── index.html                  ← 入口 HTML
├── snapshot.json               ← 资源清单
└── assets/
    ├── css/_nuxt/css/          ← CSS 文件（含未重写的 url() 引用）
    ├── fonts/_nuxt/fonts/      ← 字体文件
    ├── img/_nuxt/img/          ← 图片/SVG 文件
    └── js/
        ├── _nuxt/              ← 43 个 webpack chunk（含 b02411f.js）
        ├── api/
        ├── getCookiesV2/
        └── web_auto_login_v2/
```

## 关键文件索引

| 文件 | 说明 |
|------|------|
| `packages/core/src/parser/css-parser.ts` | `rewriteCssUrls` — CSS URL 重写（问题 1 的修复点） |
| `packages/core/src/output/bundle.ts` | `assembleBundle` — 调用 `rewriteCssUrls` 的汇编逻辑 |
| `packages/core/src/output/path-fixer.ts` | `fixNuxtConfig` — 修复 `__NUXT__.assetsPath` |
| `packages/core/src/assembler.ts` | `scanAssets` — 递归扫描集成 `extractWebpackChunks` |
| `packages/core/src/discovery/recursive-scanner.ts` | `extractWebpackChunks` — webpack chunk 映射表提取 |
| `apps/cli/src/cli.ts` | CLI 入口 + `--serve` 静态服务器 |
| `apps/cli/src/config/cli-adapter.ts` | `fromCommander` — CLI 参数到 `SnapshotOptions` 转换 |