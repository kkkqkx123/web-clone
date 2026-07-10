# 12 — 安全性与逻辑缺陷修复

## 概述

基于代码审计发现的安全性和逻辑缺陷，本方案针对性地修复以下问题类别。

## 问题清单与修复方案

### S1 — 大文件下载保护失效（严重）

**问题**：`fetchWithTimeout` 使用 `response.arrayBuffer()` 将整个响应体全部读入内存后才检查大小，导致大文件在到达限制前已完全下载。

**方案**：使用 `ReadableStream` 流式读取，边下载边累积大小，超限立即中断。

```typescript
export async function fetchWithTimeout(url: string, timeout: number, referer?: string, maxSize?: number): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': '...',
        ...(referer ? { Referer: referer } : {}),
      },
    });

    // 先检查 Content-Length
    if (maxSize && maxSize > 0) {
      const cl = response.headers.get('content-length');
      if (cl) {
        const size = parseInt(cl, 10);
        if (!isNaN(size) && size > maxSize) {
          // 立即拒绝，不下载任何数据
          throw new SizeLimitError(size, maxSize);
        }
      }
    }

    // 流式读取，边下载边检查大小
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        totalLength += value.length;
        if (maxSize && maxSize > 0 && totalLength > maxSize) {
          controller.abort(); // 中断下载
          throw new SizeLimitError(totalLength, maxSize);
        }
        chunks.push(value);
      }
    }

    // 合并所有块
    const totalBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      totalBuffer.set(chunk, offset);
      offset += chunk.length;
    }
    const buffer = Buffer.from(totalBuffer.buffer);

    // ... 后续处理
  }
}
```

### L1 — `extractInlineJs` 正则表达式 Bug（严重）

**问题**：正则 `/<script[^>]*(?!src=)(?:[^>]*)>([\s\S]*?)<\/script>/gi` 的负向先行断言位置错误，导致所有 `<script>` 标签都被匹配，包括外部脚本。

**方案**：重写正则，使用更精确的匹配逻辑。

```typescript
function extractInlineJs(html: string): string {
  let js = '';
  // 匹配不带 src 属性的 <script> 标签
  // 使用负向先行断言确保 src 不出现在标签中
  const scriptRegex = /<script(?:\s+(?!src\b)[^>]*)*\s*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    js += match[1] + '\n';
  }
  return js;
}
```

### S4 — 输出 HTML 泄露完整 URL（高）

**问题**：`data-origin-url` 和 `data-snapshot-id` 属性在最终输出中保留，泄露完整 URL。

**方案**：在输出前清理这些属性。

在 `assembleBundle` 和 `assembleSingleFile` 中，序列化 HTML 前移除 `data-snapshot-id` 和 `data-origin-url` 属性：

```typescript
// 清理 snapshot 属性
for (const el of document.querySelectorAll('[data-snapshot-id]')) {
  el.removeAttribute('data-snapshot-id');
  el.removeAttribute('data-origin-url');
}
```

### S5 — HTML 转义不完整（低）

**问题**：`esc` 函数未转义单引号。

**方案**：补充单引号转义。

```typescript
function esc(s: string): string {
  return s.replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
}
```

### S3 — 无 URL Scheme 验证（中）

**问题**：`resolveUrl` 只过滤了 `data:`、`blob:`、`javascript:`、`mailto:`，未限制仅允许 `http:` 和 `https:`。

**方案**：在 `fetchWithTimeout` 和 `resolveUrl` 中添加 scheme 验证。

```typescript
// 在 fetchWithTimeout 入口处验证
function validateUrl(url: string): void {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new Error(`Unsupported protocol: ${u.protocol}`);
    }
  } catch (err: any) {
    throw new Error(`Invalid URL: ${err.message}`);
  }
}
```

### L3 — Single File 模式 CSS/JS 匹配使用错误 URL（高）

**问题**：`assembleSingleFile` 使用 `href` 属性值（相对路径）匹配 `cssContentMap`，但 map 的键是绝对 URL。

**方案**：使用 `data-origin-url` 属性（绝对 URL）来匹配。

```typescript
// 使用 data-origin-url 查找 CSS 内容
const linkSelectors = [...document.querySelectorAll('link[rel="stylesheet"][data-origin-url]')];
for (const link of linkSelectors) {
  const originUrl = link.getAttribute('data-origin-url');
  if (!originUrl) continue;
  const cssText = cssContentMap.get(originUrl) || '';
  if (!cssText) continue;
  // ...
}
```

### L7 — CSS 验证产生大量误报（中）

**问题**：`postDownloadValidation` 检查 CSS 是否包含 `url(...)` 引用，正常 CSS 几乎一定包含，产生大量无意义警告。

**方案**：改为检查 `url()` 引用的本地资源是否实际存在，或移除该检查项。

```typescript
// 移除此检查项，或改为检查 CSS 中的 url() 是否指向已下载的资源
// 简单方案：移除该检查（当前没有简单手段验证远程引用是否"缺失"）
```

### P4 — 并发下载信号量死锁风险（中）

**问题**：`Promise.race` + `Set` 模式在异常路径可能死锁。

**方案**：使用更健壮的并发控制模式。

```typescript
export async function downloadAllAssets(
  refs: AssetRef[],
  options: SnapshotOptions,
  onProgress?: (asset: Asset, index: number, total: number) => void,
): Promise<Asset[]> {
  const results: Asset[] = [];
  const total = refs.length;
  const maxConcurrent = Math.max(1, Math.min(options.concurrency, refs.length));

  // 使用队列 + 固定 worker 的模式
  let index = 0;
  const workers = Array.from({ length: maxConcurrent }, async () => {
    while (index < refs.length && results.length < options.maxAssets) {
      const ref = refs[index++];
      try {
        const asset = await downloadSingleAsset(ref, options, options.url);
        results.push(asset);
        onProgress?.(asset, results.length, total);
      } catch (err: any) {
        // 单个下载失败不影响其他 worker
      }
    }
  });

  await Promise.all(workers);
  return results;
}
```

## 变更文件清单

| 文件 | 变更内容 | 对应问题 |
|------|---------|---------|
| `src/fetcher.ts` | 流式读取 + 大小限制 + 并发控制重写 | S1, P4 |
| `src/assembler.ts` | 修复 `extractInlineJs` 正则 | L1 |
| `src/output/bundle.ts` | 清理 `data-origin-url`/`data-snapshot-id` + 单引号转义 | S4, S5 |
| `src/output/single-file.ts` | 使用 `data-origin-url` 匹配 CSS/JS | L3 |
| `src/parser/url-resolver.ts` | 添加 URL scheme 验证 | S3 |
| `src/fetcher.ts` | 添加 URL scheme 验证 | S3 |
| `src/validators.ts` | 修复 CSS 验证误报 | L7 |

## 验收标准

- [ ] 下载大文件时，超过大小限制立即中断，不浪费带宽
- [ ] `extractInlineJs` 不再提取外部脚本内容
- [ ] 输出 HTML 中不包含 `data-origin-url` 和 `data-snapshot-id`
- [ ] `esc` 函数正确处理单引号
- [ ] 不支持 `file://`/`ftp://` 等非 HTTP 协议
- [ ] Single file 模式 CSS/JS 正确内联
- [ ] CSS 验证不再产生无意义的 `url()` 警告
- [ ] 并发下载在异常情况下不会死锁