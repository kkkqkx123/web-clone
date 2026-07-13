---
name: web-clone
description: >-
  Web page snapshot and component extraction tool. Use when the user asks to
  clone/download/capture/snapshot a webpage, extract components from a page,
  generate framework code from HTML (Vue/React/Angular/Svelte/jQuery), or
  bundle a website offline. Also use when asked about the web-clone CLI,
  its architecture, or how to use its library API programmatically.
---

# web-clone Skill

This skill provides guidance for using the web-clone CLI and library API.

## Quick Start

```bash
# Snapshot a page (bundle mode, default)
pnpm dev:cli -- https://example.com -o ./site

# Snapshot + extract components
pnpm dev:cli -- https://example.com -o ./project -m bundle --extract-components

# Single-file snapshot
pnpm dev:cli -- https://example.com -o snapshot.html -m single

# With browser automation
pnpm dev:cli -- https://spa-site.com --browser playwright
```

## Reference Files

### CLI Usage → [references/cli-usage.md](references/cli-usage.md)
- Entry commands and subcommands (`snapshot`, `inspect`, `query`, `validate`, `clean`)
- All options: basic, download, resource filtering, recursive scan, browser automation, component extraction, code generation
- Many examples (snapshot, browser automation, component extraction, code gen, resource filtering, subcommands)
- Config hierarchy (built-in → global → project → CLI args)
- Platform notes (PowerShell, proxy), testing commands

### Architecture → [references/architecture.md](references/architecture.md)
- Snapshot pipeline (fetch → parse → dedupe → download → assemble)
- Component extraction pipeline (analysis → correlation → generation)
- Key modules by package, core data structures
- Design decisions (orthogonal options, confidence scoring, CSS/JS merging)

### Output Structure → [references/output-structure.md](references/output-structure.md)
- Bundle mode and single mode directory trees
- Code generation output layout (`__generated__/`, `__drafts__/`, `shared/`)
- `manifest.json` structure and component types

## Examples (assets)

Example scripts are bundled in [assets/examples/](assets/examples/):

| Directory | Content |
|-----------|---------|
| `inspect/` | Page discovery, CI assertions, test workflow with snapshot |
| `playwright/` | Basic snapshot, authentication, multi-page, integrated workflow |
| `puppeteer/` | Basic snapshot, authentication, multi-page, integrated workflow |
| `config-examples/` | JSON config files and README for config hierarchy |

Read these examples when the user asks for usage patterns or when writing tests.
