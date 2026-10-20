# CLI Usage

## Installation

### Global Install (npm)

```bash
npm install -g @kkkqkx123/web-clone
```
After installation, the `web-clone` command is available globally.

### Library (as project dependency)

```bash
npm install -D @kkkqkx123/web-clone
# Optional: browser adapters (peer deps, install what you use)
npm install -D playwright   # for --adapter playwright
npm install -D puppeteer    # for --adapter puppeteer
```

## Entry Commands

```bash
# Global install (npm)
web-clone <url> [options]

# Dev mode (tsx, in repo)
npm run snapshot -- <url> [options]

# After build (direct node)
node dist/cli/cli.js <url> [options]
```

After `npm run build`, the dist binary is also callable as:
```bash
npm run start -- <url> [options]
```

## Subcommands

| Command | Description |
|---------|-------------|
| `web-clone <url>` | Webpage snapshot (default command) |
| `inspect <url>` | Page structure analysis (outline/locate/count/Markdown) |
| `query <url> <selector>` | Structured data extraction (row/table/filter) |
| `validate <output-dir>` | Validate downloaded snapshot directory integrity |
| `clean <output-dir>` | Clean corrupted/zero-byte files |

### inspect

```
npm run snapshot -- inspect <url> [options]
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
npm run snapshot -- query <url> <selector> [options]
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
npm run snapshot -- validate <output-dir>
```

Checks zero-byte files, corrupted files, missing resource references.

### clean

```
npm run snapshot -- clean <output-dir> [options]
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
| `--adapter <type>` | Browser automation adapter: `playwright` \| `puppeteer` (requires optional dep) |
| `--hybrid` | Hybrid mode: browser renders HTML, HTTP pool downloads assets (requires `--adapter`) |

Vue/Nuxt SSR snapshots automatically inject hydration scripts (CLI-level optimization).

### Serve Mode

| Option | Default | Description |
|--------|---------|-------------|
| `--serve` | — | Generate server files (`server.js` + `package.json` + startup scripts) for self-contained serving |
| `--run` | — | Start the HTTP server immediately (only valid with `--serve`) |
| `--serve-port <port>` | `8080` | Server port (only with `--serve --run`) |
| `--proxy` | `on` | Reverse proxy runtime API requests to original domain (only with `--serve --run`) |
| `--no-proxy` | — | Disable reverse proxy, serve only static files |

**Examples:**

```bash
# Generate server files only (no server started)
npm run snapshot -- https://example.com -o ./site --serve

# Generate server files and start the server
npm run snapshot -- https://example.com -o ./site --serve --run

# With reverse proxy (handles runtime API calls)
npm run snapshot -- https://spa-site.com --adapter playwright --serve --run --proxy

# Custom port, no proxy
npm run snapshot -- https://example.com -o ./site --serve --run --serve-port 3000 --no-proxy
```

After `--serve` generates the files, the output is self-contained:

```bash
cd ./site
node server.js          # Start the server
npm run serve           # Via package.json
./start.sh              # Unix
start.bat               # Windows
```

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
npm run snapshot -- https://example.com -o ./site

# Single file
npm run snapshot -- https://example.com -o snapshot.html -m single

# Pretty HTML
npm run snapshot -- https://example.com --pretty
```

### Browser Automation
```bash
npm run snapshot -- https://spa-site.com --adapter playwright
npm run snapshot -- https://spa-site.com --adapter puppeteer
npm run snapshot -- https://spa-site.com --adapter playwright --hybrid
```

### Component Extraction
```bash
# Basic extraction
npm run snapshot -- https://example.com --extract-components

# With framework hint and depth
npm run snapshot -- https://example.com --extract-components --framework vue --component-depth 5 -o ./output

# Disable JS logic extraction
npm run snapshot -- https://example.com --extract-components --extract-logic false

# Filter by confidence
npm run snapshot -- https://example.com --extract-components --component-filter "confidence >= 0.7 && type == 'stateful'"
```

### Code Generation
```bash
# Vue code generation
npm run snapshot -- https://example.com --extract-components --codegen-framework vue

# React with CSS Modules
npm run snapshot -- https://example.com --extract-components --codegen-framework react --codegen-css-modules

# Full project template
npm run snapshot -- https://example.com --extract-components --codegen-framework vue --codegen-generate-drafts

# Extract shared logic
npm run snapshot -- https://example.com --extract-components --codegen-framework react --codegen-extract-shared
```

### Local Conversion (Re-run without fetching)
```bash
npm run snapshot --convert-local ./output --codegen-framework vue
npm run snapshot --convert-local snapshot.html --codegen-framework react
npm run snapshot --convert-local ./output -o ./alt --codegen-framework react
```

### Resource Filtering
```bash
# Skip specific types
npm run snapshot -- https://example.com --skip-types .zip,.mp4,.pdf

# Use preset
npm run snapshot -- https://example.com --resource-preset no-media

# Disable all filtering
npm run snapshot -- https://example.com --include-all

# Fine-grained: include video+fonts, exclude images
npm run snapshot -- https://example.com --include-video --include-fonts --exclude-images

# Recursive scan hidden URLs
npm run snapshot -- https://example.com --scan-depth 3 --scan-json
```

### Subcommands
```bash
# Inspect page structure
npm run snapshot -- inspect https://example.com --outline
npm run snapshot -- inspect https://example.com --locate "Search"
npm run snapshot -- inspect https://example.com --count '.card'
npm run snapshot -- inspect https://example.com --md --budget 2000

# Query structured data
npm run snapshot -- query https://example.com '.card' --row 'title=a, href=a@href' --json
npm run snapshot -- query https://example.com 'table' --table --where 'Stars >= 100'

# Validate snapshot
npm run snapshot -- validate ./output

# Clean snapshot
npm run snapshot -- clean ./output --dry-run
npm run snapshot -- clean ./output --re-download
```

### Full Example
```bash
npm run snapshot -- https://example.com \
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
| 0 | Built-in defaults | `src/core/config/defaults.ts` |
| 1 | `~/.config/web-clone/config.json` | Global user config |
| 2 | `./web-clone.config.json` / `.web-clonerc` | Project-level config |
| 3 | CLI arguments | Highest priority |

See [config examples](../../examples/config-examples/config-README.md) for details.

## Platform Notes

**PowerShell**: Quote `--` to avoid interception:
```powershell
npm run snapshot -- '--' "https://example.com" -o ./snapshot
npx tsx src/cli/cli.ts "https://example.com" -o ./snapshot  # Alternative
```

**`--` passthrough**: `npm run snapshot -- <url>` is the recommended form and works on all platforms — the CLI automatically filters out any extra `"--"` literal that npm may inject on Windows/Git Bash.

**Proxy**: Tool reads `HTTPS_PROXY` / `HTTP_PROXY` env vars automatically.
See [docs/proxy.md](../../docs/proxy.md).

## Testing

```bash
npm run test                    # All tests (vitest)
npm run test:unit               # Unit tests only
npm run test:integration        # CLI/browser adapter integration tests
npm run lint                    # Lint
```
