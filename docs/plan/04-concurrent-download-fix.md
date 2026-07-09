# 04 — 并发下载修复与增强

## 问题

`fetcher.ts` 中的 `downloadAllAssets` 存在一个并发的 bug：

```typescript
// fetcher.ts:126 — 最后硬编码的 `1` 导致并发数永远为 1
const workers = Array.from({ length: Math.min(options.concurrency, queue.length, 1) }, async () => {
```

`Math.min(options.concurrency, queue.length, 1)` 中的 `1` 确保最小值恒为 1，这意味着无论 `--concurrency` 设置为多少，实际下载始终是**串行**的。

## 方案

### 修复并发 bug

```typescript
// 修复前
const workers = Array.from({ length: Math.min(options.concurrency, queue.length, 1) }, ...);

// 修复后
const workerCount = Math.max(1, Math.min(options.concurrency, queue.length));
const workers = Array.from({ length: workerCount }, ...);
```

### 增强：自适应并发

```typescript
async function downloadAllAssets(
    refs: AssetRef[],
    options: SnapshotOptions,
    onProgress?: (asset: Asset, index: number, total: number) => void,
): Promise<Asset[]> {
    const results: Asset[] = [];
    const queue = [...refs];
    const total = queue.length;
    const maxConcurrent = Math.max(1, Math.min(options.concurrency, queue.length));

    // 使用 Semaphore 模式控制并发
    const inFlight = new Set<Promise<void>>();

    while (queue.length > 0 || inFlight.size > 0) {
        // 填充并发槽位
        while (queue.length > 0 && inFlight.size < maxConcurrent) {
            const ref = queue.shift()!;
            const promise = downloadSingleAsset(ref, options, options.url)
                .then(asset => {
                    results.push(asset);
                    onProgress?.(asset, results.length, total);
                })
                .finally(() => inFlight.delete(promise));
            inFlight.add(promise);
        }

        // 等待任意一个完成
        if (inFlight.size > 0) {
            await Promise.race(inFlight);
        }
    }

    return results;
}
```

### 增强：分块流式写入

对于大文件（>10MB），在下载过程中边下载边写入，避免全部缓存在内存中：

```typescript
const STREAMING_THRESHOLD = 10 * 1024 * 1024; // 10MB

async function downloadSingleAsset(
    ref: AssetRef,
    options: SnapshotOptions,
    referer: string,
): Promise<Asset> {
    // ... 现有逻辑 ...

    // 对大文件使用流式下载
    if (ref.type === 'js' || ref.type === 'css') {
        // 估计大小，如果 URL 指向大文件则流式处理
        // 实际大小需在响应头中获取 Content-Length
    }
}
```

### 风险与注意事项

- 修复后并发数实际生效，网络带宽可能成为瓶颈
- 默认并发数（6）对大多数场景合适，过高的并发可能导致源站限流
- 自适应并发中的 `Promise.race` 模式比批量 `Promise.all` 更平滑，但略复杂

### 验收标准

- [ ] `--concurrency 4` 实际启动 4 个并发下载
- [ ] 下载速度与并发数成正比提升
- [ ] 所有现有测试通过