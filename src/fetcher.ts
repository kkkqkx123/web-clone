import { extname } from 'node:path';
import { request as httpRequest, Agent as HttpAgent } from 'node:http';
import { request as httpsRequest, Agent as HttpsAgent, type RequestOptions } from 'node:https';
import type { Agent, IncomingMessage } from 'node:http';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { isValidCachedResponse, mimeFromExt, checkResourceFilter } from './validators.js';
import { type AssetType, type Asset, type AssetRef, type SnapshotOptions, MAX_INLINE_SIZE } from './types.js';
import { runPool } from './worker/pool.js';

const MAX_REDIRECTS = 10;

/**
 * Resolve proxy agent for a given URL based on environment variables.
 * Supports HTTPS_PROXY / HTTP_PROXY / NO_PROXY (and lowercase variants).
 */
function resolveProxyAgent(url: string): Agent | undefined {
  const urlObj = new URL(url);
  const host = urlObj.hostname;
  const isHttps = urlObj.protocol === 'https:';

  const noProxy = process.env.NO_PROXY ?? process.env.no_proxy ?? '';
  if (noProxy) {
    const noProxyList = noProxy.split(',').map(s => s.trim());
    if (noProxyList.some((p: string) => host === p || host.endsWith('.' + p))) {
      return undefined; // bypass proxy
    }
  }

  const proxyUrl = isHttps
    ? (process.env.HTTPS_PROXY ?? process.env.https_proxy ?? process.env.HTTP_PROXY ?? process.env.http_proxy ?? '')
    : (process.env.HTTP_PROXY ?? process.env.http_proxy ?? process.env.HTTPS_PROXY ?? process.env.https_proxy ?? '');

  if (!proxyUrl) return undefined;

  // HttpsProxyAgent for HTTPS targets (CONNECT tunnel through HTTP proxy)
  // HttpProxyAgent for HTTP targets (direct proxy forwarding)
  return isHttps
    ? new HttpsProxyAgent(proxyUrl) as unknown as Agent
    : new HttpProxyAgent(proxyUrl) as unknown as Agent;
}

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
  } catch (err: unknown) {
    throw new Error(`Invalid URL: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
}

/**
 * Normalize a single header value from http.IncomingHttpHeaders to string.
 */
function headerValue(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0];
  return val ?? '';
}

export async function fetchWithTimeout(
  url: string,
  timeout: number,
  referer?: string,
  maxSize?: number,
  redirectCount = 0,
): Promise<FetchResult> {
  validateUrlScheme(url);

  const urlObj = new URL(url);
  const isHttps = urlObj.protocol === 'https:';
  const requestFn = isHttps ? httpsRequest : httpRequest;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  timer.unref(); // Don't let the abort timer keep the event loop alive

  return new Promise<FetchResult>((resolve, reject) => {
    const proxyAgent = resolveProxyAgent(url);

    // Use a dedicated Agent with keepAlive: false to prevent idle sockets
    // from keeping the Node.js event loop alive (Node.js 19+ defaults to
    // keepAlive: true with freeSocketTimeout: 30s).
    const AgentClass = isHttps ? HttpsAgent : HttpAgent;
    const httpAgent = proxyAgent || new AgentClass({ keepAlive: false, maxSockets: Infinity });

    const options: RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      timeout,  // Socket-level timeout (fallback if AbortController signal doesn't work)
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...(referer ? { Referer: referer } : {}),
      },
      signal: controller.signal,
      agent: httpAgent,
    };

    const req = requestFn(options, (res: IncomingMessage) => {
      const statusCode = res.statusCode ?? 0;

      // Handle redirects (up to MAX_REDIRECTS)
      if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
        clearTimeout(timer);
        const redirectUrl = new URL(res.headers.location, url).href;
        if (redirectCount >= MAX_REDIRECTS) {
          reject(new Error(`Too many redirects for ${url}`));
          return;
        }
        // Consume the response body to free memory, then follow redirect
        res.resume();
        fetchWithTimeout(redirectUrl, timeout, referer, maxSize, redirectCount + 1)
          .then(resolve, reject);
        return;
      }

      // Check Content-Length header before reading
      if (maxSize && maxSize > 0) {
        const cl = res.headers['content-length'];
        if (cl) {
          const size = parseInt(Array.isArray(cl) ? cl[0] : cl, 10);
          if (!isNaN(size) && size > maxSize) {
            clearTimeout(timer);
            res.resume(); // drain to prevent memory leak
            reject(new SizeLimitError(size, maxSize));
            return;
          }
        }
      }

      const chunks: Buffer[] = [];
      let totalLength = 0;

      res.on('data', (chunk: Buffer) => {
        totalLength += chunk.length;
        if (maxSize && maxSize > 0 && totalLength > maxSize) {
          clearTimeout(timer);
          controller.abort();
          req.destroy();
          reject(new SizeLimitError(totalLength, maxSize));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        clearTimeout(timer);
        const buffer = Buffer.concat(chunks);
        const contentType = headerValue(res.headers['content-type']) || mimeFromExt(url);

        resolve({
          buffer,
          mime: contentType,
          status: statusCode,
          ok: statusCode >= 200 && statusCode < 300,
          isHtmlLike: contentType.includes('text/html'),
        });
      });

      res.on('error', (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });

      // Guard: if the server closes the connection without firing 'end',
      // the promise would hang forever (the AbortController may not always
      // destroy the response stream). This handler ensures we always clean up.
      res.on('close', () => {
        clearTimeout(timer);
        // Only reject if the promise hasn't settled yet
        const err = new Error(`Connection closed prematurely for ${url}`);
        reject(err);
      });
    });

    req.on('error', (err: Error) => {
      clearTimeout(timer);
      if (err.name === 'AbortError' || (err as any).code === 'ABORT_ERR') {
        reject(new Error(`Timeout after ${timeout}ms`));
      } else {
        reject(err);
      }
    });

    // Socket timeout handler: the 'timeout' option above only sets the
    // socket timeout timer — it does NOT destroy the socket. We must
    // explicitly destroy it and reject the promise.
    req.on('timeout', () => {
      clearTimeout(timer);
      req.destroy(new Error(`Socket timeout after ${timeout}ms for ${url}`));
    });

    req.end();
  });
}

/**
 * Calculate retry backoff delay with configurable initial/max values.
 * Uses exponential backoff: initialDelay * 2^attempt, capped at maxDelay.
 */
function retryDelay(attempt: number, initialDelay: number, maxDelay: number): number {
  return Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
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
    // Track slow fetch so the user never sees a silent hang.
    let slowWarningTimer: ReturnType<typeof setTimeout> | undefined;

    try {
      slowWarningTimer = setTimeout(() => {
        process.stdout.write(`  Waiting for response from ${ref.url}...\n`);
      }, 2000);

      const result = await fetchWithTimeout(ref.url, options.timeout, referer, maxSize);
      clearTimeout(slowWarningTimer);
      slowWarningTimer = undefined;

      const ext = extname(new URL(ref.url).pathname) || '.bin';
      const filePath = `asset${ext}`;

      // Content-first validation: check if response content is valid for the asset type
      const isContentValid = isValidCachedResponse(filePath, result.mime, result.buffer);

      // Determine if the status code is acceptable
      // - Always accept 2xx
      // - Strict mode: require 2xx for all asset types
      // - Lenient mode (default): For CSS/JS: accept 4xx/5xx if content is valid and not HTML (likely error pages with actual CSS/JS content)
      // - For img/font: accept 4xx/5xx if content is valid (magic bytes or MIME check passes)
      // - For other types: always require 2xx
      const isAcceptableStatus = options.strictStatusCodes
        ? result.ok  // Strict: only 2xx
        : (result.ok ||
           (asset.type === 'css' && isContentValid && !result.isHtmlLike) ||
           (asset.type === 'js' && isContentValid && !result.isHtmlLike) ||
           ((asset.type === 'img' || asset.type === 'font') && isContentValid));

      if (!isAcceptableStatus) {
        const detail = result.isHtmlLike
          ? `HTML error page (${result.buffer.length} B)`
          : `${result.mime} (${result.buffer.length} B)`;
        asset.error = `HTTP ${result.status} ${detail}`;
        if (attempt < maxAttempts) {
          const delay = retryDelay(attempt, options.retryInitialDelay ?? 200, options.retryMaxDelay ?? 2000);
          process.stdout.write(`  Retry ${attempt}/${maxAttempts} for ${ref.url} (${asset.error}, retry in ${delay}ms)\n`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        asset.status = 'failed';
        return asset;
      }

      if (!isContentValid) {
        const detail = result.isHtmlLike
          ? `HTML content for ${ext} extension`
          : `content type mismatch (${result.mime})`;
        asset.error = `Content validation failed: ${detail}`;
        if (attempt < maxAttempts) {
          const delay = retryDelay(attempt, options.retryInitialDelay ?? 200, options.retryMaxDelay ?? 2000);
          process.stdout.write(`  Retry ${attempt}/${maxAttempts} for ${ref.url} (${asset.error}, retry in ${delay}ms)\n`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        asset.status = 'failed';
        return asset;
      }

      asset.status = 'fetched';
      asset.size = result.buffer.length;
      asset.mime = result.mime;
      asset.statusCode = result.status;

      // Mark if this resource was accepted with non-2xx status code
      if (!result.ok && (asset.type === 'css' || asset.type === 'js' || asset.type === 'img' || asset.type === 'font')) {
        asset.acceptedWithWarning = true;
      }

      if (asset.type === 'css' || asset.type === 'js') {
        asset.textContent = result.buffer.toString('utf8');
      }

      if (options.inline && asset.type !== 'css' && asset.type !== 'js') {
        if (result.buffer.length <= MAX_INLINE_SIZE) {
          asset.dataUri = `data:${result.mime};base64,${result.buffer.toString('base64')}`;
        }
      }

      return asset;
    } catch (err: unknown) {
      // Clear the slow-fetch timer if the fetch failed early
      if (slowWarningTimer !== undefined) {
        clearTimeout(slowWarningTimer);
      }
      if (err instanceof SizeLimitError) {
        asset.status = 'skipped';
        asset.error = err.message;
        return asset;
      }
      const message = err instanceof Error ? err.message : String(err);
      asset.error = message;
      if (attempt < maxAttempts) {
        const delay = retryDelay(attempt, options.retryInitialDelay ?? 200, options.retryMaxDelay ?? 2000);
        process.stdout.write(`  Retry ${attempt}/${maxAttempts} for ${ref.url} (${message}, retry in ${delay}ms)\n`);
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

  // Wrap each download operation as a separate task factory function
  const tasks = refs.map(ref => () => downloadSingleAsset(ref, options, options.url));

  // NOTE: Pool timeout is intentionally NOT set here.
  // maxAssets limits the number of tasks via maxTasks. Each individual task
  // has its own per-resource timeout (fetchWithTimeout's AbortController).
  // An additional pool-level timeout would conflate the asset limit with
  // a wall-clock deadline, causing premature truncation of downloads.
  const results = await runPool(tasks, {
    concurrency: options.concurrency,
    maxTasks: options.maxAssets,
  }, (asset, _idx, completedCount) => {
    onProgress?.(asset, completedCount, total);
  });

  return results.filter(Boolean);
}
