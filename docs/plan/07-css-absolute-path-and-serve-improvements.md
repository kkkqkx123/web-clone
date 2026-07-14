# 修复方案：CSS 绝对路径重写与 Serve 模式改进

> 对应问题：`docs/archive/01-current-state-and-issues.md` — 问题 1 (P0)、问题 2 (P2)、问题 3 (P3)
> 归档日期：2026-07-14

## 目录

1. [问题 1 (P0)：CSS 中绝对路径引用未重写](#问题-1-p0css-中绝对路径引用未重写)
2. [问题 2 (P2)：Serve 模式反向代理](#问题-2-p2serve-模式反向代理)
3. [问题 3 (P3)：Serve 模式缓存控制](#问题-3-p3serve-模式缓存控制)
4. [实施顺序与依赖关系](#实施顺序与依赖关系)

---

## 问题 1 (P0)：CSS 中绝对路径引用未重写

### 根因分析

当前 CSS 重写流程位于 `packages/core/src/output/bundle.ts` 的 `assembleBundle` 函数中（L220-238）：

```
为每个 CSS 文件构建 cssUrlMap:
  key   = a.originUrl          ← 完整 URL，如 https://example.com/_nuxt/fonts/xxx.woff
  value = relFromCss           ← 从 CSS 目录到目标文件的相对路径

调用 rewriteCssUrls(cssText, cssUrlMap):
  在 CSS 文本中搜索 key（完整 URL），替换为 value（本地相对路径）
```

**问题**：Nuxt/Vue 项目构建出的 CSS 文件中，`url()` 引用使用的是**绝对路径**（如 `/_nuxt/fonts/element-icons.313f7da.woff`），而非完整 URL。`rewriteCssUrls` 的 key 是完整 URL，字符串匹配找不到目标，因此 `url()` 保持原样。

**涉及文件**：
- `packages/core/src/output/bundle.ts` — `assembleBundle` 中 CSS URL 映射构建逻辑
- `packages/core/src/parser/css-parser.ts` — `rewriteCssUrls` 函数

### 修复方案

#### 方案 A：在 `assembleBundle` 中补充绝对路径映射（推荐）

在 `assembleBundle` 构建 `cssUrlMap` 时，除了完整 URL → 相对路径的映射，额外添加绝对路径 → 相对路径的映射。

**修改位置**：`packages/core/src/output/bundle.ts` L226-233

```typescript
const cssUrlMap = new Map<string, string>();
for (const [originUrl, assetRelPath] of assetMap.entries()) {
  if (originUrl === a.originUrl) continue;
  const relFromCss = relative(cssDir, assetRelPath).replace(/\\/g, '/');

  // 映射 1：完整 URL → 相对路径（覆盖 CSS 中使用完整 URL 的场景）
  cssUrlMap.set(originUrl, relFromCss);

  // 映射 2：绝对路径 → 相对路径（覆盖 Nuxt/Vue 使用 /_nuxt/xxx 的场景）
  // 从 originUrl 中提取 pathname，如 https://example.com/_nuxt/fonts/xxx.woff → /_nuxt/fonts/xxx.woff
  try {
    const urlObj = new URL(originUrl);
    const absolutePath = urlObj.pathname; // 如 /_nuxt/fonts/element-icons.313f7da.woff
    if (absolutePath.startsWith('/')) {
      cssUrlMap.set(absolutePath, relFromCss);
    }
  } catch {
    // URL 解析失败，跳过绝对路径映射
  }
}
```

**原理**：同一来源的 CSS 中，`url(/_nuxt/fonts/xxx.woff)` 的路径名与 `urlMap` 中 `originUrl` 的 `pathname` 段一致。CSS 使用绝对路径引用的是同源资源，将绝对路径映射到本地相对路径是安全的。

**安全性**：`new URL(originUrl)` 在遍历 `assetMap` 时已确保所有 `originUrl` 均为有效 URL，此处 `try/catch` 仅作为防御性编程。

#### 方案 B：在 `rewriteCssUrls` 中增加绝对路径替换层

如果希望将逻辑集中在 CSS 解析模块，可以在 `rewriteCssUrls` 内部增加第二遍替换：

```typescript
export function rewriteCssUrls(css: string, urlMap: Map<string, string>): string {
  let result = css;
  const entries = Array.from(urlMap.entries()).sort((a, b) => b[0].length - a[0].length);

  // 第 1 遍：完整 URL 替换
  for (const [original, replacement] of entries) {
    const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), replacement);
  }

  // 第 2 遍：绝对路径替换（从 originUrl 提取 pathname）
  for (const [originUrl, replacement] of entries) {
    try {
      const urlObj = new URL(originUrl);
      const absolutePath = urlObj.pathname;
      if (absolutePath.startsWith('/')) {
        const escaped = absolutePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(escaped, 'g'), replacement);
      }
    } catch {
      // ignore
    }
  }

  return result;
}
```

**选择理由**：推荐**方案 A**，原因如下：
1. 修改范围小，只影响调用方逻辑，`rewriteCssUrls` 保持纯替换函数不变
2. 绝对路径映射只对同一 origin 有意义，在 CSS 处理循环中构建映射更自然
3. 避免在 `rewriteCssUrls` 中引入 `URL` 解析逻辑，保持函数职责单一

#### 边界情况与测试

| 场景 | CSS 内容 | 预期行为 |
|------|---------|---------|
| 完整 URL | `url(https://example.com/img/a.png)` | 替换为 `url(../img/a.png)` |
| 绝对路径 | `url(/_nuxt/img/a.png)` | 替换为 `url(../img/_nuxt/img/a.png)` |
| 同资源多种引用 | 混合使用完整 URL 和绝对路径 | 均正确替换 |
| 跨域资源 | `url(https://cdn.other.com/lib.css)` | 保持完整 URL 替换（已有映射） |
| 路径含特殊字符 | `url(/_nuxt/img/a[1].png)` | 正则转义后正确替换 |
| 不同 origin 相同 pathname | `https://a.com/x.png` 和 `https://b.com/x.png` | 各自映射到不同本地路径，不影响 |

#### 验证方法

```bash
# 对已知包含绝对路径引用的页面执行快照
pnpm dev:cli https://fanyi.pdf365.cn/?agent=zhihu --adapter playwright --max-assets 500

# 检查 CSS 文件中的 url() 引用是否已重写
grep 'url(/_nuxt/' apps/cli/snapshot/assets/css/*.css
# 期望：无输出（全部已替换）

# 检查重写后的路径是否正确
grep 'url(.*element-icons' apps/cli/snapshot/assets/css/*.css
# 期望：如 url(../fonts/_nuxt/fonts/element-icons.313f7da.woff)
```

---

## 问题 2 (P2)：Serve 模式反向代理

### 根因分析

`packages/core/src/parser/css-parser.ts` 中 `rewriteCssUrls` 使用 `urlMap` 替换 CSS 中的 URL。`urlMap` 的 key 是完整 URL，但 CSS 文件内容中使用的是绝对路径，字符串替换找不到匹配项。

### 修复方案

修改 `packages/core/src/output/bundle.ts` 中 `assembleBundle` 的 CSS URL 映射构建逻辑，在完整 URL 映射之外，额外添加绝对路径 → 相对路径的映射。

```typescript
// 在 assembleBundle CSS 处理循环中（bundle.ts L226-233）
const cssUrlMap = new Map<string, string>();
for (const [originUrl, assetRelPath] of assetMap.entries()) {
  if (originUrl === a.originUrl) continue;
  const relFromCss = relative(cssDir, assetRelPath).replace(/\\/g, '/');
  cssUrlMap.set(originUrl, relFromCss);

  // ADD: 绝对路径映射（处理 Nuxt/Vue 的 url(/_nuxt/xxx) 引用）
  try {
    const urlObj = new URL(originUrl);
    const absolutePath = urlObj.pathname;
    if (absolutePath.startsWith('/')) {
      // 避免覆盖已有的完整 URL 映射（完整 URL 更长，排序后优先替换）
      cssUrlMap.set(absolutePath, relFromCss);
    }
  } catch {
    // 忽略无法解析的 URL
  }
}
```

`rewriteCssUrls` 函数本身无需修改——它按 key 长度降序排序后执行正则替换，完整 URL（更长）优先匹配，绝对路径（较短）在后续轮次匹配。

### 根因分析

`startStaticServer`（`apps/cli/src/cli.ts` L357-387）是一个纯静态文件服务器。当快照在 `--serve` 模式下运行时，Nuxt 水合后的 Vue 组件发起的运行时 API 请求（如 `https://fanyi.pdf365.cn/help/latest?limit=3`）会被发往原始服务器，因 CORS 策略被浏览器拦截。

### 修复方案

将 `startStaticServer` 改造为「静态文件服务 + 反向代理」混合服务器：

1. 接收 `originUrl` 参数，记录原始服务器的 origin
2. 优先尝试静态文件服务
3. 静态文件 404 时，将请求代理到原始服务器
4. 所有响应添加宽松 CORS 头

**修改位置**：`apps/cli/src/cli.ts`

#### 步骤 1：提取代理函数

```typescript
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

/**
 * 反向代理请求到原始服务器
 */
function proxyRequest(
  targetOrigin: string,
  req: IncomingMessage,
  res: ServerResponse,
): void {
  const urlObj = new URL(targetOrigin);
  const isHttps = urlObj.protocol === 'https:';
  const proxyPath = req.url || '/';

  const proxyOptions = {
    hostname: urlObj.hostname,
    port: urlObj.port || (isHttps ? 443 : 80),
    path: proxyPath,
    method: req.method || 'GET',
    headers: {
      // 透传关键请求头
      ...(req.headers['accept'] ? { 'Accept': req.headers['accept'] } : {}),
      ...(req.headers['accept-language'] ? { 'Accept-Language': req.headers['accept-language'] } : {}),
      ...(req.headers['user-agent'] ? { 'User-Agent': req.headers['user-agent'] } : {}),
      ...(req.headers['referer'] ? { 'Referer': req.headers['referer'] } : {}),
      // 移除 host，使用目标服务器 host
      'Host': urlObj.hostname,
    },
  };

  const proxyReq = (isHttps ? httpsRequest : httpRequest)(proxyOptions, (proxyRes) => {
    // 添加 CORS 头
    const headers: Record<string, string | string[]> = {
      ...proxyRes.headers,
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': '*',
    };

    // 对于流式响应（如 Server-Sent Events），使用 chunked 传输
    res.writeHead(proxyRes.statusCode || 200, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Proxy Error: ${err.message}`);
  });

  // 透传请求体（如 POST 请求）
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}
```

#### 步骤 2：改造静态服务器

```typescript
function startStaticServer(rootDir: string, port: number, originUrl?: string): void {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // ── CORS preflight ──
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': '*',
        'access-control-max-age': '86400',
      });
      res.end();
      return;
    }

    let urlPath = req.url || '/';
    const queryIdx = urlPath.indexOf('?');
    if (queryIdx !== -1) urlPath = urlPath.substring(0, queryIdx);

    const filePath = urlPath.endsWith('/')
      ? join(rootDir, urlPath, 'index.html')
      : join(rootDir, urlPath);

    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const stream = createReadStream(filePath);
    stream.on('open', () => {
      // 静态文件命中 → 直接返回（带 CORS 头）
      res.writeHead(200, {
        'Content-Type': contentType,
        'access-control-allow-origin': '*',
      });
      stream.pipe(res);
    });
    stream.on('error', () => {
      // 静态文件 404 → 反向代理到原始服务器（如果配置了 originUrl）
      if (originUrl) {
        proxyRequest(originUrl, req, res);
      } else {
        res.writeHead(404, {
          'Content-Type': 'text/plain',
          'access-control-allow-origin': '*',
        });
        res.end('Not Found');
      }
    });
  });

  server.listen(port, () => {
    process.stdout.write(`\n  Snapshot served at: ${chalk.green(`http://localhost:${port}`)}\n`);
    if (originUrl) {
      process.stdout.write(`  Proxy origin: ${chalk.gray(originUrl)}\n`);
    }
    process.stdout.write(`  Press ${chalk.bold('Ctrl+C')} to stop.\n\n`);
  });
}
```

#### 步骤 3：调用处传入 originUrl

在 `cli.ts` L160-167 修改：

```typescript
if (opts.serve && !isLocal) {
  const port = opts.servePort ? parseInt(opts.servePort, 10) : 8080;
  if (Number.isFinite(port) && port > 0 && port < 65536) {
    startStaticServer(options.output, port, options.url);
  } else {
    console.error(chalk.red(`Invalid --serve-port: "${opts.servePort}". Using 8080.`));
    startStaticServer(options.output, 8080, options.url);
  }
}
```

#### 配置选项

增加 `--proxy` 选项控制反向代理行为：

```typescript
.option('--proxy', 'Enable reverse proxy for runtime API requests in --serve mode')
```

仅在显式指定 `--proxy` 且 `--serve` 时启用代理功能，避免意外暴露。

#### 安全考虑

| 风险 | 缓解措施 |
|------|---------|
| SSRF（服务端请求伪造） | 仅代理到 `options.url` 的 origin，不允许自定义目标 |
| 敏感信息泄露 | 透传请求头白名单化（仅透传 Accept / User-Agent 等） |
| 无限制的代理滥用 | 默认关闭 `--proxy`，需用户显式启用 |

#### 验证方法

```bash
# 启动 serve 模式（带代理）
pnpm dev:cli https://fanyi.pdf365.cn/?agent=zhihu --adapter playwright --max-assets 500 --serve --proxy

