/**
 * 测试数据集
 * 集中管理所有测试中使用的常用数据
 */

/**
 * 测试 URL 集合
 */
export const TEST_URLS = {
  // 基础 URL
  simple: 'https://example.com',
  withPath: 'https://example.com/page',
  withQuery: 'https://example.com/search?q=test',
  withFragment: 'https://example.com/page#section',
  withPort: 'https://example.com:8443/secure',

  // 同源 URL 组合
  sameOrigin: {
    main: 'https://example.com',
    css: 'https://example.com/style.css',
    js: 'https://example.com/script.js',
    img: 'https://example.com/logo.png',
  },

  // 跨域 URL 组合
  crossOrigin: {
    main: 'https://example.com',
    cdn: 'https://cdn.example.com/style.css',
    api: 'https://api.example.com/data',
    font: 'https://fonts.example.com/roboto.woff2',
  },

  // 特殊 URL
  redirect: 'https://example.com/redirect',
  redirectTarget: 'https://example.com/new-page',
  notFound: 'https://example.com/missing',
  serverError: 'https://example.com/error',
  timeout: 'https://example.com/slow',

  // 本地 URL (用于集成测试)
  localhost: 'http://localhost:3000',
  localhostWithPath: 'http://localhost:3000/test-page',
};

/**
 * 测试请求头集合
 */
export const TEST_HEADERS = {
  // 认证相关
  auth: {
    'Authorization': 'Bearer token123',
  },

  bearerAuth: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  },

  basicAuth: {
    'Authorization': 'Basic dXNlcjpwYXNz', // base64: user:pass
  },

  // 自定义头
  custom: {
    'X-Custom-Header': 'value',
    'X-Request-ID': 'req-12345',
  },

  // API 相关
  api: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-API-Version': 'v1',
  },

  // 组合头
  combined: {
    'Authorization': 'Bearer token',
    'X-Custom-Header': 'value',
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Test)',
  },

  // 浏览器标准头
  browserDefault: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate',
  },
};

/**
 * 测试 Cookie 集合
 */
export const TEST_COOKIES = [
  {
    name: 'session',
    value: 'abc123def456ghi789',
    domain: 'example.com',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Strict' as const,
    expires: Math.floor(Date.now() / 1000) + 86400, // 1 天后过期
  },
  {
    name: 'tracking',
    value: 'xyz789uvw012xyz',
    domain: '.example.com',
    path: '/',
    secure: false,
    httpOnly: false,
    sameSite: 'Lax' as const,
    expires: Math.floor(Date.now() / 1000) + 31536000, // 1 年后过期
  },
  {
    name: 'preferences',
    value: 'lang=en&theme=dark&timezone=UTC',
    domain: 'example.com',
    path: '/user',
    secure: false,
    httpOnly: false,
    sameSite: 'None' as const,
    expires: Math.floor(Date.now() / 1000) + 7776000, // 90 天后过期
  },
];

/**
 * 测试认证令牌集合
 */
export const TEST_AUTH_TOKENS = {
  // JWT 令牌（示例）
  jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',

  // Bearer 令牌
  bearer: 'Bearer abc123def456ghi789jkl012mno345pqr678stu901vwx234yz',

  // Basic Auth (user:pass 的 base64 编码)
  basic: 'Basic dXNlcjpwYXNz',

  // OAuth 风格
  oauth: 'Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IjIwMjAtMDEtMDEifQ...',

  // 简单令牌
  simple: 'token_abc123def456',

  // 过期令牌
  expired: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MDAwMDAwMDB9.expired',
};

/**
 * 存储在 localStorage 中的测试数据
 */
export const TEST_LOCAL_STORAGE = [
  {
    name: 'auth_token',
    value: 'Bearer jwt_token_here',
  },
  {
    name: 'user_id',
    value: '12345',
  },
  {
    name: 'user_role',
    value: 'admin',
  },
  {
    name: 'theme',
    value: 'dark',
  },
  {
    name: 'last_login',
    value: new Date().toISOString(),
  },
];

/**
 * 存储在 sessionStorage 中的测试数据
 */
