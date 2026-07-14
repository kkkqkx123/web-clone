# Nuxt SSR 水合失败修复方案

> 基于 `docs/issue/nuxt-ssr-hydration-analysis.md` 的分析结论，制定以下代码修改方案。
> 目标：解决快照中 Vue 异步组件（如语言选择下拉框）无法交互的问题。

---

## 总览

| 缺陷 | 根因 | 优先级 | 涉及文件 | 工作量 |
|------|------|--------|----------|--------|
| 缺陷 1：动态 chunk 缺失 | `extractJsUrls` 无法识别 webpack chunk 映射表 | **P0** | `recursive-scanner.ts`, `assembler.ts` | 中 |
| 缺陷 2：HTML 被误判为 JS | `html-parser.ts` 未过滤非 JS 后缀的 `<script src>` | P1 | `html-parser.ts` | 小 |
| 缺陷 3：路径修复双重修改 | `fixScriptPaths` + `assembleBundle` 两次修改同一元素 | P2 | `path-fixer.ts`, `bundle.ts` | 中 |
| 缺陷 4：`file://` 安全限制 | 浏览器对 `file://` 施加唯一安全来源限制 | P2 | `cli.ts` | 中 |
| 默认增强 | `scanDepth` 默认值仅为 1，扫描深度不足 | P1 | `defaults.ts` | 小 |

---

## 修改 1：Webpack Chunk 映射表扫描（P0）

### 问题

Nuxt 的异步 chunk 仅在 webpack 运行时的 chunk 映射表中以 `{41:"b02411f", ...}[e] + ".js"` 形式存在，`extractJsUrls` 的静态 URL 正则无法扫描到这些动态拼接的 chunk 文件名。

### 方案

在 `packages/core/src/discovery/recursive-scanner.ts` 中新增 `extractWebpackChunks` 函数，专门检测 webpack chunk 映射表模式，并在 `assembler.ts` 的递归扫描流程中集成调用。

#### 1.1 新增 `extractWebpackChunks` 函数

**文件**：`packages/core/src/discovery/recursive-scanner.ts`

在文件末尾（`extractJsonUrls` 之后）新增：

```typescript
/**
 * Detect webpack runtime chunk map in JS source.
 *
 * Targets patterns like:
 *   f.p + "" + { 41: "b02411f", 42: "d8b86cf" }[e] + ".js"
 *   e.p + "" + { 3: "692284f", 4: "2d4adf4" }[n] + ".js"
 *
 * Returns the chunk file names (e.g. "b02411f.js") resolved against the base URL.
 */
export function extractWebpackChunks(jsText: string, baseUrl: string): DiscoveredUrl[] {
  const found = new Map<string, DiscoveredUrl>();

  // Pattern: {...chunkId: "hash"...}[identifier] + ".js"
  // Matches the object literal in webpack chunk map
  const chunkMapRe = /\{\s*(?:\d+\s*:\s*["']([^"']+)["']\s*(?:,\s*)?)+\}\s*\[\w+\]\s*\+\s*["']\.js["']/g;
  // Simpler: just find all "hash": "hexString" pairs that look like chunk hashes
  const chunkEntryRe = /(\d+)\s*:\s*["']([a-f0-9]{6,8})["']/g;

  let match: RegExpExecArray | null;
  const baseUrlObj = new URL(baseUrl);
  const baseDir = baseUrlObj.origin + baseUrlObj.pathname.substring(0, baseUrlObj.pathname.lastIndexOf('/') + 1);

  while ((match = chunkEntryRe.exec(jsText)) !== null) {
    const chunkId = match[1];
    const hash = match[2];
    const fileName = `${hash}.js`;

    // Verify this is inside a webpack chunk map (not a random hash)
    // by checking surrounding context
    const contextStart = Math.max(0, match.index - 20);
    const contextEnd = Math.min(jsText.length, match.index + match[0].length + 20);
    const context = jsText.slice(contextStart, contextEnd);

    // Webpack chunk maps have the pattern: chunkId: "hash" inside {...}
    if (context.includes('{') || context.includes(':')) {
      const url = resolveMaybeRelative(fileName, baseDir);
      if (url && !found.has(url)) {
        found.set(url, {
          url,
          source: baseUrl,
          confidence: 'low', // low confidence because it's a heuristic
        });
      }
    }
  }

  return [...found.values()];
}
```

