# Changelog

## v1.0.4 (2026-07-15)

### Fixed

- **CLI runtime crash** — `jsdom` moved from `peerDependencies` (optional) to `dependencies` in `@web-clone/core`. Previously, installing the CLI globally via npm would not install `jsdom` (optional peer dep), causing `ERR_MODULE_NOT_FOUND` at startup. Now `jsdom` is a proper direct dependency, ensuring it is always available at runtime.
- **Version inconsistency** — Unified `jsdom` version to `^29.1.1` across all locations; removed redundant `jsdom` entry from `devDependencies`.

### Changed

- **CLI binary name** — Renamed from `snapshot` to `web-clone` (`bin` field in `apps/cli/package.json`). The old `snapshot` command is no longer available; use `web-clone` instead. The Commander program name in `--help` output is also updated accordingly.
- **Development script** — `apps/cli/package.json` script `"snapshot"` renamed to `"start"` to avoid confusion with the removed binary name.
- **Documentation** — Updated all references to the CLI command name (`snapshot` → `web-clone`) in `README.md`, `README_zh.md`, `skills/web-clone/SKILL.md`, `skills/web-clone/references/cli-usage.md`, and `docs/commands.md`.

## v1.0.3 (2026-07-15)

### Fixed

- **Browser proxy support** — `createPlaywrightAdapter` and `createPuppeteerAdapter` now pass `--proxy-server` to Chromium launch args, reading from `HTTPS_PROXY`/`HTTP_PROXY` env vars or the new `proxy` option. Previously the browser launched without proxy, causing `ERR_CONNECTION_RESET` on restricted sites.
- **HTML serialization** — `serializeDocument` in both `bundle.ts` and `single-file.ts` now uses `document.documentElement.outerHTML` (HTML serializer) instead of `XMLSerializer.serializeToString()` (XML serializer). This fixes two issues: SVG elements (e.g. `<svg id="edges">`) being dropped, and `<script>` content being HTML-entity-encoded (`&` → `&amp;`) which inflated file size.
- **Terminal output clarity** — When no external assets are found, the message now reads "No external assets found — page is self-contained" instead of "Downloading 0 assets". Stats display is split into "Assets: 0 B" and "Page: XX KB (HTML)" so users can see the page was successfully fetched even when there are no external resources.

### Added

- **`proxy` option** — `PlaywrightAdapterOptions` and `PuppeteerAdapterOptions` now accept a `proxy` field for explicit proxy configuration.
- **`htmlBytes` in stats** — `SnapshotResult.stats` now includes `htmlBytes` to report the HTML page size separately from asset byte totals.

## v1.0.1 (2026-07-15)

### Added

- **Server mode** — New `serve` command that starts a local static server to serve snapshots, with configurable port and directory options.
- **Browser automation scripts** — Playwright and Puppeteer detection/verification scripts (`check-browsers.mjs`, `check-playwright.mjs`, `check-puppeteer.mjs`).
- **CLI hydration support** — SPA hydration detection and browser-level hydration logic in `browser.ts` and `hydration.ts`.
- **Adapter enhancements** — `adapter-playwright` and `adapter-puppeteer` now expose additional browser automation methods.
- **Configuration** — New CLI adapter config options; default config extended with server-related settings.
- **Documentation** — Added docs for serve mode, Nuxt SSR hydration analysis, URL handling analysis, CSS absolute path fixes, and integration test environment setup.

### Changed

- **URL processing** — Improved URL resolution and normalization during snapshot assembly.
- **Output path presentation** — Fixed display of output paths in CLI progress messages.
- **Asset path fixes** — All asset references (CSS, JS, images) in generated output are now resolved to correct absolute/relative paths.
- **Server logic** — Consolidated and polished server generation and static file serving.
- **Recursive scanner** — Enhanced discovery logic for more reliable asset collection.
- **Bundle output** — Single-file and directory bundle outputs updated to reflect path-fixing improvements.
- **Test suite** — Extended integration tests for Playwright-based snapshots and real-content scenarios; improved test helpers and server setup.
- **Scripts migrated** — TypeScript utility scripts (check-browsers, verify-playwright) rewritten to ESM (`.mjs`) for better portability.

### Fixed

- Asset paths in generated HTML output now correctly point to bundled resources.
- Output path presentation no longer shows misleading directory locations.
- Various edge cases in URL handling during recursive page scanning.

### Removed

- Legacy `scripts/check-browsers.ts` and `scripts/test-playwright.ts` (replaced by `.mjs` equivalents).