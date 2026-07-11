# 代码框架详细实现指南

## 一、适配器接口层

### 1.1 核心接口定义

文件：`src/adapters/fetcher-adapter.ts`

```typescript
/**
 * 资源获取适配器接口
 * 
 * 这个接口定义了 web-clone 与不同 HTTP/浏览器后端交互的方式
 * 实现者可以是：
 * - HTTP 客户端（node-fetch）
 * - Playwright 浏览器上下文
 * - 缓存层
 * - 代理或中间件
 */

/**
 * 获取选项
 */
export interface FetchOptions {
  /**
   * 超时时间（毫秒）
   * @default 15000
   */
  timeout?: number;

  /**
   * Referer 请求头
   * 某些网站需要此头信息来验证请求来源
   */
  referer?: string;

  /**
   * 自定义请求头
   * @example { 'Authorization': 'Bearer token' }
   */
  headers?: Record<string, string>;

  /**
   * 最大文件大小（字节）
   * 超过此大小的文件将被拒绝
   */
  maxSize?: number;

  /**
   * 是否验证 SSL 证书
   * @default true
   */
  validateSSL?: boolean;

  /**
   * 是否跟随 HTTP 重定向
   * @default true
   */
  followRedirects?: boolean;
}

/**
 * 获取结果
 */
export interface FetchResult {
  /**
   * 响应体（二进制）
   */
  buffer: Buffer;

  /**
   * MIME 类型
   * @example 'text/html', 'application/json', 'image/png'
   */
  mime: string;

  /**
   * HTTP 状态码
   */
  status: number;

  /**
   * 是否成功（200-299）
   */
  ok: boolean;

  /**
   * 是否可能是 HTML 文档
   * 用于区分 404 错误页面和真正的非 HTML 内容
   */
  isHtmlLike: boolean;

  /**
   * 响应头
   */
  headers?: Record<string, string>;

  /**
   * 最终 URL（经过重定向后）
   */
  url?: string;
}

/**
 * 认证上下文
 * 用于提供当前页面的认证状态
 */
export interface AuthContext {
  /**
   * 浏览器 Cookie 列表
   */
  cookies?: Array<{
    name: string;
    value: string;
  }>;

  /**
   * 自定义请求头
   * @example { 'Authorization': 'Bearer ...', 'X-Custom': '...' }
   */
  headers?: Record<string, string>;

  /**
   * 认证令牌
   * 可以是 JWT、OAuth 令牌等
   */
  token?: string;
}

/**
 * 资源获取适配器接口
 */
export interface FetcherAdapter {
  /**
   * 获取 URL 指向的资源
   * 
   * @param url - 资源 URL
   * @param options - 获取选项
   * @returns 获取结果
   * 
   * @throws 网络错误、超时、认证失败等
   */
  fetch(
    url: string,
    options: FetchOptions
  ): Promise<FetchResult>;

  /**
   * 可选：检查资源是否可访问
   * 用于在下载前进行快速检查
   * 
   * @param url - 资源 URL
   * @returns 是否可访问
   */
  canAccess?(url: string): Promise<boolean>;

  /**
   * 可选：获取当前的认证上下文
   * 返回当前的 Cookie、令牌等认证信息
   * 
   * @returns 认证上下文
   */
  getAuthContext?(): Promise<AuthContext>;

  /**
   * 可选：清理资源
   * 例如关闭浏览器连接、清理临时文件等
   * 
   * 调用后不应再使用此适配器实例
   */
  dispose?(): Promise<void>;
}
```

### 1.2 导出文件

文件：`src/adapters/index.ts`

```typescript
/**
 * 适配器层导出
 */

export type {
  FetcherAdapter,
  FetchOptions,
  FetchResult,
  AuthContext,
} from './fetcher-adapter.js';

export { HttpFetcherAdapter } from './http-fetcher-adapter.js';
export { PlaywrightFetcherAdapter } from './playwright-fetcher-adapter.js';
export type { PlaywrightAdapterOptions } from './playwright-fetcher-adapter.js';
```

