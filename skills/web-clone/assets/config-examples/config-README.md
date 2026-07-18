# web-clone Configuration Guide

## Config File Locations

web-clone merges configuration from multiple sources (lower number = lower priority):

| Priority | Source | Description |
|----------|--------|-------------|
| 0 (base) | Built-in defaults | Hardcoded in `packages/core/src/config/defaults.ts` |
| 1 | `~/.config/web-clone/config.json` | User-global config (applies to all projects) |
| 2 | `./web-clone.config.json` | Project-level config (nearest ancestor) |
| 2 | `.web-clonerc` | Alternative project config (JSON) |
| 2 | `.web-clonerc.json` | Alternative project config (JSON) |
| 3 | `--config <path>` | Explicit config file (replaces auto-discovery) |
| 4 | CLI flags | Highest priority, overrides everything |

> When `--config` is provided, the auto-discovered project config is **skipped**, but the global config (`~/.config/web-clone/config.json`) still applies.

## Config File Format

All config files use JSON format with the following top-level fields:

```jsonc
{
  // (Optional) Schema reference — ignored by runtime
  "$schema": "https://example.com/web-clone/schema.json",

  // ── Resource filtering ──────────────────────────────
  "resourcePreset": "default",

  // Explicit skip list (bypasses preset entirely)
  "skipExtensions": [],

  // Extensions to forcibly include (removed from skip list)
  "includeExtensions": [".wasm"],

  // Extensions to forcibly exclude (added to skip list)
  "excludeExtensions": [],

  // Per-category include toggles (convenience)
  "include": {
    "wasm": true,
    "fonts": true
  },

  // ── Browser adapter configuration ───────────────────
  "browser": {
    "adapter": "playwright",
    "headless": true,
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "viewport": "1920x1080",
    "locale": "zh-CN",
    "waitForLoadState": "networkidle",
    "launchArgs": ["--disable-gpu"],
    "hybrid": false
  },

  // ── Component extraction ────────────────────────────
  "extraction": {
    "enabled": true,
    "depth": 3,
    "framework": "react",
    "extractLogic": true,
    "memoryLimit": 1536
  },

  // ── Code generation ─────────────────────────────────
  "codegen": {
    "framework": "react",
    "typescript": true,
    "cssModules": true,
    "generateDrafts": false,
    "extractShared": true
  },

  // ── Server mode ─────────────────────────────────────
  "server": {
    "enabled": false,
    "port": 8080,
    "proxy": true
  },

  // Default values for SnapshotOptions (overridable by CLI)
  "defaults": {
    "output": "./snapshots",
    "mode": "bundle",
    "maxAssets": 200,
    "concurrency": 8,
    "timeout": 30000,
    "maxFileSize": "100MB",
    "inline": true,
    "pretty": false,
    "scanDepth": 2,
    "scanJs": true,
    "scanJson": false
  }
}
```

## Browser Config Fields

| Field | Type | CLI Equivalent | Description |
|-------|------|----------------|-------------|
| `adapter` | `string` | `--adapter` | Adapter type: `playwright` / `puppeteer` |
| `headless` | `boolean` | `--headed` / `--no-headed` | Headless mode (default: `true`) |
| `userAgent` | `string` | `--user-agent` | Custom User-Agent to avoid anti-bot detection |
| `viewport` | `string` | `--viewport` | Viewport size, e.g. `"1920x1080"` |
| `locale` | `string` | `--locale` | Browser locale, e.g. `"zh-CN"` |
| `waitForLoadState` | `string` | — | Wait state: `load` / `domcontentloaded` / `networkidle` |
| `launchArgs` | `string[]` | `--launch-args` | Extra Chromium launch arguments |
| `hybrid` | `boolean` | `--hybrid` | Browser for HTML, HTTP for assets |

## Extraction Config Fields

| Field | Type | CLI Equivalent | Description |
|-------|------|----------------|-------------|
| `enabled` | `boolean` | `--extract-components` | Enable component extraction |
| `depth` | `number` | `--component-depth` | Recognition depth limit |
| `framework` | `string` | `--framework` | Framework hint: `vue` / `react` / `svelte` |
| `filter` | `string` | `--component-filter` | Filter expression, e.g. `"confidence >= 0.7"` |
| `extractLogic` | `boolean` | `--extract-logic` | Extract JS logic |
| `memoryLimit` | `number` | `--memory-limit` | Memory budget (MB) |

## Codegen Config Fields

