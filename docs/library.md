# Library API Reference

> **Language**: English (code/API), 简体中文 (explanation)

web-clone is organized as a monorepo with 5 library packages and 1 CLI application.
This document covers the library API for each package — suitable for users who
want to import web-clone programmatically into their own projects.

---

## Package Overview

| Package | npm Scope | Description |
|---------|-----------|-------------|
| Core | `@web-clone/core` | Snapshot engine, parsers, output assemblers, component analysis, query, validation |
| Adapter Common | `@web-clone/adapter-common` | Shared SPA hydration detection and automation types |
| Adapter Playwright | `@web-clone/adapter-playwright` | Playwright browser integration (hard dep on Playwright) |
| Adapter Puppeteer | `@web-clone/adapter-puppeteer` | Puppeteer browser integration (hard dep on Puppeteer) |
| Codegen | `@web-clone/codegen` | Framework code generators (Vue/React/Angular/Svelte/jQuery) |
| CLI | `web-clone-cli` | Commander-based CLI (separate application) |

---

## @web-clone/core

The core library. Provides the snapshot engine, HTML/CSS parsers, output assemblers,
component extraction, query/data extraction, validation, and resource filtering.

### Installation

```bash
pnpm add @web-clone/core
```

Peer dependencies (optional):
- `jsdom` — required for component extraction and query subcommands
- `@web-clone/codegen` — required for framework code generation

### Entry Point

```typescript
import { snapshot } from '@web-clone/core';
```

### Exports

#### ▸ `snapshot(url, options, adapter?)`

Core snapshot function. Fetches a web page, downloads its assets, and assembles
the output (single HTML file or bundle directory).

```typescript
async function snapshot(
  url: string,
  options: SnapshotOptions,
  adapter?: FetcherAdapter,  // defaults to HttpFetcherAdapter
): Promise<SnapshotResult>
```

**Basic usage** (HTTP only):

```typescript
import { snapshot } from '@web-clone/core';

const result = await snapshot('https://example.com', {
  output: './snapshot',
  mode: 'bundle',        // 'single' | 'bundle'
  maxAssets: 100,
  concurrency: 6,
  timeout: 15000,
  inline: true,
  pretty: false,
});
```

**With custom adapter** (Playwright):

```typescript
import { chromium } from 'playwright';
import { snapshot } from '@web-clone/core';
import { PlaywrightFetcherAdapter } from '@web-clone/adapter-playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
const context = browser.defaultContext();

const adapter = new PlaywrightFetcherAdapter(page, context, {
  waitForLoadState: 'networkidle',
  timeout: 30000,
});

const result = await snapshot('https://spa-site.com', {
  output: './snapshot',
  mode: 'bundle',
}, adapter);

await browser.close();
```

---

#### ▸ `convertLocalSnapshot(options)`

Run component extraction and code generation on an existing local snapshot
(bundle directory or single HTML file). Skips URL fetch entirely.

```typescript
async function convertLocalSnapshot(options: SnapshotOptions): Promise<SnapshotResult>
```

```typescript
import { convertLocalSnapshot } from '@web-clone/core';

const result = await convertLocalSnapshot({
  url: './snapshot',          // path to existing output
  output: './output',
  mode: 'bundle',
  extractComponents: true,
  frameworkHint: 'vue',
  frameworkCodegen: {
    framework: 'vue',
    typescript: true,
    extractSharedLogic: true,
  },
});
```

---

#### ▸ SnapshotOptions

