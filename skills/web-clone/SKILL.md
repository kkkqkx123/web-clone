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

## Installation

### CLI (Global Install)

```bash
npm install -g @kkkqkx123/web-clone-cli
# Then use the `snapshot` command directly:
snapshot https://example.com -o ./snapshot
```

### Library (Project Use)

```bash
# Core engine
pnpm add @web-clone/core
# Optional: browser adapters & codegen
pnpm add @web-clone/adapter-playwright @web-clone/codegen
```

See [references/cli-usage.md](references/cli-usage.md) for more entry commands.

## Quick Start

```bash
# Snapshot a page (bundle mode, default)
pnpm dev:cli https://example.com -o ./site

# Snapshot + extract components
pnpm dev:cli https://example.com -o ./project -m bundle --extract-components

# Single-file snapshot
pnpm dev:cli https://example.com -o snapshot.html -m single

# With browser automation
pnpm dev:cli https://spa-site.com --adapter playwright
```

## Reference Files

### CLI Usage → [references/cli-usage.md](references/cli-usage.md)
- Entry commands and subcommands (`snapshot`, `inspect`, `query`, `validate`, `clean`)
- All options: basic, download, resource filtering, recursive scan, browser automation, **serve mode**, component extraction, code generation
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

### Examples Guide → [references/examples-guide.md](references/examples-guide.md)
- How to run each example (inspect, playwright, puppeteer)
- Environment variables and output paths
- Swapping Playwright ↔ Puppeteer adapters
- Custom browser configuration

## Examples (assets)

Example scripts are also bundled in [assets/examples/](assets/examples/) for quick reference.
Read them when the user asks for usage patterns or when writing tests.
