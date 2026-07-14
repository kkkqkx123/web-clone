/**
 * Basic Puppeteer Snapshot Example
 *
 * Demonstrates the simplest usage of web-clone with Puppeteer.
 * This is the recommended starting point for Puppeteer users.
 *
 * Usage:
 *   pnpm tsx examples/puppeteer/01-basic-snapshot.ts
 *
 * Prerequisites:
 *   pnpm add puppeteer @web-clone/core @web-clone/adapter-puppeteer
 */

import puppeteer from 'puppeteer';
import { snapshot } from '@web-clone/core';
import { PuppeteerFetcherAdapter } from '@web-clone/adapter-puppeteer';

async function main() {
  // 1. Launch browser (you control this)
  const browser = await puppeteer.launch({ headless: true });

  try {
    // 2. Create a new page
    const page = await browser.newPage();

    try {
      // 3. Create adapter from your page
      //    Note: Puppeteer adapter only needs a page (no separate context object)
      const adapter = new PuppeteerFetcherAdapter(page, {
        waitForLoadState: 'networkidle',
        executeJs: true,
      });

      // 4. Use snapshot() with the adapter
      const result = await snapshot({
        url: 'https://example.com',
        output: './examples/output/snapshot',
        mode: 'bundle',
      }, adapter);

      console.log('✓ Snapshot complete!');
      console.log(`  Total assets: ${result.stats.total}`);
      console.log(`  Fetched: ${result.stats.fetched}`);
      console.log(`  Failed: ${result.stats.failed}`);
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
