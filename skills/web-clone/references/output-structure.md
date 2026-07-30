# Output Structure

## Bundle Mode

```
output/
├── index.html                  # Main snapshot (paths rewritten to relative)
├── assets/
│   ├── css/
│   ├── js/
│   ├── img/
│   ├── fonts/
│   └── data/
├── snapshot.json               # Resource manifest and status
├── SNAPSHOT_ISSUES.json        # Quality review: issues the user should inspect
├── SNAPSHOT_ISSUES.md          # Quality review: human-readable version
├── SNAPSHOT_LOG.json           # Fetch debug: raw download/network events
├── SNAPSHOT_LOG.md             # Fetch debug: human-readable version
├── manifest.json               # Resource validation info
├── server.js                   # Standalone server (when --serve)
├── package.json                # npm scripts (when --serve)
├── proxy-config.json           # Proxy configuration (when --serve)
├── start.bat                   # Windows launcher (when --serve)
├── start.sh                    # Unix launcher (when --serve)
└── components/                 # Component extraction (when --extract-components)
    ├── components/
    │   ├── Header/
    │   │   ├── template.html
    │   │   ├── style.css
    │   │   ├── manifest.json
    │   │   └── logic.original.json
    │   ├── Footer/
    │   └── ...
    ├── index.json
    ├── README.md
    ├── MIGRATION.md
    ├── REVIEW_REQUIRED.md      # Low-confidence components
    ├── SNAPSHOT_ISSUES.json    # Merged quality review (includes component analysis)
    ├── SNAPSHOT_ISSUES.md
    ├── SNAPSHOT_LOG.json       # Merged fetch log
    └── SNAPSHOT_LOG.md
```

The `server.js` is a standalone Node.js script using only built-in modules (`http`, `fs`, `path`). No npm dependencies required. Run with:

```bash
cd output/
node server.js              # Start on port 8080
PORT=3000 node server.js    # Custom port
npm run serve               # Via package.json
```

## Single Mode

```
snapshot.html                   # Self-contained HTML (CSS/JS inlined, images/fonts as base64)
SNAPSHOT_ISSUES.json            # Quality review: issues the user should inspect
SNAPSHOT_ISSUES.md
SNAPSHOT_LOG.json               # Fetch debug: raw download/network events
SNAPSHOT_LOG.md
snapshot_components/            # Component extraction (when --extract-components)
├── components/
├── index.json
├── README.md
├── MIGRATION.md
├── REVIEW_REQUIRED.md
├── SNAPSHOT_ISSUES.json        # Merged quality review
├── SNAPSHOT_ISSUES.md
├── SNAPSHOT_LOG.json           # Merged fetch log
└── SNAPSHOT_LOG.md
```

## Code Generation Output

When `--codegen-framework` is specified, generated code appears inside `components/`:

```
components/
├── __generated__/              # Generated framework components
│   ├── Header.vue              # Vue SFC example
│   ├── Footer.jsx              # React JSX example
│   └── ...
├── __drafts__/                 # Full project templates (--codegen-generate-drafts)
│   ├── package.json
│   ├── src/
│   │   ├── App.vue
│   │   ├── main.ts
│   │   └── components/
│   └── ...
└── shared/                     # Shared logic (--codegen-extract-shared)
    ├── utils.ts
    └── types.ts
```

Supported frameworks: Vue | React | Angular | Svelte | jQuery

## manifest.json Structure

```json
{
  "name": "Header",
  "type": "presentational",
  "path": "components/Header",
  "children": [],
  "state": {
    "isOpen": {
      "type": "boolean",
      "initial": false,
      "bindings": [],
      "confidence": 0.85
    }
  },
  "events": {
    "handleClick": {
      "event": "click",
      "handler": "handleClick",
      "selector": ".menu-button"
    }
  },
  "migration": {
    "priority": "high",
    "effort": "2h",
    "suggestions": ["Extract state to reactive refs", "Map event handlers to component methods"],
    "todos": []
  }
}
```

**Component types**:
- `stateful` — Has state and events (high priority)
- `presentational` — Styles/logic only (medium priority)
- `unknown` — Cannot determine type (low priority)

## Two Separate Reports

### SNAPSHOT_ISSUES — Quality Review

Issues the user should inspect because they affect the correctness of the snapshot output.

| Category | Severity | When |
|----------|----------|------|
| `html_fetch` | `warning` | HTML page returned 4xx/5xx but content was accepted (e.g. error page) |
| `asset_download` | `warning` | Resource returned 4xx/5xx but valid content accepted (lenient mode) |
| `asset_validation` | `warning` | Zero-length files, integrity check failures |
| `memory_budget` | `warning` | Memory budget downgrade — some analysis skipped |
| `memory_budget` | `error` | HTML too large, component extraction skipped entirely |
| `component_analysis` | `warning` | Low-confidence component match (< 60%) |

### SNAPSHOT_LOG — Fetch Debug

Runtime/network events useful for debugging or verifying tool behavior.

| Category | Severity | When |
|----------|----------|------|
| `html_fetch` | `error` | Network failure during HTML fetch |
| `html_fetch` | `info` | Non-2xx HTTP status received (informational) |
| `css_fetch` | `warning` | External CSS file download failure |
| `asset_download` | `error` | Resource download failure (network, 404, etc.) |
| `asset_download` | `info` | Resource skipped (extension filter, size filter) |
| `resource_filter` | `info` | Resource filter statistics |

### JSON Format

Both files share the same JSON schema:

```json
{
  "sourceUrl": "https://example.com",
  "generatedAt": "2026-07-24T12:00:00.000Z",
  "summary": {
    "total": 5,
    "errors": 2,
    "warnings": 2,
    "infos": 1
  },
  "issues": [
    {
      "severity": "warning",
      "category": "asset_download",
      "source": "https://example.com/missing.js",
      "message": "Accepted with HTTP 404 — content may be incorrect",
      "detail": "Resource returned 404 but contained valid JS content",
      "action": "Verify this resource manually to ensure correct content was captured",
      "timestamp": "2026-07-24T12:00:01.000Z"
    }
  ]
}
```

### Severity Levels

| Level | Icon | Meaning |
|-------|------|---------|
| `error` | `✗` | Functional problems — resource missing, pipeline halted |
| `warning` | `⚠` | Potentially degraded — content may be wrong, review recommended |
| `info` | `ℹ` | Contextual notes — expected behavior, for debugging purposes |
