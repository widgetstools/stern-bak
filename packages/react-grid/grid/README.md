# @wellsfargo-starui/grid

Merged MarketsGrid product surface (Phase 3).

## Layout

```
src/
├── widget/       MarketsGrid chrome, toolbars, formatter (was @wellsfargo-starui/markets-grid)
├── customizer/   Module pipeline UI, hooks, editors (was @wellsfargo-starui/grid-react)
└── runtime/      OpenFin popout helpers (removed from @wellsfargo-starui/engine)
```

## Exports

| Import | Surface |
|---|---|
| `@wellsfargo-starui/grid` | `MarketsGrid`, storage helpers, types |
| `@wellsfargo-starui/grid/customizer` | Hooks, modules, settings-panel primitives |
| `@wellsfargo-starui/grid/styles.css` | Widget stylesheet |
| `@wellsfargo-starui/grid/runtime/openfin` | `isOpenFin`, `openFinWindowOpener` |

## Dependencies

- `@wellsfargo-starui/engine`, `@wellsfargo-starui/types`, `@wellsfargo-starui/host` — StarGrid platform
- `@wellsfargo-starui/ui`, `@wellsfargo-starui/design-system` — design system + primitives

## Host integration

Pass an optional `host: GridHostContext` prop to wire runtime identity, storage,
data, and config without the legacy provider stack:

```tsx
<MarketsGrid
  host={createGridHostContext({ runtime, storage, data, config })}
  gridId="blotter"
  rowData={rows}
  columnDefs={cols}
/>
```

Explicit `appId`, `userId`, `storage`, and `appData` props override host defaults.
