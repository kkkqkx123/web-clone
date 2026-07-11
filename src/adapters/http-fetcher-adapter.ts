/**
 * HTTP 适配器实现
 *
 * 包装现有的 fetchWithTimeout 逻辑，实现 FetcherAdapter 接口。
 * 这是默认的适配器，用于标准的 HTTP 请求。
 *
 * 使用场景：
 * - CLI 模式：快照公开网站
 * - 库模式：用户没有特殊认证需求时的默认选择
 */

import { type FetchOptions, type FetchResult, type AuthContext, type FetcherAdapter } from './fetcher-adapter.js';
import { fetchWithTimeout } from '../fetcher.js';

/**
 * HTTP 适配器：使用 node-fetch 进行 HTTP 请求
 *
 * 特点：
 * - 简单高效，适合公开内容
 * - 无法处理需要浏览器 Cookie 的认证
 * - 适合作为 CLI 工具的默认后端
 *
 * 使用示例：
 * ```typescript
 * const adapter = new HttpFetcherAdapter();
 * const result = await adapter.fetch('https://example.com', {
 *   timeout: 15000,
 *   referer: 'https://google.com'
 * });
 * ```
 */
export class HttpFetcherAdapter implements FetcherAdapter {
  /**
   * 获取 HTTP 资源
   *
   * 调用现有的 fetchWithTimeout 函数，并将其结果转换为统一的 FetchResult 格式。
   *
   * @param url 资源的完整 URL
   * @param options 获取选项（timeout、referer、maxSize 等）
   * @returns FetchResult 包含缓冲区、MIME 类型、状态码等
   */
  async fetch(url: string, options: FetchOptions): Promise<FetchResult> {
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
      url: url,
    };
  }

  /**
   * 检查资源是否可访问
   *
   * 快速检查：发送带较短超时的请求。
   * 如果请求成功且状态码为 2xx，返回 true。
   *
   * @param url 资源的完整 URL
   * @returns true 表示 HTTP 请求成功（2xx），false 表示失败
   */
  async canAccess(url: string): Promise<boolean> {
    try {
      const result = await this.fetch(url, { timeout: 5000 });
      return result.ok;
    } catch {
      return false;
    }
  }

  /**
   * 获取认证上下文
   *
   * HTTP 适配器不处理认证，返回空的认证上下文。
   * 如果需要自定义请求头，可以在 fetch() 调用时通过 options.headers 传入。
   *
   * @returns 空的认证上下文
   */
  async getAuthContext(): Promise<AuthContext> {
    return {
      cookies: [],
      headers: {},
    };
  }

  /**
   * 清理资源
   *
   * HTTP 适配器无需特殊清理，该方法为空实现。
   */
  async dispose(): Promise<void> {
    // HTTP 适配器无状态，无需清理
  }
}
