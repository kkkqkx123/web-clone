/**
 * Local HTTP test server for E2E tests.
 *
 * Starts a Node.js HTTP server on a random available port,
 * serving the fixtures directory. Used to replace external
 * URLs (e.g., example.com) when network access is unavailable.
 */
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = resolve(__dirname, 'fixtures');

interface TestServer {
  url: (path?: string) => string;
  port: number;
  stop: () => Promise<void>;
}

/**
 * Start a local HTTP server on a free port, serving the fixtures directory.
 *
 * @param host - Host to bind to (default: '127.0.0.1')
 * @returns TestServer with url(), port, and stop()
 */
export function startTestServer(host: string = '127.0.0.1'): Promise<TestServer> {
  return new Promise((resolveFn, reject) => {
    const server: Server = createServer((req, res) => {
      // Parse requested path, default to test-page.html
      const reqPath = req.url === '/' ? '/test-page.html' : req.url ?? '/test-page.html';

      // Security: prevent directory traversal
      if (reqPath.includes('..')) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      try {
        const filePath = resolve(FIXTURES_DIR, reqPath.replace(/^\//, ''));
        const content = readFileSync(filePath, 'utf-8');

        const ext = reqPath.split('.').pop()?.toLowerCase();
        const mimeTypes: Record<string, string> = {
          html: 'text/html; charset=utf-8',
          css: 'text/css; charset=utf-8',
          js: 'application/javascript; charset=utf-8',
          json: 'application/json; charset=utf-8',
          png: 'image/png',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          gif: 'image/gif',
          svg: 'image/svg+xml',
          ico: 'image/x-icon',
        };

        res.writeHead(200, { 'Content-Type': mimeTypes[ext ?? ''] ?? 'text/plain' });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    server.on('error', reject);

    // Listen on port 0 to get a random available port
    server.listen(0, host, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server address'));
        return;
      }

      resolveFn({
        port: addr.port,
        url: (path: string = '/test-page.html') => `http://${host}:${addr.port}${path}`,
        stop: () => {
          return new Promise<void>((resolveStop, rejectStop) => {
            server.close((err) => {
              if (err) rejectStop(err);
              else resolveStop();
            });
          });
        },
      });
    });
  });
}
