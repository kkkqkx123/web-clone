# web-clone

**Language**
Always use English in code files(include config files, comments) and use Simplified Chinese in docs.

## Project Overview

**web-clone** — Monorepo (pnpm + Turborepo) — see [docs/architecture/MONOREPO_DESIGN.md](docs/architecture/MONOREPO_DESIGN.md)

**web-clone** is a single-execution web page snapshot tool that downloads and bundles a complete webpage snapshot into either a self-contained HTML file or a directory structure. It can optionally extract and analyze component structure.

**Core capabilities:**
- Snapshot: Download entire webpage (HTML, CSS, JS, images, fonts, media)
- Output: Single HTML file or directory bundle with separated assets
- Transform: Extract component structure with state/event analysis (optional)

## Build & Development

```bash
pnpm install              # Install all dependencies
pnpm build                # Build all packages (turbo run build)
pnpm dev:cli -- <url>     # Run CLI via tsx
pnpm dev                  # All packages in watch mode
pnpm test                 # Run all tests (turbo run test)
pnpm clean                # Clean all dist directories
```

Entry point for development: `apps/cli/src/cli.ts`

## CLI Usage

```bash
pnpm dev:cli -- <url> [options]
pnpm --filter web-clone-cli dev -- <url> [options]
node apps/cli/dist/cli.js <url> [options]  # After pnpm build
```

**Common options:**
- `-o, --output <path>` — Output path (default: `./snapshot`)
- `-m, --mode <type>` — `single` (HTML file) or `bundle` (directory, default)
- `--extract-components` — Extract component structure (works with any mode)
- `--framework <hint>` — Framework hint for component extraction: `vue`, `react`, or `svelte`
- `--component-depth <n>` — Component recognition depth threshold (default: 4)
- `--max-assets <n>` — Limit total assets (default: 100)
- `--concurrency <n>` — Parallel downloads (default: 6)
- `--timeout <ms>` — Per-resource timeout (default: 15000)
- `--no-inline` — Skip data URI inlining
- `--pretty` — Prettify HTML
- `--skip-types <extensions>` — Comma-separated extensions to skip (e.g. `.zip,.mp4,.ts`); empty to disable; defaults to archives/installers/docs/video/audio/binaries
- `--max-file-size <size>` — Hard size limit per file (e.g. `50MB`, `10m`, or bytes; default: 50MB; 0 = no limit)
- `--browser <type>` — Browser automation engine: `playwright` | `puppeteer` (requires respective optional package)

## Packages

| Package | Description |
|---------|-------------|
| `@web-clone/core` | Core snapshot logic, HTTP adapter, types, component analysis |
| `@web-clone/adapter-common` | Shared SPA hydration detection & automation types |
| `@web-clone/adapter-playwright` | Playwright browser automation adapter |
| `@web-clone/adapter-puppeteer` | Puppeteer browser automation adapter |
| `@web-clone/codegen` | Framework code generators (Vue/React/Angular/Svelte/jQuery) |
| `web-clone-cli` | CLI application |

**Common options:**
- `-o, --output <path>` — Output path (default: `./snapshot`)
- `-m, --mode <type>` — `single` (HTML file) or `bundle` (directory, default)
- `--extract-components` — Extract component structure (works with any mode)
- `--framework <hint>` — Framework hint for component extraction: `vue`, `react`, or `svelte`
- `--component-depth <n>` — Component recognition depth threshold (default: 4)
- `--max-assets <n>` — Limit total assets (default: 100)
- `--concurrency <n>` — Parallel downloads (default: 6)
- `--timeout <ms>` — Per-resource timeout (default: 15000)
- `--no-inline` — Skip data URI inlining
- `--pretty` — Prettify HTML
- `--skip-types <extensions>` — Comma-separated extensions to skip (e.g. `.zip,.mp4,.ts`); empty to disable; defaults to archives/installers/docs/video/audio/binaries
- `--max-file-size <size>` — Hard size limit per file (e.g. `50MB`, `10m`, or bytes; default: 50MB; 0 = no limit)

## Architecture

The snapshot workflow is orchestrated by `packages/core/src/assembler.ts` in these stages:

### Main Pipeline (Snapshot)

