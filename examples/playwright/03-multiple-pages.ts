/**
 * Playwright Snapshot - Multiple Pages Example
 *
 * Demonstrates snapshotting multiple pages using the same authenticated context.
 * This is useful when you need to snapshot an entire site or multiple views.
 */

import { chromium } from 'playwright';
import { snapshot } from '@web-clone/core';
import { PlaywrightFetcherAdapter } from '@web-clone/adapter-playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();

    try {
      // Optional: Perform authentication once
      const authPage = await context.newPage();
      await authPage.goto('https://example.com/login');
      // ... your login logic here ...
      await authPage.close();

      // Now snapshot multiple pages with the authenticated context
      const pagesToSnapshot = [
        { url: 'https://example.com/', output: './snapshots/home' },
        { url: 'https://example.com/dashboard', output: './snapshots/dashboard' },
        { url: 'https://example.com/settings', output: './snapshots/settings' },
      ];

      for (const page of pagesToSnapshot) {
        console.log(`\n◉ Snapshotting: ${page.url}`);

        const snapshotPage = await context.newPage();

        try {
          const adapter = new PlaywrightFetcherAdapter(snapshotPage, context, {
            waitForLoadState: 'networkidle',
            executeJs: true,
          });

          const result = await snapshot({
            url: page.url,
            output: page.output,
            mode: 'bundle',
          }, adapter);

          console.log(`  ✓ Complete: ${result.stats.fetched} assets fetched`);
        } finally {
          await snapshotPage.close();
        }
      }

      console.log('\n✓ All snapshots complete!');
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
