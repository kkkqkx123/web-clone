# web-clone

**Language**: Use English in code files and Simplified Chinese in docs.

**web-clone** — A single-execution web page snapshot tool that downloads and bundles a webpage into a single HTML file or directory bundle, with optional component extraction and multi-framework code generation. Single npm package (`@kkkqkx123/web-clone`), no monorepo tooling (npm + tsc + vitest).

## Build & Development

```bash
npm install              # Install dependencies
npm run build            # Build (tsc → dist/)
npm run start -- <url>   # Run CLI via tsx
npm test                 # Run all tests (vitest)
npm run test:unit        # Unit tests only
npm run test:integration # CLI/browser adapter integration tests
npm run test:e2e         # SPA crawl E2E tests (real browser)
npm run clean            # Clean dist/coverage
```

Entry point: `src/cli/cli.ts` (bin: `web-clone`)

## Source Layout

| Directory | Description |
|---------|-------------|
| `src/core/` | Core snapshot logic, HTTP adapter, types, component analysis |
| `src/codegen/` | Framework code generators (Vue/React/Angular/Svelte/jQuery) |
| `src/adapters/common.ts` | Shared SPA hydration detection & automation types |
| `src/adapters/playwright/` | Playwright browser automation adapter |
| `src/adapters/puppeteer/` | Puppeteer browser automation adapter |
| `src/cli/` | CLI application (bin `web-clone`) |
| `src/types.ts` | Shared types (also exported as subpath `./types`) |

`playwright` / `puppeteer` are optional peer dependencies — only installed/used when the user passes `--browser`.

## Skills

Detailed usage guides are in the skill directory:

- `skills/web-clone/SKILL.md` — Main skill with navigation to all reference files
- `skills/web-clone/references/cli-usage.md` — CLI commands, options, examples
- `skills/web-clone/references/architecture.md` — Pipeline stages, modules, data structures
- `skills/web-clone/references/output-structure.md` — Output directory trees
