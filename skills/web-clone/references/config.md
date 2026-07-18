# Config File Reference

## Overview

web-clone merges configuration from multiple sources (low → high priority):

| Priority | Source | Description |
|----------|--------|-------------|
| 0 (base) | Built-in defaults | `packages/core/src/config/defaults.ts` |
| 1 | `~/.config/web-clone/config.json` | User-global config (applies to all projects) |
| 2 | `./web-clone.config.json` / `.web-clonerc` / `.web-clonerc.json` | Auto-discovered project config (walks up directory tree) |
| 3 | `--config <path>` | Explicit config file (replaces auto-discovery) |
| 4 (highest) | CLI arguments | Command-line flags |

> When `--config` is provided, the auto-discovered project config is **skipped**, but the global config (`~/.config/web-clone/config.json`) still applies.

---

## Quick Start

### 1. Global Config

```bash
mkdir -p ~/.config/web-clone
```

Create `~/.config/web-clone/config.json`:

```json
{ "defaults": { "concurrency": 8, "maxAssets": 200, "timeout": 30000 } }
```

### 2. Project Config (auto-discovered)

Create `web-clone.config.json` in your project root:

```json
{
  "resourcePreset": "no-media",
  "include": { "fonts": true },
  "defaults": { "output": "./snapshots", "mode": "bundle" }
}
```

### 3. Explicit Config Path

```bash
pnpm dev:cli -- https://example.com --config ./my-config.json
pnpm dev:cli -- https://example.com -c ./my-config.json
```

---

## Config File Format

### Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `$schema` | `string` | Optional JSON Schema URL (ignored by runtime) |
| `resourcePreset` | `string` | Resource filtering preset: `none` / `minimal` / `default` / `no-media` / `aggressive` |
| `skipExtensions` | `string[]` | Explicit skip list (bypasses preset entirely) |
| `includeExtensions` | `string[]` | Extensions to forcibly include |
| `excludeExtensions` | `string[]` | Extensions to forcibly exclude |
| `include` | `object` | Per-category include toggles |
| `browser` | `object` | Browser adapter configuration |
| `extraction` | `object` | Component extraction configuration |
| `codegen` | `object` | Code generation configuration |
| `server` | `object` | Server mode configuration |
| `defaults` | `object` | Global defaults for SnapshotOptions + extra options |

### `browser` — Browser Adapter Config

| Field | Type | CLI Equivalent | Description |
|-------|------|----------------|-------------|
| `adapter` | `string` | `--adapter` | Adapter type: `playwright` / `puppeteer` |
| `headless` | `boolean` | `--headed` / `--no-headed` | Headless mode |
| `userAgent` | `string` | `--user-agent` | Custom User-Agent (anti-bot detection) |
| `viewport` | `string` | `--viewport` | Viewport size, e.g. `"1920x1080"` |
| `locale` | `string` | `--locale` | Browser locale, e.g. `"zh-CN"` |
| `waitForLoadState` | `string` | — | Wait state: `load` / `domcontentloaded` / `networkidle` |
| `launchArgs` | `string[]` | `--launch-args` | Extra Chromium launch args |
| `hybrid` | `boolean` | `--hybrid` | Hybrid mode (browser for HTML, HTTP for assets) |

### `extraction` — Component Extraction

| Field | Type | CLI Equivalent | Description |
|-------|------|----------------|-------------|
| `enabled` | `boolean` | `--extract-components` | Enable component extraction |
| `depth` | `number` | `--component-depth` | Recognition depth limit |
| `framework` | `string` | `--framework` | Framework hint: `vue` / `react` / `svelte` |
| `filter` | `string` | `--component-filter` | Filter expression |
| `extractLogic` | `boolean` | `--extract-logic` | Extract JS logic |
| `memoryLimit` | `number` | `--memory-limit` | Memory budget (MB) |

### `codegen` — Code Generation

| Field | Type | CLI Equivalent | Description |
|-------|------|----------------|-------------|
| `framework` | `string` | `--codegen-framework` | Target framework: `vue` / `react` / `angular` / `svelte` / `jquery` |
| `typescript` | `boolean` | `--codegen-typescript` | Use TypeScript |
| `cssModules` | `boolean` | `--codegen-css-modules` | Use CSS Modules (React) |
| `generateDrafts` | `boolean` | `--codegen-generate-drafts` | Generate full project templates |
| `extractShared` | `boolean` | `--codegen-extract-shared` | Extract shared logic |

### `server` — Server Mode

| Field | Type | CLI Equivalent | Description |
|-------|------|----------------|-------------|
| `enabled` | `boolean` | `--serve` | Generate server files |
| `port` | `number` | `--serve-port` | HTTP server port |
| `proxy` | `boolean` | `--proxy` | Enable reverse proxy |

### `defaults` — Global Defaults

Supports all `SnapshotOptions` fields plus these extras:

| Extra Field | Type | CLI Equivalent | Description |
|-------------|------|----------------|-------------|
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

---

## Preset Reference

| Preset | Skipped Extensions | Use Case |
|--------|--------------------|----------|
| `none` | (none) | Full site mirror |
| `minimal` | Archives (.zip, .rar, .7z, .tar, .gz, .bz2) | Quick snapshot |
| `default` | Archives + installers + documents | Safe for most sites (recommended) |
| `no-media` | Default + video + audio | Text-focused, fastest |
| `aggressive` | Only critical web assets | Minimal footprint |

## Include/Exclude Categories

| Category | Extensions |
|----------|------------|
| `wasm` | `.wasm` |
| `bin` | `.bin` |
| `video` | `.mp4`, `.webm`, `.m3u8`, `.ts`, `.m4v`, `.mkv`, `.avi`, `.mov`, `.flv` |
| `audio` | `.mp3`, `.aac`, `.flac`, `.ogg`, `.wma`, `.wav` |
| `fonts` | `.woff`, `.woff2`, `.ttf`, `.otf` |
| `documents` | `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx` |
| `archives` | `.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.bz2` |

---

## Merge Example

```bash
# Global config (~/.config/web-clone/config.json) sets:
#   { "resourcePreset": "minimal", "defaults": { "concurrency": 4 } }

# Project config (web-clone.config.json) sets:
#   { "include": { "wasm": true }, "defaults": { "concurrency": 8, "maxAssets": 200 } }

# CLI invocation:
pnpm dev:cli -- https://example.com --include-video -o ./out

# Effective config:
#   resourcePreset: "minimal" (from global)
#   concurrency: 8 (CLI doesn't set it, project overrides global)
#   maxAssets: 200 (from project config)
#   includeExtensions: [".wasm", ".mp4", ...] (wasm from project + video from CLI)
#   output: "./out" (CLI overrides)
```

---

## Anti-Bot Recommended Config

```json
{
  "browser": {
    "adapter": "playwright",
    "headless": true,
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "viewport": "1920x1080",
    "locale": "zh-CN",
    "waitForLoadState": "domcontentloaded"
  },
  "defaults": {
    "timeout": 60000
  }
}
```

---

## Example Files

Example config files are available in `assets/config-examples/`:

- `web-clone.config.full.json` — All options documented
- `web-clone.config.minimal.json` — Minimal production config
- `web-clone.config.vue-project.json` — Vue/Nuxt project config
- `.web-clonerc` — Alt-format project config

A complete example with comments is also at the project root:
- `web-clone.config.example.json`