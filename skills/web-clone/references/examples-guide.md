# Examples Guide

All examples are in `examples/`. They serve dual purpose: documentation for **framework library API usage** and runnable **verification scripts**.

## Overview

| Directory | Topic | Automation |
|-----------|-------|------------|
| `inspect/` | Page structure analysis APIs (`inspectStructure`, `locateElement`, `countElements`) | None (fetch-only) |
| `playwright/` | Snapshot + analysis using Playwright automation | Playwright |
| `puppeteer/` | Snapshot + analysis using Puppeteer automation | Puppeteer |
| `config-examples/` | JSON configuration files and README for config hierarchy | None |

## Running Examples

```bash
# Inspect examples (no browser needed)
npx tsx examples/inspect/01-page-discovery.ts <url>
npx tsx examples/inspect/02-ci-assertions.ts <url>
npx tsx examples/inspect/03-test-workflow-with-snapshot.ts <url>

# Playwright examples (requires playwright installed)
npx tsx examples/playwright/01-basic-snapshot.ts
npx tsx examples/playwright/02-with-authentication.ts
npx tsx examples/playwright/03-multiple-pages.ts
npx tsx examples/playwright/04-integrated-test-workflow.ts

# Puppeteer examples (requires puppeteer installed)
npx tsx examples/puppeteer/01-basic-snapshot.ts
npx tsx examples/puppeteer/02-with-authentication.ts
npx tsx examples/puppeteer/03-multiple-pages.ts
npx tsx examples/puppeteer/04-integrated-test-workflow.ts
```

All examples write output to `examples/output/`. This directory is created automatically and is gitignored.

### Environment Variables

| Variable | Affects | Description |
|----------|---------|-------------|
| `MIN_LINKS=<n>` | CI assertions | Minimum number of links expected |
| `MIN_IMAGES=<n>` | CI assertions | Minimum number of images expected |
| `MUST_CONTAIN_TEXT=<text>` | CI assertions | Text that must exist on the page |
| `TARGET_URL=<url>` | Integrated test workflow | URL to test (default: `https://example.com`) |
| `ASSET_BASE=<url>` | Integrated test workflow | Base URL for asset references |
| `ASSERT_TEXT=<text>` | Integrated test workflow | Text to assert on page |
| `OUTPUT_DIR=<path>` | All examples | Override output directory |

## Examples Detail

### inspect/01-page-discovery.ts

Demonstrates `@web-clone/core` library APIs for page analysis:
- `inspectStructure()` — Find repeating HTML structures
- `locateElement()` — Find elements containing specific text
- `countElements()` — Count CSS selector matches
- `toMarkdown()` — Convert HTML to Markdown
- `tableToRows()` — Parse HTML tables to structured rows
- `spaNote()` — Detect SPA husk pages

Run against any URL:
```bash
npx tsx examples/inspect/01-page-discovery.ts https://example.com
```

### inspect/02-ci-assertions.ts

Run as CI assertions to validate page structure programmatically. Supports configurable assertions via environment variables:

```bash
# Basic check
npx tsx examples/inspect/02-ci-assertions.ts https://example.com

# With custom assertions
MIN_LINKS=5 MIN_IMAGES=2 MUST_CONTAIN_TEXT="Search" \
  npx tsx examples/inspect/02-ci-assertions.ts https://example.com
```

### inspect/03-test-workflow-with-snapshot.ts

Runs multiple assertions (headings, alt text, broken links, text content), collects failure artifacts (HTML snapshot + report) on first failure:

```bash
npx tsx examples/inspect/03-test-workflow-with-snapshot.ts <url>
```

### playwright/* / puppeteer/*

Each browser automation example has a matching implementation for both Playwright and Puppeteer:

| # | Topic | Key Concept |
|---|-------|-------------|
| 01 | Basic snapshot | Simplest `snapshot()` call with a browser adapter |
| 02 | Authentication | Login flow, then snapshot with authenticated context |
| 03 | Multiple pages | Reuse a single browser context across multiple snapshots |
| 04 | Integrated workflow | Full pipeline: navigate → analyze → assert → snapshot on failure |

## Swapping Browser Instances

The browser adapters (`PlaywrightFetcherAdapter` / `PuppeteerFetcherAdapter`) accept user-controlled browser instances. This gives you full control over browser setup, authentication, and lifecycle.

### Pattern: User Controls the Browser

```typescript
// YOU create the browser, context, and page
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
  // Your login/interaction logic here
  await page.goto(url);
  await page.fill('input[name="email"]', email);
  await page.click('button[type="submit"]');

  // Create adapter from YOUR browser state
  const adapter = new PlaywrightFetcherAdapter(page, context, {
    waitForLoadState: 'networkidle',
    executeJs: true,
  });

  // Adapter inherits all cookies, localStorage, and auth state
  const result = await snapshot({ url, output, mode: 'bundle' }, adapter);
} finally {
  await page.close();
  await context.close();
  await browser.close();
}
```

### Swapping Playwright ↔ Puppeteer

Swap the import and adapter class — the rest of the logic stays identical:

```typescript
// Playwright
import { chromium } from 'playwright';
import { PlaywrightFetcherAdapter } from '@web-clone/adapter-playwright';
const adapter = new PlaywrightFetcherAdapter(page, context, opts);

// Puppeteer
import puppeteer from 'puppeteer';
import { PuppeteerFetcherAdapter } from '@web-clone/adapter-puppeteer';
const adapter = new PuppeteerFetcherAdapter(page, opts);
```

### Key Differences

| Aspect | Playwright | Puppeteer |
|--------|------------|-----------|
| Import | `import { chromium } from 'playwright'` | `import puppeteer from 'puppeteer'` |
| Browser launch | `chromium.launch()` | `puppeteer.launch()` |
| Adapter class | `PlaywrightFetcherAdapter` | `PuppeteerFetcherAdapter` |
| Context | Explicit `browser.newContext()` (2nd arg to adapter) | Implicit (single page per context) |
| Auth sharing | Pass context to adapter; all pages share cookies/tokens | Not supported cross-page |
| SPA hydration | Built-in detection for Vue/Nuxt | Not supported |

### Custom Browser Configuration

Pass any launch options directly:

```typescript
const browser = await chromium.launch({
  headless: false,            // Show browser window for debugging
  slowMo: 500,                // Slow down operations by 500ms
  args: ['--no-sandbox'],     // Additional Chromium flags
  timeout: 60000,             // Launch timeout
});
```

### Environment: PLAYWRIGHT_BROWSERS_PATH

When browsers are installed to a custom location, set the environment variable:

```bash
# PowerShell
$env:PLAYWRIGHT_BROWSERS_PATH = "D:\Source\pw-browsers"

# Git Bash
export PLAYWRIGHT_BROWSERS_PATH="D:\\Source\\pw-browsers"
```

Puppeteer users configure browser path via `executablePath`:

```typescript
const browser = await puppeteer.launch({
  executablePath: 'D:/Source/pw-browsers/chromium-1208/chrome-win64/chrome.exe',
});
```

## Notes

- Output goes to `examples/output/`. Add this directory to `.gitignore`.
- Inspect examples use only `fetch` + `@web-clone/core` — no browser needed.
- Playwright examples import `playwright` directly (peer dependency of `@web-clone/adapter-playwright`).
- Puppeteer examples require `puppeteer` to be installed separately.
