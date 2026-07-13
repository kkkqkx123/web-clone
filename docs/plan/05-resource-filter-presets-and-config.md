# Resource Filter Presets & Config System Design

> Date: 2026-07-13
> Status: Draft
> Related: `mirror-kit-ref.txt`, `resource-filter.ts`, `validators.ts`, `cli.ts`

---

## 1. Motivation

Current `--skip-types` design has several limitations:

1. **Single flat list** — a single comma-separated extension list offers no granularity; users who want to skip `video` but keep `wasm` must manually enumerate.
2. **No presets** — every user must construct their own extension list; there is no `--skip-types minimal` / `--skip-types aggressive` convenience.
3. **Binary/ WASM/ video are hardcoded** — `.wasm`, `.bin`, `.mp4`, `.webm` are baked into `DEFAULT_SKIP_EXTENSIONS` and silently skipped. A user snapshotting a WASM demo or a video-portfolio site loses key content by default.
4. **No config file** — CLI arguments are the only way to tweak filters; no shared project-level config, no environment-wide defaults.
5. **No presets for resource discovery depth** — the `mirror-kit-ref.txt` analysis highlights that deeper resource scanning (JS/CSS/JSON recursion) is needed, but the current code does one-pass HTML parsing only.

---

## 2. Design Principles

- **Opt-in, not opt-out** — binary/WASM/video should be included by default; skipped only when a preset or explicit `--skip-types` says so.
- **Presets are composable** — `--resource-preset minimal --include-wasm` extends, doesn't override.
- **Config file hierarchy** — project config > environment variable > CLI flag > defaults.
- **Backward compatibility** — existing `--skip-types ""` (empty string = no filtering) and `--skip-types ".zip,.mp4"` (explicit list) continue to work.
- **Extensibility** — easy to add new presets or categories without changing the filter engine.

---

## 3. Preset System

### 3.1 Presets Definition

| Preset | Description | Skipped Extensions |
|--------|-------------|-------------------|
| `none` / `off` | No filtering at all | `[]` |
| `minimal` | Only obvious non-web garbage | `.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.bz2` |
| `default` | Current behavior (safe for typical sites) | `.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.bz2`, `.exe`, `.msi`, `.dmg`, `.apk`, `.deb`, `.rpm`, `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx` |
| `no-media` | Skip media files (fast, text-focused) | default + `.mp4`, `.webm`, `.mp3`, `.wav`, `.m4v`, `.mkv`, `.avi`, `.mov`, `.flv`, `.aac`, `.flac`, `.ogg`, `.wma` |
| `aggressive` | Download only critical web assets | no-media + `.wasm`, `.bin`, `.iso`, `.torrent`, `.ts`, `.m3u8`, `.otf`, `.ttf`, `.woff`, `.woff2` |

### 3.2 Preset Resolution Logic

```
1. If --skip-types is explicitly provided (even ""):
   → Use it as-is (backward compatible path)
2. Else if --resource-preset is provided:
   → Expand preset to extension list
3. Else:
   → Use "default" preset (safe defaults)
4. Apply --include-* and --exclude-* overrides on top
```

### 3.3 Override Flags

| Flag | Effect |
|------|--------|
| `--include-wasm` | Remove `.wasm` from skip list (priority over preset) |
| `--include-bin` | Remove `.bin` from skip list |
| `--include-video` | Remove `.mp4`, `.webm`, `.m3u8`, `.ts`, `.mkv` etc. |
| `--include-media` | Remove all video + audio extensions |
| `--include-fonts` | Remove `.woff`, `.woff2`, `.ttf`, `.otf` |
| `--include-all` | Same as preset `none` |
| `--exclude-images` | Add image extensions to skip list |
| `--exclude-css` | Add `.css` to skip list |
| `--exclude-js` | Add `.js`, `.mjs` to skip list |

---

## 4. Config File Support

### 4.1 Config File Formats

Support three formats, searched in order:

1. `web-clone.config.json` (project-level, nearest ancestor)
2. `.web-clonerc` (JSON)
3. `.web-clonerc.json`
4. `~/.config/web-clone/config.json` (user-global)

### 4.2 Config Schema

```jsonc
{
  "$schema": "https://example.com/web-clone/schema.json",

  // Preset selection
  "resourcePreset": "default",

  // Extension overrides
  "skipExtensions": [],
  "includeExtensions": [".wasm", ".bin"],
  "excludeExtensions": [],

  // Per-category toggles (convenience overrides)
  "include": {
    "wasm": true,
    "bin": true,
    "video": false,
    "audio": false,
    "fonts": true,
    "documents": false,
    "archives": false
  },

  // Global defaults (overridable by CLI)
  "defaults": {
    "output": "./my-snapshots",
    "mode": "bundle",
    "maxAssets": 200,
    "concurrency": 8,
    "timeout": 30000,
    "maxFileSize": "100MB"
  }
}
```

