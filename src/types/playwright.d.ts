/**
 * Playwright type stubs for compilation purposes
 * Actual runtime use requires 'playwright' to be installed
 */

declare module 'playwright' {
  export interface LaunchOptions {
    headless?: boolean;
    [key: string]: unknown;
  }

  export interface BrowserContextOptions {
    viewport?: { width: number; height: number } | null;
    userAgent?: string;
    locale?: string;
    [key: string]: unknown;
  }

  export interface Response {
    ok: boolean;
    status: number;
    body(): Promise<Buffer>;
    headers(): Record<string, string>;
    allHeaders(): Promise<Record<string, string>>;
  }

  export interface Request {
    fetch(url: string, options?: unknown): Promise<Response>;
    head(url: string, options?: unknown): Promise<Response>;
  }

  export interface Page {
    goto(url: string, options?: unknown): Promise<Response>;
    close(): Promise<void>;
    url: string;
    isClosed(): boolean;
    content(): Promise<string>;
    waitForLoadState(state?: string): Promise<void>;
    screenshot(options?: unknown): Promise<Buffer>;
  }

  export interface StorageState {
    origins?: Array<{
      origin: string;
      localStorage?: Array<{ name: string; value: string }>;
      sessionStorage?: Array<{ name: string; value: string }>;
    }>;
    [key: string]: unknown;
  }

  export interface BrowserContext {
    newPage(): Promise<Page>;
    close(): Promise<void>;
    cookies(): Promise<unknown[]>;
    storageState(): Promise<StorageState>;
    request: Request;
  }

  export interface Browser {
    newContext(options?: BrowserContextOptions): Promise<BrowserContext>;
    close(): Promise<void>;
  }

  export interface Chromium {
    launch(options?: LaunchOptions): Promise<Browser>;
  }

  export const chromium: Chromium;
}
