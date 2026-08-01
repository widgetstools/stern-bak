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
| 1 | **UI Design System** | `packages/design-system/` | `@wellsfargo-starui/design-system`, `@wellsfargo-starui/icons-svg` |
| 2 | **React UI Controls** | `packages/react-ui/` | `@wellsfargo-starui/ui` |
| 3 | **React Grid** | `packages/react-grid/` | `@wellsfargo-starui/grid` |
| 4 | **Data Utilities** | `packages/data/` | `@wellsfargo-starui/host-data`, `@wellsfargo-starui/host-data-angular` |
| 5 | **OpenFin Utils** | `packages/openfin/` | `@wellsfargo-starui/host-openfin`, `@wellsfargo-starui/openfin-platform` |
| 6 | **React Core** | `packages/react-core/` | `@wellsfargo-starui/app`, `@wellsfargo-starui/widgets-react`, `@wellsfargo-starui/widget-sdk`, `@wellsfargo-starui/host-wrapper-react`, `@wellsfargo-starui/config-browser`, `@wellsfargo-starui/workspace-setup-react`, `@wellsfargo-starui/host-data-react` |
| 7 | **Core / Shared** | `packages/shared/` | `@wellsfargo-starui/types`, `@wellsfargo-starui/shared-types`, `@wellsfargo-starui/engine`, `@wellsfargo-starui/host`, `@wellsfargo-starui/host-browser`, `@wellsfargo-starui/widget`, `@wellsfargo-starui/widget-browser`, `@wellsfargo-starui/host-config` |

## Import rules (unchanged semantics)

- **Shared (10)** — no imports from framework buckets.
- **Design System (1)** — foundation only; no grid/host imports.
- **Data (6)** — vanilla + config; no React/Angular UI.
- **OpenFin (7)** — only buckets here + shared may import `@openfin/core`.
- **Grid (4/5)** — engine + host + design-system; no sibling framework imports.
- **Core (8/9)** — composes grid, data, openfin, UI for product shells and tools.
- **Angular ↔ React** — never import each other.

## `@wellsfargo-starui/*` names

Package **names stay stable** (`@wellsfargo-starui/grid`, not `@wellsfargo-starui/react-grid`). Only
**filesystem paths** change to match the architecture buckets.
