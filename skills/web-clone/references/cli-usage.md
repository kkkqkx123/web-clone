# CLI Usage

## Installation

### Global Install (npm)

```bash
npm install -g @kkkqkx123/web-clone-cli
```
After installation, the `snapshot` command is available globally.

### Library (as project dependency)

```bash
pnpm add @web-clone/core
# Optional: browser adapters
pnpm add @web-clone/adapter-playwright
pnpm add @web-clone/adapter-puppeteer
# Optional: code generators
pnpm add @web-clone/codegen
```

## Entry Commands

```bash
# Global install (npm)
snapshot <url> [options]

# Dev mode (tsx, inside monorepo)
pnpm dev:cli -- <url> [options]

# Via filter
pnpm --filter web-clone-cli snapshot -- <url>

# After build (direct node)
node apps/cli/dist/cli.js <url> [options]
```

After `pnpm build`, the dist binary is also callable as:
```bash
pnpm --filter web-clone-cli snapshot <url> [options]
```

## Subcommands

| Command | Description |
|---------|-------------|
| `snapshot <url>` | Webpage snapshot (default command) |
| `inspect <url>` | Page structure analysis (outline/locate/count/Markdown) |
| `query <url> <selector>` | Structured data extraction (row/table/filter) |
| `validate <output-dir>` | Validate downloaded snapshot directory integrity |
| `clean <output-dir>` | Clean corrupted/zero-byte files |

### inspect

```
pnpm dev:cli inspect <url> [options]
```

| Option | Description |
|--------|-------------|
| `--outline` | Show structural outline (tag.class frequency) |
| `--locate <text>` | Find selectors containing specific text |
| `--count <selector>` | Count elements matching CSS selector |
| `--md` | Convert page to Markdown |
| `--json` | JSON output (for `--locate`) |
| `--limit <n>` | Limit output entries (default 50) |
| `--all` | Show all results, no limit |
| `--budget <n>` | Output cap (~N tokens) |

### query

```
pnpm dev:cli query <url> <selector> [options]
```

| Option | Description |
|--------|-------------|
| `--row <spec>` | Structured row extraction: `name=selector, name2=sel@attr` |
| `--table` | Parse HTML table into structured rows |
| `--where <expr>` | Filter rows, e.g. `"age >= 18"` |
| `--attr <name>` | Extract single attribute |
| `--count` | Count matching elements only |
| `--html` | Extract inner HTML |
| `--json` | JSON output |
| `--tsv` | TSV output |
| `--limit <n>` | Limit output entries (default 50) |
| `--all` | Show all results |
| `--budget <n>` | Output cap |

### validate

```
pnpm dev:cli validate <output-dir>
```

Checks zero-byte files, corrupted files, missing resource references.

### clean

```
pnpm dev:cli clean <output-dir> [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--dry-run` | false | Preview files to delete without removing |
| `--no-zero-byte` | (remove) | Skip zero-byte file removal |
| `--no-corrupted` | (remove) | Skip corrupted file removal |
| `--re-download` | false | Re-download removed resources (reads original URLs from snapshot.json) |

## Options

### Basic

| Option | Default | Description |
|--------|---------|-------------|
| `<url>` | (required) | Target URL; optional with `--convert-local` |
| `-o, --output <path>` | `./snapshot` | Output path |
| `-m, --mode <type>` | `bundle` | `single` (HTML file) or `bundle` (directory) |
| `--convert-local <path>` | — | Run component extraction + codegen on existing local output (skips fetch) |

### Download & Resource

| Option | Default | Description |
|--------|---------|-------------|
| `--max-assets <n>` | 100 | Max total assets to download |
| `--concurrency <n>` | 6 | Parallel downloads |
| `--timeout <ms>` | 15000 | Per-resource timeout |
| `--retry-count <n>` | 1 | Retry attempts on failure |
| `--retry-initial-delay <ms>` | 200 | Initial backoff delay |
| `--retry-max-delay <ms>` | 2000 | Max backoff delay |
| `--no-inline` | (inline) | Disable data URI inlining |
| `--pretty` | (minified) | Prettify output HTML |
| `--strict-status-codes` | false | Require 2xx for all resources (default lenient: accepts valid 4xx/5xx CSS/JS) |
| `--max-file-size <size>` | 50MB | Per-file hard limit (`50MB`, `10m`, or bytes; `0` = no limit) |

