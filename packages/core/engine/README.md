# @wellsfargo-starui/engine

Vanilla TypeScript grid engine — ported from `@wellsfargo-starui/core` (Phase 2).

## Contents

- **GridPlatform** — module pipeline, event bus, API hub
- **ProfileManager** — storage-agnostic profile state machine
- **ExpressionEngine** — 44 built-in functions, CSP policy gate
- **Persistence** — MemoryAdapter, LocalStorageBundleAdapter
- **HistoryStack** — undo/redo
- **colDef helpers** — formatters, themed styles

## Intentionally excluded (vs legacy core)

- `openFinWindowOpener` / `isOpenFin` — moved to `@wellsfargo-starui/host-openfin` or `@wellsfargo-starui/grid` (phase 3/5)
- All React UI — lives in `@wellsfargo-starui/grid` (phase 3)

## Dependencies

- `@wellsfargo-starui/types` — `composeRowId`, `getValueByPath`
- `ssf`, `zustand`, ag-grid (peer)

## Verify

```bash
npm run build -w @wellsfargo-starui/engine
npm run test -w @wellsfargo-starui/engine
```
