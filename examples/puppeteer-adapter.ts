/**
 * Custom Adapter Example: Puppeteer
 *
 * This example shows how to implement your own FetcherAdapter for Puppeteer.
 * This demonstrates that web-clone is framework-agnostic.
 *
 * Note: This is a simplified example. In production, you would handle error cases,
 * redirects, and other edge cases more robustly.
 */

import puppeteer from 'puppeteer';
import { snapshot } from 'web-clone';
import type {
  FetcherAdapter,
  FetchOptions,
  FetchResult,
  AuthContext,
} from 'web-clone/adapters';

/**
 * Your custom Puppeteer adapter implementation
 * Simply implement the FetcherAdapter interface
 */
class PuppeteerFetcherAdapter implements FetcherAdapter {
  constructor(
    private page: puppeteer.Page,
    private browser: puppeteer.Browser
  ) {}

  async fetch(url: string, options: FetchOptions): Promise<FetchResult> {
    if (options.isMainDocument) {
      // For main HTML: navigate and get rendered content
      const response = await this.page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: options.timeout ?? 30000,
      });

      if (!response) {
        throw new Error(`Failed to navigate to ${url}`);
      }

      const html = await this.page.content();
      const buffer = Buffer.from(html, 'utf-8');

      return {
        buffer,
        mime: 'text/html',
        status: response.status(),
        ok: response.status() >= 200 && response.status() < 300,
        isHtmlLike: true,
        headers: response.headers(),
        url: this.page.url(),
      };
    } else {
      // For sub-resources: use HTTP client (inherits cookies)
      const response = await this.page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: options.timeout ?? 15000,
      });

      if (!response) {
        throw new Error(`Failed to fetch ${url}`);
      }

      const buffer = await response.buffer();

      return {
        buffer,
        mime: response.headers()['content-type'] || 'application/octet-stream',
        status: response.status(),
        ok: response.status() >= 200 && response.status() < 300,
        isHtmlLike: response.headers()['content-type']?.includes('text/html') ?? false,
        headers: response.headers(),
        url: response.url(),
      };
    }
  }

  async canAccess(url: string): Promise<boolean> {
    try {
      const response = await this.page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 5000,
      });
      return response?.ok() ?? false;
    } catch {
      return false;
    }
  }

  async getAuthContext(): Promise<AuthContext> {
    const cookies = await this.page.cookies();
    return {
      cookies: cookies.map(c => ({
        name: c.name,
        value: c.value,
      })),
    };
  }

  async dispose(): Promise<void> {
    // No cleanup needed for Puppeteer page
    // Browser is managed by the caller
  }
}

async function main() {
  const browser = await puppeteer.launch({ headless: true });

  try {
    const page = await browser.newPage();

    try {
      // Use your custom adapter with web-clone
      const adapter = new PuppeteerFetcherAdapter(page, browser);

      const result = await snapshot({
        url: 'https://example.com',
        output: './puppeteer-snapshot',
        mode: 'bundle',
      }, adapter);

      console.log('✓ Puppeteer snapshot complete!');
      console.log(`  Total assets: ${result.stats.total}`);
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
