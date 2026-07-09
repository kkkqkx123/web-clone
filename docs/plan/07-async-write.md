# 07 — 异步写入与进度控制

## 问题

`assembler.ts` 在写入大文件时使用同步操作，导致事件循环阻塞：

```typescript
// assembler.ts:170-189 — 同步写入
if (options.mode === 'bundle') {
    mkdirSync(options.output, { recursive: true });
    assembleBundle(parsed.document, assets, options);

    for (const a of assets) {
        if (a.status === 'fetched' && a.localPath) {
            mkdirSync(dirname(a.localPath), { recursive: true });
            const buf = ...;
            writeFileSync(a.localPath, buf);  // 同步写入，大文件阻塞
        }
    }
}
```

ModelScope 测试中，50 个资产（含 9.3MB 的字体文件）的同步写入累计耗时显著。

## 方案

### 1. 异步文件写入

```typescript
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

async function writeAssets(assets: Asset[], options: SnapshotOptions): Promise<void> {
    const writePromises = assets
        .filter(a => a.status === 'fetched' && a.localPath)
        .map(async (a) => {
            const dir = dirname(a.localPath!);
            await mkdir(dir, { recursive: true });

            const buf = a.dataUri
                ? Buffer.from(a.dataUri.split(',')[1]!, 'base64')
                : a.textContent
                    ? Buffer.from(a.textContent, 'utf8')
                    : Buffer.alloc(0);

            return writeFile(a.localPath!, buf);
        });

    // 并发写入，但限制最大并发数避免 file descriptor 耗尽
    const MAX_CONCURRENT_WRITES = 10;
    for (let i = 0; i < writePromises.length; i += MAX_CONCURRENT_WRITES) {
        await Promise.all(writePromises.slice(i, i + MAX_CONCURRENT_WRITES));
    }
}
```

### 2. 大文件流式写入

对于大文件，使用流式写入避免内存中都存一份：

```typescript
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';

async function writeAssetStreamed(a: Asset): Promise<void> {
    await mkdir(dirname(a.localPath!), { recursive: true });

    return new Promise((resolve, reject) => {
        const writeStream = createWriteStream(a.localPath!);
        const readable = a.dataUri
            ? Readable.from(Buffer.from(a.dataUri.split(',')[1]!, 'base64'))
            : a.textContent
                ? Readable.from(a.textContent, 'utf8')
                : Readable.from(Buffer.alloc(0));

        readable.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
    });
}
```

### 3. 进度报告

```typescript
async function writeAssetsWithProgress(assets: Asset[]): Promise<void> {
    const toWrite = assets.filter(a => a.status === 'fetched' && a.localPath);
    let written = 0;

    const writeOne = async (a: Asset) => {
        await writeAssetStreamed(a);
        written++;
        // 每 10% 或每 10 个文件报告一次进度
        if (written % Math.max(1, Math.floor(toWrite.length / 10)) === 0) {
            process.stdout.write(`  Writing assets: ${written}/${toWrite.length}\n`);
        }
    };

    // 分批并发写入
    const batchSize = 5;
    for (let i = 0; i < toWrite.length; i += batchSize) {
        await Promise.all(toWrite.slice(i, i + batchSize).map(writeOne));
    }
}
```

### 变更文件

| 文件 | 变更 |
|------|------|
| `src/assembler.ts` | 改为异步写入，集成进度报告 |

### 验收标准

- [ ] 大文件写入不阻塞事件循环
- [ ] 写入进度对用户可见
- [ ] 所有现有测试通过