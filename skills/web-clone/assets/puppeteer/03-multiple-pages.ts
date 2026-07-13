/**
 * Puppeteer Snapshot — Multiple Pages Example
 *
 * Demonstrates snapshotting multiple pages using the same browser instance.
 * Cookies are automatically forwarded from the current page for each snapshot.
 *
 * Usage:
 *   pnpm tsx examples/puppeteer/03-multiple-pages.ts
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
    // ── Optional: Perform authentication once ──────────────
    // Puppeteer cookies are per-page, so if you need auth on all pages,
    // use the same page for all snapshots, or re-authenticate per page.
    // For simplicity, this example snaps public pages without auth.

    const pagesToSnapshot = [
      { url: 'https://example.com/',        output: './snapshots/home' },
      { url: 'https://example.com/about',   output: './snapshots/about' },
      { url: 'https://example.com/contact', output: './snapshots/contact' },
    ];

    for (const item of pagesToSnapshot) {
      console.log(`\n◉ Snapshotting: ${item.url}`);

      // Create a fresh page for each URL (clean state)
      const page = await browser.newPage();

      try {
        const adapter = new PuppeteerFetcherAdapter(page, {
          waitForLoadState: 'networkidle',
          executeJs: true,
        });

        const result = await snapshot({
          url: item.url,
          output: item.output,
          mode: 'bundle',
        }, adapter);

        console.log(`  ✓ Complete: ${result.stats.fetched} assets fetched (${result.stats.totalBytes} bytes)`);
      } finally {
        await page.close();
      }
    }

    console.log('\n✓ All snapshots complete!');
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
