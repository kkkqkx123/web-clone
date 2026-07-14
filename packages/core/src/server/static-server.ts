/**
 * Snapshot static file server with cache control and optional reverse proxy.
 *
 * Provides:
 * - Static file serving with ETag / Last-Modified cache control
 * - Conditional request handling (304 Not Modified)
 * - CORS headers on all responses
 * - Optional reverse proxy for runtime API requests (--proxy mode)
 */

import { createReadStream, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

// ── MIME types ──────────────────────────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

// ── Types ───────────────────────────────────────────────────────────────────

export interface SnapshotServerOptions {
  /** Port to listen on */
  port: number;
  /** Original source URL for reverse proxy (required when proxy is enabled) */
  originUrl?: string;
  /** Enable reverse proxy for runtime API requests (requires originUrl) */
  proxy?: boolean;
}

// ── Proxy helper ────────────────────────────────────────────────────────────

/**
 * Reverse proxy: forward an incoming request to the target origin.
 * Used in --serve --proxy mode to handle runtime API requests from
 * hydrated Vue/Nuxt components.
 */
function proxyRequest(
  targetOrigin: string,
  req: IncomingMessage,
  res: ServerResponse,
): void {
  let urlObj: URL;
  try {
    urlObj = new URL(targetOrigin);
  } catch {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Invalid proxy target origin');
    return;
  }

  const isHttps = urlObj.protocol === 'https:';
  const proxyPath = req.url || '/';

  const proxyOptions = {
    hostname: urlObj.hostname,
    port: urlObj.port || (isHttps ? 443 : 80),
    path: proxyPath,
    method: req.method || 'GET',
    headers: {
      ...(req.headers['accept'] ? { 'Accept': req.headers['accept'] } : {}),
      ...(req.headers['accept-language'] ? { 'Accept-Language': req.headers['accept-language'] } : {}),
      ...(req.headers['user-agent'] ? { 'User-Agent': req.headers['user-agent'] } : {}),
      ...(req.headers['referer'] ? { 'Referer': req.headers['referer'] } : {}),
      ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] } : {}),
      ...(req.headers['content-length'] ? { 'Content-Length': req.headers['content-length'] } : {}),
      'Host': urlObj.hostname,
    },
    timeout: 30000,
  };

  const proxyReq = (isHttps ? httpsRequest : httpRequest)(proxyOptions, (proxyRes) => {
    // Add CORS headers to the proxied response
    const headers: Record<string, string | string[]> = {
      ...proxyRes.headers,
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': '*',
    };

    res.writeHead(proxyRes.statusCode || 200, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Proxy Error: ${err.message}`);
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    res.writeHead(504, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Proxy Timeout');
  });

  // Pipe request body for POST/PUT/PATCH
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}

// ── Server ──────────────────────────────────────────────────────────────────

/**
 * Start a snapshot HTTP server.
 *
 * Serves static files from `rootDir` with ETag-based cache control and CORS
 * headers. When `proxy` is enabled and `originUrl` is provided, requests that
 * don't match a static file are reverse-proxied to the original server.
 */
export function startSnapshotServer(rootDir: string, options: SnapshotServerOptions): void {
  const { port, originUrl, proxy } = options;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // ── CORS preflight ────────────────────────────────────────────────
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
    // Strip query string for file lookup
    const queryIdx = urlPath.indexOf('?');
    if (queryIdx !== -1) urlPath = urlPath.substring(0, queryIdx);

    // Normalize: default to index.html for directories
    const filePath = urlPath.endsWith('/')
      ? join(rootDir, urlPath, 'index.html')
      : join(rootDir, urlPath);

    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // ── Try static file ───────────────────────────────────────────────
    try {
      const stats = statSync(filePath);
      const mtime = stats.mtime.toUTCString();
      const etag = `"${stats.size}-${stats.mtimeMs.toString(16)}"`;

      // Conditional request: If-None-Match
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

      // Conditional request: If-Modified-Since
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

      // Normal response with cache headers
      const headers: Record<string, string> = {
        'Content-Type': contentType,
        'etag': etag,
        'last-modified': mtime,
        'access-control-allow-origin': '*',
      };

      // HTML: do not cache (hydration may change state)
      // Other assets: cache for 1 hour
      if (ext === '.html') {
        headers['cache-control'] = 'no-cache';
      } else {
        headers['cache-control'] = 'public, max-age=3600';
      }

      res.writeHead(200, headers);
      createReadStream(filePath).pipe(res);
    } catch {
      // ── File not found → reverse proxy ──────────────────────────────
      if (proxy && originUrl) {
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

  server.listen(port, () => {
    process.stdout.write(`\n  Snapshot served at: http://localhost:${port}\n`);
    if (proxy && originUrl) {
      process.stdout.write(`  Proxy origin: ${originUrl}\n`);
    }
    process.stdout.write(`  Press Ctrl+C to stop.\n\n`);
  });
}