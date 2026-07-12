/**
 * Basic Playwright Snapshot Example
 *
 * Demonstrates the simplest usage of web-clone with Playwright.
 * This is the recommended starting point.
 */

import { chromium } from 'playwright';
import { snapshot } from 'web-clone';
import { PlaywrightFetcherAdapter } from 'web-clone/adapters';

async function main() {
  // Launch browser (user controls this)
  const browser = await chromium.launch({ headless: true });

  try {
    // Create browser context and page (user controls this)
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // Create adapter from your page and context
      const adapter = new PlaywrightFetcherAdapter(page, context, {
        waitForLoadState: 'networkidle',
        executeJs: true,
      });

      // Use snapshot() with the adapter
      const result = await snapshot({
        url: 'https://example.com',
        output: './snapshot',
        mode: 'bundle',
      }, adapter);

      console.log('✓ Snapshot complete!');
      console.log(`  Total assets: ${result.stats.total}`);
      console.log(`  Fetched: ${result.stats.fetched}`);
      console.log(`  Failed: ${result.stats.failed}`);
    } finally {
      await page.close();
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
