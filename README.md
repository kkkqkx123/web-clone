# web-clone

**Single-execution web page snapshot tool** — Download and bundle complete webpage snapshots with optional component structure extraction.

[中文文档](./README_zh.md)

## Features

- **Complete Snapshot**: Download entire webpage (HTML, CSS, JS, images, fonts, media)
- **Flexible Output**: Single self-contained HTML file or directory bundle with separated assets
- **Component Extraction**: Analyze and extract component structure with state/event analysis (optional)
- **Framework CodeGen**: Generate Vue/React/Angular/Svelte/jQuery code from extracted components (optional)
- **Smart Filtering**: Skip irrelevant resources (archives, installers, documents, media) by default
- **Size Limits**: Hard file size limits to prevent bandwidth waste

## Quick Start

```bash
# Install dependencies
npm install

# Run directly (no build required)
npm run dev -- https://example.com -o ./snapshot

# Or build first, then run
npm run build
node dist/cli.js https://example.com -o ./snapshot
```

## CLI Usage

```bash
npm run dev -- <url> [options]
npx tsx src/cli.ts <url> [options]
node dist/cli.js <url> [options]  # After build
```

### Basic Options

| Option | Default | Description |
|--------|---------|-------------|
| `-o, --output <path>` | `./snapshot` | Output path |
| `-m, --mode <type>` | `bundle` | Output format: `single` (HTML file) or `bundle` (directory) |
| `--extract-components` | — | Extract component structure (works with any mode) |
| `--convert-local <path>` | — | Run component extraction + codegen on an existing local bundle/single output (skips URL fetch. Implies `--extract-components`) |

### Download Options

| Option | Default | Description |
|--------|---------|-------------|
| `--max-assets <n>` | `100` | Maximum number of assets to download |
| `--concurrency <n>` | `6` | Concurrent downloads |
| `--timeout <ms>` | `15000` | Per-resource timeout (milliseconds) |
| `--retry-count <n>` | `1` | Retry attempts for failed downloads |
| `--skip-types <exts>` | (see below) | Skip file extensions (comma-separated); `""` to disable |
| `--max-file-size <size>` | `50MB` | Hard size limit per file; `0` to disable |
| `--no-inline` | — | Skip data URI inlining (single mode only) |
| `--pretty` | — | Prettify output HTML |

### Default Skipped Extensions

By default, the following extensions are skipped to avoid wasting bandwidth on non-rendering resources:

- **Archives**: `.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.bz2`
- **Installers**: `.exe`, `.msi`, `.dmg`, `.apk`, `.deb`, `.rpm`
- **Documents**: `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`
- **Video**: `.ts`, `.m3u8`, `.m4v`, `.mkv`, `.avi`, `.mov`, `.flv`, `.mp4`, `.webm`
- **Audio**: `.mp3`, `.aac`, `.flac`, `.ogg`, `.wma`, `.wav`
- **Other**: `.iso`, `.torrent`, `.wasm`, `.bin`

### Component Extraction Options

| Option | Description |
|--------|-------------|
| `--component-depth <n>` | Limit component recognition depth (default: unlimited) |
| `--framework <hint>` | Framework hint: `vue`, `react`, or `svelte` |
| `--extract-logic` | Extract JavaScript logic (default: `true`) |

### Framework CodeGen Options

| Option | Description |
|--------|-------------|
| `--codegen-framework <type>` | Generate framework code: `vue`, `react`, `angular`, `svelte`, `jquery` |
| `--codegen-typescript` | Use TypeScript (default: `true`) |
| `--codegen-css-modules` | Use CSS Modules for React (default: `false`) |
| `--codegen-generate-drafts` | Generate complete project templates in `__drafts__/` |
| `--codegen-extract-shared` | Extract shared logic to `shared/` directory |

## Examples

### Basic Snapshot

```bash
# Bundle mode (default) - creates directory structure
npm run dev -- https://example.com -o ./site

# Single file mode - creates self-contained HTML
npm run dev -- https://example.com -o snapshot.html -m single
```

### Snapshot with Component Extraction

```bash
# Extract components to bundle
npm run dev -- https://example.com -o ./project -m bundle --extract-components

# Extract components with single-file snapshot
npm run dev -- https://example.com -o snapshot.html -m single --extract-components

# With framework hint and depth limit
npm run dev -- https://example.com --extract-components --framework vue --component-depth 5
```

### Local-Only Conversion

```bash
# Run conversion on existing bundle output (skips URL fetch)
npm run dev -- --convert-local ./project --codegen-framework vue

# Run on single-file output
npm run dev -- --convert-local snapshot.html --codegen-framework react

# Custom output directory
npm run dev -- --convert-local ./project -o ./alt --codegen-framework vue \
  --codegen-generate-drafts
```

### Advanced Usage

```bash
# Custom skip list
npm run dev -- https://example.com --skip-types .zip,.mp4,.pdf

# Disable type filtering (download all types)
npm run dev -- https://example.com --skip-types ""

# Size limit per file
npm run dev -- https://example.com --max-file-size 10MB

# Disable size limit
npm run dev -- https://example.com --max-file-size 0

# Full example: bundle + components + React codegen
npm run dev -- https://example.com \
  -o ./project \
  -m bundle \
  --extract-components \
  --codegen-framework react \
  --codegen-typescript \
  --skip-types .zip,.exe \
  --max-file-size 20MB \
  --concurrency 8 \
  --pretty
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

The snapshot pipeline follows these stages:

1. **Fetch HTML** — Download page with timeout and User-Agent
2. **Parse HTML** — Extract asset references (CSS, JS, images, fonts, media)
3. **Recursive CSS Extraction** — Download external CSS, extract nested `@import` and `url()` references
4. **Deduplicate** — Remove duplicate URLs
5. **Filter & Download** — Apply extension/size filters, download remaining assets concurrently
6. **Assemble Output** — Bundle mode writes files; Single mode inlines everything

Optional component extraction pipeline:
- Analyze HTML/CSS/JS for component boundaries
- Correlate components with styles and logic
- Generate component specs with confidence scores
- Output framework-specific code (optional)

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run without building
npm run dev -- <url>

# Run tests
npm run test:run
```

## License

MIT