1. **Fetch HTML** (`packages/core/src/fetcher.ts:fetchWithTimeout`) — Fetch page with timeout and User-Agent header
2. **Parse HTML** (`packages/core/src/parser/html-parser.ts:parseHtml`) — Extract asset refs (CSS, JS, img, font, media)
3. **Recursive CSS extraction** (`packages/core/src/assembler.ts` → `packages/core/src/parser/css-parser.ts`) — Download external CSS files, extract nested assets
4. **Deduplicate** (`packages/core/src/assembler.ts:dedupe`) — Remove duplicate URLs
5. **Download assets** (`packages/core/src/fetcher.ts:downloadAllAssets`) — Concurrent workers with retry and validation
6. **Assemble output**:
   - **Bundle mode** (`packages/core/src/output/bundle.ts:assembleBundle`) — Write assets to `assets/{css,js,img,fonts,data}/`, rewrite HTML paths
   - **Single mode** (`packages/core/src/output/single-file.ts:assembleSingleFile`) — Inline all CSS/JS, convert images/fonts to data URIs

### Optional: Component Extraction Pipeline

When `--extract-components` is specified:

1. **Extract inline CSS/JS** (`packages/core/src/assembler.ts:extractInlineCss/extractInlineJs`) — From `<style>` and `<script>` tags
2. **Merge with downloaded assets** (`packages/core/src/assembler.ts:extractCssFromAssets/extractJsFromAssets`) — Combine with downloaded CSS/JS
3. **HTML Analysis** (`packages/core/src/transform/component-analyzer.ts:enhanceHtmlAnalysis`)
   - Identify component boundaries: explicit markers → semantic tags → (optionally) depth-based
   - **No implicit depth limit**: By default, all DOM depths are analyzed for component boundaries
   - **Optional depth constraint**: Use `--component-depth <n>` to limit recognition to specified depth
   - Extract dynamic points: bindings, events, conditions
   - Build component hierarchy
4. **CSS Analysis** (`packages/core/src/transform/css-analyzer.ts:enhanceCssAnalysis`)
   - Extract CSS variables
   - Group rules by component (BEM-based)
   - Mark dynamic styles
5. **JS Analysis** (`packages/core/src/transform/js-analyzer.ts:analyzeJavaScript`)
   - Extract state variables (heuristic-based)
   - Identify event handlers and lifecycle hooks
   - Track DOM references
6. **Correlation** (`packages/core/src/transform/correlator.ts:correlateComponents`)
   - Match HTML components with CSS rules (class/ID matching)
   - Match with JS logic (DOM ref matching)
   - Calculate match confidence scores
7. **Generation** (`packages/core/src/transform/generator.ts:generateComponentStructure`)
   - Build component specs with manifests
   - Estimate migration effort
   - Generate suggestions
8. **Output** (`packages/core/src/output/convert.ts:assembleConvert`)
   - Write component directories
   - Generate README, MIGRATION guide
   - **NEW**: Generate REVIEW_REQUIRED.md for low-confidence components

### Key Modules (by package)

- **@web-clone/core** — Core snapshot logic (assembler, fetcher, validators, types), HTML/CSS parsers, output assemblers, component analysis engines, HTTP adapter
- **@web-clone/adapter-common** — Shared SPA hydration detection (`spa-detector.ts`), automation option types
- **@web-clone/adapter-playwright** — Playwright browser automation adapter
- **@web-clone/adapter-puppeteer** — Puppeteer browser automation adapter
- **@web-clone/codegen** — Framework code generators for Vue/React/Angular/Svelte/jQuery
- **web-clone-cli** — Commander CLI (`apps/cli/src/cli.ts`) with orthogonal options design

### Data Structures

```typescript
// CLI input - unified options
interface SnapshotOptions {
  url, output, mode: 'single'|'bundle',
  maxAssets, concurrency, timeout, retryCount, 
  inline, pretty,
  // NEW: Component extraction fields
  extractComponents?, componentDepth?, frameworkHint?, extractLogic?
}

// Discovered reference
interface AssetRef {
  url: string;
  type: AssetType; // 'css' | 'js' | 'img' | 'font' | 'media' | 'other'
  origin: string;
}

// Fetched asset
interface Asset {
  originUrl, localPath?, dataUri?, textContent?, type, status, size, mime, error?
}

// Extracted component (NEW enhancement)
interface ComponentSpec {
  name, type: 'stateful'|'presentational'|'unknown',
  template, styles, logic,
  manifest: ComponentManifest & { migration: { priority, effort, suggestions, todos } }
}
```

## Design Decisions

### Orthogonal Options (NEW)

**Before**: Three mutually exclusive modes: `single`, `bundle`, `convert`
- Problem: Users needed two runs to get both snapshot + components

**After**: Output mode + component extraction are orthogonal
- `-m single/bundle` — Choose snapshot format
- `--extract-components` — Optional, combines with any mode
- Result: One command generates both snapshot and components