# 打开浏览器访问 http://localhost:8080
# 按 F12 查看 Network 面板：
# 1. 静态资源应返回 200（本地文件）
# 2. API 请求（如 /help/latest?limit=3）应代理到原始服务器并返回 200
# 3. 所有响应头应包含 access-control-allow-origin: *
```

---

## 问题 3 (P3)：Serve 模式缓存控制

### 根因分析

当前 `startStaticServer` 对所有请求返回 `200 OK`，没有设置 `ETag`、`Last-Modified`，也不处理 `If-None-Match` / `If-Modified-Since` 请求头。浏览器无法利用缓存，每次刷新都重新下载所有资源。

### 修复方案

在静态文件响应中添加缓存控制头，并处理条件请求。

**修改位置**：`apps/cli/src/cli.ts` — `startStaticServer` 函数

```typescript
function startStaticServer(rootDir: string, port: number, originUrl?: string): void {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // ...（CORS preflight 处理同上，略）...

    let urlPath = req.url || '/';
    const queryIdx = urlPath.indexOf('?');
    if (queryIdx !== -1) urlPath = urlPath.substring(0, queryIdx);

    const filePath = urlPath.endsWith('/')
      ? join(rootDir, urlPath, 'index.html')
      : join(rootDir, urlPath);

    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // 获取文件状态信息用于条件请求
    try {
      const stats = statSync(filePath);
      const mtime = stats.mtime.toUTCString();
      const etag = `"${stats.size}-${stats.mtimeMs.toString(16)}"`;

      // ── 条件请求处理 ──
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, {
          'etag': etag,
          'last-modified': mtime,
          'cache-control': 'no-cache',
          'access-control-allow-origin': '*',
        });
        res.end();
        return;
      }

      if (req.headers['if-modified-since'] === mtime) {
        res.writeHead(304, {
          'etag': etag,
          'last-modified': mtime,
          'cache-control': 'no-cache',
          'access-control-allow-origin': '*',
        });
        res.end();
        return;
      }

      // ── 正常响应（带缓存头） ──
      const headers: Record<string, string> = {
        'Content-Type': contentType,
        'etag': etag,
        'last-modified': mtime,
        'access-control-allow-origin': '*',
      };

      // HTML 文件不缓存，确保水合后页面为最新
      if (ext === '.html') {
        headers['cache-control'] = 'no-cache';
      } else {
        headers['cache-control'] = 'public, max-age=3600';
      }

      res.writeHead(200, headers);
      createReadStream(filePath).pipe(res);
    } catch {
      // 文件不存在 → 尝试反向代理
      if (originUrl) {
        proxyRequest(originUrl, req, res);
      } else {
        res.writeHead(404, {
          'Content-Type': 'text/plain',
          'access-control-allow-origin': '*',
        });
        res.end('Not Found');
      }
    }
  });

  // ...listen 部分同上...
}
```

#### 缓存策略

| 资源类型 | Cache-Control | 说明 |
|---------|--------------|------|
| HTML（index.html） | `no-cache` | 确保每次请求都验证新鲜度 |
| JS / CSS | `public, max-age=3600` | 缓存 1 小时 |
| 图片 / 字体 | `public, max-age=86400` | 缓存 1 天（可选优化） |
| API 代理响应 | 不设置缓存 | 透传原始服务器的缓存头 |

#### 需要新增 import

```typescript
import { statSync } from 'node:fs';
```

#### 验证方法

```bash
# 启动 serve 模式
pnpm dev:cli https://fanyi.pdf365.cn/?agent=zhihu --adapter playwright --max-assets 500 --serve