**导出**：在文件末尾的 `export` 或文件顶部添加 `extractWebpackChunks` 的导出。

#### 1.2 集成到 `assembler.ts` 的递归扫描

**文件**：`packages/core/src/assembler.ts`

**步骤 A**：在导入中添加 `extractWebpackChunks`（第 17 行附近）

```typescript
import { extractJsUrls, extractJsonUrls, extractWebpackChunks } from './discovery/recursive-scanner.js';
```

**步骤 B**：在 `scanAssets` 函数内部（第 352-402 行），在 JS 扫描块中追加 webpack chunk 检测：

```typescript
// 在 scanAssets 的 scanJsEnabled 块中，extractJsUrls 调用之后追加：
if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
  const text = asset.textContent || (asset.dataUri ? Buffer.from(asset.dataUri.split(',')[1], 'base64').toString('utf8') : '');
  if (text) {
    // 现有逻辑：提取静态 URL
    const urls = extractJsUrls(text, asset.originUrl);
    for (const found of urls) {
      if (!seenUrls.has(found.url)) {
        seenUrls.add(found.url);
        discovered.push({
          url: found.url,
          type: classifyByExt(found.url),
          origin: `js:${asset.originUrl}`,
        });
      }
    }
    // 新增逻辑：提取 webpack chunk 文件名
    const webpackChunks = extractWebpackChunks(text, asset.originUrl);
    for (const found of webpackChunks) {
      if (!seenUrls.has(found.url)) {
        seenUrls.add(found.url);
        discovered.push({
          url: found.url,
          type: 'js', // 强制标记为 JS 类型
          origin: `webpack-chunk:${asset.originUrl}`,
        });
      }
    }
  }
}
```

**预期效果**：`b02411f.js` 等异步 chunk 被自动发现并下载，Vue 异步组件可正常初始化。

---

## 修改 2：非 JS 脚本过滤（P1）

### 问题

`<script src="/web_auto_login_v2/index.html">` 等标签将 HTML 内容当作 JS 加载，导致 `SyntaxError: Unexpected token '<'`。

### 方案

**文件**：`packages/core/src/parser/html-parser.ts` 第 21-23 行

修改 `TAG_ATTR_MAP` 中的 `script` 规则，添加 URL 后缀过滤：

```typescript
script: [
  {
    sel: 'script[src]',
    attr: 'src',
    type: 'js',
    // 只下载真正的 JS 文件；非 JS 后缀的脚本保留 src 但不标记为需要下载的 JS 资源
    filter: (url: string) =>
      /\.(?:js|mjs|cjs)(?:\?[^#]*)?(?:#.*)?$/i.test(url) ||
      /\/[\w-]+\.\w{2,}$/i.test(url), // fallback: 有文件扩展名的路径
  } as { sel: string; attr: string; type: AssetType; filter?: (url: string) => boolean },
],
```

同时需要修改 `parseHtml` 函数中的资源收集逻辑（第 78-93 行），在 `rules` 遍历中支持 `filter` 回调：

```typescript
for (const { sel, attr, type, filter } of rules) {
  for (const el of document.querySelectorAll(sel)) {
    const raw = el.getAttribute(attr);
    if (!raw) continue;
    const resolved = resolveUrl(raw, baseUrl);
    if (!resolved) continue;
    addSnapshotAttrs(el, resolved);
    if (seen.has(resolved)) continue;
    // 如果定义了 filter 且返回 false，跳过下载但不跳过 data-origin-url 标记
    if (filter && !filter(resolved)) {
      // 仍然标记元素，但不加入 assets 列表
      continue;
    }
    seen.add(resolved);
    assets.push({ url: resolved, type, origin: sel, attribute: attr });
  }
}
```

**注意**：即使过滤掉资源下载，`data-origin-url` 仍然被标记（在 `continue` 之前），以便后续 `assembleBundle` 中处理失败资源时能移除该属性。

### 效果

- `/web_auto_login_v2/index.html` 等路由路径不会被当作 JS 下载
- 控制台不再出现 `Unexpected token '<'` 语法错误
- 不影响真正的 JS 文件下载

---

## 修改 3：统一路径修复逻辑（P2）

### 问题