### Confidence Scoring & Review (NEW)

**Before**: Low-confidence components silently included in manifests

**After**: 
- Components with `matchConfidence < 0.6` flagged in `REVIEW_REQUIRED.md`
- Sorted by confidence for manual triage
- Clear action items for corrections

### CSS/JS Source Merging (NEW)

**Before**: Component extraction only used `<style>` and `<script>` inline tags

**After**:
- Prefers inline CSS/JS (immediately available)
- Falls back to extracted CSS/JS from downloaded assets
- Comprehensive logic analysis regardless of delivery method

## Common Tasks

**To generate complete project backup with components:**
```bash
pnpm dev:cli -- https://example.com -o ./project -m bundle --extract-components
```

**To generate single-file snapshot with component analysis:**
```bash
pnpm dev:cli -- https://example.com -o snapshot.html -m single --extract-components
```

**To generate snapshot with browser automation:**
```bash
pnpm dev:cli -- https://spa-site.com --browser playwright
```

**To debug component extraction:**
- Check `components/*/manifest.json` for confidence scores
- Read `REVIEW_REQUIRED.md` for low-confidence matches
- Inspect `components/*/template.html` for boundary correctness

**To adjust component recognition:**
- Modify `--component-depth` (higher = more granular, slower)
- Set `--extract-logic false` to skip JS analysis (faster)

## Output Structure

### Bundle Mode + Components
```
output/
├── index.html                  # Main snapshot
├── assets/
│   ├── css/, js/, img/, fonts/, data/
├── snapshot.json
├── manifest.json
└── components/                 # Component extraction
    ├── components/
    │   ├── Header/, Footer/, etc.
    ├── index.json
    ├── README.md
    ├── MIGRATION.md
    └── REVIEW_REQUIRED.md      # NEW: Low-confidence items
```

### Single Mode + Components
```
snapshot.html                  # Main snapshot
snapshot_components/           # Component extraction
├── components/
├── index.json
├── README.md
├── MIGRATION.md
└── REVIEW_REQUIRED.md         # NEW: Low-confidence items
```

## Testing & Validation

- `pnpm test` — Run all tests via turbo
- `pnpm test:unit` — Unit tests for @web-clone/core only
- `pnpm test:integration` — Integration tests for CLI only
- Manual testing via `pnpm dev:cli -- <url>`
- Inspect output structure and HTTP status codes
- Use `REVIEW_REQUIRED.md` to validate component extraction quality

## Recent Changes (Monorepo Migration)

### What Changed

1. **Converted to pnpm + Turborepo monorepo**
   - Root workspace: `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `vitest.workspace.ts`
   - Package manager: pnpm (was npm)
   - Build system: Turborepo (was direct tsc)

2. **Split into 6 packages**
   - **`@web-clone/core`** — Core snapshot logic, types, HTTP adapter, component analysis
   - **`@web-clone/adapter-common`** — Shared SPA hydration detection & automation types
   - **`@web-clone/adapter-playwright`** — Playwright browser adapter (hard dep on playwright)
   - **`@web-clone/adapter-puppeteer`** — Puppeteer browser adapter (hard dep on puppeteer)
   - **`@web-clone/codegen`** — Framework code generators (Vue/React/Angular/Svelte/jQuery)
   - **`web-clone-cli`** — CLI application

3. **CLI in its own app (`apps/cli/`)**
   - `apps/cli/src/cli.ts` (was `src/cli.ts`)
   - `apps/cli/src/config/` (was `src/config/`)
   - Adapters are optional dependencies, dynamically loaded via `--browser` flag

4. **Removed `loadPlaywrightAdapter()` / `loadPuppeteerAdapter()`**
   - These were dynamic loaders in `src/adapters/index.ts`
   - Replaced by direct imports from `@web-clone/adapter-playwright` and `@web-clone/adapter-puppeteer`

5. **Updated commands**
   - `npm run dev` → `pnpm dev:cli`
   - `npm run build` → `pnpm build` (turbo parallel build)
   - `npm test` → `pnpm test` (turbo run test)

### Implementation Clarity

- **Single responsibility**: Component options are only set and used when `--extract-components` is true
- **No fallback logic**: Component-related fields (`componentDepth`, `frameworkHint`, `extractLogic`) are undefined unless explicitly provided with `--extract-components`
- **Explicit requirements**: Help text clearly states "requires --extract-components" for component options
- **No silent behaviors**: Component extraction never happens unless `extractComponents: true` in options
