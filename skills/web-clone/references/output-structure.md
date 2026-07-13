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
├── manifest.json               # Resource validation info
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
    └── REVIEW_REQUIRED.md      # Low-confidence components
```

## Single Mode

```
snapshot.html                   # Self-contained HTML (CSS/JS inlined, images/fonts as base64)
snapshot_components/            # Component extraction (when --extract-components)
├── components/
├── index.json
├── README.md
├── MIGRATION.md
└── REVIEW_REQUIRED.md
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
