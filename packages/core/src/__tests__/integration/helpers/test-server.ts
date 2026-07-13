/**
 * Local Test Server for Playwright E2E tests
 *
 * Serves a minimal web page with CSS/JS/IMG resources to verify
 * that the snapshot pipeline correctly downloads sub-resources.
 *
 * Usage:
 * ```typescript
 * const server = await startTestServer();
 * const url = server.url; // e.g. http://localhost:12345
 * // ... run tests ...
 * await stopTestServer(server);
 * ```
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';

export interface TestServer {
  server: Server;
  url: string;
  port: number;
}

const TEST_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Test Page</title>
  <link rel="stylesheet" href="/style.css">
  <link rel="icon" href="data:,">
</head>
<body>
  <h1>Test Page</h1>
  <p>This page has external CSS, JS, and images.</p>
  <img src="/image.svg" alt="test image">
  <script src="/script.js"></script>
  <!-- No Nuxt/Vue markers here — they go on /spa endpoint only -->
</body>
</html>`;

const TEST_CSS = `body { font-family: sans-serif; margin: 2rem; color: #333; }
h1 { color: #0066cc; border-bottom: 2px solid #0066cc; padding-bottom: 0.5rem; }
p { line-height: 1.6; }
img { max-width: 100%; height: auto; }`;

const TEST_JS = `console.log('Test page loaded');
document.addEventListener('DOMContentLoaded', () => {
  const h1 = document.querySelector('h1');
  if (h1) h1.style.color = '#004499';
});`;

const TEST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#0066cc" rx="10"/>
  <circle cx="50" cy="45" r="20" fill="white"/>
  <text x="50" y="80" text-anchor="middle" fill="white" font-size="12">TEST</text>
</svg>`;

const TEST_SPA_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SPA Test Page</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div id="app">
    <h1>Vue SPA</h1>
    <p>This page simulates a Vue.js SPA for SSR detection testing.</p>
    <img src="/image.svg" alt="test">
  </div>
  <script src="/script.js"></script>
  <script>
    window.__VUE__ = true;
  </script>
</body>
</html>`;

const ROUTES: Record<string, { contentType: string; content: string }> = {
  '/':                { contentType: 'text/html; charset=utf-8',          content: TEST_HTML },
  '/style.css':       { contentType: 'text/css; charset=utf-8',           content: TEST_CSS },
  '/script.js':       { contentType: 'application/javascript; charset=utf-8', content: TEST_JS },
  '/image.svg':       { contentType: 'image/svg+xml; charset=utf-8',      content: TEST_SVG },
  '/spa':             { contentType: 'text/html; charset=utf-8',          content: TEST_SPA_HTML },
};

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const route = ROUTES[req.url || '/'];
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