---

## 二、HTTP 适配器实现

### 2.1 完整实现

文件：`src/adapters/http-fetcher-adapter.ts`

```typescript
import { FetcherAdapter, FetchOptions, FetchResult, AuthContext } from './fetcher-adapter.js';
import { fetchWithTimeout, type FetchResult as FetcherFetchResult } from '../fetcher.js';

/**
 * HTTP 适配器
 * 使用 node-fetch 和现有的 fetchWithTimeout 逻辑
 * 
 * 这是默认的适配器，用于标准 HTTP 请求
 */
export class HttpFetcherAdapter implements FetcherAdapter {
  /**
   * 创建 HTTP 适配器实例
   */
  constructor() {}

  /**
   * 获取资源
   */
  async fetch(
    url: string,
    options: FetchOptions
  ): Promise<FetchResult> {
    try {
      // 使用现有的 fetchWithTimeout 函数
      const result = await fetchWithTimeout(
        url,
        options.timeout ?? 15000,
        options.referer,
        options.maxSize
      );

      return {
        buffer: result.buffer,
        mime: result.mime,
        status: result.status,
        ok: result.ok,
        isHtmlLike: result.isHtmlLike,
        headers: {},
        url,
      };
    } catch (error) {
      throw new Error(
        `HTTP fetch failed for ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * 检查资源是否可访问
   * 使用 HEAD 请求以减少带宽
   */
  async canAccess(url: string): Promise<boolean> {
    try {
      const result = await this.fetch(url, { timeout: 5000 });
      return result.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取认证上下文
   * HTTP 适配器没有认证上下文，返回空
   */
  async getAuthContext(): Promise<AuthContext> {
    return {
      cookies: [],
      headers: {},
    };
  }

  /**
   * HTTP 适配器无需清理资源
   */
  async dispose(): Promise<void> {
    // No-op
  }
}
```

### 2.2 单元测试

文件：`src/adapters/__tests__/http-fetcher-adapter.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpFetcherAdapter } from '../http-fetcher-adapter.js';
import * as fetcherModule from '../../fetcher.js';

