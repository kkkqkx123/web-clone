/**
 * E2E Fixture Server
 *
 * 轻量 HTTP 服务器，提供预构建的框架 fixture 静态文件。
 * 基于 Node.js http 模块，零外部依赖。
 *
 * 使用方式：
 *   const server = await startFixtureServer('/path/to/builds');
 *   const vueUrl = server.getFixtureUrl('vue3-spa');
 *   // vueUrl → http://127.0.0.1:<PORT>/vue3-spa/
 *   await server.close();
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface FixtureServer {
  /** 获取指定 fixture 的可访问 URL */
  getFixtureUrl(fixtureName: string): string;
  /** 获取服务器端口号 */
  readonly port: number;
  /** 关闭服务器 */
  close(): Promise<void>;
}

/**
 * MIME 类型映射表。
 * 覆盖常见框架构建产物的文件类型，特别是 Angular/Next.js 的特殊后缀。
 */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
};

function getMimeType(filePath: string): string {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * 处理 HTTP 请求，返回 fixture 构建产物中的静态文件。
 *
 * URL 路径 → 文件映射规则：
 * - `/vue3-spa/`          → builds/vue3-spa/index.html
 * - `/vue3-spa/style.css` → builds/vue3-spa/style.css
 * - `/react18-spa/assets/index-xxx.js` → builds/react18-spa/assets/index-xxx.js
 */
function createRequestHandler(baseDir: string) {
  return function handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url || '/';
    const urlPath = url.split('?')[0]; // Strip query params

    // 解析 fixture 名称和文件路径
    // urlPath 格式: /fixtureName/path/to/file
    const parts = urlPath.split('/').filter(Boolean);

    if (parts.length === 0) {
      // 根目录请求，返回 404（没有索引页）
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found: No root index. Use /fixtureName/ to access fixtures.');
      return;
    }

    const fixtureName = parts[0];
    const filePath = parts.length > 1 ? join(...parts.slice(1)) : 'index.html';

    // 安全检查：防止路径穿越
    const safeFilePath = join(baseDir, fixtureName, filePath);
    if (!safeFilePath.startsWith(join(baseDir, fixtureName))) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden: Path traversal attempt.');
      return;
    }

    // 如果是目录请求，尝试返回 index.html
    let resolvedPath = safeFilePath;
    try {
      if (existsSync(resolvedPath) && statSync(resolvedPath).isDirectory()) {
        resolvedPath = join(resolvedPath, 'index.html');
      }
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
      return;
    }

    // 文件不存在
    if (!existsSync(resolvedPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Not Found: ${fixtureName}/${filePath}`);
      return;
    }

    // 读取并返回文件
    try {
      const content = readFileSync(resolvedPath);
      const mime = getMimeType(resolvedPath);
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': content.length,
        'Cache-Control': 'no-cache',
      });
      res.end(content);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  };
}

/**
 * 启动 fixture 本地 HTTP 服务器。
 *
 * @param buildsDir 包含各框架预构建产物的目录路径（如 tests/e2e/builds/）
 * @returns FixtureServer 实例
 */
export function startFixtureServer(buildsDir: string): Promise<FixtureServer> {
  return new Promise((resolve, reject) => {
    const server = createServer(createRequestHandler(buildsDir));
    let resolvedPort = 0;

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('Failed to get server address'));
        return;
      }
      resolvedPort = addr.port;

      resolve({
        port: resolvedPort,
        getFixtureUrl(fixtureName: string): string {
          return `http://127.0.0.1:${resolvedPort}/${fixtureName}/`;
        },
        close(): Promise<void> {
          return new Promise((resolveClose, rejectClose) => {
            server.close((err) => {
              if (err) rejectClose(err);
              else resolveClose();
            });
          });
        },
      });
    });

    server.on('error', reject);
  });
}
