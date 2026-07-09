import { extname } from 'node:path';
import { isValidCachedResponse, mimeFromExt, checkResourceFilter } from './validators.js';
import { type AssetType, type Asset, type AssetRef, type SnapshotOptions, MAX_INLINE_SIZE } from './types.js';

export interface FetchResult {
  buffer: Buffer;
  mime: string;
  status: number;
  ok: boolean;
  isHtmlLike: boolean;
}

export async function fetchWithTimeout(url: string, timeout: number, referer?: string, maxSize?: number): Promise<FetchResult> {
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

    if (maxSize && maxSize > 0) {
      const cl = response.headers.get('content-length');
      if (cl) {
        const size = parseInt(cl, 10);
        if (!isNaN(size) && size > maxSize) {
          throw new SizeLimitError(size, maxSize);
        }
      }
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (maxSize && maxSize > 0 && buffer.length > maxSize) {
      throw new SizeLimitError(buffer.length, maxSize);
    }

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
        if (attempt < maxAttempts) continue;
        asset.status = 'failed';
        return asset;
      }

      const ext = extname(new URL(ref.url).pathname) || '.bin';
      const filePath = `asset${ext}`;

      if (!isValidCachedResponse(filePath, result.mime, result.buffer)) {
        asset.error = 'Content validation failed';
        if (attempt < maxAttempts) continue;
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
      if (attempt < maxAttempts) continue;
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
  const results: Asset[] = [];
  const queue = [...refs];
  const total = queue.length;
  const maxConcurrent = Math.max(1, Math.min(options.concurrency, queue.length));

  // Semaphore pattern: Use Promise.race to control concurrency
  const inFlight = new Set<Promise<void>>();

  while (queue.length > 0 || inFlight.size > 0) {
    // Fill concurrent slots
    while (queue.length > 0 && inFlight.size < maxConcurrent && results.length < options.maxAssets) {
      const ref = queue.shift()!;
      const promise = downloadSingleAsset(ref, options, options.url)
        .then(asset => {
          results.push(asset);
          onProgress?.(asset, results.length, total);
        })
        .finally(() => inFlight.delete(promise));
      inFlight.add(promise);
    }

    // Wait for any one to complete
    if (inFlight.size > 0) {
      await Promise.race(inFlight);
    }
  }

  return results;
}
