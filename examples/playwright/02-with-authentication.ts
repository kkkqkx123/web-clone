/**
 * Playwright Snapshot with Authentication Example
 *
 * Demonstrates how to use web-clone with Playwright for authenticated pages.
 * Your authentication logic is completely under your control.
 */

import { chromium } from 'playwright';
import { snapshot } from '@web-clone/core';
import { PlaywrightFetcherAdapter } from '@web-clone/adapter-playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();

    try {
      // Step 1: Perform your authentication logic
      const authPage = await context.newPage();

      await authPage.goto('https://example.com/login');

      // Fill login form (YOUR LOGIC - we just provide an adapter)
      await authPage.fill('input[name="email"]', process.env.AUTH_EMAIL || 'user@example.com');
      await authPage.fill('input[name="password"]', process.env.AUTH_PASSWORD || 'password');
      await authPage.click('button[type="submit"]');

      // Wait for navigation or redirect
      await authPage.waitForNavigation({ waitUntil: 'networkidle' });
      console.log('✓ Authentication successful');

      await authPage.close();

      // Step 2: Use authenticated context to snapshot
      const page = await context.newPage();

      try {
        // The context now has authentication cookies/tokens
        // All requests made by the adapter will automatically inherit them
        const adapter = new PlaywrightFetcherAdapter(page, context, {
          waitForLoadState: 'networkidle',
          executeJs: true,
        });

        const result = await snapshot({
          url: 'https://example.com/dashboard',
          output: './examples/output/auth-snapshot',
          mode: 'bundle',
        }, adapter);

        console.log('✓ Authenticated snapshot complete!');
        console.log(`  Total assets: ${result.stats.total}`);
      } finally {
        await page.close();
      }
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