export const TEST_SESSION_STORAGE = [
  {
    name: 'request_id',
    value: 'req-12345-67890',
  },
  {
    name: 'temp_token',
    value: 'temp_abc123',
  },
  {
    name: 'page_state',
    value: JSON.stringify({ page: 1, filter: 'active' }),
  },
];

/**
 * 常见的 MIME 类型
 */
export const TEST_MIME_TYPES = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  javascript: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  text: 'text/plain; charset=utf-8',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  zip: 'application/zip',
  pdf: 'application/pdf',
  octetStream: 'application/octet-stream',
};

/**
 * 常见的 HTTP 状态码
 */
export const TEST_STATUS_CODES = {
  // 2xx - 成功
  ok: 200,
  created: 201,
  accepted: 202,
  noContent: 204,

  // 3xx - 重定向
  movedPermanently: 301,
  found: 302,
  notModified: 304,
  temporaryRedirect: 307,

  // 4xx - 客户端错误
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  methodNotAllowed: 405,
  timeout: 408,
  gone: 410,

  // 5xx - 服务器错误
  internalServerError: 500,
  notImplemented: 501,
  badGateway: 502,
  serviceUnavailable: 503,
  gatewayTimeout: 504,
};

/**
 * 测试超时值
 */
export const TEST_TIMEOUTS = {
  short: 1000,      // 1 秒 - 快速操作
  normal: 5000,     // 5 秒 - 正常操作
  medium: 10000,    // 10 秒 - 较慢操作
  long: 30000,      // 30 秒 - 集成测试
  verLong: 60000,   // 60 秒 - 极慢操作
};

/**
 * 测试文件大小
 */
export const TEST_FILE_SIZES = {
  tiny: 1024,                    // 1 KB
  small: 100 * 1024,             // 100 KB
  medium: 1024 * 1024,           // 1 MB
  large: 10 * 1024 * 1024,       // 10 MB
  huge: 100 * 1024 * 1024,       // 100 MB
  gigantic: 1024 * 1024 * 1024,  // 1 GB
};

/**
 * 测试 HTML 内容示例
 */
export const TEST_HTML_CONTENTS = {
  minimal: `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body><h1>Hello</h1></body>
</html>`,

  withStyles: `<!DOCTYPE html>
<html>
<head>
  <title>Test Page</title>
  <link rel="stylesheet" href="style.css">
  <style>body { color: red; }</style>
</head>
<body>
  <h1>Test</h1>
  <p>Content</p>
</body>
</html>`,

  withScripts: `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <h1>Test</h1>
  <script src="app.js"></script>
  <script>console.log('inline');</script>
</body>
</html>`,

  withAssets: `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="style.css">
  <link rel="icon" href="favicon.ico">
</head>
<body>
  <img src="logo.png" alt="Logo">
  <img src="banner.jpg" alt="Banner">
  <script src="app.js"></script>
</body>
</html>`,

  spa: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>SPA App</title>
  <link rel="stylesheet" href="main.css">
</head>
<body>
  <div id="root"></div>
  <script src="react.js"></script>
  <script src="app.js"></script>
</body>
</html>`,
};

/**
 * 测试错误消息
 */
export const TEST_ERROR_MESSAGES = {
  networkTimeout: 'Network timeout',
  connectionRefused: 'Connection refused',
  dnsNotFound: 'DNS lookup failed',
  sslCertificate: 'SSL certificate verification failed',
  invalidUrl: 'Invalid URL',
  navigationFailed: 'Navigation failed',
  pageNavigationError: 'Failed to navigate',
  resourceNotFound: 'Resource not found',
};

/**
 * 常用的测试选项组合
 */
export const TEST_OPTIONS_COMBINATIONS = {
  basic: {
    timeout: TEST_TIMEOUTS.normal,
  },

  withHeaders: {
    timeout: TEST_TIMEOUTS.normal,
    headers: TEST_HEADERS.combined,
  },

  withAuth: {
    timeout: TEST_TIMEOUTS.normal,
    headers: TEST_HEADERS.bearerAuth,
  },

  fast: {
    timeout: TEST_TIMEOUTS.short,
  },

  slow: {
    timeout: TEST_TIMEOUTS.long,
  },

  withRedirect: {
    timeout: TEST_TIMEOUTS.normal,
    followRedirects: true,
  },
};
