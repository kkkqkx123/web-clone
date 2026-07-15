# web-clone

**Single-execution web page snapshot tool** — Download and bundle complete webpage snapshots with optional component structure extraction and framework code generation.

[中文文档](./README_zh.md)

## Features

- **Complete Snapshot**: Download entire webpage (HTML, CSS, JS, images, fonts, media)
- **Flexible Output**: Single self-contained HTML file or directory bundle with separated assets
- **Component Extraction**: Analyze and extract component structure with state/event analysis (optional)
- **Framework CodeGen**: Generate Vue/React/Angular/Svelte/jQuery code from extracted components (optional)
- **Browser Automation**: Playwright or Puppeteer support for SPA/SSR applications
- **Smart Filtering**: Resource presets and fine-grained include/exclude controls
- **Recursive Discovery**: Scan JS/JSON for embedded asset URLs (optional)
- **Size & Budget Limits**: Hard file size limits, concurrency control, memory budgets
- **Config Hierarchy**: Global `~/.config/web-clone/config.json` + project-level `web-clone.config.json` + CLI overrides
- **Validation & Cleanup**: Validate snapshot integrity, remove corrupted files, re-download missing assets
- **Page Diagnostics**: Inspect page structure, locate text, extract structured data (built-in query engine)

## Installation

### CLI (Global Install)

Install the CLI tool globally via npm:

```bash
npm install -g @kkkqkx123/web-clone-cli
```

After installation, the `web-clone` command is available globally:

```bash
web-clone https://example.com -o ./snapshot
```

### Library (for Project Use)

Use web-clone as a library in your Node.js/TypeScript project:

```bash
# Core snapshot engine
pnpm add @web-clone/core

# Optional: Browser automation adapters
pnpm add @web-clone/adapter-playwright
pnpm add @web-clone/adapter-puppeteer

# Optional: Framework code generators
pnpm add @web-clone/codegen

# Optional: Shared types
pnpm add @web-clone/types
```

### Package Overview

| Package | npm Scope | Description |
|---------|-----------|-------------|
| `@kkkqkx123/web-clone-cli` | `@kkkqkx123` (personal) | CLI application with `web-clone` binary |
| `@web-clone/core` | `@web-clone` (org) | Core snapshot engine |
| `@web-clone/adapter-common` | `@web-clone` (org) | Shared SPA hydration detection & automation types |
| `@web-clone/adapter-playwright` | `@web-clone` (org) | Playwright browser automation adapter |
| `@web-clone/adapter-puppeteer` | `@web-clone` (org) | Puppeteer browser automation adapter |
| `@web-clone/codegen` | `@web-clone` (org) | Framework code generators (Vue/React/Angular/Svelte/jQuery) |
| `@web-clone/types` | `@web-clone` (org) | Shared TypeScript type definitions |

## Quick Start

```bash
# Install dependencies
pnpm install

# Run directly (no build required)
pnpm dev:cli https://example.com -o ./snapshot

# Or build first, then run
pnpm build
node apps/cli/dist/cli.js https://example.com -o ./snapshot
```

> **PowerShell users**: `pnpm dev:cli <url>` works directly (the CLI handles `--` passthrough automatically). If you encounter issues, quote `--` — `pnpm dev:cli '--' <url>` — or use `npx tsx apps/cli/src/cli.ts <url>`.
> **Proxy users**: The tool automatically detects `HTTPS_PROXY`/`HTTP_PROXY` env vars. See [docs/proxy.md](docs/proxy.md).

## CLI Usage

```bash
pnpm dev:cli <url> [options]                         # Snapshot (default command)
pnpm dev:cli inspect <url> [options]                    # Page structure analysis
pnpm dev:cli query <url> <selector> [options]           # Structured data extraction
pnpm dev:cli validate <output-dir>                      # Validate snapshot integrity
pnpm dev:cli clean <output-dir> [options]               # Clean corrupted files
```

### Basic Options

| Option | Default | Description |
|--------|---------|-------------|
| `-o, --output <path>` | `./snapshot` | Output path |
| `-m, --mode <type>` | `bundle` | Output format: `single` (HTML file) or `bundle` (directory) |
| `--convert-local <path>` | — | Run component extraction + codegen on existing snapshot (skips URL fetch) |

### Download & Performance

