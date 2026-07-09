# web-clone Skills Guide for AI Agents

## Project Overview

**web-clone** is a single-execution webpage snapshot tool built on the MirrorKit design philosophy. It can download complete webpages (HTML, CSS, JS, images, fonts, media) and output them as a single HTML file or a directory bundle. Optionally, it can extract and analyze component structures, supporting multi-framework code generation (Vue/React/Angular/Svelte/jQuery).

## Core Capabilities

### 1. Webpage Snapshot

- **Fetch HTML** — Uses `fetchWithTimeout` to retrieve pages with User-Agent and timeout settings
- **Parse HTML** — Extracts references to CSS/JS/images/fonts/media and other resources (using `linkedom` parsing)
- **Recursive CSS Extraction** — Downloads external CSS, extracts nested `@import` and `url()` references
- **Deduplication** — URL-based deduplication
- **Download Resources** — Concurrent workers with retry logic and validation
- **Assemble Output**:
  - **Bundle Mode** — Resources saved to `assets/{css,js,img,fonts,data}/`, HTML paths rewritten
  - **Single Mode** — CSS/JS inlined, images/fonts converted to base64 data URIs

### 2. Component Extraction

- **HTML Analysis** — Identifies component boundaries (explicit markers → semantic tags → optional depth limits)
- **CSS Analysis** — Extracts CSS variables, BEM grouping, marks dynamic styles
- **JS Analysis** — Extracts state variables, event handlers, lifecycle hooks, DOM references
- **Correlation Analysis** — Matches HTML components with CSS rules and JS logic, calculates confidence scores
- **Generation** — Produces component specifications, manifests, migration guides, and review reports

### 3. Framework Code Generation

- Supports Vue 3, React 18, Angular 17, Svelte 4, jQuery 3.7
- Optional TypeScript, CSS Modules, full project templates (`__drafts__/`)
- Shared logic extraction (API clients, utilities, constants)

### 4. Resource Filtering

- **Extension Filtering** — Skips archives, installers, documents, videos, audio, and other resources irrelevant to webpage rendering by default
- **Size Limits** — Hard per-file size cap to prevent abnormally large files from wasting bandwidth
- **Early Interception** — Checks extensions before download, checks `content-length` in response headers, aborts immediately if limits are exceeded

## Input

```bash
npm run dev -- <url> [options]
npx tsx src/cli.ts <url> [options]
```

### Required Parameter

| Parameter | Description |
|-----------|-------------|
| `<url>` | Target page URL |

### Output Mode Options

| Option | Default | Description |
|--------|---------|-------------|
| `-o, --output <path>` | `./snapshot` | Output path |
| `-m, --mode <type>` | `bundle` | `single` (single HTML file) or `bundle` (directory bundle) |

### Download Options

| Option | Default | Description |
|--------|---------|-------------|
| `--max-assets <n>` | `100` | Maximum number of resources to download |
| `--concurrency <n>` | `6` | Concurrency level |
| `--timeout <ms>` | `15000` | Timeout (milliseconds) |
| `--retry-count <n>` | `1` | Number of retries |
| `--no-inline` | — | Disable data URI inlining |
| `--pretty` | — | Pretty-print HTML |
| `--skip-types <extensions>` | Full default list | Skip downloading resources with specified extensions, comma-separated; empty string disables filtering |
| `--max-file-size <size>` | `50MB` | Hard per-file size cap, supports `50MB`/`10m`/byte count; `0` means no limit |

### Component Extraction Options

| Option | Description |
|--------|-------------|
| `--extract-components` | Enable component extraction |
| `--component-depth <n>` | Limit identification depth (unlimited by default) |
| `--framework <hint>` | Framework hint: `vue`/`react`/`svelte` |
| `--extract-logic` | Whether to extract JS logic (default true) |

### Framework Code Generation Options

