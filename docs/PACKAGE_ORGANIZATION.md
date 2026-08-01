# Package organization — engineering architecture buckets

Ten top-level buckets under `packages/`. Dependency flow: **Shared (10)** and
**Design System (1)** are foundations; framework buckets (2–5, 8–9) consume
them; **Data (6)** and **OpenFin (7)** are cross-cutting services.

```
┌─────────────────────────────────────────────────────────────────┐
│  Apps (apps/)                                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
     ┌───────────────────────┼───────────────────────┐
     │                       │                       │
┌────▼─────┐  ┌──────▼──────┐  ┌────────▼────────┐  ┌──────▼──────┐
│ 8 Ang    │  │ 9 React     │  │ 4 Ang Grid      │  │ 5 React Grid│
│ Core     │  │ Core        │  │                 │  │             │
└────┬─────┘  └──────┬──────┘  └────────┬────────┘  └──────┬──────┘
     │               │                  │                  │
     └───────────────┴──────────────────┴──────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
       ┌──────▼─────┐ ┌──────▼──────┐ ┌─────▼─────┐
       │ 6 Data     │ │ 7 OpenFin   │ │ 2/3 UI    │
       │ Utilities  │ │ Utils       │ │ Controls  │
       └──────┬─────┘ └──────┬──────┘ └─────┬─────┘
              │              │              │
              └──────────────┴──────────────┘
                             │
              ┌──────────────┴──────────────┐
              │ 10 Shared    │ 1 Design Sys │
              └─────────────────────────────┘
```

## Bucket map

| # | Bucket | Path | npm packages |
|---|--------|------|--------------|
| 1 | **UI Design System** | `packages/design-system/` | `@wellsfargo-starui/design-system` |
| 2 | **React Grid** | `packages/react-grid/` | `@wellsfargo-starui/grid` |
| 3 | **Data Utilities** | `packages/data/` | `@wellsfargo-starui/data` |
| 4 | **OpenFin Utils** | `packages/openfin/` | `@wellsfargo-starui/openfin` |
| 5 | **React Core** | `packages/react-core/` | `@wellsfargo-starui/react` |
| 6 | **Types** | `packages/types/` | `@wellsfargo-starui/types`, `@wellsfargo-starui/shared-types` |
| 7 | **Core** | `packages/core/` | `@wellsfargo-starui/engine`, `@wellsfargo-starui/host`, `@wellsfargo-starui/host-browser`, `@wellsfargo-starui/widget`, `@wellsfargo-starui/widget-browser`, `@wellsfargo-starui/host-config` |

## Import rules

- **Shared (10)** — no imports from framework buckets.
- **Design System (1)** — foundation only; no grid/host imports.
- **Data (6)** — vanilla only; no React/Angular UI. (`host-config` moved to Shared; `host-data-react` moved to React Core — see the bucket-move history in `docs/WORKLOG.md` item 11.)
- **OpenFin (7)** — only buckets here + shared may import `@openfin/core`.
- **Grid (4/5)** — engine + host + design-system; now also carries the collapsed `config-browser` and `widgets-react` modules (`./config-browser`, `./widgets` subpaths), which have real edges to React Core (`ui`, `host-data-react`, `widget-sdk`), OpenFin, and Data — see `docs/WORKLOG.md` item 11 for why.
- **Core (8/9)** — composes grid, data, openfin, UI for product shells and tools.
- **Angular ↔ React** — never import each other.

## `@wellsfargo-starui/*` names

Package **names stay stable** (`@wellsfargo-starui/grid`, not `@wellsfargo-starui/react-grid`). Only
**filesystem paths** change to match the architecture buckets.