| Option | Default | Description |
|--------|---------|-------------|
| `--max-assets <n>` | `100` | Maximum number of assets to download |
| `--concurrency <n>` | `6` | Concurrent downloads |
| `--timeout <ms>` | `15000` | Per-resource timeout (milliseconds) |
| `--retry-count <n>` | `1` | Retry attempts for failed downloads |
| `--retry-initial-delay <ms>` | `200` | Initial retry backoff delay |
| `--retry-max-delay <ms>` | `2000` | Maximum retry backoff delay |
| `--max-file-size <size>` | `50MB` | Per-file size limit; `0` to disable |
| `--no-inline` | (inline) | Skip data URI inlining (single mode only) |
| `--pretty` | (minified) | Prettify output HTML |
| `--strict-status-codes` | `false` | Require 2xx for all assets |

### Resource Filtering

| Option | Default | Description |
|--------|---------|-------------|
| `--resource-preset <name>` | `default` | Preset: `none` \| `minimal` \| `default` \| `no-media` \| `aggressive` |
| `--skip-types <exts>` | (preset) | Explicit skip list (overrides preset); `""` to disable |
| `--include-wasm` | — | Include `.wasm` files |
| `--include-bin` | — | Include `.bin` files |
| `--include-video` | — | Include video files |
| `--include-media` | — | Include video + audio files |
| `--include-fonts` | — | Include font files |
| `--include-all` | — | Include all file types |
| `--exclude-images` | — | Exclude image files |
| `--exclude-css` | — | Exclude CSS files |
| `--exclude-js` | — | Exclude JavaScript files |

### Recursive Scan

| Option | Default | Description |
|--------|---------|-------------|
| `--scan-depth <n>` | `1` | Recursive scan depth (2+ scans JS/JSON for embedded URLs) |
| `--scan-js` | `true` | Scan JS files for embedded URLs |
| `--scan-json` | `false` | Scan JSON files for media URLs |

### Browser Automation

| Option | Description |
|--------|-------------|
| `--adapter <type>` | Browser engine: `playwright` \| `puppeteer` |
| `--hybrid` | Browser renders HTML, HTTP pool downloads assets (requires `--adapter`) |

### Serve Mode

| Option | Default | Description |
|--------|---------|-------------|
| `--serve` | — | Generate server files (`server.js` + `package.json` + startup scripts) for self-contained snapshot serving |
| `--run` | — | Start the HTTP server immediately (only valid with `--serve`) |
| `--serve-port <port>` | `8080` | Server port (only with `--serve --run`) |
| `--proxy` | `on` | Reverse proxy runtime API requests to original domain (only with `--serve --run`) |
| `--no-proxy` | — | Disable reverse proxy, serve only static files |

### Component Extraction

| Option | Default | Description |
|--------|---------|-------------|
| `--extract-components` | — | Enable component extraction |
| `--component-depth <n>` | unlimited | Limit component recognition depth |
| `--framework <hint>` | — | Framework hint: `vue`, `react`, or `svelte` |
| `--extract-logic` | `true` | Extract JavaScript logic |
| `--component-filter <expr>` | — | Filter by expression, e.g. `"confidence >= 0.7"` |
| `--memory-limit <mb>` | `1536` | Memory budget for extraction |

### Framework Code Generation

| Option | Default | Description |
|--------|---------|-------------|
| `--codegen-framework <type>` | — | Target framework: `vue` \| `react` \| `angular` \| `svelte` \| `jquery` |
| `--codegen-typescript` | `true` | Generate TypeScript |
| `--codegen-css-modules` | `false` | CSS Modules for React |
| `--codegen-generate-drafts` | — | Generate full project templates in `__drafts__/` |
| `--codegen-extract-shared` | — | Extract shared logic to `shared/` |

### Diagnostics Subcommands

```
# Page structure analysis
pnpm dev:cli inspect <url> [--outline | --locate <text> | --count <sel> | --md]

# Structured data extraction
pnpm dev:cli query <url> <selector> [--row <spec> | --table | --attr <n> | --json]

# Validate snapshot integrity
pnpm dev:cli validate <output-dir>

# Clean corrupted/zero-byte files
pnpm dev:cli clean <output-dir> [--dry-run] [--re-download]
```

See [docs/commands.md](docs/commands.md) for the complete option reference.