| Option | Description |
|--------|-------------|
| `--codegen-framework <type>` | Generate framework code: `vue`/`react`/`angular`/`svelte`/`jquery` |
| `--codegen-typescript` | Use TypeScript (default true) |
| `--codegen-css-modules` | Use CSS Modules (default false) |
| `--codegen-generate-drafts` | Generate full project templates to `__drafts__/` |
| `--codegen-extract-shared` | Extract shared logic to `shared/` |

## Output

### Bundle Mode Output Structure

```
output/
├── index.html                # Main snapshot HTML
├── assets/
│   ├── css/, js/, img/, fonts/, data/
├── snapshot.json              # Resource manifest and status
├── manifest.json              # Resource validation information
└── components/                # Component extraction results (optional)
    ├── components/
    │   ├── Header/
    │   │   ├── template.html
    │   │   ├── style.css
    │   │   ├── manifest.json
    │   │   └── logic.original.json
    ├── index.json
    ├── README.md
    ├── MIGRATION.md
    └── REVIEW_REQUIRED.md     # Low-confidence component review checklist
```

### Single Mode Output

```
snapshot.html                  # Complete self-contained HTML
snapshot_components/           # Component extraction results
```

## System Architecture

### Main Pipeline

```
URL → fetchHtml() → parseHtml() → extract resource references → recursive CSS extraction → deduplication → downloadAllAssets() → assemble output (bundle/single) → optional: component extraction
```

### Component Extraction Pipeline

```
HTML analysis → CSS analysis → JS analysis → correlation analysis → generate component specifications → write output
```

### Core Modules

| Module | Function |
|--------|----------|
| `src/cli.ts` | Commander CLI with orthogonal option design |
| `src/assembler.ts` | Main pipeline orchestration |
| `src/fetcher.ts` | HTTP fetching, AbortController timeout, concurrency pool, retries |
| `src/converter.ts` | Component extraction pipeline orchestration |
| `src/validators.ts` | MIME validation, magic number checks, content integrity |
| `src/parser/html-parser.ts` | HTML parsing, resource reference extraction, `linkedom` |
| `src/parser/css-parser.ts` | CSS parsing, `@import`/`url()` extraction, `css-tree` |
| `src/parser/url-resolver.ts` | URL resolution (relative→absolute), srcset parsing |
| `src/output/bundle.ts` | Bundle mode assembly, path rewriting, path traversal protection |
| `src/output/single-file.ts` | Single mode assembly, CSS/JS inlining, data URIs |
| `src/output/convert.ts` | Component output writing, including framework code generation |
| `src/transform/component-analyzer.ts` | HTML component analysis |
| `src/transform/css-analyzer.ts` | CSS analysis, BEM grouping |
| `src/transform/js-analyzer.ts` | JS analysis, Babel AST |
| `src/transform/correlator.ts` | Correlation matching, confidence calculation |
| `src/transform/generator.ts` | Component specification generation |
| `src/transform/framework-codegen/` | Multi-framework code generators |

## Usage Examples

### Basic Snapshot

```bash
# Bundle mode (default)
npm run dev -- https://example.com -o ./site

# Single mode
npm run dev -- https://example.com -o snapshot.html -m single
```

### Snapshot + Component Extraction

```bash
npm run dev -- https://example.com -o ./project -m bundle --extract-components
```

### Snapshot + Component Extraction + Framework Code Generation

```bash
npm run dev -- https://example.com -o ./project -m bundle \
  --extract-components \
  --codegen-framework vue \
  --codegen-typescript \
  --codegen-generate-drafts
```

## Important Notes

1. **Orthogonal Option Design**: Output mode (`-m single/bundle`) and component extraction (`--extract-components`) are orthogonal and can be combined freely
2. **Component Depth Limits**: `--component-depth` is unlimited by default; when enabled, high-depth components receive decreasing confidence scores
3. **Confidence Scoring**: HTML detection 50% + CSS matching 30% + JS logic 20%; scores below 0.6 are marked for review
4. **CSS/JS Source Merging**: Prioritizes inline CSS/JS, falls back to downloaded assets
5. **Path Safety**: Bundle mode includes path traversal protection
6. **Output Path**: Component output directory is `{output}/components` (bundle mode) or `{output}_components` (single mode)