```typescript
interface SnapshotOptions {
  /** Target URL (or local path when using convertLocal) */
  url: string;
  /** Output path */
  output: string;
  /** Output format */
  mode: 'single' | 'bundle';
  /** Max assets to download */
  maxAssets: number;
  /** Concurrent download count */
  concurrency: number;
  /** Per-resource timeout in ms */
  timeout: number;
  /** Retry count for failed downloads */
  retryCount: number;
  /** Initial retry backoff delay in ms */
  retryInitialDelay?: number;
  /** Max retry backoff delay in ms */
  retryMaxDelay?: number;
  /** Inline resources as data URIs (single mode only) */
  inline: boolean;
  /** Prettify output HTML */
  pretty: boolean;

  // ── Component extraction ──
  /** Enable component extraction */
  extractComponents?: boolean;
  /** Filter components (e.g. "confidence >= 0.7") */
  componentFilter?: string;
  /** Limit recognition depth (undefined = no limit) */
  componentDepth?: number;
  /** Framework hint: 'vue' | 'react' | 'svelte' */
  frameworkHint?: FrameworkHint;
  /** Extract JS logic (default: true) */
  extractLogic?: boolean;
  /** Framework code generation config */
  frameworkCodegen?: FrameworkCodeGenOptions;
  /** Memory budget for extraction (MB) */
  memoryLimit?: number;

  // ── Resource filtering ──
  /** Named preset */
  resourcePreset?: ResourcePreset;
  /** Explicit skip list (overrides preset) */
  skipExtensions?: string[];
  /** Extensions to forcibly include */
  includeExtensions?: string[];
  /** Extensions to forcibly exclude */
  excludeExtensions?: string[];
  /** Hard per-file size limit (bytes) */
  maxFileSize?: number;

  // ── Local conversion ──
  /** Local path (alternative to URL fetch) */
  convertLocal?: string;

  // ── Advanced ──
  /** Strict HTTP status codes */
  strictStatusCodes?: boolean;
  /** Recursive scan depth (1 = current, 2+ = scan JS/JSON) */
  scanDepth?: number;
  /** Scan JS files for embedded URLs */
  scanJs?: boolean;
  /** Scan JSON files for media URLs */
  scanJson?: boolean;
  /** Hybrid mode: browser for HTML, HTTP pool for assets */
  hybrid?: boolean;
}
```

---

#### ▸ SnapshotResult

```typescript
interface SnapshotResult {
  output: string;
  stats: {
    total: number;
    fetched: number;
    failed: number;
    skipped: number;
    totalBytes: number;
  };
  assets: Asset[];
  snapshot: string;         // HTML content
}
```

When component extraction is enabled, the result also contains:

```typescript
interface ConvertResult extends SnapshotResult {
  components: Map<string, ComponentSpec>;
  componentTree: Record<string, unknown>;
  index: Record<string, unknown>;
}
```

---

#### ▸ `startSnapshotServer(outputDir, options)`

Start a local HTTP server to serve a snapshot directory. Supports static file serving with ETag/Last-Modified cache control, CORS headers, and optional reverse proxy.

```typescript
import { startSnapshotServer } from '@web-clone/core';

const server = startSnapshotServer('./snapshot', {
  port: 8080,
  originUrl: 'https://example.com',
  proxy: true,
});
```

**SnapshotServerOptions:**

```typescript
interface SnapshotServerOptions {
  port: number;
  originUrl?: string;
  proxy?: boolean;
}
```

---

#### ▸ `generateStandaloneServerFiles(outputDir, options)`

Generate standalone server files (`server.js`, `package.json`, `proxy-config.json`, `start.bat`, `start.sh`) in the output directory. The generated `server.js` uses only Node.js built-in modules — zero npm dependencies.

```typescript
import { generateStandaloneServerFiles } from '@web-clone/core';

generateStandaloneServerFiles('./snapshot', {
  url: 'https://example.com',
  proxy: true,
});
```

**GenerateServerOptions:**

```typescript
interface GenerateServerOptions {
  /** The original source URL (used as proxy origin) */
  url: string;
  /** Enable reverse proxy for runtime API requests (default: false) */
  proxy?: boolean;
}
```

After generation, the output directory is self-contained:

```bash
cd ./snapshot
node server.js              # Start on port 8080
PORT=3000 node server.js    # Custom port
npm run serve               # Via package.json
```

---

#### ▸ FetcherAdapter Interface

```typescript
interface FetcherAdapter {
  fetch(url: string, options: FetchOptions): Promise<FetchResult>;
  canAccess?(url: string): Promise<boolean>;
  getAuthContext?(): Promise<AuthContext>;
  dispose?(): Promise<void>;
}
```

**Implementations included:**

