# 13 — 拉取模块深层缺陷修复

## 概述

聚焦 `fetcher.ts` 及 `assembler.ts` 中调用拉取模块的代码，修复以下问题：

| 编号 | 问题 | 严重程度 | 影响范围 |
|------|------|---------|---------|
| S1.1 | Buffer 合并方式错误 | 中 | 大文件下载后数据损坏 |
| S1.2 | HTML 页面下载无大小限制 | 高 | 大 HTML 页面耗尽内存 |
| S1.3 | CSS 递归下载无大小限制 | 中 | 大型 CSS 文件无限下载 |
| P4.1 | 并发下载无整体超时 | 高 | Worker pool 可能永远挂起 |
| P4.2 | 下载结果顺序不可预测 | 中 | 下游依赖位置索引的代码异常 |
| P4.3 | 重试无指数退避 | 低 | 失败时打服务器，加剧压力 |
| P4.4 | Worker 空 catch 吞掉错误 | 低 | 调试困难，难以定位失败原因 |
| P4.5 | maxAssets 边界检查竞态 | 低 | 可能多下载少量资源 |

## 问题详解与修复方案

### S1.1 — Buffer 合并方式错误（中）

**问题**：`fetcher.ts` 使用 `Buffer.from(totalBuffer.buffer)` 将合并后的 `Uint8Array` 转为 `Buffer`。虽然 `new Uint8Array(n)` 的 `.buffer` 返回的 `ArrayBuffer` 长度通常等于 `n`，但这是实现细节而非规范保证。更安全的做法是直接使用 `Buffer.from(totalBuffer)`，该 API 明确只复制 `Uint8Array` 视图范围内的字节。

```typescript
// 当前代码（有隐患）
const buffer = Buffer.from(totalBuffer.buffer);

// 修复代码
const buffer = Buffer.from(totalBuffer);
```

### S1.2 — HTML 页面下载无大小限制（高）

**问题**：`assembler.ts` 中的 `fetchHtml` 函数调用 `fetchWithTimeout` 时只传递了 `timeout` 参数，没有传递 `maxSize`。如果目标页面是一个巨大的 HTML 文件，会直接下载全部内容到内存中，可能耗尽内存。

**方案**：传递 `options.maxFileSize` 参数。

### S1.3 — CSS 递归下载无大小限制（中）

**问题**：`assembler.ts` 在递归下载 CSS 文件时，也未传递 `maxSize` 参数。Master CSS 文件可能很小，但 `@import` 链中引用的 CSS 文件可能非常大。

**方案**：传递 `options.maxFileSize` 参数。

### W1 — Worker pool 提取为独立子目录（中）

**问题**：`fetcher.ts` 的 `downloadAllAssets` 函数内联了完整的 worker pool 实现（约 50 行），与其他职责（URL 验证、类型分类、重试逻辑）混合在一起，导致：
- `fetcher.ts` 膨胀到 259 行，承担多个不相关的职责
- 并发调度模式无法复用（`assembler.ts` 的 `writeAssets` 使用不同的批处理模式）
- 单元测试难以覆盖并发调度逻辑本身
- 代码边界不清晰，可维护性降低

**方案**：将 worker pool 提取到 `src/worker/pool.ts`，作为通用并发工具。`downloadAllAssets` 变为薄封装层。

```typescript
// src/worker/pool.ts — 通用 worker pool 工具
export async function runPool<T>(
  tasks: (() => Promise<T>)[],
  options: PoolOptions,
  onTaskComplete?: (result: T, index: number, completedCount: number) => void,
): Promise<T[]> {
  const total = tasks.length;
  const maxConcurrent = Math.max(1, Math.min(options.concurrency, total));
  const results: T[] = new Array(total);
  let nextIndex = 0;
  let completedCount = 0;
  let timedOut = false;

  const worker = async (): Promise<void> => {
    while (true) {
      if (timedOut) break;
      const idx = nextIndex++;
      if (idx >= total) break;
      if (options.maxTasks !== undefined && idx >= options.maxTasks) continue;
      const result = await tasks[idx]();
      results[idx] = result;
      completedCount++;
      onTaskComplete?.(result, idx, completedCount);
    }
  };

  const workers = Array.from({ length: maxConcurrent }, () => worker());

  if (options.timeoutMs && options.timeoutMs > 0) {
    const timeoutGuard = new Promise<void>((resolve) => {
      setTimeout(() => { timedOut = true; resolve(); }, options.timeoutMs);
    });
    await Promise.race([Promise.all(workers), timeoutGuard]);
    if (timedOut) {
      // 等待正在执行的任务完成，但不再启动新任务
      await Promise.all(workers);
    }
  } else {
    await Promise.all(workers);
  }

  return results;
}
```

```typescript
// src/fetcher.ts — 重构后的 downloadAllAssets
export async function downloadAllAssets(
  refs: AssetRef[],
  options: SnapshotOptions,
  onProgress?: (asset: Asset, index: number, total: number) => void,
): Promise<Asset[]> {
  const total = refs.length;
  const tasks = refs.map(ref => () => downloadSingleAsset(ref, options, options.url));
  const results = await runPool(tasks, {
    concurrency: options.concurrency,
    maxTasks: options.maxAssets,
    timeoutMs: options.timeout * 2,
  }, (asset, _idx, completedCount) => {
    onProgress?.(asset, completedCount, total);
  });
  return results.filter(Boolean);
}
```

**关键设计决策**：
- 超时使用 `timedOut` 标志位优雅停止，而不是 reject — 保证返回 partial 结果
- 结果按输入索引存储，保持顺序一致
- `maxTasks` 通过索引比较实现，避免竞态
- `onTaskComplete` 回调传递 `completedCount` 而非 `results.length`，修复了预分配数组导致的 progress 显示 bug（原代码中 `results.length` 在预分配后始终等于 `refs.length`，导致进度显示为 `[total/total]`）

### P4.3 — 重试无指数退避（低）

**问题**：`downloadSingleAsset` 中的重试循环在失败后立即发起下一次尝试，没有等待时间。如果服务器过载，立即重试可能加剧服务器压力，导致重试也失败。

**方案**：在重试之间添加指数退避延迟，第 n 次重试等待 `2^n * 100ms`。

```typescript
if (attempt < maxAttempts) {
  const delay = Math.min(100 * Math.pow(2, attempt), 2000);
  await new Promise(resolve => setTimeout(resolve, delay));
  continue;
}
```

## 变更文件清单

| 文件 | 变更内容 | 对应问题 |
|------|---------|---------|
| `src/fetcher.ts` | 修复 Buffer 合并方式 + 添加重试退避 + 重构为 runPool + 修复 progress 计数 | S1.1, P4.3, W1 |
| `src/assembler.ts` | HTML 和 CSS 递归下载传递 maxSize 参数 | S1.2, S1.3 |
| `src/worker/pool.ts` | **新建** — 通用 worker pool 工具 | W1 |

## 验收标准

- [ ] 合并大文件 buffer 时不会产生数据损坏
- [ ] 下载超大 HTML 页面时受 `maxFileSize` 限制保护
- [ ] CSS 递归下载受 `maxFileSize` 限制保护
- [ ] 所有 worker 卡住时，整体超时触发，返回部分结果，进程不挂起
- [ ] 下载结果数组顺序与输入引用数组顺序一致
- [ ] 重试之间有等待时间（指数退避），不立即重试打服务器
- [ ] Worker pool 提取到独立目录，`fetcher.ts` 仅保留下载业务逻辑
- [ ] 实际下载资源数不超过 `maxAssets`
- [ ] Progress 回调显示正确完成计数