## Examples

### Basic Snapshot

```bash
# Bundle mode (default) — directory structure with separated assets
pnpm dev:cli https://example.com -o ./site

# Single file mode — self-contained HTML
pnpm dev:cli https://example.com -o snapshot.html -m single
```

### Browser Automation

```bash
# Playwright (SPA/SSR sites)
pnpm dev:cli https://spa-site.com --adapter playwright

# Hybrid: browser renders HTML, HTTP pool downloads assets
pnpm dev:cli https://spa-site.com --adapter playwright --hybrid
```

### Component Extraction

```bash
# Extract component structure
pnpm dev:cli https://example.com --extract-components

# With framework hint and depth limit
pnpm dev:cli https://example.com --extract-components --framework vue --component-depth 5

# Generate framework code
pnpm dev:cli https://example.com --extract-components --codegen-framework react
```

### Resource Filtering

```bash
# Use a preset
pnpm dev:cli https://example.com --resource-preset no-media

# Fine-grained control
pnpm dev:cli https://example.com --include-video --include-fonts --exclude-images

# Include all file types
pnpm dev:cli https://example.com --include-all
```

### Recursive Scan

```bash
pnpm dev:cli https://example.com --scan-depth 3 --scan-json
```

### Local Conversion (skip URL fetch)

```bash
pnpm dev:cli --convert-local ./project --codegen-framework vue
```

### Page Diagnostics

```bash
# Structure outline
pnpm dev:cli inspect https://example.com --outline

# Find elements containing text
pnpm dev:cli inspect https://example.com --locate "Search"

# Extract table data
pnpm dev:cli query https://example.com 'table' --table --where 'Stars >= 100' --json

# Validate and clean
pnpm dev:cli validate ./output
pnpm dev:cli clean ./output --dry-run
```

### Serve Mode

```bash
# Generate server files in the output (no server started)
pnpm dev:cli https://example.com -o ./site --serve

# Generate server files and start the server immediately
pnpm dev:cli https://example.com -o ./site --serve --run

# Serve with reverse proxy (handles runtime API requests)
pnpm dev:cli https://spa-site.com --adapter playwright --serve --run --proxy

# Serve on custom port, disable proxy
pnpm dev:cli https://example.com -o ./site --serve --run --serve-port 3000 --no-proxy
```

After `--serve` generates the files, the output directory is self-contained:

```bash
cd ./site
node server.js          # Start the server
npm run serve           # Alternative via package.json
./start.sh              # Unix
start.bat               # Windows
```

### Full Example

```bash
pnpm dev:cli https://example.com \
  -o ./project \
  -m bundle \
  --extract-components \
  --framework react \
  --component-depth 4 \
  --max-assets 200 \
  --concurrency 8 \
  --pretty \
  --resource-preset no-media \
  --max-file-size 20MB \
  --codegen-framework react \
  --codegen-typescript \
  --codegen-extract-shared
```

## Output Structure

### Bundle Mode

```
output/
├── index.html                  # Main snapshot HTML
├── assets/
│   ├── css/                    # Stylesheets
│   ├── js/                     # JavaScript files
│   ├── img/                    # Images
│   ├── fonts/                  # Font files
│   └── data/                   # Other data (media, etc.)
├── snapshot.json               # Asset manifest and status
├── manifest.json               # Resource checksums
└── components/                 # (if --extract-components)
    ├── components/
    │   ├── Header/
    │   │   ├── template.html
    │   │   ├── style.css
    │   │   ├── manifest.json
    │   │   └── logic.original.json
    │   └── Footer/
    ├── index.json
    ├── README.md
    ├── MIGRATION.md
    └── REVIEW_REQUIRED.md      # Low-confidence components
```

### Single Mode

```
snapshot.html                   # Self-contained HTML file
snapshot_components/            # (if --extract-components)
├── components/
├── index.json
├── README.md
└── MIGRATION.md
```

## Architecture

### Snapshot Pipeline

1. **Fetch HTML** — Download page with timeout and User-Agent header
2. **Parse HTML** — Extract asset references (CSS, JS, images, fonts, media)
3. **Recursive CSS Extraction** — Download external CSS, extract nested `@import` and `url()` references
4. **Recursive JS/JSON Scan** (optional) — Scan downloaded JS/JSON for embedded asset URLs
5. **Deduplicate** — Remove duplicate URLs
6. **Filter & Download** — Apply extension/size filters, download remaining assets concurrently
7. **Assemble Output** — Bundle mode writes files; Single mode inlines everything