| Adapter | Package | Description |
|---------|---------|-------------|
| `HttpFetcherAdapter` | `@web-clone/core` (built-in) | Default HTTP-based fetcher |
| `PlaywrightFetcherAdapter` | `@web-clone/adapter-playwright` | Playwright browser adapter |
| `PuppeteerFetcherAdapter` | `@web-clone/adapter-puppeteer` | Puppeteer browser adapter |

---

#### ▸ HttpFetcherAdapter

Built-in HTTP adapter. Used by default when no adapter is passed to `snapshot()`.

```typescript
import { HttpFetcherAdapter } from '@web-clone/core';

const adapter = new HttpFetcherAdapter({
  timeout: 15000,
  validateSSL: true,
  followRedirects: true,
  headers: {
    'User-Agent': 'Mozilla/5.0...',
  },
});
```

---

#### ▸ Resource Filtering

```typescript
import {
  ResourceFilter,
  resolveSkipExtensions,
  resolveGroupOverrides,
  RESOURCE_PRESETS,
  EXTENSION_GROUPS,
} from '@web-clone/core';
```

- `RESOURCE_PRESETS` — available presets: `none`, `minimal`, `default`, `no-media`, `aggressive`
- `EXTENSION_GROUPS` — extension category groups (wasm, bin, video, audio, fonts, etc.)
- `resolveGroupOverrides(includes, excludes)` — compute final include/exclude lists
- `ResourceFilter` — class to filter `AssetRef[]` by extension rules

---

#### ▸ HTML/CSS Parsers

```typescript
import { parseHtml } from '@web-clone/core';
// parse HTML document → extract asset references (CSS, JS, img, font, media)
```

---

#### ▸ Validation & Cleanup

```typescript
import {
  validateSnapshot,
  cleanSnapshot,
  formatValidationReport,
  formatCleanResult,
} from '@web-clone/core';
```

- `validateSnapshot(outputDir)` — inspect a snapshot directory for integrity issues
- `cleanSnapshot(outputDir, options, downloadFn?)` — remove corrupted/zero-byte files, optionally re-download

---

#### ▸ Component Extraction (programmatic)

Use the `convert()` function directly if you already have HTML/CSS/JS strings:

```typescript
import { convert } from '@web-clone/core';  // Note: internal, use snapshot() with extractComponents

// For direct access to analysis pipeline:
// 1. analyzeHtml()      — HTML component boundary detection
// 2. analyzeCss()       — CSS variable extraction, BEM grouping
// 3. analyzeJavaScript() — State variable extraction, event handlers
// 4. correlateComponents() — Match HTML ↔ CSS ↔ JS
// 5. generateComponentStructure() — Build component specs
```

---

#### ▸ Query / Data Extraction (ax integration)

Extract structured data from HTML without downloading assets:

```typescript
import {
  // Query engine
  compileWhere,           // Compile filter expression (e.g. "age >= 18")
  runQuery,               // Run a compiled query against a set of rows
  typeOf,                 // Infer expression type
  toTsv,                  // Convert results to TSV
  emitQueryResult,        // Format and emit query results

  // HTML analysis
  inspectStructure,       // Detect repeating DOM structures (outline)
  locateElement,          // Find elements containing text
  countElements,          // Count elements matching a CSS selector
  toMarkdown,             // Convert HTML to Markdown
  tableToRows,            // Parse HTML tables to structured rows
  rowStats,               // Row count statistics
  parseRowSpec,           // Parse "name=sel, name=sel@attr" row spec
  collapse, signature, selectorPath, inlineToMd,
} from '@web-clone/core';

// Output formatting
import { sanitizeLine, emitLines, emitJson } from '@web-clone/core';
```

---

#### ▸ Config Helpers

```typescript
import {
  DEFAULTS,
  safeInt,
  parseBool,
  parseCodegenFramework,
  parseFrameworkHint,
  parseResourcePreset,
  parseFileSize,
  validateOptions,
  loadMergedConfig,
} from '@web-clone/core';
```

- `DEFAULTS` — built-in default values
- `loadMergedConfig()` — loads global + project-level config files and merges them
- `validateOptions(opts)` — validate and clamp SnapshotOptions

---

#### ▸ Worker Pool

