# 06 — URL 分类与命名优化

## 问题

`bundle.ts` 中的 `isRoutePath` 函数通过检查 URL 路径是否有扩展名来判断是否为"路由路径"：

```typescript
function isRoutePath(url: string): boolean {
    try {
        const pathname = new URL(url).pathname;
        return extname(pathname) === '';
    } catch {
        return false;
    }
}
```

对于带查询参数的 URL（如 Google Tag Manager 的 `/gtag/js?id=G-K9CSTSKFC5`），`extname` 检查的是 `pathname` 而非完整的 URL 路径，导致：

- `/gtag/js?id=G-K9CSTSKFC5` → `pathname` 为 `/gtag/js` → 无扩展名 → 被识别为路由路径
- 输出为 `index.html` 而非正确的 `gtag.js`
- 浏览器打开时因 MIME 类型错误而无法加载

## 方案

### 1. 优先使用 Content-Type 和 URL 语义

```typescript
function classifyAssetFilename(url: string, mime: string, index: number): string {
    try {
        const u = new URL(url);
        let pathname = u.pathname.replace(/^\/+/, '') || 'index';

        // 1. 基于 Content-Type 推断扩展名
        const extFromMime = extnameFromMime(mime);
        if (extFromMime) {
            // 替换或追加扩展名
            const existingExt = extname(pathname);
            if (existingExt && existingExt !== extFromMime) {
                // 已有扩展名但不同，追加
                return pathname + extFromMime;
            }
            if (!existingExt) {
                return pathname + extFromMime;
            }
        }

        // 2. 基于 URL 路径和查询参数推断
        // 处理 /gtag/js?id=xxx → gtag.js
        const lastSegment = pathname.split('/').pop() || 'index';
        if (lastSegment === 'js' && u.searchParams.toString()) {
            return `gtag_${index}.js`;
        }

        return pathname || `asset_${index}`;
    } catch {
        return `asset_${index}${extname(url.split('?')[0]) || '.bin'}`;
    }
}

function extnameFromMime(mime: string): string | null {
    const map: Record<string, string> = {
        'text/css': '.css',
        'application/javascript': '.js',
        'text/javascript': '.js',
        'application/x-javascript': '.js',
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/gif': '.gif',
        'image/svg+xml': '.svg',
        'image/webp': '.webp',
        'image/x-icon': '.ico',
        'font/woff': '.woff',
        'font/woff2': '.woff2',
        'font/ttf': '.ttf',
        'font/opentype': '.otf',
    };
    return map[mime] || null;
}
```

### 2. 保留 `isRoutePath` 但严格化

```typescript
function isRoutePath(url: string): boolean {
    try {
        const u = new URL(url);
        // 路由路径的判断标准：
        // 1. pathname 无扩展名
        // 2. 且不以常见文件名格式结尾（如 /api/xxx, /page/）
        // 3. 且 Content-Type 是 text/html 或未知
        const pathname = u.pathname.replace(/\/+$/, '');
        const ext = extname(pathname);
        if (ext) return false; // 有扩展名 → 文件

        // 检查最后一个路径段，如果看起来像文件名（无扩展名但有参数），不是路由
        const lastSegment = pathname.split('/').pop() || '';
        if (lastSegment && u.search && !lastSegment.includes('.')) {
            // 如 /gtag/js?id=xxx → 不是路由
            // 如 /page/123 → 可能是路由
            // 保守判断：有查询参数且最后一段较短 → 文件
            if (lastSegment.length < 10 && u.search) return false;
        }

        return true;
    } catch {
        return false;
    }
}
```

### 3. 结合 MIME 类型做最终判断

在 `assembleBundle` 中结合下载后的 MIME 信息：

```typescript
// 如果下载后知道是 JS 文件，但之前被归类为路由，修正文件名
if (a.type === 'js' && a.localPath?.endsWith('.html')) {
    // 修正为 .js 扩展名
    a.localPath = a.localPath.replace(/\.html$/, '.js');
}
```

### 变更文件

| 文件 | 变更 |
|------|------|
| `src/output/bundle.ts` | 重写 `isRoutePath`/`classifyAssetFilename`，增加 MIME 推断 |

### 验收标准

- [ ] Google Tag Manager URL (`/gtag/js?id=xxx`) 输出为 `.js` 而非 `.html`
- [ ] 真正的路由路径（如 `/user/profile`）仍然输出为 `index.html`
- [ ] 所有现有测试通过