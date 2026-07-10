import { extname } from 'node:path';
import { isValidCachedResponse, mimeFromExt, checkResourceFilter } from './validators.js';
import { type AssetType, type Asset, type AssetRef, type SnapshotOptions, MAX_INLINE_SIZE } from './types.js';
import { runPool } from './worker/pool.js';

export interface FetchResult {
  buffer: Buffer;
  mime: string;
  status: number;
  ok: boolean;
  isHtmlLike: boolean;
}

/**
 * Validate that a URL uses http or https protocol.
 */
function validateUrlScheme(url: string): void {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new Error(`Unsupported protocol: ${u.protocol}`);
    }
  } catch (err: any) {
    throw new Error(`Invalid URL: ${err.message}`);
  }
}

export async function fetchWithTimeout(url: string, timeout: number, referer?: string, maxSize?: number): Promise<FetchResult> {
  validateUrlScheme(url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...(referer ? { Referer: referer } : {}),
      },
    });

    // 先检查 Content-Length 头，避免不必要的下载
    if (maxSize && maxSize > 0) {
      const cl = response.headers.get('content-length');
      if (cl) {
        const size = parseInt(cl, 10);
        if (!isNaN(size) && size > maxSize) {
          throw new SizeLimitError(size, maxSize);
        }
      }
    }

    // 流式读取，边下载边检查大小，超过限制立即中断
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
        // 每次收到数据块都检查大小，超限立即中断
        if (maxSize && maxSize > 0 && totalLength > maxSize) {
          controller.abort();
          throw new SizeLimitError(totalLength, maxSize);
        }
        chunks.push(value);
      }
    }

    // 合并所有数据块为单一 Buffer
    const totalBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      totalBuffer.set(chunk, offset);
      offset += chunk.length;
    }
    const buffer = Buffer.from(totalBuffer);

    return {
      buffer,
      mime: response.headers.get('content-type') || mimeFromExt(url),
      status: response.status,
      ok: response.ok,
      isHtmlLike: response.headers.get('content-type')?.includes('text/html') || false,
    };
  } catch (err: any) {
    if (err instanceof SizeLimitError) throw err;
    throw new Error(err.name === 'AbortError' ? `Timeout after ${timeout}ms` : err.message);
  } finally {
    clearTimeout(timer);
  }
}

export class SizeLimitError extends Error {
  size: number;
  limit: number;
  constructor(size: number, limit: number) {
    super(`File too large: ${size} bytes (max ${limit})`);
    this.name = 'SizeLimitError';
    this.size = size;
    this.limit = limit;
  }
}

function classifyAssetType(url: string, refType: AssetType): AssetType {
  if (refType !== 'other') return refType;
  const ext = extname(url.split('?')[0]).toLowerCase();
  if (['.css'].includes(ext)) return 'css';
  if (['.js', '.mjs'].includes(ext)) return 'js';
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.ico'].includes(ext)) return 'img';
  if (['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext)) return 'font';
  if (['.mp4', '.webm', '.mp3', '.wav', '.mov'].includes(ext)) return 'media';
  return 'other';
}

export async function downloadSingleAsset(
  ref: AssetRef,
  options: SnapshotOptions,
  referer: string,
): Promise<Asset> {
  const asset: Asset = {
    originUrl: ref.url,
    type: classifyAssetType(ref.url, ref.type),
    status: 'pending',
    size: 0,
    mime: '',
  };

  const filterResult = checkResourceFilter(ref.url, options);
  if (filterResult.skip) {
    asset.status = 'skipped';
    asset.error = filterResult.reason;
    return asset;
  }

  const maxAttempts = Math.max(1, options.retryCount);
  const maxSize = options.maxFileSize ?? 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fetchWithTimeout(ref.url, options.timeout, referer, maxSize);

      if (!result.ok) {
        asset.error = `HTTP ${result.status}`;
        if (attempt < maxAttempts) {
          // 指数退避：第 1 次重试等 200ms，第 2 次等 400ms，第 3 次等 800ms，最大 2s
          const delay = Math.min(100 * Math.pow(2, attempt), 2000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        asset.status = 'failed';
        return asset;
      }

      const ext = extname(new URL(ref.url).pathname) || '.bin';
      const filePath = `asset${ext}`;

      if (!isValidCachedResponse(filePath, result.mime, result.buffer)) {
        asset.error = 'Content validation failed';
        if (attempt < maxAttempts) {
          const delay = Math.min(100 * Math.pow(2, attempt), 2000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        asset.status = 'failed';
        return asset;
      }

      asset.status = 'fetched';
      asset.size = result.buffer.length;
      asset.mime = result.mime;

      if (asset.type === 'css' || asset.type === 'js') {
        asset.textContent = result.buffer.toString('utf8');
      }

      if (options.inline && asset.type !== 'css' && asset.type !== 'js') {
        if (result.buffer.length <= MAX_INLINE_SIZE) {
          asset.dataUri = `data:${result.mime};base64,${result.buffer.toString('base64')}`;
        }
      }

      return asset;
    } catch (err: any) {
      if (err instanceof SizeLimitError) {
        asset.status = 'skipped';
        asset.error = err.message;
        return asset;
      }
      asset.error = err.message;
      if (attempt < maxAttempts) {
        const delay = Math.min(100 * Math.pow(2, attempt), 2000);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      asset.status = 'failed';
      return asset;
    }
  }

  asset.status = 'failed';
  return asset;
}

export async function downloadAllAssets(
  refs: AssetRef[],
  options: SnapshotOptions,
  onProgress?: (asset: Asset, index: number, total: number) => void,
): Promise<Asset[]> {
  const total = refs.length;

  // 将每个下载操作包装为独立的任务工厂函数
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