```typescript
import { runPool } from '@web-clone/core';

// Generic concurrent task executor with timeout protection
const results = await runPool(tasks, {
  concurrency: 6,
  maxTasks: 100,
  timeoutMs: 30000,
}, onTaskComplete);
```

---

#### ▸ Memory Budget

```typescript
import { assessMemoryBudget, MemoryWatchdog } from '@web-clone/core';

// Assess memory strategy based on input sizes
const budget = assessMemoryBudget(html, css, js, maxMemoryMB);

// Runtime memory monitoring
const watchdog = new MemoryWatchdog(1536); // 1536 MB limit
```

---

#### ▸ Types

```typescript
import type {
  Asset, AssetRef, AssetType, AssetStatus,
  ComponentSpec, ComponentManifest, ComponentRoot,
  StateVariable, EventBinding, MethodSpec, MigrationTodo,
  ConvertResult, GeneratedComponent, GeneratedFramework,
  FrameworkHint, CodegenFramework, ResourcePreset,
  MemoryBudget, HtmlStrategy, CssStrategy, JsStrategy,
  ValidationReport, ValidationIssue, ValidationSeverity,
  CleanOptions, CleanResult, DownloadFn,
  WebCloneConfigFile, MergedConfig,
  FetcherAdapter, FetchOptions, FetchResult, AuthContext,
  QueryEmitOptions, OutlineEntry, LocateHit, TableResult,
  EmitOptions, EmitResult,
} from '@web-clone/core';
```

---

### Package Exports Map

```json
{
  ".": "./dist/index.js",
  "./adapters": "./dist/adapters/index.js",
  "./types": "./dist/types.js",
  "./config": "./dist/config/schema.js"
}
```

| Subpath | Contents |
|---------|----------|
| `@web-clone/core` | Main entry — snapshot, types, parsers, config, validation, query, resource filter |
| `@web-clone/core/adapters` | FetcherAdapter interface + HttpFetcherAdapter implementation |
| `@web-clone/core/types` | Core type definitions |
| `@web-clone/core/config` | Config schema types |

---

## @web-clone/adapter-common

Shared utilities for browser automation adapters.

### Installation

```bash
pnpm add @web-clone/adapter-common
```

### Exports

```typescript
export { waitForSpaHydration } from './spa-detector.js';
export type { SpaPageLike, SpaDetectorOptions } from './spa-detector.js';
```

#### ▸ `waitForSpaHydration(page, options?)`

Framework-agnostic SPA hydration detector. Works with both Playwright and Puppeteer pages.

```typescript
import { waitForSpaHydration, type SpaPageLike } from '@web-clone/adapter-common';

// After page.goto()
await waitForSpaHydration(page, {
  timeout: 30000,
  logPrefix: '[My Adapter]',
});
```

**Supported frameworks:**
- Vue 2/3 (detects `__vue__`, `__vue_app__`, `__nuxt`)
- React (detects `__reactFiber$`, `__reactInternalInstance$`)
- Angular (detects `ng-version`, `__ngContext__`)
- Nuxt 2/3 (detects `window.$nuxt`, `window.__NUXT__`)

The `SpaPageLike` interface is a minimal page abstraction compatible with both
Playwright's `Page` and Puppeteer's `Page`:

```typescript
interface SpaPageLike {
  evaluate<T>(fn: Function | string, ...args: any[]): Promise<T>;
  waitForFunction(fn: Function | string, options?: { timeout?: number }, ...args: any[]): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
}
```

---

## @web-clone/adapter-playwright

Playwright browser automation adapter. Provides rendered HTML snapshots of
SPA/SSR applications with authentication support.

### Installation

```bash
pnpm add @web-clone/adapter-playwright
# Peer: also install playwright in your project
pnpm add playwright
```

### Exports

```typescript
export { PlaywrightFetcherAdapter } from './adapter.js';
export type { PlaywrightAdapterOptions, PlaywrightWaitUntil } from './options.js';
```

### Usage

