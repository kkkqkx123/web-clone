# Architecture

The snapshot workflow is orchestrated by `src/core/assembler.ts`.

## Main Pipeline (Snapshot)

1. **Fetch HTML** (`src/core/fetcher.ts:fetchWithTimeout`) — Fetch page with timeout and User-Agent header
2. **Parse HTML** (`src/core/parser/html-parser.ts:parseHtml`) — Extract asset refs (CSS, JS, img, font, media)
3. **Recursive CSS extraction** (`src/core/assembler.ts` → `src/core/parser/css-parser.ts`) — Download external CSS, extract nested assets
4. **Deduplicate** (`src/core/assembler.ts:dedupe`) — Remove duplicate URLs
5. **Download assets** (`src/core/fetcher.ts:downloadAllAssets`) — Concurrent workers with retry and validation
6. **Assemble output**:
   - **Bundle mode** (`src/core/output/bundle.ts:assembleBundle`) — Write assets to `assets/{css,js,img,fonts,data}/`, rewrite HTML paths
   - **Single mode** (`src/core/output/single-file.ts:assembleSingleFile`) — Inline all CSS/JS, convert images/fonts to data URIs

## Component Extraction Pipeline

When `--extract-components` is specified:

1. **Extract inline CSS/JS** (`src/core/assembler.ts:extractInlineCss/extractInlineJs`) — From `<style>` and `<script>` tags
2. **Merge with downloaded assets** (`src/core/assembler.ts:extractCssFromAssets/extractJsFromAssets`) — Combine with downloaded CSS/JS
3. **HTML Analysis** (`src/core/transform/component-analyzer.ts:enhanceHtmlAnalysis`)
   - Identify component boundaries: explicit markers → semantic tags → (optionally) depth-based
   - Extract dynamic points (bindings, events, conditions); build component hierarchy
4. **CSS Analysis** (`src/core/transform/css-analyzer.ts:enhanceCssAnalysis`) — CSS variables, BEM grouping, dynamic styles
5. **JS Analysis** (`src/core/transform/js-analyzer.ts:analyzeJavaScript`) — State variables, event handlers, lifecycle hooks, DOM refs
6. **Correlation** (`src/core/transform/correlator.ts:correlateComponents`) — Match HTML ↔ CSS ↔ JS, calculate confidence scores
7. **Generation** (`src/core/transform/generator.ts:generateComponentStructure`) — Build specs, manifests, migration estimates
8. **Output** (`src/core/output/convert.ts:assembleConvert`) — Write component dirs, README, MIGRATION, REVIEW_REQUIRED.md

## Key Modules (by package)

| Module | Key files |
|---------|-------------|
| `src/core/` | `assembler.ts`, `fetcher.ts`, `validators.ts`; `parser/html-parser.ts`, `parser/css-parser.ts`, `parser/url-resolver.ts`; `output/bundle.ts`, `output/single-file.ts`, `output/convert.ts`; `transform/component-analyzer.ts`, `transform/css-analyzer.ts`, `transform/js-analyzer.ts`, `transform/correlator.ts`, `transform/generator.ts` |
| `src/adapters/common.ts` | `spa-detector.ts`, automation option types |
| `src/adapters/playwright/` | Playwright browser automation adapter |
| `src/adapters/puppeteer/` | Puppeteer browser automation adapter |
| `src/codegen/` | Framework code generators for Vue/React/Angular/Svelte/jQuery |
| `src/cli/` | `src/cli/cli.ts` — Commander CLI |

## Data Structures

```typescript
interface SnapshotOptions {
  url, output, mode: 'single'|'bundle',
  maxAssets, concurrency, timeout, retryCount,
  inline, pretty,
  extractComponents?, componentDepth?, frameworkHint?, extractLogic?
}

interface AssetRef {
  url: string;
  type: AssetType; // 'css' | 'js' | 'img' | 'font' | 'media' | 'other'
  origin: string;
}

interface Asset {
  originUrl, localPath?, dataUri?, textContent?, type, status, size, mime, error?
}

interface ComponentSpec {
  name, type: 'stateful'|'presentational'|'unknown',
  template, styles, logic,
  manifest: ComponentManifest & { migration: { priority, effort, suggestions, todos } }
}
```

## Design Decisions

### Orthogonal Options
Output mode (`-m single|bundle`) and component extraction (`--extract-components`) are orthogonal and can be combined freely.

### Confidence Scoring
Components with `matchConfidence < 0.6` are flagged in `REVIEW_REQUIRED.md`, sorted for manual triage.

### CSS/JS Source Merging
Component extraction prefers inline CSS/JS from `<style>`/`<script>` tags, falls back to downloaded assets.

### Design Principles
- Component options only used when `--extract-components` is true
- No fallback logic: component fields are undefined unless explicitly set
- Extraction never happens unless `extractComponents: true`
