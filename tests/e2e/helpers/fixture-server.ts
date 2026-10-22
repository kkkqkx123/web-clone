/**
 * E2E Fixture Server
 *
 * Lightweight HTTP server that serves the prebuilt framework fixture static files.
 * Built on the Node.js http module, zero external dependencies.
 *
 * Usage:
 *   const server = await startFixtureServer('/path/to/builds');
 *   const vueUrl = server.getFixtureUrl('vue3-spa');
 *   // vueUrl → http://127.0.0.1:<PORT>/vue3-spa/
 *   await server.close();
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface FixtureServer {
  /** Get the accessible URL of the given fixture */
  getFixtureUrl(fixtureName: string): string;
  /** Get the server port number */
  readonly port: number;
  /** Shut down the server */
  close(): Promise<void>;
}

/**
 * MIME type mapping table.
 * Covers the file types of common framework build outputs, in particular the
 * special extensions produced by Angular/Next.js.
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
 * Handle an HTTP request and return a static file from the fixture build output.
 *
 * URL path → file mapping rules:
 * - `/vue3-spa/`          → builds/vue3-spa/index.html
 * - `/vue3-spa/style.css` → builds/vue3-spa/style.css
 * - `/react18-spa/assets/index-xxx.js` → builds/react18-spa/assets/index-xxx.js
 */
function createRequestHandler(baseDir: string) {
  return function handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url || '/';
    const urlPath = url.split('?')[0]; // Strip query params

    // Parse the fixture name and file path
    // urlPath format: /fixtureName/path/to/file
    const parts = urlPath.split('/').filter(Boolean);

    if (parts.length === 0) {
      // Root request: return 404 (there is no index page)
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found: No root index. Use /fixtureName/ to access fixtures.');
      return;
    }

    const fixtureName = parts[0];
    const filePath = parts.length > 1 ? join(...parts.slice(1)) : 'index.html';

    // Security check: prevent path traversal
    const safeFilePath = join(baseDir, fixtureName, filePath);
    if (!safeFilePath.startsWith(join(baseDir, fixtureName))) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden: Path traversal attempt.');
      return;
    }

    // For a directory request, try to serve index.html
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

    // File does not exist
    if (!existsSync(resolvedPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Not Found: ${fixtureName}/${filePath}`);
      return;
    }

    // Read and serve the file
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
 * Start the local fixture HTTP server.
 *
 * @param buildsDir path to the directory containing each framework's prebuilt output (e.g. tests/e2e/builds/)
 * @returns FixtureServer instance
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