```typescript
import { chromium } from 'playwright';
import { snapshot } from '@web-clone/core';
import { PlaywrightFetcherAdapter } from '@web-clone/adapter-playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

const adapter = new PlaywrightFetcherAdapter(page, context, {
  timeout: 30000,
  waitForLoadState: 'networkidle',   // 'load' | 'domcontentloaded' | 'networkidle'
  executeJs: true,                    // Enable JS execution for main document
  validateSSL: true,                  // Validate SSL certificates
  debugScreenshot: './debug.png',     // Optional debug screenshot path
  customHeaders: {                    // Custom request headers
    'Authorization': 'Bearer <token>',
  },
});

const result = await snapshot('https://example.com', {
  output: './snapshot',
  mode: 'bundle',
}, adapter);

await browser.close();
```

### PlaywrightAdapterOptions

```typescript
interface PlaywrightAdapterOptions {
  /** Timeout in ms (default: 30000) */
  timeout?: number;
  /** Load event to wait for (default: 'networkidle') */
  waitForLoadState?: PlaywrightWaitUntil;
  /** Execute JS during page load (default: true) */
  executeJs?: boolean;
  /** Validate SSL certificates (default: true) */
  validateSSL?: boolean;
  /** Path to save debug screenshot (default: none) */
  debugScreenshot?: string;
  /** Custom request headers */
  customHeaders?: Record<string, string>;
  /** Wait for navigation after fetch (default: true) */
  waitForNavigation?: boolean;
}

type PlaywrightWaitUntil = 'load' | 'domcontentloaded' | 'networkidle';
```

### Key Features

- **Page rendering**: uses `page.goto()` for HTML, `context.request.fetch()` for sub-resources
- **Auth support**: cookies and session state are inherited automatically from browser context
- **getAuthContext()**: extracts cookies + localStorage tokens for reuse
- **SPA hydration**: automatically waits for Vue/React/Angular hydration after page load
- **SSL control**: can disable SSL validation for self-signed certificates

---

## @web-clone/adapter-puppeteer

Puppeteer browser automation adapter. Alternative to Playwright for projects
already using Puppeteer.

### Installation

```bash
pnpm add @web-clone/adapter-puppeteer
# Peer: also install puppeteer in your project
pnpm add puppeteer
```

### Exports

```typescript
export { PuppeteerFetcherAdapter } from './adapter.js';
export type { PuppeteerAdapterOptions, PuppeteerWaitUntil } from './options.js';
```

### Usage

```typescript
import puppeteer from 'puppeteer';
import { snapshot } from '@web-clone/core';
import { PuppeteerFetcherAdapter } from '@web-clone/adapter-puppeteer';

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();

const adapter = new PuppeteerFetcherAdapter(page, {
  timeout: 30000,
  waitForLoadState: 'networkidle',   // 'load' | 'domcontentloaded' | 'networkidle'
  executeJs: true,                    // Enable JS execution
  validateSSL: true,
  debugScreenshot: './debug.png',
  customHeaders: { 'Authorization': 'Bearer <token>' },
});

const result = await snapshot('https://example.com', {
  output: './snapshot',
  mode: 'bundle',
}, adapter);

await browser.close();
```

### PuppeteerAdapterOptions

```typescript
interface PuppeteerAdapterOptions {
  timeout?: number;
  waitForLoadState?: PuppeteerWaitUntil;
  executeJs?: boolean;
  validateSSL?: boolean;
  debugScreenshot?: string;
  customHeaders?: Record<string, string>;
}

type PuppeteerWaitUntil = 'load' | 'domcontentloaded' | 'networkidle';
```

### Key Differences from Playwright

| Aspect | Playwright | Puppeteer |
|--------|------------|-----------|
| Auth context | `context.cookies()` + `context.storageState()` | `page.cookies()` + `page.evaluate(localStorage)` |
| Sub-resources | `context.request.fetch()` (browser API) | Raw HTTP `fetch()` with cookie forwarding |
| Page management | Separates `page` and `context` | Single `page` object |
| Constructor | `(page, context, options)` | `(page, options)` |

---

## @web-clone/codegen

Framework code generators. Converts extracted component specifications into
actual framework component source code.

### Installation

```bash
pnpm add @web-clone/codegen
```

### Exports

