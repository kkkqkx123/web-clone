# `--serve` 模式 — 本地静态文件服务器

> 用于在快照完成后启动本地 HTTP 服务器提供静态文件服务，避免 `file://` 协议的安全限制。
> 实现位置：`apps/cli/src/cli.ts` lines 159-172, 327-387

## 使用方式

```bash
# 快照完成后启动服务器（默认端口 8080）
pnpm dev:cli <url> --adapter playwright --serve

# 指定端口
pnpm dev:cli <url> --adapter playwright --serve --serve-port 3000
```

## 解决的问题

浏览器将 `file://` 视为唯一安全来源，限制以下 API：

- `fetch()` / `XMLHttpRequest` — 跨域请求被拦截
- `import()` — 动态模块加载受限
- webpack 动态创建 `<script>` 标签加载 chunk 时可能受限

通过本地 HTTP 服务器提供快照文件，所有资源通过 `http://localhost:<port>` 加载，不受上述限制。

## CLI 参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `--serve` | boolean | 无 | 启动本地 HTTP 服务器 |
| `--serve-port` | number | 8080 | 服务器端口 |

## 实现架构

### 1. CLI 集成（`cli.ts` lines 159-172）

快照完成后，根据 `opts.serve` 标志决定是否启动服务器：

```typescript
if (opts.serve && !isLocal) {
  const port = opts.servePort ? parseInt(opts.servePort, 10) : 8080;
  if (Number.isFinite(port) && port > 0 && port < 65536) {
    startStaticServer(options.output, port);
  } else {
    console.error(chalk.red(`Invalid --serve-port: "${opts.servePort}". Using 8080.`));
    startStaticServer(options.output, 8080);
  }
} else {
  process.exit(0);  // 非 serve 模式直接退出
}
```

### 2. 静态文件服务器（`cli.ts` lines 357-387）

基于 `node:http` 的轻量级静态文件服务器：

```typescript
function startStaticServer(rootDir: string, port: number): void {
  const server = createServer((req, res) => {
    let urlPath = req.url || '/';
    // 去除查询字符串
    const queryIdx = urlPath.indexOf('?');
    if (queryIdx !== -1) urlPath = urlPath.substring(0, queryIdx);

    // 目录路径默认返回 index.html
    const filePath = urlPath.endsWith('/')
      ? join(rootDir, urlPath, 'index.html')
      : join(rootDir, urlPath);

    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const stream = createReadStream(filePath);
    stream.on('open', () => {
      res.writeHead(200, { 'Content-Type': contentType });
      stream.pipe(res);
    });
    stream.on('error', () => {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });
  });

  server.listen(port, () => {
    process.stdout.write(`\n  Snapshot served at: http://localhost:${port}\n`);
    process.stdout.write(`  Press Ctrl+C to stop.\n\n`);
  });
}
```

### 3. MIME 类型映射（`cli.ts` lines 331-355）

支持的类型：

| 类别 | 扩展名 |
|------|--------|
| HTML | `.html` |
| JavaScript | `.js`, `.mjs`, `.cjs` |
| CSS | `.css` |
| JSON | `.json` |
| 图片 | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.ico` |
| 字体 | `.woff`, `.woff2`, `.ttf`, `.otf`, `.eot` |
| 其他 | `.wasm`, `.mp4`, `.webm`, `.mp3`, `.wav` |

## 已知限制

1. **CSS 中绝对路径引用未正确重写**：CSS 文件中使用 `url(/_nuxt/fonts/xxx.woff)` 等绝对路径引用资源，但 `rewriteCssUrls` 只替换完整 URL（`https://...`），不匹配绝对路径格式，导致字体/SVG 等资源 404。

2. **无 API 代理**：快照页面中的 Vue 组件在水合后可能发起实时 API 请求到原始服务器（如 `https://fanyi.pdf365.cn/help/latest?limit=3`），因 CORS 策略被浏览器拦截。当前服务器不提供反向代理功能。

3. **无 `304 Not Modified` 缓存**：所有文件请求都返回 `200 OK`，未实现条件请求头 (`If-Modified-Since`, `ETag`)。

4. **路径穿越防护**：依赖 `node:path.join` 的默认行为，未显式校验请求路径是否在 `rootDir` 范围内。