### 4.3 Merge Order (lowest → highest priority)

1. Built-in defaults (`DEFAULTS`)
2. User-global config (`~/.config/web-clone/config.json`)
3. Project config (`./web-clone.config.json` or ancestor)
4. CLI flags
5. CLI `--include-*` / `--exclude-*` overrides

---

## 5. Resource Discovery Depth (Mirror-Kit Integration)

Per `mirror-kit-ref.txt` §2.1, a major gap is single-pass asset discovery. We introduce a depth-controlled recursive scanner.

### 5.1 Recursive Scan Architecture

```
parseHtml(url)
  → collect refs (current behavior)
  → for each downloaded JS/CSS/JSON:
     → regex-extract urls (url(), src=, fetch(), import())
     → parse JSON for media-like string values
     → add new refs to queue
  → repeat up to --scan-depth <n> rounds
  → deduplicate → filter → download
```

### 5.2 CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--scan-depth <n>` | `1` | How many rounds of recursive resource extraction. `1` = current behavior. `3`-`4` catches most hidden URLs. |
| `--scan-js` | `true` | Scan JS files for embedded URLs |
| `--scan-json` | `false` | Scan JSON files for media URLs (useful for headless CMS) |

### 5.3 Integration Points

- **New module**: `packages/core/src/discovery/recursive-scanner.ts`
- Extends the current `parseHtml` → `extractCssAssets` flow in `assembler.ts:snapshotInternal`
- Runs after HTML parsing but before deduplication and filtering
- Each recursion round fetches only new, unseen URLs of type JS/CSS/JSON
- Configurable concurrency within each round (reuses `runPool`)

---

## 6. Offline Validation & Maintenance (Mirror-Kit §2.3)

### 6.1 Post-Download Validation Enhancement

Current `postDownloadValidation` in `validators.ts` only checks zero-length. We add:

| Check | Description |
|-------|-------------|
| Magic number validation | `hasExpectedMagic()` already exists; integrate into validation report |
| JSON parse check | `JSON.parse()` validation for `.json` files |
| HTML external link audit | Scan output HTML for unsubstituted external URLs |
| MIME-content mismatch | Warn if `.js` file has `text/html` content type |

### 6.2 CLI Subcommand: `web-clone validate [output-dir]`

```bash
pnpm dev:cli -- validate ./snapshot
```

Produces a validation report:
```
✓ Validating snapshot at ./snapshot ...
  assets/images/logo.png   ✓ magic OK
  assets/js/app.js         ✓ valid JS
  assets/data/config.json  ✗ INVALID JSON → parse error at line 42
  index.html               ⚠ contains 3 unresolveable external URLs
```

### 6.3 CLI Subcommand: `web-clone clean [output-dir]`

```bash
pnpm dev:cli -- clean ./snapshot --dry-run
pnpm dev:cli -- clean ./snapshot --force
```

- Removes zero-byte files
- Removes files with corrupted magic bytes
- Optionally re-downloads failed assets (if URL manifest exists)

---

## 7. Implementation Plan

### Phase 1: Presets & Config (P0 — 🔥)

| Step | File(s) | Description |
|------|---------|-------------|
| 1.1 | `packages/core/src/core/resource-filter.ts` | Define `ResourcePreset` enum and `PRESET_EXTENSION_MAP`; refactor `ResourceFilter` constructor to accept preset name + overrides |
| 1.2 | `packages/core/src/types.ts` / `config/schema.ts` | Add `resourcePreset`, `includeExtensions`, `excludeExtensions` fields to `SnapshotOptions` |
| 1.3 | `packages/core/src/core/resource-filter.ts` | Add `applyOverrides()` method that applies `--include-*` / `--exclude-*` on top of preset |
| 1.4 | `apps/cli/src/cli.ts` | Add `--resource-preset`, `--include-wasm`, `--include-video`, `--include-bin`, `--include-media`, `--exclude-images`, etc. options |
| 1.5 | `apps/cli/src/config/cli-adapter.ts` | Update `fromCommander()` to resolve presets + overrides into final `skipExtensions` |
| 1.6 | `packages/core/src/config/` | New module `load-config.ts`: search config file hierarchy, merge with CLI options |
| 1.7 | `packages/core/src/config/` | Define `WebCloneConfigFile` interface matching §4.2 schema |
| 1.8 | Tests | Unit tests for preset resolution, config file loading, override merging |

