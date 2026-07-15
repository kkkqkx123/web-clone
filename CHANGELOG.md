# Changelog

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