### Resource Filtering

| Option | Default | Description |
|--------|---------|-------------|
| `--skip-types <ext>` | default list | Skip extensions (`.zip,.mp4,.pdf`); empty string disables |
| `--resource-preset <name>` | `default` | Filter preset: `none` \| `minimal` \| `default` \| `no-media` \| `aggressive` (`--skip-types` takes precedence) |
| `--include-wasm` | — | Include .wasm files |
| `--include-bin` | — | Include .bin files |
| `--include-video` | — | Include video (.mp4, .webm, .m3u8, .ts, etc.) |
| `--include-media` | — | Include video and audio |
| `--include-fonts` | — | Include fonts (.woff, .woff2, .ttf, .otf) |
| `--include-all` | — | Include all file types (same as `--resource-preset none`) |
| `--exclude-images` | — | Exclude image files |
| `--exclude-css` | — | Exclude CSS files |
| `--exclude-js` | — | Exclude JavaScript files |

**Preset reference**:

| Preset | Skipped extensions | Use case |
|--------|-------------------|----------|
| `none` | (none) | Full site mirror including WASM, video, fonts |
| `minimal` | Archives | Quick typical webpage snapshot |
| `default` | Archives + installers + docs | Safe default for most sites |
| `no-media` | default + video + audio | Text-first, fastest |
| `aggressive` | Only core web resources | Minimal size |

### Recursive Scan

| Option | Default | Description |
|--------|---------|-------------|
| `--scan-depth <n>` | 1 | Recursive scan depth (1=current; 2+ scans JS/CSS/JSON hidden URLs) |
| `--scan-js` | true | Scan JS files for embedded URLs |
| `--scan-json` | false | Scan JSON files for media URLs |

### Browser Automation

| Option | Description |
|--------|-------------|
| `--browser <type>` | Browser engine: `playwright` \| `puppeteer` (requires optional dep) |
| `--hybrid` | Hybrid mode: browser renders HTML, HTTP pool downloads assets (requires `--browser`) |

Vue/Nuxt SSR snapshots automatically inject hydration scripts (CLI-level optimization).

### Component Extraction

All options below require `--extract-components`.

| Option | Default | Description |
|--------|---------|-------------|
| `--extract-components` | — | Extract component structure (combines with any output mode) |
| `--component-depth <n>` | (unlimited) | Limit component recognition depth |
| `--framework <hint>` | — | Framework hint: `vue`, `react`, or `svelte` |
| `--extract-logic` | true | Whether to extract JS logic |
| `--component-filter <expr>` | — | Filter components, e.g. `"confidence >= 0.7 && type == 'stateful'"` |
| `--memory-limit <mb>` | 1536 | Component extraction memory budget (MB) |

### Code Generation

All options require `--extract-components`.

| Option | Default | Description |
|--------|---------|-------------|
| `--codegen-framework <type>` | — | Generate code: `vue` \| `react` \| `angular` \| `svelte` \| `jquery` |
| `--codegen-typescript` | true | Use TypeScript |
| `--codegen-css-modules` | false | Use CSS Modules (React) |
| `--codegen-generate-drafts` | — | Generate full project templates in `__drafts__/` |
| `--codegen-extract-shared` | — | Extract shared logic to `shared/` |

## Examples

### Basic Snapshot
```bash
# Bundle mode (default)
pnpm dev:cli -- https://example.com -o ./site

# Single file
pnpm dev:cli -- https://example.com -o snapshot.html -m single

# Pretty HTML
pnpm dev:cli -- https://example.com --pretty
```