`fixPathsForFileProtocol` → `fixScriptPaths` 将 `/_nuxt/14014a2.js` 改为 `./assets/js/_nuxt/14014a2.js`（带 `./` 前缀），随后 `assembleBundle` 通过 `data-origin-url` 又将 `src` 改为 `assets/js/_nuxt/14014a2.js`（不带 `./`）。两次修改虽然最终结果一致，但增加了复杂度和潜在的序列化差异风险。

### 方案

**将 `fixScriptPaths` 和 `fixLinkPaths` 的职责转移到 `assembleBundle` 的路径改写阶段**，使路径修改只发生一次。

#### 3.1 精简 `fixPathsForFileProtocol`

**文件**：`packages/core/src/output/path-fixer.ts`

保留 `fixNuxtConfig`（Nuxt 的 `window.__NUXT__.assetsPath` 是独立的配置项，`assembleBundle` 不处理它），但移除 `fixScriptPaths` 和 `fixLinkPaths` 调用：

```typescript
export function fixPathsForFileProtocol(document: Document, html: string): void {
  const framework = detectFramework(html);

  // Framework-specific fixes — Nuxt assetsPath 必须修正，否则 Vue 运行时内部路径错误
  if (framework === 'nuxt') {
    fixNuxtConfig(document);
  }

  // 注意：fixScriptPaths / fixLinkPaths 已移除，DOM 元素路径修改统一由 assembleBundle 完成
  // 但 preload link 的 href 也交由 assembleBundle 处理（通过 data-origin-url）
}
```

#### 3.2 确保 `assembleBundle` 覆盖所有路径类型

**文件**：`packages/core/src/output/bundle.ts` 第 248-255 行

当前 `assembleBundle` 已通过 `data-origin-url` 处理 `script`、`link`、`img`、`source`、`video`、`audio` 标签。确认 `link[rel="preload"]` 也被覆盖：检查 `html-parser.ts` 中 `link[rel="preload"][href]` 是否被标记了 `data-origin-url`。

`html-parser.ts` 第 17 行已定义 `{ sel: 'link[rel="preload"][href]', attr: 'href', type: 'other' }`，所以 preload link 也会有 `data-origin-url`，会被 `assembleBundle` 处理。

**无需额外修改**，只需确认移除 `fixScriptPaths`/`fixLinkPaths` 后，preload link 的路径仍然正确。

#### 3.3 测试验证

需要验证两种场景：

1. `mode: 'single'`（单文件模式）—— 使用 `single-file.ts`，是否也依赖 `fixScriptPaths`？
2. `mode: 'bundle'`（目录模式）—— 完全由 `assembleBundle` 处理

检查 `single-file.ts` 是否调用 `fixPathsForFileProtocol`：

经确认，`single-file.ts` **不**使用 `fixPathsForFileProtocol` / `fixScriptPaths` / `fixLinkPaths` 中的任何一个。因此移除 `fixScriptPaths` 和 `fixLinkPaths` 仅影响 `bundle` 模式，无副作用。

### 效果

- 每个 DOM 元素在 `bundle` 模式下只被修改一次 `src`/`href` 属性
- 降低 JSDOM 序列化差异风险
- 减少代码维护复杂度

---

## 修改 4：增加默认 `scanDepth`（P1）

### 问题

`scanDepth` 默认值为 1，只扫描 HTML 直接引用的资源，不足以发现 Nuxt 异步 chunk 所依赖的更深层资源。

### 方案

**文件**：`packages/core/src/config/defaults.ts` 第 22 行

```diff
-  scanDepth: 1,
+  scanDepth: 2,
```

### 影响

- 默认情况下，流水线会执行 2 轮递归扫描
- 第 1 轮：下载 HTML 直接引用的资源
- 第 2 轮：扫描已下载 JS/CSS 中引用的资源（包括通过修改 1 发现的 webpack chunk）
- 性能影响：增加一轮 HTTP 请求，但由于 `maxAssets` 限制，不会无限制下载
- 用户可通过 `--scan-depth 1` 恢复旧行为

---

## 修改 5：新增 `--serve` 模式（P2）

### 问题

`file://` 协议下，浏览器限制 `import()` 等动态模块加载 API，某些 webpack 运行时行为异常。

### 方案

**文件**：`apps/cli/src/cli.ts`

在 CLI 中新增 `--serve` 参数，在快照完成后启动本地 HTTP 服务器提供静态文件服务。

#### 5.1 新增 `--serve` 参数