| Field | Type | CLI Equivalent | Description |
|-------|------|----------------|-------------|
| `framework` | `string` | `--codegen-framework` | Target: `vue` / `react` / `angular` / `svelte` / `jquery` |
| `typescript` | `boolean` | `--codegen-typescript` | Use TypeScript |
| `cssModules` | `boolean` | `--codegen-css-modules` | Use CSS Modules (React) |
| `generateDrafts` | `boolean` | `--codegen-generate-drafts` | Generate full project templates |
| `extractShared` | `boolean` | `--codegen-extract-shared` | Extract shared logic |

## Server Config Fields

| Field | Type | CLI Equivalent | Description |
|-------|------|----------------|-------------|
| `enabled` | `boolean` | `--serve` | Generate server files |
| `port` | `number` | `--serve-port` | HTTP server port |
| `proxy` | `boolean` | `--proxy` | Enable reverse proxy |

## defaults Extra Fields

In addition to all `SnapshotOptions`, `defaults` supports:

| Field | Type | CLI Equivalent | Description |
|-------|------|----------------|-------------|
| `adapter` | `string` | `--adapter` | Browser adapter type |
| `headless` | `boolean` | `--headed` | Headless mode |
| `userAgent` | `string` | `--user-agent` | User-Agent |
| `viewport` | `string` | `--viewport` | Viewport size |
| `locale` | `string` | `--locale` | Locale |
| `launchArgs` | `string[]` | `--launch-args` | Launch args |
| `hybrid` | `boolean` | `--hybrid` | Hybrid mode |
| `serve` | `boolean` | `--serve` | Generate server files |
| `servePort` | `number` | `--serve-port` | Server port |
| `run` | `boolean` | `--run` | Start server |
| `proxy` | `boolean` | `--proxy` | Reverse proxy |
| `convertLocal` | `string` | `--convert-local` | Local conversion path |

## Preset Reference

| Preset | Skipped Extensions | Use Case |
|--------|--------------------|----------|
| `none` | (none) | Full site mirror, including WASM, video, fonts |
| `minimal` | `.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.bz2` | Quick snapshot of typical web content |
| `default` | Archives + installers + documents | Safe for most sites (recommended) |
| `no-media` | Default + video + audio | Text-focused, fastest |
| `aggressive` | Only critical web assets | Minimal footprint |

## Include/Exclude Category Reference

| Category | Extensions |
|----------|------------|
| `wasm` | `.wasm` |
| `bin` | `.bin` |
| `video` | `.mp4`, `.webm`, `.m3u8`, `.ts`, `.m4v`, `.mkv`, `.avi`, `.mov`, `.flv` |
| `audio` | `.mp3`, `.aac`, `.flac`, `.ogg`, `.wma`, `.wav` |
| `fonts` | `.woff`, `.woff2`, `.ttf`, `.otf` |
| `documents` | `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx` |
| `archives` | `.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.bz2` |

## Merge Order Example

```bash
# Global config (~/.config/web-clone/config.json) sets:
#   { "resourcePreset": "minimal", "defaults": { "concurrency": 4 } }

# Project config (web-clone.config.json) sets:
#   { "include": { "wasm": true }, "defaults": { "concurrency": 8, "maxAssets": 200 } }

# CLI invocation:
pnpm dev:cli -- https://example.com --include-video -o ./out

# Actual effective config:
#   resourcePreset: "minimal" (from global)
#   concurrency: 8 (CLI doesn't set it, project overrides global)
#   maxAssets: 200 (from project config)
#   includeExtensions: [".wasm", ".mp4", ...] (wasm from project + video from CLI)
#   output: "./out" (CLI overrides)
```

## Quick Start

### 1. Global config (applies to all projects)

Create `~/.config/web-clone/config.json`:

```json
{ "defaults": { "concurrency": 8, "maxAssets": 200 } }
```

### 2. Project config (per-project defaults)

Create `web-clone.config.json` in your project root:

```json
{
  "resourcePreset": "no-media",
  "include": { "wasm": true },
  "defaults": { "output": "./my-snapshots", "mode": "bundle" }
}
```

### 3. Use explicit config path

```bash
# Uses the specified config file instead of auto-discovery
pnpm dev:cli -- https://example.com --config ./my-config.json
pnpm dev:cli -- https://example.com -c ./my-config.json
```

### 4. Run snapshot

```bash
# Uses merged config (global + project) + CLI overrides
pnpm dev:cli -- https://example.com --output ./custom-out
```

## Example Files

- `web-clone.config.full.json` — All options documented
- `web-clone.config.minimal.json` — Minimal production config
- `web-clone.config.vue-project.json` — Vue/Nuxt project config
- `.web-clonerc` — Alt-format project config

A comprehensive example with Chinese comments is also at the project root:
- `web-clone.config.example.json` — Full config with all sections
