/**
 * Playwright 浏览器适配器
 *
 * 使用 Playwright 浏览器上下文进行资源获取，支持：
 * - Cookie 自动继承
 * - 身份验证令牌管理
 * - JavaScript 动态执行
 * - 页面加载状态控制
 *
 * 使用场景：
 * - 需要登录的网站快照
 * - 需要执行 JavaScript 的 SPA 快照
 * - 需要自定义请求头的 API 集成
 *
 * 架构：
 * - 主文档（HTML）：使用 page.goto() + page.content()
 *   原因：需要执行 JavaScript、等待动态内容加载
 * - 子资源（CSS/JS/图片）：使用 context.request.fetch()
 *   原因：自动继承 Cookie、认证信息
 */

import type { Page, BrowserContext } from 'playwright';
import {
  type FetcherAdapter,
  type FetchOptions,
  type FetchResult,
  type AuthContext,
} from './fetcher-adapter.js';

/**
 * Playwright 适配器的配置选项
 */
export interface PlaywrightAdapterOptions {
  /**
   * 是否等待页面导航完成
   * @default true
   */
  waitForNavigation?: boolean;

  /**
   * 是否执行页面 JavaScript
   * @default true
   */
  executeJs?: boolean;

  /**
   * 等待的加载状态
   * - 'load': 等待 load 事件
   * - 'domcontentloaded': 等待 DOMContentLoaded 事件
   * - 'networkidle': 等待网络空闲（推荐）
   * @default 'networkidle'
   */
  waitForLoadState?: 'load' | 'domcontentloaded' | 'networkidle';

  /**
   * 自定义请求头
   * 这些头会在所有请求中包含，与 Cookie 一起发送
   * 用于 API 认证：Authorization: Bearer token
   */
  customHeaders?: Record<string, string>;

  /**
   * 调试模式：保存页面截图
   * 如果设置，会在导航后保存截图到该路径
   */
  debugScreenshot?: string;

  /**
   * 是否验证 SSL 证书
   * @default true
   */
  validateSSL?: boolean;
}

/**
 * Playwright 浏览器适配器
 *
 * 集成 Playwright 浏览器上下文，实现 FetcherAdapter 接口。
 * 支持认证、Cookie 继承、JavaScript 执行等高级功能。
 *
 * 生命周期管理：
 * - 页面由适配器创建和管理，dispose() 会关闭页面
 * - 浏览器上下文由调用者管理，适配器不关闭
 * - 浏览器本身由调用者管理
 *
 * 使用示例：
 * ```typescript
 * const browser = await chromium.launch();
 * const context = await browser.newContext();
 * const page = await context.newPage();
 *
 * // 登录流程
 * await page.goto('https://example.com/login');
 * await page.fill('input[name="email"]', 'user@example.com');
 * await page.fill('input[name="password"]', 'password');
 * await page.click('button[type="submit"]');
 * await page.waitForNavigation();
 *
 * // 创建适配器
 * const adapter = new PlaywrightFetcherAdapter(page, context, {
 *   waitForLoadState: 'networkidle',
 *   customHeaders: { 'Authorization': 'Bearer token' }
 * });
 *
 * // 快照
 * const result = await snapshot(options, adapter);
 *
 * // 清理
 * await adapter.dispose();
 * await context.close();
 * await browser.close();
 * ```
 */
export class PlaywrightFetcherAdapter implements FetcherAdapter {
  constructor(
    private page: Page,
    private context: BrowserContext,
    private options: PlaywrightAdapterOptions = {}
  ) {}