```typescript
export { FrameworkCodeGenerator } from './index.js';  // main class
export { SharedLogicExtractor } from './shared-logic-extractor.js';
export { ConfigGenerator } from './config-generator.js';
```

Subpath exports for individual generators:

| Subpath | Generator |
|---------|-----------|
| `@web-clone/codegen/vue` | `VueGenerator` |
| `@web-clone/codegen/react` | `ReactGenerator` |
| `@web-clone/codegen/angular` | `AngularGenerator` |
| `@web-clone/codegen/svelte` | `SvelteGenerator` |
| `@web-clone/codegen/jquery` | `JQueryGenerator` |

### Usage

```typescript
import { FrameworkCodeGenerator } from '@web-clone/codegen';
import type { ComponentSpec, FrameworkCodeGenOptions } from '@web-clone/core';

const generator = new FrameworkCodeGenerator();

// Generate individual components
const components = generator.generateComponents(specs, {
  framework: 'vue',
  typescript: true,
});

// Generate app template (root component that imports child components)
const appTemplate = generator.generateAppTemplate(components, {
  framework: 'vue',
  typescript: true,
});

// Generate main entry point (index.ts / main.ts)
const mainEntry = generator.generateMainEntry({
  framework: 'vue',
  typescript: true,
});

// Generate package.json
const packageJson = generator.generatePackageJson({
  framework: 'vue',
  typescript: true,
  generateDrafts: true,
});
```

### Supported Frameworks

| Framework | File Extension | Style System |
|-----------|---------------|--------------|
| Vue | `.vue` (SFC) | `<style scoped>` |
| React | `.jsx` / `.tsx` | Plain CSS or CSS Modules |
| Angular | `.ts` + `.html` + `.css` | Component-scoped styles |
| Svelte | `.svelte` | `<style>` scoped |
| jQuery | `.js` / `.ts` | Separate CSS file |

### FrameworkCodeGenOptions

```typescript
interface FrameworkCodeGenOptions {
  framework?: 'vue' | 'react' | 'angular' | 'svelte' | 'jquery';
  typescript?: boolean;           // Use .tsx / .ts extension (default: true)
  cssModules?: boolean;           // CSS Modules for React (default: false)
  generateDrafts?: boolean;        // Generate full project template
  extractSharedLogic?: boolean;    // Extract shared utilities
}
```

---

## web-clone-cli

The CLI application. Built on Commander. See [docs/commands.md](./commands.md) for full documentation.

### Installation (global)

```bash
pnpm add -g web-clone-cli
snapshot --help
```

### Installation (dev)

```bash
pnpm --filter web-clone-cli add
pnpm dev:cli -- <url> [options]
```

---

## Custom Adapter Example

Implement the `FetcherAdapter` interface to integrate web-clone with any
resource source (caching, custom auth, proxy chains, etc.):

```typescript
import type { FetcherAdapter, FetchOptions, FetchResult, AuthContext } from '@web-clone/core';

class CustomCachingAdapter implements FetcherAdapter {
  private cache = new Map<string, FetchResult>();

  async fetch(url: string, options: FetchOptions): Promise<FetchResult> {
    if (this.cache.has(url)) {
      return this.cache.get(url)!;
    }
    const result = await yourCustomFetch(url, options);
    this.cache.set(url, result);
    return result;
  }

  async canAccess(url: string): Promise<boolean> {
    // Quick availability check (HEAD request, etc.)
    return true;
  }

  async getAuthContext(): Promise<AuthContext> {
    return { cookies: [], headers: {} };
  }

  async dispose(): Promise<void> {
    this.cache.clear();
  }
}

// Use it:
const adapter = new CustomCachingAdapter();
const result = await snapshot('https://example.com', options, adapter);
```

---

## Programmatic Usage Patterns

### Pattern 1: Basic HTTP Snapshot

```typescript
import { snapshot } from '@web-clone/core';

const result = await snapshot('https://example.com', {
  output: './output',
  mode: 'bundle',
  maxAssets: 200,
  concurrency: 8,
});
console.log(result.stats);
// { total: 42, fetched: 40, failed: 2, skipped: 0, totalBytes: 1520000 }
```

