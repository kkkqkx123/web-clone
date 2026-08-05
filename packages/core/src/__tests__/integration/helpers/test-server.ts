/**
 * Local HTTP test server for core integration tests.
 *
 * Serves a minimal page with sub-resources (CSS/JS/IMG) plus 404 and 500
 * routes, replacing external URLs (e.g., example.com) so the tests run
 * fully offline and deterministically.
 *
 * Usage:
 * ```typescript
 * const server = await startTestServer();
 * const url = server.url; // e.g. http://127.0.0.1:12345
 * // ... run snapshot(url) ...
 * await stopTestServer(server);
 * ```
 */
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';

export interface TestServer {
  server: Server;
  /** Base URL without trailing slash, e.g. http://127.0.0.1:12345 */
  url: string;
  port: number;
}

const TEST_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Example Domain</title>
  <link rel="stylesheet" href="/style.css">
  <link rel="icon" href="data:,">
</head>
<body>
  <div>
    <h1>Example Domain</h1>
    <p>This is a local test page served by the integration test server.</p>
    <p><a href="https://iana.org/domains/example">Learn more</a></p>
    <img src="/image.svg" alt="test image">
  </div>
  <script src="/script.js"></script>
</body>
</html>`;

const TEST_CSS = `body { font-family: system-ui, sans-serif; margin: 15vh auto; width: 60vw; color: #333; }
h1 { font-size: 1.5em; }
div { opacity: 0.8; }`;

const TEST_JS = `console.log('Local test page loaded');`;

const TEST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#0066cc" rx="10"/>
  <circle cx="50" cy="45" r="20" fill="white"/>
  <text x="50" y="80" text-anchor="middle" fill="white" font-size="12">TEST</text>
</svg>`;

const ROUTES: Record<string, { contentType: string; content: string }> = {
  '/': { contentType: 'text/html; charset=utf-8', content: TEST_HTML },
  '/index.html': { contentType: 'text/html; charset=utf-8', content: TEST_HTML },
  '/style.css': { contentType: 'text/css; charset=utf-8', content: TEST_CSS },
  '/script.js': { contentType: 'application/javascript; charset=utf-8', content: TEST_JS },
  '/image.svg': { contentType: 'image/svg+xml; charset=utf-8', content: TEST_SVG },
};

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const path = (req.url || '/').split('?')[0];

  if (path === '/missing') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  if (path === '/error') {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
    return;
  }

  const route = ROUTES[path];
  if (route) {
    res.writeHead(200, { 'Content-Type': route.contentType });
    res.end(route.content);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
}

/**
 * Start the local test server on a random available port.
 * Returns the server instance and its base URL.
 */
export function startTestServer(): Promise<TestServer> {
  return new Promise((resolve, reject) => {
    const server = createServer(handleRequest);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server address'));
        return;
      }
      const port = addr.port;
      resolve({
        server,
        url: `http://127.0.0.1:${port}`,
        port,
      });
    });
    server.on('error', reject);
  });
}

/**
 * Stop the test server.
 */
export function stopTestServer(server: TestServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