### Component Extraction Pipeline (optional)

1. **HTML Analysis** — Identify component boundaries (semantic tags, depth)
2. **CSS Analysis** — Extract variables, group rules by component (BEM)
3. **JS Analysis** — Extract state variables, event handlers, lifecycle hooks
4. **Correlation** — Match HTML components with CSS rules and JS logic
5. **Code Generation** (optional) — Generate Vue/React/Angular/Svelte/jQuery code

## Library API

web-clone can also be used as a library in your own Node.js/TypeScript projects:

```bash
pnpm add @web-clone/core
# Optional: pnpm add @web-clone/adapter-playwright @web-clone/codegen
```

```typescript
import { snapshot } from '@web-clone/core';
import { PlaywrightFetcherAdapter } from '@web-clone/adapter-playwright';

// HTTP snapshot
const result = await snapshot('https://example.com', {
  output: './snapshot',
  mode: 'bundle',
});

// Browser automation snapshot
const adapter = new PlaywrightFetcherAdapter(page, context);
const result = await snapshot({ url: 'https://spa-site.com', ... }, adapter);
```

See [docs/library.md](docs/library.md) for the complete API reference.

## Configuration

web-clone supports multi-layer configuration (lowest → highest priority):

| Priority | Location | Description |
|----------|----------|-------------|
| 0 | Built-in defaults | Hardcoded in `packages/core/src/config/defaults.ts` |
| 1 | `~/.config/web-clone/config.json` | Global user config |
| 2 | `./web-clone.config.json` / `.web-clonerc` | Project-level config |
| 3 | CLI flags | Highest priority |

See [examples/config-examples/config-README.md](examples/config-examples/config-README.md) for config file format details.

## Platform Notes

### PowerShell

`pnpm dev:cli <url>` works directly — the CLI automatically filters out the `"--"` literal that pnpm's `--` passthrough may inject. If you still encounter issues:

```powershell
# Quote -- to prevent PowerShell interception:
pnpm dev:cli '--' "https://example.com" -o ./snapshot
# Or bypass pnpm entirely:
npx tsx apps/cli/src/cli.ts "https://example.com" -o ./snapshot
```

### Proxy

The tool automatically reads `HTTPS_PROXY` / `HTTP_PROXY` environment variables. See [docs/proxy.md](docs/proxy.md) for details.

## Development

```bash
# Install dependencies
pnpm install

# Build all packages (turbo parallel)
pnpm build

# Run CLI without building
pnpm dev:cli <url>

# Watch mode (all packages)
pnpm dev

# Run all tests
pnpm test          # turbo run test
pnpm test:unit     # @web-clone/core unit tests
pnpm test:integration  # CLI integration tests

# Clean all build artifacts
pnpm clean
```

## Project Structure

```
├── apps/cli/                     # CLI application (Commander)
├── packages/
│   ├── core/                     # @web-clone/core — Snapshot engine
│   ├── adapter-common/           # Shared SPA hydration detection
│   ├── adapter-playwright/       # Playwright browser adapter
│   ├── adapter-puppeteer/        # Puppeteer browser adapter
│   └── codegen/                  # Framework code generators
├── docs/                         # Documentation
├── examples/                     # Usage examples
│   ├── config-examples/          # Config file examples
│   └── playwright/               # Playwright integration examples
└── pnpm-workspace.yaml           # Monorepo config
```

## Docs

| Document | Description |
|----------|-------------|
| [docs/commands.md](docs/commands.md) | Full CLI command reference |
| [docs/library.md](docs/library.md) | Library API reference for all packages |
| [docs/proxy.md](docs/proxy.md) | Proxy configuration |
| [docs/COMPONENT_TRANSFORM.md](docs/COMPONENT_TRANSFORM.md) | Component extraction details |
| [docs/architecture/MONOREPO_DESIGN.md](docs/architecture/MONOREPO_DESIGN.md) | Monorepo architecture |

## License

MIT

## 🤝 Acknowledgments and Community

This project is forever grateful for the support and promotion from the [LINUX DO](https://linux.do/) community.
