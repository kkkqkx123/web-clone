# web-clone Configuration Guide

## Config File Locations

web-clone searches for configuration in the following order (lower number = lower priority):

| Priority | Location | Description |
|----------|----------|-------------|
| 0 (base) | Built-in defaults | Hardcoded in `packages/core/src/config/defaults.ts` |
| 1 | `~/.config/web-clone/config.json` | User-global config (applies to all projects) |
| 2 | `./web-clone.config.json` | Project-level config (nearest ancestor) |
| 2 | `.web-clonerc` | Alternative project config (JSON) |
| 2 | `.web-clonerc.json` | Alternative project config (JSON) |
| 3 | CLI flags | Highest priority, overrides everything |

## Config File Format

All config files use JSON format with the following top-level fields:

```jsonc
{
  // (Optional) Schema reference — ignored by runtime
  "$schema": "https://example.com/web-clone/schema.json",

  // Resource filtering preset
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

### 3. Run snapshot

```bash
# Uses merged config (global + project) + CLI overrides
pnpm dev:cli -- https://example.com --output ./custom-out
```

## Example Files

- `web-clone.config.full.json` — All options documented
- `web-clone.config.minimal.json` — Minimal production config
- `web-clone.config.vue-project.json` — Vue/Nuxt project config
- `.web-clonerc` — Alt-format project config