### Phase 2: Recursive Scanner (P1 — ⚡)

| Step | File(s) | Description |
|------|---------|-------------|
| 2.1 | `packages/core/src/discovery/recursive-scanner.ts` | Implement `RecursiveScanner` class: JS URL extraction, JSON deep traversal, multi-round queue |
| 2.2 | `packages/core/src/parser/` | Add `extractJsUrls(jsText: string, baseUrl: string): AssetRef[]` |
| 2.3 | `packages/core/src/parser/` | Add `extractJsonMediaUrls(json: string, baseUrl: string): AssetRef[]` |
| 2.4 | `packages/core/src/assembler.ts` | Integrate `RecursiveScanner` into `snapshotInternal()` pipeline |
| 2.5 | `apps/cli/src/cli.ts` | Add `--scan-depth`, `--scan-js`, `--scan-json` options |
| 2.6 | Tests | Unit + integration tests for recursive scanning |

### Phase 3: Validation & Cleanup Commands (P1 — ⚡)

| Step | File(s) | Description |
|------|---------|-------------|
| 3.1 | `packages/core/src/validation/asset-validator.ts` | Implement comprehensive asset validation (magic, JSON, MIME, external links) |
| 3.2 | `packages/core/src/validation/cleaner.ts` | Implement bad cache cleanup logic |
| 3.3 | `apps/cli/src/cli.ts` | Add `validate` and `clean` subcommands (Commodore subcommand pattern) |
| 3.4 | Tests | Unit + integration tests |

### Phase 4: Hybrid Fetch Strategy (P2 — 🛠️)

| Step | File(s) | Description |
|------|---------|-------------|
| 4.1 | `packages/core/src/assembler.ts` | Split "render" phase (browser) from "download" phase (HTTP pool) |
| 4.2 | `apps/cli/src/cli.ts` | Add `--hybrid` flag |
| 4.3 | Tests | Integration tests |

---

## 8. Backward Compatibility

| Existing Behavior | New Behavior | Migration |
|-------------------|-------------|-----------|
| `--skip-types ".zip,.mp4"` | Same — explicit list takes priority | No change needed |
| `--skip-types ""` | Same — empty string resolves to `[]` (no filtering) | No change needed |
| Default (no `--skip-types`) | Uses `default` preset (same as current) | No change needed |
| `.wasm` / `.bin` / `.mp4` in default skip list | Removed from default preset; users opt in via `--resource-preset no-media` or `--skip-types` | Minor: WASM/media now included by default; users who want old behavior add `--resource-preset default` |

---

## 9. Appendix: Preset Definition Constants

```typescript
// packages/core/src/core/resource-filter.ts

export type ResourcePreset = 'none' | 'minimal' | 'default' | 'no-media' | 'aggressive';

export const PRESETS: Record<ResourcePreset, {
  description: string;
  skipExtensions: string[];
}> = {
  none: {
    description: 'No filtering applied',
    skipExtensions: [],
  },
  minimal: {
    description: 'Skip only archives and installers',
    skipExtensions: [
      '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',
    ],
  },
  default: {
    description: 'Skip archives, installers, and documents',
    skipExtensions: [
      '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',
      '.exe', '.msi', '.dmg', '.apk', '.deb', '.rpm',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    ],
  },
  'no-media': {
    description: 'Skip all media files (fast, text-focused)',
    skipExtensions: [
      ...PRESETS.default.skipExtensions,
      '.mp4', '.webm', '.m3u8', '.ts',
      '.m4v', '.mkv', '.avi', '.mov', '.flv',
      '.mp3', '.aac', '.flac', '.ogg', '.wma', '.wav',
    ],
  },
  aggressive: {
    description: 'Download only critical web assets',
    skipExtensions: [
      ...PRESETS['no-media'].skipExtensions,
      '.wasm', '.bin',
      '.iso', '.torrent',
      '.otf', '.ttf', '.woff', '.woff2',
    ],
  },
};
```

> **Note**: `.wasm` and `.bin` are intentionally absent from the `default` preset — users who want them skipped must opt into `no-media` or `aggressive`, or explicitly pass `--skip-types ".wasm,.bin"`.

---

## 10. Open Questions

1. Should `--include-all` be an alias for `--resource-preset none`? (Proposal: yes)
2. Should `--include-video` also cover HLS segments (`.ts`) and playlists (`.m3u8`)? (Proposal: yes — all video-related extensions)
3. Config file: should we support YAML in addition to JSON? (Proposal: defer, JSON-only v1)
4. Should `--max-file-size` have preset-sensitivity (e.g., lower default for media-heavy presets)? (Proposal: no — keep orthogonal)
