# web-clone

**Language**: Use English in code files and Simplified Chinese in docs.

**web-clone** — Monorepo (pnpm + Turborepo). A single-execution web page snapshot tool that downloads and bundles a webpage into a single HTML file or directory bundle, with optional component extraction and multi-framework code generation.

## Build & Development

```bash
pnpm install              # Install all dependencies
pnpm build                # Build all packages (turbo run build)
pnpm dev:cli -- <url>     # Run CLI via tsx
pnpm dev                  # All packages in watch mode
pnpm test                 # Run all tests (turbo run test)
pnpm clean                # Clean all dist directories
```

Entry point: `apps/cli/src/cli.ts`

## Packages

| Package | Description |
|---------|-------------|
| `@web-clone/core` | Core snapshot logic, HTTP adapter, types, component analysis |
| `@web-clone/adapter-common` | Shared SPA hydration detection & automation types |
| `@web-clone/adapter-playwright` | Playwright browser automation adapter |
| `@web-clone/adapter-puppeteer` | Puppeteer browser automation adapter |
| `@web-clone/codegen` | Framework code generators (Vue/React/Angular/Svelte/jQuery) |
| `web-clone-cli` | CLI application |

## Skills

Detailed usage guides are in the skill directory:

- `skills/web-clone/SKILL.md` — Main skill with navigation to all reference files
- `skills/web-clone/references/cli-usage.md` — CLI commands, options, examples
- `skills/web-clone/references/architecture.md` — Pipeline stages, modules, data structures
- `skills/web-clone/references/output-structure.md` — Output directory trees