```typescript
program
  .option('--serve', 'Start a local HTTP server to serve the snapshot (avoids file:// restrictions)')
  .option('--serve-port <port>', 'Port for the HTTP server (default: 8080)', '8080');
```

#### 5.2 实现 `startStaticServer` 函数

在 `cli.ts` 中新增：

```typescript
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { extname, join } from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  // ...
};

function startStaticServer(rootDir: string, port: number): void {
  const server = createServer((req, res) => {
    let filePath = join(rootDir, req.url === '/' ? 'index.html' : req.url);
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const stream = createReadStream(filePath);
    stream.on('open', () => {
      res.writeHead(200, { 'Content-Type': contentType });
      stream.pipe(res);
    });
    stream.on('error', () => {
      res.writeHead(404);
      res.end('Not Found');
    });
  });

  server.listen(port, () => {
    process.stdout.write(`\n  Snapshot served at: http://localhost:${port}\n`);
    process.stdout.write(`  Press Ctrl+C to stop.\n\n`);
  });
}
```

#### 5.3 集成到快照流程

在 `snapshot()` 调用成功后，检查 `options.serve` 标志：

```typescript
const result = await snapshot(options);
// ... 现有输出逻辑 ...

if (options.serve) {
  startStaticServer(options.output, options.servePort ?? 8080);
}
```

### 效果

- 浏览器不再受 `file://` 安全限制
- `import()` 动态加载、`fetch`、`XMLHttpRequest` 等 API 正常工作
- 提供更接近生产环境的测试体验

---

## 实施顺序

| 优先级 | 修改 | 依赖 | 建议分批 |
|--------|------|------|----------|
| P0 | 修改 1：Webpack Chunk 扫描 | 无 | **第一批** |
| P1 | 修改 2：非 JS 脚本过滤 | 无 | **第一批** |
| P1 | 修改 4：默认 scanDepth 改为 2 | 依赖修改 1 完成后验证 | **第二批** |
| P2 | 修改 3：路径修复统一 | 无（但需与修改 1/2 的代码合并测试） | **第二批** |
| P2 | 修改 5：`--serve` 模式 | 无 | **第三批** |

### 建议分三批实施

**第一批（核心修复）**：修改 1 + 修改 2
- 解决最关键的动态 chunk 缺失和 HTML 误判问题
- 完成后即可验证 Nuxt 水合是否修复

**第二批（体验优化）**：修改 4 + 修改 3
- 提高默认扫描深度使更多用户免于遇到此问题
- 清理路径修复逻辑，降低维护成本

**第三批（功能增强）**：修改 5
- `--serve` 模式作为独立功能，无代码依赖，随时可交付

---

## 验证方法

### 单元测试

1. **`recursive-scanner.test.ts`**：新增 `extractWebpackChunks` 的测试用例
   - 输入 webpack chunk 映射表 JS 代码 → 验证提取出正确的 chunk 文件名
   - 输入普通 JS 代码（无 chunk 映射）→ 验证返回空数组
   - 输入边界情况（空字符串、无匹配）→ 验证不崩溃

2. **`html-parser.test.ts`**：新增 `filter` 回调测试
   - `<script src="/api/getCookies/index.html">` → 不被标记为 JS 资源
   - `<script src="/_nuxt/app.js">` → 正常标记为 JS 资源

### 集成测试

使用目标页面（`https://fanyi.pdf365.cn/?agent=zhihu`）验证：

```bash
# 旧行为（确认问题存在）
pnpm dev:cli https://fanyi.pdf365.cn/?agent=zhihu --adapter playwright --max-assets 500

# 新行为（验证修复）
pnpm dev:cli https://fanyi.pdf365.cn/?agent=zhihu --adapter playwright --max-assets 500

# 验证文件存在
ls snapshot/assets/js/_nuxt/b02411f.js  # 应存在

# 打开 index.html 确认语言选择器可交互
```

### 手动验证清单

- [ ] `b02411f.js` 存在于输出目录中
- [ ] 控制台无 `ChunkLoadError: Loading chunk 41 failed`
- [ ] 控制台无 `SyntaxError: Unexpected token '<'`
- [ ] 语言选择下拉框可点击展开
- [ ] 页面其他交互功能正常
- [ ] `--scan-depth 1` 仍能工作（回退兼容）
- [ ] 非 Nuxt 页面不受影响