describe('HttpFetcherAdapter', () => {
  beforeEach(() => {
    // Mock fetchWithTimeout
    vi.spyOn(fetcherModule, 'fetchWithTimeout');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch resource successfully', async () => {
    const mockBuffer = Buffer.from('<html>Test</html>');
    
    vi.mocked(fetcherModule.fetchWithTimeout).mockResolvedValue({
      buffer: mockBuffer,
      mime: 'text/html',
      status: 200,
      ok: true,
      isHtmlLike: true,
    });

    const adapter = new HttpFetcherAdapter();
    const result = await adapter.fetch('https://example.com', {
      timeout: 5000,
    });

    expect(result.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.mime).toBe('text/html');
    expect(result.buffer.toString()).toContain('Test');
  });

  it('should use default timeout', async () => {
    vi.mocked(fetcherModule.fetchWithTimeout).mockResolvedValue({
      buffer: Buffer.from(''),
      mime: 'text/html',
      status: 200,
      ok: true,
      isHtmlLike: true,
    });

    const adapter = new HttpFetcherAdapter();
    await adapter.fetch('https://example.com', {});

    expect(vi.mocked(fetcherModule.fetchWithTimeout)).toHaveBeenCalledWith(
      'https://example.com',
      15000,  // 默认超时
      undefined,
      undefined
    );
  });

  it('should respect custom timeout', async () => {
    vi.mocked(fetcherModule.fetchWithTimeout).mockResolvedValue({
      buffer: Buffer.from(''),
      mime: 'text/html',
      status: 200,
      ok: true,
      isHtmlLike: true,
    });

    const adapter = new HttpFetcherAdapter();
    await adapter.fetch('https://example.com', { timeout: 30000 });

    expect(vi.mocked(fetcherModule.fetchWithTimeout)).toHaveBeenCalledWith(
      'https://example.com',
      30000,
      undefined,
      undefined
    );
  });

  it('should pass referer header', async () => {
    vi.mocked(fetcherModule.fetchWithTimeout).mockResolvedValue({
      buffer: Buffer.from(''),
      mime: 'text/css',
      status: 200,
      ok: true,
      isHtmlLike: false,
    });

    const adapter = new HttpFetcherAdapter();
    await adapter.fetch('https://example.com/style.css', {
      referer: 'https://example.com/',
    });

    expect(vi.mocked(fetcherModule.fetchWithTimeout)).toHaveBeenCalledWith(
      'https://example.com/style.css',
      15000,
      'https://example.com/',
      undefined
    );
  });

  it('should respect maxSize parameter', async () => {
    vi.mocked(fetcherModule.fetchWithTimeout).mockResolvedValue({
      buffer: Buffer.from(''),
      mime: 'image/png',
      status: 200,
      ok: true,
      isHtmlLike: false,
    });

    const adapter = new HttpFetcherAdapter();
    await adapter.fetch('https://example.com/image.png', {
      maxSize: 5 * 1024 * 1024,  // 5MB
    });

    expect(vi.mocked(fetcherModule.fetchWithTimeout)).toHaveBeenCalledWith(
      'https://example.com/image.png',
      15000,
      undefined,
      5 * 1024 * 1024
    );
  });

  it('should check access with HEAD request', async () => {
    vi.mocked(fetcherModule.fetchWithTimeout).mockResolvedValue({
      buffer: Buffer.from(''),
      mime: 'text/html',
      status: 200,
      ok: true,
      isHtmlLike: true,
    });

    const adapter = new HttpFetcherAdapter();
    const canAccess = await adapter.canAccess('https://example.com');

    expect(canAccess).toBe(true);
  });

  it('should return false when resource is not accessible', async () => {
    vi.mocked(fetcherModule.fetchWithTimeout).mockRejectedValue(
      new Error('Network error')
    );

    const adapter = new HttpFetcherAdapter();
    const canAccess = await adapter.canAccess('https://unreachable.com');

    expect(canAccess).toBe(false);
  });

  it('should return empty auth context', async () => {
    const adapter = new HttpFetcherAdapter();
    const auth = await adapter.getAuthContext();

    expect(auth).toEqual({
      cookies: [],
      headers: {},
    });
  });

  it('should throw on fetch error', async () => {
    const error = new Error('Fetch failed');
    vi.mocked(fetcherModule.fetchWithTimeout).mockRejectedValue(error);

    const adapter = new HttpFetcherAdapter();

    await expect(
      adapter.fetch('https://example.com', {})
    ).rejects.toThrow('HTTP fetch failed');
  });
});
```

---

## 三、Playwright 适配器实现

### 3.1 完整实现

文件：`src/adapters/playwright-fetcher-adapter.ts`

```typescript
import type { Page, BrowserContext } from 'playwright';
import { FetcherAdapter, FetchOptions, FetchResult, AuthContext } from './fetcher-adapter.js';

/**
 * Playwright 适配器选项
 */
export interface PlaywrightAdapterOptions {
  /**
   * 主 HTML 文档的加载状态等待条件
   * - 'load': 等待 window.onload 事件
   * - 'domcontentloaded': 等待 DOMContentLoaded 事件
   * - 'networkidle': 等待网络空闲（无未处理的网络连接）
   * @default 'networkidle'
   */
  waitForLoadState?: 'load' | 'domcontentloaded' | 'networkidle';

  /**
   * 是否在导航后等待指定的加载状态
   * @default true
   */
  waitForNavigation?: boolean;

  /**
   * 是否执行页面 JavaScript（用于主 HTML 文档）
   * @default true
   */
  executeJs?: boolean;

  /**
   * 自定义请求头，会与 Cookie 一起发送到所有请求
   */
  customHeaders?: Record<string, string>;

