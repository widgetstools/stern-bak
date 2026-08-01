# Package organization — engineering architecture buckets

Seven top-level buckets under `packages/`, one published package each.
Dependency flow: **Types (6)**, **Core (7)** and **Design System (1)** are
foundations; **React Core (5)** and **React Grid (2)** consume them;
**Data (3)** and **OpenFin (4)** are cross-cutting services.

```
┌─────────────────────────────────────────────────────────────────┐
│  Apps (separate repo — docs/APPS_REPO.md)                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
       ┌──────▼──────┐               ┌──────▼──────┐
       │ 5 React     │               │ 2 React Grid│
       │ Core        │               │             │
       └──────┬──────┘               └──────┬──────┘
              │                             │
              └──────────────┬──────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
       ┌──────▼─────┐ ┌──────▼──────┐      │
       │ 3 Data     │ │ 4 OpenFin   │      │
       │            │ │             │      │
       └──────┬─────┘ └──────┬──────┘      │
              │              │             │
              └──────────────┴─────────────┘
                             │
       ┌─────────────────────┴───────────────────┐
       │ 6 Types │ 7 Core │ 1 Design Sys         │
       └─────────────────────────────────────────┘
```

## Bucket map

| # | Bucket | Path | npm packages |
|---|--------|------|--------------|
| 1 | **UI Design System** | `packages/design-system/` | `@wellsfargo-starui/design-system` |
| 2 | **React Grid** | `packages/react-grid/` | `@wellsfargo-starui/grid` |
| 3 | **Data Utilities** | `packages/data/` | `@wellsfargo-starui/data` |
| 4 | **OpenFin Utils** | `packages/openfin/` | `@wellsfargo-starui/openfin` |
| 5 | **React Core** | `packages/react-core/` | `@wellsfargo-starui/react` |
| 6 | **Types** | `packages/types/` | `@wellsfargo-starui/types` — members as subpaths: `.` (former `types`), `./shared` (+`/configuration`, `/dataProvider`, `/fieldSelector`; former `shared-types`) |
| 7 | **Core** | `packages/core/` | `@wellsfargo-starui/core` — members as subpaths: `.` (former `engine`), `./host` (former `host`), `./host/browser`, `./host/config`, `./widget`, `./widget/browser` |

## Import rules

- **Types (6) / Core (7)** — no imports from framework buckets; `types` imports
  nothing, `core` imports only `types` (plus its `ag-grid-community` peer).
- **Design System (1)** — foundation only; no grid/host imports.
- **Data (3)** — vanilla only; no React/Angular UI. (`host-config` moved into what
  is now Core; `host-data-react` moved to React Core — see the bucket-move
  history in `docs/WORKLOG.md` item 11.)
- **OpenFin (4)** — only this bucket may import `@openfin/core`.
- **Grid (2)** — core + design-system; also carries the collapsed
  `config-browser` and `widgets-react` modules (`./config-browser`, `./widgets`
  subpaths), which have real edges to React Core, OpenFin, and Data — see
  `docs/WORKLOG.md` item 11 for why.
- **Angular ↔ React** — never import each other.

## `@wellsfargo-starui/*` names

Package **names stay stable** (`@wellsfargo-starui/grid`, not `@wellsfargo-starui/react-grid`). Only
**filesystem paths** change to match the architecture buckets.