  /**
   * 获取资源
   *
   * 根据资源类型选择不同的获取策略：
   * - 主 HTML 文档：使用 fetchWithPage()
   * - 子资源：使用 fetchWithContext()
   *
   * @param url 资源的完整 URL
   * @param options 获取选项
   * @returns FetchResult 包含资源内容、MIME 类型、状态码等
   * @throws 在网络错误、超时等异常情况下抛出异常
   */
  async fetch(url: string, options: FetchOptions): Promise<FetchResult> {
    const mergedOptions: PlaywrightAdapterOptions = {
      waitForNavigation: this.options.waitForNavigation ?? true,
      executeJs: this.options.executeJs ?? true,
      waitForLoadState: this.options.waitForLoadState ?? 'networkidle',
      validateSSL: options.validateSSL ?? true,
      ...this.options,
    };

    try {
      // 判断是否为主文档请求
      // 如果当前页面还未加载过或正在请求主页面，使用 page.goto()
      const currentUrl = (this.page as any).url || '';
      const isMainDocument =
        !currentUrl ||
        currentUrl === 'about:blank' ||
        new URL(url).origin === new URL(currentUrl).origin;

      if (isMainDocument) {
        return await this.fetchWithPage(url, options, mergedOptions);
      } else {
        return await this.fetchWithContext(url, options, mergedOptions);
      }
    } catch (error) {
      throw new Error(
        `Playwright fetch failed for ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error }
      );
    }
  }

  /**
   * 使用 page.goto() 获取主 HTML 文档
   *
   * 策略：
   * 1. 导航到 URL，等待加载完成
   * 2. 等待指定的加载状态
   * 3. 可选：执行调试截图
   * 4. 获取最终的页面内容
   *
   * 特点：
   * - 执行页面 JavaScript（如果启用）
   * - 自动处理重定向
   * - 维护 Cookie 和会话状态
   * - 返回渲染后的 HTML
   *
   * @private
   */
  private async fetchWithPage(
    url: string,
    options: FetchOptions,
    pwOptions: PlaywrightAdapterOptions
  ): Promise<FetchResult> {
    // 导航到页面
    const response = await this.page.goto(url, {
      timeout: options.timeout ?? 30000,
      waitUntil: pwOptions.waitForLoadState,
    });

    if (!response) {
      throw new Error(`Failed to navigate to ${url}`);
    }

    // 等待加载完成（如果启用）
    if (pwOptions.waitForNavigation && pwOptions.waitForLoadState) {
      await this.page.waitForLoadState(pwOptions.waitForLoadState);
    }

    // 可选：调试截图
    if (pwOptions.debugScreenshot) {
      try {
        await this.page.screenshot({
          path: pwOptions.debugScreenshot,
        });
      } catch (err) {
        console.warn(`Failed to save debug screenshot: ${err}`);
      }
    }

    // 获取最终的 HTML 内容（已渲染）
    const html = await this.page.content();
    const buffer = Buffer.from(html, 'utf-8');

    // 构建返回值
    const allHeaders = await response.allHeaders();
    return {
      buffer,
      mime: 'text/html',
      status: (response as any).status,
      ok: (response as any).ok,
      isHtmlLike: true,
      headers: Object.fromEntries(Object.entries(allHeaders)),
      url: (this.page as any).url || '',
    };
  }

  /**
   * 使用 context.request.fetch() 获取子资源
   *
   * 策略：
   * 1. 使用浏览器上下文的 API 进行请求
   * 2. 自动继承 Cookie 和认证信息
   * 3. 合并自定义请求头
   * 4. 读取响应正文
   *
   * 特点：
   * - 自动继承浏览器 Cookie
   * - 支持自定义请求头
   * - 不执行 JavaScript（更快）
   * - 直接访问原始响应
   *
   * @private
   */
  private async fetchWithContext(
    url: string,
    options: FetchOptions,
    pwOptions: PlaywrightAdapterOptions
  ): Promise<FetchResult> {
    // 使用浏览器上下文进行请求，自动继承 Cookie
    const response = await (this.context.request!).fetch(url, {
      timeout: options.timeout ?? 15000,
      headers: {
        ...options.headers,
        ...pwOptions.customHeaders,
      },
    });

    // 读取响应正文为 Buffer
    const buffer = await (response as any).body();

    // 获取 Content-Type
    const contentType =
      (response as any).headers()['content-type'] ||
      'application/octet-stream';

    // 构建返回值
    return {
      buffer,
      mime: contentType,
      status: (response as any).status,
      ok: (response as any).ok,
      isHtmlLike: contentType.includes('text/html'),
      headers: (response as any).headers(),
      url: (response as any).url || '',
    };
  }

  /**
   * 检查资源是否可访问
   *
   * 使用 HEAD 请求进行快速检查，无需下载完整内容。
   *
   * @param url 资源的完整 URL
   * @returns true 表示资源可访问（2xx），false 表示不可访问
   */
  async canAccess(url: string): Promise<boolean> {
    try {
      const response = await (this.context.request!).head(url, {
        timeout: 5000,
      });
      return (response as any).ok;
    } catch {
      return false;
    }
  }

  /**
   * 获取认证上下文
   *
   * 提取当前浏览器上下文中的认证信息，包括：
   * - Cookie：从浏览器上下文中提取
   * - 自定义请求头：从适配器配置中提取
   * - 令牌：从 localStorage 中查找
   *
   * 这些信息可以用于：
   * - 后续快照请求的认证复用
   * - 认证状态导出
   * - 日志记录
   *
   * @returns AuthContext 包含 Cookie、请求头、令牌等
   */
  async getAuthContext(): Promise<AuthContext> {
    // 获取浏览器 Cookie
    const cookies = await this.context.cookies();

    // 获取存储状态（包括 localStorage、sessionStorage）
    const storageState = await this.context.storageState();

    // 尝试从第一个源的 localStorage 中查找令牌
    let token: string | undefined;
    if (storageState?.origins && storageState.origins.length > 0) {
      const localStorage = storageState.origins[0].localStorage;
      if (localStorage) {
        // 常见的令牌名称
        for (const item of localStorage) {
          if (
            item.name.toLowerCase().includes('token') ||
            item.name.toLowerCase().includes('auth')
          ) {
            token = item.value;
            break;
          }
        }
      }
    }

    return {
      cookies: cookies.map((c: any) => ({
        name: c.name,
        value: c.value,
      })),
      headers: this.options.customHeaders,
      token,
    };
  }

  /**
   * 清理资源
   *
   * 关闭此适配器管理的页面。
   * 浏览器上下文和浏览器实例由调用者管理，不在此释放。
   *
   * 说明：
   * - 页面对象：适配器创建和管理，dispose() 关闭
   * - 浏览器上下文：调用者管理，适配器仅使用
   * - 浏览器实例：调用者管理，适配器不涉及
   */
  async dispose(): Promise<void> {
    try {
      // 关闭页面，但保留浏览器上下文和浏览器
      // 由调用者在不再需要时关闭
      if (!this.page.isClosed()) {
        await this.page.close();
      }
    } catch (err) {
      // 忽略已关闭的页面错误
      console.warn(`Error closing page in dispose: ${err}`);
    }
  }
}
