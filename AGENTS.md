# web-clone

## Project Overview

**web-clone** is a single-execution web page snapshot tool that downloads and bundles a complete webpage snapshot into either a self-contained HTML file or a directory structure. It can optionally extract and analyze component structure.

**Core capabilities:**
- Snapshot: Download entire webpage (HTML, CSS, JS, images, fonts, media)
- Output: Single HTML file or directory bundle with separated assets
- Transform: Extract component structure with state/event analysis (optional)

## Build & Development

```bash
npm run build         # TypeScript → dist/ (dist/cli.js is the binary)
npm run dev           # Run via tsx without compilation
npm run snapshot      # Alias for dev
```

Entry point for development: `src/cli.ts`

## CLI Usage

```bash
npm run dev -- <url> [options]
npx tsx src/cli.ts <url> [options]
node dist/cli.js <url> [options]  # After npm run build
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

## Architecture

The snapshot workflow is orchestrated by `assembler.ts` in these stages:

### Main Pipeline (Snapshot)

1. **Fetch HTML** (`fetcher.ts:fetchWithTimeout`) — Fetch page with timeout and User-Agent header
2. **Parse HTML** (`parser/html-parser.ts:parseHtml`) — Extract asset refs (CSS, JS, img, font, media)
3. **Recursive CSS extraction** (`assembler.ts` → `parser/css-parser.ts`) — Download external CSS files, extract nested assets
4. **Deduplicate** (`assembler.ts:dedupe`) — Remove duplicate URLs
5. **Download assets** (`fetcher.ts:downloadAllAssets`) — Concurrent workers with retry and validation
6. **Assemble output**:
   - **Bundle mode** (`output/bundle.ts:assembleBundle`) — Write assets to `assets/{css,js,img,fonts,data}/`, rewrite HTML paths
   - **Single mode** (`output/single-file.ts:assembleSingleFile`) — Inline all CSS/JS, convert images/fonts to data URIs

### Optional: Component Extraction Pipeline

When `--extract-components` is specified:

1. **Extract inline CSS/JS** (`assembler.ts:extractInlineCss/extractInlineJs`) — From `<style>` and `<script>` tags
2. **Merge with downloaded assets** (`assembler.ts:extractCssFromAssets/extractJsFromAssets`) — Combine with downloaded CSS/JS
3. **HTML Analysis** (`transform/component-analyzer.ts:enhanceHtmlAnalysis`)
   - Identify component boundaries: explicit markers → semantic tags → (optionally) depth-based
   - **No implicit depth limit**: By default, all DOM depths are analyzed for component boundaries
   - **Optional depth constraint**: Use `--component-depth <n>` to limit recognition to specified depth
   - Extract dynamic points: bindings, events, conditions
   - Build component hierarchy
4. **CSS Analysis** (`transform/css-analyzer.ts:enhanceCssAnalysis`)
   - Extract CSS variables
   - Group rules by component (BEM-based)
   - Mark dynamic styles
5. **JS Analysis** (`transform/js-analyzer.ts:analyzeJavaScript`)
   - Extract state variables (heuristic-based)
   - Identify event handlers and lifecycle hooks
   - Track DOM references
6. **Correlation** (`transform/correlator.ts:correlateComponents`)
   - Match HTML components with CSS rules (class/ID matching)
   - Match with JS logic (DOM ref matching)
   - Calculate match confidence scores
7. **Generation** (`transform/generator.ts:generateComponentStructure`)
   - Build component specs with manifests
   - Estimate migration effort
   - Generate suggestions
8. **Output** (`output/convert.ts:assembleConvert`)
   - Write component directories
   - Generate README, MIGRATION guide
   - **NEW**: Generate REVIEW_REQUIRED.md for low-confidence components

### Key Modules

- **`types.ts`** — Shared types: `SnapshotOptions`, `Asset`, `AssetRef`, `ComponentSpec`, etc.
- **`fetcher.ts`** — HTTP fetching with AbortController timeout, concurrent worker pool, retry logic
- **`validators.ts`** — MIME validation, file extension→MIME mapping, content integrity checks
- **`parser/url-resolver.ts`** — URL resolution (relative→absolute), srcset parsing
- **`parser/css-parser.ts`** — CSS tree parsing for `@import`, `url()` extraction
- **`transform/*`** — Component analysis and correlation engines
- **`cli.ts`** — Commander CLI with orthogonal options design

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
npm run dev -- https://example.com -o ./project -m bundle --extract-components
```

**To generate single-file snapshot with component analysis:**
```bash
npm run dev -- https://example.com -o snapshot.html -m single --extract-components
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

- No test suite in repo
- Manual testing via `npm run dev -- <url>`
- Inspect output structure and HTTP status codes
- Use `REVIEW_REQUIRED.md` to validate component extraction quality

## Recent Changes (P0 Refactoring)

### What Changed

1. **Removed mutually exclusive modes**
   - Deleted: `mode: 'convert'` from SnapshotMode
   - Added: `extractComponents?: boolean` to SnapshotOptions
   - Impact: Single command can now generate snapshot + components

2. **Enhanced component extraction**
   - Supports CSS/JS from downloaded assets (not just inline)
   - Generates `REVIEW_REQUIRED.md` for low-confidence components
   - Confidence scoring passed to manifest generation

3. **Updated CLI**
   - `--extract-components` flag (works with `-m single` and `-m bundle`)
   - Component extraction options only recognized when flag is specified
   - Clear help text showing option dependencies

4. **Refactored pipeline**
   - `snapshot()` handles snapshot generation, optionally followed by component extraction
   - CSS/JS extraction helpers: `extractCssFromAssets()`, `extractJsFromAssets()`
   - Component output goes to subdirectory of snapshot location

### Implementation Clarity

- **Single responsibility**: Component options are only set and used when `--extract-components` is true
- **No fallback logic**: Component-related fields (`componentDepth`, `frameworkHint`, `extractLogic`) are undefined unless explicitly provided with `--extract-components`
- **Explicit requirements**: Help text clearly states "requires --extract-components" for component options
- **No silent behaviors**: Component extraction never happens unless `extractComponents: true` in options
