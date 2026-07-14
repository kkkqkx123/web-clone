/**
 * Puppeteer Snapshot with Authentication Example
 *
 * Demonstrates how to use web-clone with Puppeteer for authenticated pages.
 * Your authentication logic is completely under your control.
 *
 * Usage:
 *   AUTH_EMAIL=user@example.com AUTH_PASSWORD=secret \
 *     pnpm tsx examples/puppeteer/02-with-authentication.ts
 *
 * Prerequisites:
 *   pnpm add puppeteer @web-clone/core @web-clone/adapter-puppeteer
 */

import puppeteer from 'puppeteer';
import { snapshot } from '@web-clone/core';
import { PuppeteerFetcherAdapter } from '@web-clone/adapter-puppeteer';

async function main() {
  const browser = await puppeteer.launch({ headless: true });

  try {
    const page = await browser.newPage();

    try {
      // ── Step 1: Perform your authentication logic ─────────────
      console.log('◉ Logging in...');

      await page.goto('https://example.com/login', {
        waitUntil: 'networkidle2',
      });

      // Fill login form (YOUR LOGIC — we just provide an adapter)
      await page.type('input[name="email"]', process.env.AUTH_EMAIL || 'user@example.com');
      await page.type('input[name="password"]', process.env.AUTH_PASSWORD || 'password');
      await page.click('button[type="submit"]');

      // Wait for navigation or redirect
      await page.waitForNavigation({ waitUntil: 'networkidle2' });
      console.log('✓ Authentication successful');

      // ── Step 2: Use authenticated session to snapshot ─────────
      // The page now has authentication cookies.
      // PuppeteerFetcherAdapter will automatically forward cookies
      // to sub-resource requests via raw HTTP fetch.
      const adapter = new PuppeteerFetcherAdapter(page, {
        waitForLoadState: 'networkidle',
        executeJs: true,
      });

      const result = await snapshot({
        url: 'https://example.com/dashboard',
        output: './examples/output/auth-snapshot',
        mode: 'bundle',
      }, adapter);

      console.log('\n✓ Authenticated snapshot complete!');
      console.log(`  Total assets: ${result.stats.total}`);
      console.log(`  Fetched: ${result.stats.fetched}`);

      // ── Step 3 (optional): Extract auth context for reuse ──
      const auth = await adapter.getAuthContext();
      if (auth.cookies && auth.cookies.length > 0) {
        console.log(`  Cookies captured: ${auth.cookies.length}`);
      }
      if (auth.token) {
        console.log(`  Auth token found: ${auth.token.slice(0, 20)}...`);
      }
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
