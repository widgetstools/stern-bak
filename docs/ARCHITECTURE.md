# StarUI Platform Architecture

See also: root [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) and [`docs/ARCHITECTURE_GUIDE.md`](../../docs/ARCHITECTURE_GUIDE.md).

## Layer model

```
┌─────────────────────────────────────────┐
│  Apps (phase 6)                         │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  @wellsfargo-starui/grid-react + @wellsfargo-starui/app  │  React bindings, Hosted*
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  @wellsfargo-starui/grid                         │  MarketsGrid product
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  @wellsfargo-starui/engine                       │  Vanilla grid platform
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  @wellsfargo-starui/host + adapters              │  Ports + browser/openfin
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  @wellsfargo-starui/types                        │  Foundation types
└─────────────────────────────────────────┘
```

## Host ports

| Port | Required | Default |
|---|---|---|
| `RuntimePort` | Yes | `@wellsfargo-starui/host-browser` |
| `StoragePort` | Yes | localStorage (phase 3) |
| `DataPort` | No | — |
| `ConfigPort` | No | — |

## Folder layout

Ten architecture buckets under `packages/` — see
[`docs/PACKAGE_ORGANIZATION.md`](./PACKAGE_ORGANIZATION.md):

```
packages/design-system/   — (1) tokens, icons
packages/react-ui/        — (3) shadcn primitives
packages/react-grid/      — (5) @wellsfargo-starui/grid
packages/data/            — (6) @wellsfargo-starui/data
packages/openfin/         — (7) @wellsfargo-starui/openfin
packages/react-core/      — (9) app, host-data-react, tools
packages/shared/          — (10) engine, host, host-config, types, widget contract
```

## Import rules

- `engine` must not import from `grid`, `grid-react`, or `app`
- `grid` must not import `@openfin/*` — OpenFin lives in `@wellsfargo-starui/openfin`
- `@wellsfargo-starui/openfin`'s OpenFin peer deps are optional; browser-only apps never import them
- Framework adapters (`grid-react`, future `grid-angular`) sit above `grid`

## Phase 1 packages (shipped)

- `@wellsfargo-starui/types`
- `@wellsfargo-starui/host`
- `@wellsfargo-starui/host-browser`

## Phase 2 packages (shipped)

- `@wellsfargo-starui/engine` — vanilla grid platform (ported from `@wellsfargo-starui/core`, OpenFin shim removed)

## Phase 3 packages (shipped)

- `@wellsfargo-starui/grid` — merged MarketsGrid + customizer (`widget/`, `customizer/`, `runtime/openFin`)

## Phase 4 packages (shipped)

- `@wellsfargo-starui/design-system` — tokens, CSS, framework adapters
- `@wellsfargo-starui/ui` — shadcn/Radix primitives