# 测试 ETag 条件请求
curl -v -H 'If-None-Match: "xxx"' http://localhost:8080/index.html
# 期望首次返回 200，带上 ETag 后返回 304

# 测试 Last-Modified 条件请求
curl -v --header 'If-Modified-Since: ...' http://localhost:8080/index.html
# 期望如果在修改时间之后则返回 304
```

---

## 实施顺序与依赖关系

| 优先级 | 问题 | 涉及文件 | 预估工时 | 依赖 |
|--------|------|---------|---------|------|
| P0 | 问题 1：CSS 绝对路径重写 | `bundle.ts` | 15min | 无 |
| P2 | 问题 2：Serve 反向代理 | `cli.ts` | 45min | 无 |
| P3 | 问题 3：缓存控制 | `cli.ts` | 20min | 可与 P2 同时实施 |

**推荐实施顺序**：

1. **第一批（P0，独立）**：修复 CSS 绝对路径重写 → 验证快照 CSS 无 404
2. **第二批（P2 + P3，可并行）**：改造静态服务器 → 验证 serve 模式 API 代理 + 缓存
3. **验证**：完整走一遍 `pnpm dev:cli ... --serve --proxy` 端到端流程

### 修改清单总结

| 文件 | 修改内容 |
|------|---------|
| `packages/core/src/output/bundle.ts` | CSS URL 映射构建：增加绝对路径 → 本地路径映射 |
| `apps/cli/src/cli.ts` | `startStaticServer`：增加 CORS、反向代理、缓存控制 |
| `apps/cli/src/cli.ts` | 新增 `proxyRequest` 函数 |
| `apps/cli/src/cli.ts` | `--proxy` 选项声明 |
| `packages/core/src/parser/css-parser.ts` | **无需修改**（方案 A） |