### Pattern 2: Snapshot with Component Extraction

```typescript
import { snapshot } from '@web-clone/core';

const result = await snapshot('https://example.com', {
  output: './output',
  mode: 'bundle',
  extractComponents: true,
  componentDepth: 5,
  frameworkHint: 'react',
  extractLogic: true,
});

if ('components' in result) {
  for (const [name, spec] of result.components) {
    console.log(`Component: ${name} (${spec.type})`);
    console.log(`  Confidence: ${spec.matchConfidence}`);
  }
}
```

### Pattern 3: Validate and Clean After Snapshot

```typescript
import { validateSnapshot, cleanSnapshot, formatValidationReport } from '@web-clone/core';

// Validate
const report = validateSnapshot('./output');
console.log(formatValidationReport(report));

// Clean
const result = await cleanSnapshot('./output', {
  dryRun: false,
  removeZeroByte: true,
  removeCorrupted: true,
  reDownload: true,
});
```

### Pattern 4: Structured Data Extraction

```typescript
import { JSDOM } from 'jsdom';
import { tableToRows, compileWhere, rowStats } from '@web-clone/core';

const dom = new JSDOM(await fetch(url).then(r => r.text()));
const tables = [...dom.window.document.querySelectorAll('table')];

for (const table of tables) {
  const { headers, rows } = tableToRows(table);

  // Filter rows
  const wherePred = compileWhere('Stars >= 100');
  const filtered = rows.filter(wherePred);

  console.log(`${headers.join('\t')}`);
  for (const row of filtered) {
    console.log(headers.map(h => row[h]).join('\t'));
  }
}
```

### Pattern 5: Framework Code Generation

```typescript
import { FrameworkCodeGenerator } from '@web-clone/codegen';
import type { ComponentSpec } from '@web-clone/core';

const specs: ComponentSpec[] = [ /* ...extracted components */ ];
const generator = new FrameworkCodeGenerator();

const genComponents = generator.generateComponents(specs, {
  framework: 'react',
  typescript: true,
  cssModules: true,
});

// genComponents[0].code  → JSX code string
// genComponents[0].style → CSS string
// genComponents[0].path  → relative path like 'components/Header.tsx'
```

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                 User Project (your code)                  │
│  import { snapshot } from '@web-clone/core'               │
└───────────┬──────────────────────────────┬───────────────┘
            │ snapshot()                   │ snapshot(..., adapter)
            ▼                              ▼
┌───────────────────────┐    ┌─────────────────────────────┐
│  HttpFetcherAdapter   │    │  PlaywrightFetcherAdapter    │
│  (built-in, no deps)  │    │  (optional, needs PW)        │
├───────────────────────┤    ├─────────────────────────────┤
│  - fetch()            │    │  - fetch() /w page.goto()   │
│  - no auth state      │    │  - getAuthContext()          │
└───────────────────────┘    └─────────────────────────────┘
            │                            │
            ▼                            ▼
┌──────────────────────────────────────────────────────────┐
│              @web-clone/core (snapshot engine)             │
│                                                            │
│  fetchHTML → parseHTML → extractCSSAssets → deduplicate   │
│  → downloadAllAssets → assembleBundle / assembleSingleFile │
│                                                            │
│  Optional: convert() → component extraction → codegen     │
└──────────────────────────────────────────────────────────┘
```

---

## Dependencies Overview

```
@web-clone/adapter-common ← @web-clone/adapter-playwright
                          ← @web-clone/adapter-puppeteer

@web-clone/core (peer)    ← @web-clone/codegen
@web-clone/core           ← @web-clone/adapter-common (dep)

web-clone-cli             ← @web-clone/core (dep)
                          ← @web-clone/codegen (dep)
                          ← @web-clone/adapter-playwright (optional)
                          ← @web-clone/adapter-puppeteer (optional)
```

- `adapter-playwright` and `adapter-puppeteer` are **optional** — only needed for browser automation
- `@web-clone/codegen` and `jsdom` are **optional peer deps** of `@web-clone/core`
- The CLI (`web-clone-cli`) pulls in adapters as optional dependencies