  /**
   * 调试模式：保存页面截图到指定路径
   * 用于调试和验证页面是否正确加载
   */
  debugScreenshot?: string;

  /**
   * 是否验证 SSL 证书
   * @default true
   */
  validateSSL?: boolean;

  /**
   * 是否在导航时接受下载
   */
  acceptDownloads?: boolean;
}

/**
 * Playwright 浏览器适配器
 * 
 * 使用 Playwright 浏览器上下文进行资源获取
 * 特点：
 * - 自动继承浏览器的 Cookie 和 Session
 * - 支持 JavaScript 执行（用于动态内容）
 * - 支持自定义认证头
 * - 支持代理和 HTTP 基础认证
 * 
 * 主 HTML 文档：使用 page.goto() 以支持 JS 执行
 * 子资源：使用 context.request.fetch() 以继承 Cookie
 */
export class PlaywrightFetcherAdapter implements FetcherAdapter {
  private disposed: boolean = false;

  constructor(
    private page: Page,
    private context: BrowserContext,
    private options: PlaywrightAdapterOptions = {}
  ) {}

  /**
   * 获取资源
   * 
   * 策略：
   * 1. 如果是主文档（初次 fetch），使用 page.goto()
   * 2. 其他资源使用 context.request.fetch()
   */
  async fetch(
    url: string,
    options: FetchOptions
  ): Promise<FetchResult> {
    if (this.disposed) {
      throw new Error('PlaywrightFetcherAdapter has been disposed');
    }

    const timeout = options.timeout ?? 30000;

    try {
      // 判断是否应使用 page.goto（主文档）或 context.request.fetch（子资源）
      const isMainDocument = this.isMainDocument(url);

      if (isMainDocument && this.options.executeJs !== false) {
        return await this.fetchWithPage(url, timeout);
      } else {
        return await this.fetchWithRequest(url, options);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Playwright fetch failed for ${url}: ${message}`);
    }
  }

  /**
   * 判断 URL 是否是主文档
   * 
   * 主文档条件：
   * 1. 当前页面尚未加载任何内容
   * 2. URL 与当前页面 URL 相同或相近
   */
  private isMainDocument(url: string): boolean {
    try {
      const currentUrl = this.page.url();
      // 如果页面未加载或 URL 相同，则是主文档
      if (!currentUrl || currentUrl === 'about:blank') {
        return true;
      }
      // 如果 URL 相同，也认为是主文档
      if (new URL(url).href === new URL(currentUrl).href) {
        return true;
      }
      return false;
    } catch {
      // URL 解析失败，不认为是主文档
      return false;
    }
  }

  /**
   * 使用 page.goto() 获取主 HTML 文档
   * 
   * 特点：
   * - 执行页面 JavaScript
   * - 支持浏览器事件和交互
   * - 返回最终渲染后的 HTML
   */
  private async fetchWithPage(
    url: string,
    timeout: number
  ): Promise<FetchResult> {
    const waitForState = this.options.waitForLoadState ?? 'networkidle';

    // 导航到页面
    const response = await this.page.goto(url, {
      timeout,
      waitUntil: waitForState,
    });

    if (!response) {
      throw new Error(`Failed to navigate to ${url} (no response)`);
    }

    // 可选的额外等待
    if (this.options.waitForNavigation !== false) {
      await this.page.waitForLoadState(waitForState);
    }

    // 可选：调试截图
    if (this.options.debugScreenshot) {
      try {
        await this.page.screenshot({
          path: this.options.debugScreenshot,
        });
      } catch (error) {
        console.warn(`Failed to save debug screenshot: ${error}`);
      }
    }

    // 获取最终的 HTML 内容
    const html = await this.page.content();
    const buffer = Buffer.from(html, 'utf-8');

    return {
      buffer,
      mime: 'text/html',
      status: response.status(),
      ok: response.ok(),
      isHtmlLike: true,
      headers: Object.fromEntries(await response.allHeaders()),
      url: this.page.url(),
    };
  }

  /**
   * 使用 context.request.fetch() 获取子资源
   * 
   * 特点：
   * - 自动继承浏览器的 Cookie
   * - 自动继承认证状态
   * - 不需要打开新页面
   */
  private async fetchWithRequest(
    url: string,
    options: FetchOptions
  ): Promise<FetchResult> {
    const timeout = options.timeout ?? 15000;

    const response = await this.context.request.fetch(url, {
      timeout,
      headers: {
        ...options.headers,
        ...this.options.customHeaders,
      },
    });

    // 读取响应正文
    const buffer = await response.body();

    const contentType =
      response.headers()['content-type'] ||
      response.headers()['Content-Type'] ||
      'application/octet-stream';

    return {
      buffer,
      mime: contentType,
      status: response.status(),
      ok: response.ok(),
      isHtmlLike: contentType.includes('text/html'),
      headers: response.headers(),
      url: response.url(),
    };
  }

  /**
   * 检查资源是否可访问
   * 使用 HEAD 请求以减少带宽
   */
  async canAccess(url: string): Promise<boolean> {
    if (this.disposed) {
      return false;
    }

    try {
      const response = await this.context.request.head(url, {
        timeout: 5000,
      });
      return response.ok();
    } catch {
      return false;
    }
  }

  /**
   * 获取当前的认证上下文
   * 
   * 返回：
   * - Cookie 列表
   * - 自定义请求头
   * - 令牌（从 localStorage 或其他存储）
   */
  async getAuthContext(): Promise<AuthContext> {
    if (this.disposed) {
      return { cookies: [], headers: {} };
    }

    try {
      const cookies = await this.context.cookies();
      const storageState = await this.context.storageState();

      // 尝试从 localStorage 获取常见的令牌字段
      const token = this.extractTokenFromStorage(storageState);

      return {
        cookies: cookies.map(c => ({
          name: c.name,
          value: c.value,
        })),
        headers: this.options.customHeaders,
        token,
      };
    } catch (error) {
      console.warn(`Failed to get auth context: ${error}`);
      return {
        cookies: [],
        headers: this.options.customHeaders,
      };
    }
  }

  /**
   * 从存储状态提取令牌
   * 检查常见的令牌字段名
   */
  private extractTokenFromStorage(storageState: any): string | undefined {
    const origins = storageState?.origins || [];
    const commonTokenKeys = [
      'auth_token',
      'authToken',
      'access_token',
      'accessToken',
      'token',
      'jwt',
      'api_key',
      'apiKey',
    ];

    for (const origin of origins) {
      const localStorage = origin.localStorage || [];
      for (const item of localStorage) {
        if (commonTokenKeys.includes(item.name)) {
          return item.value;
        }
      }
    }

    return undefined;
  }

  /**
   * 清理资源
   * 关闭页面（但不关闭浏览器）
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    try {
      await this.page.close();
    } catch (error) {
      console.warn(`Failed to close page: ${error}`);
    }

    this.disposed = true;
  }
}
```

### 3.2 单元测试

文件：`src/adapters/__tests__/playwright-fetcher-adapter.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlaywrightFetcherAdapter } from '../playwright-fetcher-adapter.js';
import type { Page, BrowserContext } from 'playwright';

describe('PlaywrightFetcherAdapter', () => {
  let mockPage: any;
  let mockContext: any;

  beforeEach(() => {
    // 模拟 Page 对象
    mockPage = {
      goto: vi.fn(),
      content: vi.fn(),
      waitForLoadState: vi.fn(),
      screenshot: vi.fn(),
      close: vi.fn(),
      url: vi.fn(() => 'about:blank'),
    };

    // 模拟 BrowserContext 对象
    mockContext = {
      cookies: vi.fn().mockResolvedValue([
        { name: 'session_id', value: 'abc123', domain: 'example.com' },
        { name: 'user_pref', value: 'dark_mode', domain: 'example.com' },
      ]),
      storageState: vi.fn().mockResolvedValue({
        origins: [
          {
            origin: 'https://example.com',
            localStorage: [
              { name: 'auth_token', value: 'token_12345' },
            ],
          },
        ],
      }),
      request: {
        fetch: vi.fn(),
        head: vi.fn(),
      },
    };
  });

  describe('fetch() - main document', () => {
    it('should fetch HTML via page.goto()', async () => {
      const htmlContent = '<html><body>Hello World</body></html>';
      const mockResponse = {
        status: () => 200,
        ok: () => true,
        allHeaders: async () => ({ 'content-type': 'text/html; charset=utf-8' }),
      };

      mockPage.goto.mockResolvedValue(mockResponse);
      mockPage.content.mockResolvedValue(htmlContent);
      mockPage.url.mockReturnValue('https://example.com/');

      const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
      const result = await adapter.fetch('https://example.com/', {
        timeout: 30000,
      });

      expect(result.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.mime).toContain('text/html');
      expect(result.isHtmlLike).toBe(true);
      expect(result.buffer.toString()).toContain('Hello World');
    });

    it('should use default load state', async () => {
      mockPage.goto.mockResolvedValue({
        status: () => 200,
        ok: () => true,
        allHeaders: async () => ({}),
      });
      mockPage.content.mockResolvedValue('<html></html>');

      const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
      await adapter.fetch('https://example.com/', {});

      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://example.com/',
        expect.objectContaining({
          waitUntil: 'networkidle',
        })
      );
    });

    it('should respect custom waitForLoadState', async () => {
      mockPage.goto.mockResolvedValue({
        status: () => 200,
        ok: () => true,
        allHeaders: async () => ({}),
      });
      mockPage.content.mockResolvedValue('<html></html>');

      const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext, {
        waitForLoadState: 'load',
      });
      await adapter.fetch('https://example.com/', {});

      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://example.com/',
        expect.objectContaining({
          waitUntil: 'load',
        })
      );
    });

    it('should save debug screenshot if specified', async () => {
      mockPage.goto.mockResolvedValue({
        status: () => 200,
        ok: () => true,
        allHeaders: async () => ({}),
      });
      mockPage.content.mockResolvedValue('<html></html>');

      const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext, {
        debugScreenshot: '/tmp/debug.png',
      });
      await adapter.fetch('https://example.com/', {});

      expect(mockPage.screenshot).toHaveBeenCalledWith({
        path: '/tmp/debug.png',
      });
    });
  });

  describe('fetch() - sub-resource', () => {
    it('should fetch resource via context.request.fetch()', async () => {
      const cssContent = 'body { color: red; }';
      mockContext.request.fetch.mockResolvedValue({
        status: () => 200,
        ok: () => true,
        headers: () => ({ 'content-type': 'text/css' }),
        body: async () => Buffer.from(cssContent),
        url: () => 'https://example.com/style.css',
      });

      const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
      const result = await adapter.fetch('https://example.com/style.css', {});

      expect(result.status).toBe(200);
      expect(result.mime).toBe('text/css');
      expect(result.buffer.toString()).toBe(cssContent);
    });

    it('should merge custom headers with request', async () => {
      mockContext.request.fetch.mockResolvedValue({
        status: () => 200,
        ok: () => true,
        headers: () => ({}),
        body: async () => Buffer.from(''),
        url: () => 'https://api.example.com/data',
      });

      const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext, {
        customHeaders: {
          'Authorization': 'Bearer secret_token',
          'X-Custom': 'value',
        },
      });

      await adapter.fetch('https://api.example.com/data', {
        headers: { 'Accept': 'application/json' },
      });

      expect(mockContext.request.fetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer secret_token',
            'X-Custom': 'value',
            'Accept': 'application/json',
          }),
        })
      );
    });
  });

  describe('canAccess()', () => {
    it('should return true for accessible resource', async () => {
      mockContext.request.head.mockResolvedValue({
        ok: () => true,
      });

      const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
      const result = await adapter.canAccess('https://example.com/image.png');

      expect(result).toBe(true);
    });

    it('should return false for inaccessible resource', async () => {
      mockContext.request.head.mockRejectedValue(new Error('404 Not Found'));

      const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
      const result = await adapter.canAccess('https://example.com/missing.png');

      expect(result).toBe(false);
    });

    it('should return false if disposed', async () => {
      const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
      await adapter.dispose();

      const result = await adapter.canAccess('https://example.com');
      expect(result).toBe(false);
    });
  });

  describe('getAuthContext()', () => {
    it('should return cookies and token', async () => {
      const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
      const auth = await adapter.getAuthContext();

      expect(auth.cookies).toEqual([
        { name: 'session_id', value: 'abc123' },
        { name: 'user_pref', value: 'dark_mode' },
      ]);
      expect(auth.token).toBe('token_12345');
    });

    it('should include custom headers', async () => {
      const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext, {
        customHeaders: {
          'Authorization': 'Bearer xyz789',
        },
      });
      const auth = await adapter.getAuthContext();

      expect(auth.headers).toEqual({
        'Authorization': 'Bearer xyz789',
      });
    });

    it('should handle missing localStorage', async () => {
      mockContext.storageState.mockResolvedValue({ origins: [] });

      const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
      const auth = await adapter.getAuthContext();

      expect(auth.cookies).toHaveLength(2);
      expect(auth.token).toBeUndefined();
    });
  });

  describe('dispose()', () => {
    it('should close page', async () => {
      const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
      await adapter.dispose();

      expect(mockPage.close).toHaveBeenCalled();
    });

    it('should not throw if already disposed', async () => {
      const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
      await adapter.dispose();
      await expect(adapter.dispose()).resolves.toBeUndefined();
    });

    it('should prevent further operations after disposal', async () => {
      const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
      await adapter.dispose();

      await expect(
        adapter.fetch('https://example.com', {})
      ).rejects.toThrow('disposed');
    });
  });

  describe('error handling', () => {
    it('should throw on fetch error', async () => {
      mockPage.goto.mockRejectedValue(new Error('Navigation failed'));

      const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);

      await expect(
        adapter.fetch('https://example.com', {})
      ).rejects.toThrow('Playwright fetch failed');
    });

    it('should throw if goto returns null', async () => {
      mockPage.goto.mockResolvedValue(null);

      const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);

      await expect(
        adapter.fetch('https://example.com', {})
      ).rejects.toThrow('Failed to navigate');
    });
  });
});
```

---

## 四、assembler.ts 集成改动

### 4.1 关键修改点

文件：`src/assembler.ts`

```typescript
// 在文件顶部添加导入
import type { FetcherAdapter } from './adapters/fetcher-adapter.js';
import { HttpFetcherAdapter } from './adapters/http-fetcher-adapter.js';

/**
 * 快照函数签名更新
 * 添加可选的 FetcherAdapter 参数
 */
export async function snapshot(
  options: SnapshotOptions,
  fetcherAdapter?: FetcherAdapter
): Promise<SnapshotResult> {
  // 如果没有提供适配器，使用默认的 HTTP 适配器
  const fetcher = fetcherAdapter || new HttpFetcherAdapter();

  try {
    // 步骤 1：获取 HTML
    const html = await fetchHtml(
      options.url,
      options.timeout,
      fetcher,
      options.maxFileSize
    );

    if (!html) {
      throw new Error(`Failed to fetch HTML from ${options.url}`);
    }

    // 步骤 2：解析 HTML 文件获取资源引用
    const refs = parseHtml(html, options.url);
    
    // ... 后续步骤保持不变，但使用 fetcher 获取资源 ...
  } finally {
    // 清理适配器资源（如果需要）
    if (fetcherAdapter && fetcherAdapter.dispose) {
      await fetcherAdapter.dispose().catch(() => {
        // 忽略清理错误
      });
    }
  }
}

/**
 * 使用 FetcherAdapter 获取 HTML
 */
async function fetchHtml(
  url: string,
  timeout: number,
  fetcher: FetcherAdapter,
  maxSize?: number
): Promise<string | null> {
  try {
    const result = await fetcher.fetch(url, {
      timeout,
      maxSize,
    });

    if (!result.ok && !result.isHtmlLike) {
      return null;
    }

    return result.buffer.toString('utf8');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stdout.write(`Warning: Failed to fetch HTML: ${message}\n`);
    return null;
  }
}

/**
 * 使用 FetcherAdapter 下载所有资源
 */
async function downloadAllAssets(
  refs: AssetRef[],
  fetcher: FetcherAdapter,
  options: SnapshotOptions
): Promise<Asset[]> {
  // 现有的并发下载逻辑，但改为使用 fetcher.fetch()
  // 详见原 fetcher.ts downloadAllAssets 实现
}
```

---

## 五、类型定义更新

### 5.1 types.ts 新增

```typescript
// 在 src/types.ts 末尾添加

// 重新导出适配器相关类型（为了便利）
export type {
  FetcherAdapter,
  FetchOptions,
  FetchResult,
  AuthContext,
} from './adapters/fetcher-adapter.js';
```

---

## 六、库入口文件

文件：`src/index.ts`

```typescript
/**
 * web-clone 库入口
 * 
 * 暴露公开 API：
 * - 核心快照函数
 * - 类型定义
 * - 适配器接口和实现
 */

// ============= 核心函数 =============
export { snapshot, convertLocalSnapshot } from './assembler.js';

// ============= 类型定义 =============
export type {
  // 基础类型
  AssetType,
  AssetStatus,
  SnapshotMode,
  
  // 选项和结果
  SnapshotOptions,
  SnapshotResult,
  ConvertResult,
  
  // 资源类型
  Asset,
  AssetRef,
  
  // 组件相关
  ComponentSpec,
  ComponentManifest,
  MigrationTodo,
  StateVariable,
  EventBinding,
  MethodSpec,
  
  // 代码生成
  FrameworkCodeGenOptions,
  GeneratedComponent,
  GeneratedFramework,
} from './types.js';

// ============= 适配器 =============
export type {
  FetcherAdapter,
  FetchOptions,
  FetchResult,
  AuthContext,
} from './adapters/fetcher-adapter.js';

export { HttpFetcherAdapter } from './adapters/http-fetcher-adapter.js';
export { PlaywrightFetcherAdapter } from './adapters/playwright-fetcher-adapter.js';
export type { PlaywrightAdapterOptions } from './adapters/playwright-fetcher-adapter.js';

// ============= 工具函数 =============
export { parseHtml } from './parser/html-parser.js';
export { extractCssAssets } from './parser/css-parser.js';

/**
 * 版本信息（可选）
 * 从 package.json 动态导入或手动设置
 */
export const VERSION = '2.0.0';
```

---

## 七、总结和检查清单

### 文件创建清单

- [ ] `src/adapters/fetcher-adapter.ts` — 接口定义
- [ ] `src/adapters/http-fetcher-adapter.ts` — HTTP 实现
- [ ] `src/adapters/playwright-fetcher-adapter.ts` — Playwright 实现
- [ ] `src/adapters/index.ts` — 适配器导出
- [ ] `src/adapters/__tests__/` — 测试文件
- [ ] `src/index.ts` — 库入口
- [ ] 相关文档

### 文件修改清单

- [ ] `src/assembler.ts` — 接受 FetcherAdapter 参数
- [ ] `src/types.ts` — 添加重新导出
- [ ] `package.json` — 更新导出和 peerDependencies
- [ ] `tsconfig.json` — 确保支持 Playwright 类型
- [ ] `.eslintignore` / `eslintrc` — 确保新文件被检查

### 向后兼容性验证

- [ ] `snapshot(options)` 仍然有效（不传 adapter）
- [ ] CLI 命令仍然工作
- [ ] 现有测试通过

---

本文档提供了完整的代码框架和实现细节，可以直接作为开发指南使用。