### Browser Automation
```bash
pnpm dev:cli -- https://spa-site.com --browser playwright
pnpm dev:cli -- https://spa-site.com --browser puppeteer
pnpm dev:cli -- https://spa-site.com --browser playwright --hybrid
```

### Component Extraction
```bash
# Basic extraction
pnpm dev:cli -- https://example.com --extract-components

# With framework hint and depth
pnpm dev:cli -- https://example.com --extract-components --framework vue --component-depth 5 -o ./output

# Disable JS logic extraction
pnpm dev:cli -- https://example.com --extract-components --extract-logic false

# Filter by confidence
pnpm dev:cli -- https://example.com --extract-components --component-filter "confidence >= 0.7 && type == 'stateful'"
```

### Code Generation
```bash
# Vue code generation
pnpm dev:cli -- https://example.com --extract-components --codegen-framework vue

# React with CSS Modules
pnpm dev:cli -- https://example.com --extract-components --codegen-framework react --codegen-css-modules

# Full project template
pnpm dev:cli -- https://example.com --extract-components --codegen-framework vue --codegen-generate-drafts

# Extract shared logic
pnpm dev:cli -- https://example.com --extract-components --codegen-framework react --codegen-extract-shared
```

### Local Conversion (Re-run without fetching)
```bash
pnpm dev:cli -- --convert-local ./output --codegen-framework vue
pnpm dev:cli -- --convert-local snapshot.html --codegen-framework react
pnpm dev:cli -- --convert-local ./output -o ./alt --codegen-framework react
```

### Resource Filtering
```bash
# Skip specific types
pnpm dev:cli -- https://example.com --skip-types .zip,.mp4,.pdf

# Use preset
pnpm dev:cli -- https://example.com --resource-preset no-media

# Disable all filtering
pnpm dev:cli -- https://example.com --include-all

# Fine-grained: include video+fonts, exclude images
pnpm dev:cli -- https://example.com --include-video --include-fonts --exclude-images

# Recursive scan hidden URLs
pnpm dev:cli -- https://example.com --scan-depth 3 --scan-json
```

### Subcommands
```bash
# Inspect page structure
pnpm dev:cli inspect https://example.com --outline
pnpm dev:cli inspect https://example.com --locate "Search"
pnpm dev:cli inspect https://example.com --count '.card'
pnpm dev:cli inspect https://example.com --md --budget 2000

# Query structured data
pnpm dev:cli query https://example.com '.card' --row 'title=a, href=a@href' --json
pnpm dev:cli query https://example.com 'table' --table --where 'Stars >= 100'

# Validate snapshot
pnpm dev:cli validate ./output

# Clean snapshot
pnpm dev:cli clean ./output --dry-run
pnpm dev:cli clean ./output --re-download
```

### Full Example
```bash
pnpm dev:cli -- https://example.com \
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

## Config Hierarchy

web-clone merges config from multiple levels (low to high priority):

| Priority | Location | Description |
|----------|----------|-------------|
| 0 | Built-in defaults | `packages/core/src/config/defaults.ts` |
| 1 | `~/.config/web-clone/config.json` | Global user config |
| 2 | `./web-clone.config.json` / `.web-clonerc` | Project-level config |
| 3 | CLI arguments | Highest priority |

See [config examples](../../examples/config-examples/config-README.md) for details.

## Platform Notes

**PowerShell**: Quote `--` to avoid interception:
```powershell
pnpm dev:cli '--' "https://example.com" -o ./snapshot
npx tsx apps/cli/src/cli.ts "https://example.com" -o ./snapshot  # Alternative
```

**Proxy**: Tool reads `HTTPS_PROXY` / `HTTP_PROXY` env vars automatically.
See [docs/proxy.md](../../docs/proxy.md).

## Testing

```bash
pnpm test                    # All tests (turbo)
pnpm test:unit               # @web-clone/core only
pnpm test:integration        # CLI only
pnpm --filter web-clone-cli lint  # Lint CLI only
```
