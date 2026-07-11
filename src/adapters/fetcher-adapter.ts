/**
 * 统一的资源获取适配器接口
 * 支持多种后端：HTTP、Playwright、缓存等
 *
 * 设计原理：
 * - 抽象资源获取逻辑，解耦快照核心与具体的HTTP实现
 * - 支持多种身份验证和资源来源（HTTP、浏览器上下文、缓存等）
 * - 允许Playwright和其他自动化工具集成
 */

/**
 * 获取资源时的选项
 */
export interface FetchOptions {
  /**
   * 请求超时（毫秒）
   * @default 15000
   */
  timeout?: number;

  /**
   * Referer 请求头
   */
  referer?: string;

  /**
   * 自定义请求头
   */
  headers?: Record<string, string>;

  /**
   * 最大文件大小（字节）
   * @default 0 (无限制)
   */
  maxSize?: number;

  /**
   * 是否验证 SSL 证书
   * @default true
   */
  validateSSL?: boolean;

  /**
   * 是否跟随重定向
   * @default true
   */
  followRedirects?: boolean;
}

/**
 * 资源获取的结果
 */
export interface FetchResult {
  /**
   * 资源内容二进制数据
   */
  buffer: Buffer;

  /**
   * MIME 类型
   */
  mime: string;

  /**
   * HTTP 状态码
   */
  status: number;

  /**
   * 是否成功（2xx）
   */
  ok: boolean;

  /**
   * 是否类似 HTML 的文本内容（text/html, application/xhtml+xml 等）
   */
  isHtmlLike: boolean;

  /**
   * 响应头
   */
  headers?: Record<string, string>;

  /**
   * 最终 URL（重定向后）
   */
  url?: string;
}

/**
 * 认证上下文
 * 用于在适配器间传递认证信息
 */
export interface AuthContext {
  /**
   * 浏览器 Cookie 列表
   */
  cookies?: Array<{ name: string; value: string }>;

  /**
   * 自定义请求头（如 Authorization）
   */
  headers?: Record<string, string>;

  /**
   * 认证令牌（JWT、OAuth 等）
   */
  token?: string;
}

/**
 * 统一的资源获取适配器接口
 *
 * 实现示例：
 * - HttpFetcherAdapter: 使用 node-fetch 进行 HTTP 请求（默认）
 * - PlaywrightFetcherAdapter: 使用 Playwright 浏览器上下文
 * - CacheFetcherAdapter: 从本地缓存读取资源
 *
 * 使用方式：
 * ```typescript
 * const adapter = new HttpFetcherAdapter();
 * // 或
 * const adapter = new PlaywrightFetcherAdapter(page, context);
 *
 * const result = await adapter.fetch('https://example.com/style.css', {
 *   timeout: 15000,
 *   headers: { 'Accept': 'text/css' }
 * });
 *
 * if (result.ok) {
 *   console.log(`Fetched ${result.buffer.length} bytes of ${result.mime}`);
 * }
 * ```
 */
export interface FetcherAdapter {
  /**
   * 获取资源（HTML、CSS、JS、图片等）
   *
   * @param url 资源的完整 URL
   * @param options 获取选项
   * @returns 获取结果，包含缓冲区、MIME 类型、状态码等
   * @throws 在网络错误、超时等异常情况下抛出异常
   */
  fetch(url: string, options: FetchOptions): Promise<FetchResult>;

  /**
   * 检查资源是否可访问
   *
   * 可选方法。用于提前过滤无法访问的资源。
   * 实现时应该高效快速（如使用 HEAD 请求或简单的 canAccess 检查）。
   *
   * @param url 资源的完整 URL
   * @returns true 表示资源可访问，false 表示无法访问
   * @default 如果未实现，调用方应该假设资源可以尝试获取
   */
  canAccess?(url: string): Promise<boolean>;

  /**
   * 获取当前的认证上下文
   *
   * 可选方法。返回当前适配器中的认证信息，包括 Cookie、令牌等。
   * 用于在快照后提取认证状态以便后续使用。
   *
   * 实现说明：
   * - HTTP 适配器：返回空对象或自定义请求头
   * - Playwright 适配器：返回浏览器 Cookie 和 localStorage 令牌
   *
   * @returns 认证上下文，包含 Cookie、请求头、令牌等
   * @default 如果未实现，假设没有特殊认证信息
   */
  getAuthContext?(): Promise<AuthContext>;

  /**
   * 清理资源
   *
   * 可选方法。在适配器不再使用时调用，用于释放资源。
   * 例如：关闭浏览器连接、清理临时文件等。
   *
   * 实现说明：
   * - HTTP 适配器：通常无需实现
   * - Playwright 适配器：关闭页面（但不关闭浏览器，由调用者管理）
   *
   * @default 如果未实现，假设不需要特殊清理
   */
  dispose?(): Promise<void>;
}
