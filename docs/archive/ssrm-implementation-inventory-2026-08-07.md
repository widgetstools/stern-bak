# MarketsGrid SSRM — Implementation Inventory

**Branch:** `feature/ssrm`  
**Date:** 2026-08-07  
**Repo / worktree:** `stern-bak` (`.worktrees/marketsgrid-ssrm-chrome`)

Related docs:

- Design: [specs/2026-08-07-marketsgrid-ssrm-chrome-design.md](./specs/2026-08-07-marketsgrid-ssrm-chrome-design.md)
- Plan: `2026-08-07-marketsgrid-ssrm-chrome.md` (deleted — git history)

---

## What was implemented

### 1. SharedWorker SSRM data plane (`stomp-ssrm` / `mock-ssrm`)

Server-side row model runs inside the SharedWorker hub:

- Feed (STOMP or mock) fills a row cache.
- An **SSRM plane** (`SsrmPlane` + `QueryEngine` + `RowStore`) answers AG Grid block requests: filter, sort, group, aggregations, quick filter, set-filter values, status-bar summaries.
- Live ticks fan out as `ssrm-tick` events with viewport interest keys.
- Client adapters expose `ISsrmDataProvider` (`getRows`, `configureExpressions`, tick subscription, lifecycle).

**Provider types:**

| Type | Transport | SSRM plane | Typical use |
|------|-----------|------------|-------------|
| `stomp-ssrm` | STOMP WebSocket (`startStomp`) | Yes | Live broker feeds (`stomp-marketsgrid-minimal/?ssrm=1`) |
| `mock-ssrm` | In-worker mock (`startMock`) | Yes | Lab / offline — **same LabRow field names as CSRM mock** (`id`, `cusip`, `bidPrice`, …) |

### 2. MarketsGrid full chrome over SSRM

SSRM is no longer a thin parallel grid. Consumers pass `ssrm` on `MarketsGrid`:

```ts
ssrm={{ provider, keyColumn, cacheBlockSize? }}
```

- Host chrome stays CSRM-identical (customizer, toolbars, profiles, settings).
- Inner surface switches to `rowModelType: 'serverSide'` via `MarketsGridSsrmSurface`.
- Customizer expressions bridge to the worker (`useSsrmExpressionBridge` → `configureExpressions`).
- Quick filter routes into SSRM query state.
- Stable `getRowId`, status-bar strip, tick → `applyServerSideTransaction` wiring.

Thin wrappers remain for compatibility but mount full `MarketsGrid` + `ssrm`:

- `SsrmMarketsGrid` (deprecated thin wrapper)
- `SsrmMarketsGridContainer` / `useSsrmProviderDataWiring`
- `HostedSsrmMarketsGrid`

### 3. Demo apps

| App | Role |
|-----|------|
| `stomp-marketsgrid-minimal` | Minimal SSRM smoke (`?ssrm=1`) against `stomp-ssrm` + broker |
| `markets-grid-ssrm-lab` | Full clone of markets-grid-lab chrome/tabs/profiles, data via **`mock-ssrm`** (no broker) |

Run lab:

```bash
npm run app -- markets-grid-ssrm-lab
# http://127.0.0.1:5320/
```

---

## Architecture (high level)

```
MarketsGrid (ssrm prop)
  └─ MarketsGridHost chrome (unchanged)
       └─ MarketsGridSsrmSurface
            ├─ createSsrmDatasource → provider.getRows()
            ├─ bindSsrmTicks → applyServerSideTransaction
            └─ useSsrmExpressionBridge → configureExpressions

ISsrmDataProvider (SsrmProviderClientAdapter)
  └─ SharedWorker hub RPCs (ssrm-get-rows, ssrm-tick, …)
       └─ SsrmPlane ← feed (stomp-ssrm | mock-ssrm)
```

---

## New files added

### Types

*(no separate new file — `MockSsrmProviderConfig` / `PROVIDER_TYPES.MOCK_SSRM` live in the modified `dataProvider.ts`)*

### Data package (`@wellsfargo-starui/data`)

| File | Purpose |
|------|---------|
| `packages/data/host-data/src/provider/ISsrmDataProvider.ts` | SSRM provider interface |
| `packages/data/host-data/src/provider/SsrmProviderClientAdapter.ts` | Client adapter over SharedWorker SSRM RPCs |
| `packages/data/host-data/src/runtime/ssrm/SsrmPlane.ts` | Per-provider SSRM plane; `isSsrmProviderType` |
| `packages/data/host-data/src/runtime/ssrm/SsrmServer.ts` | RPC handlers for the plane |
| `packages/data/host-data/src/runtime/ssrm/QueryEngine.ts` | Filter / sort / group / page |
| `packages/data/host-data/src/runtime/ssrm/QueryEngine.test.ts` | QueryEngine tests |
| `packages/data/host-data/src/runtime/ssrm/RowStore.ts` | Indexed row store |
| `packages/data/host-data/src/runtime/ssrm/aggregations.ts` | Group aggregations |
| `packages/data/host-data/src/runtime/ssrm/filter.ts` | Column filter evaluation |
| `packages/data/host-data/src/runtime/ssrm/quickFilter.ts` | Quick-filter text match |
| `packages/data/host-data/src/runtime/ssrm/statusBar.ts` | Status-bar aggregates |
| `packages/data/host-data/src/runtime/ssrm/types.ts` | SSRM request/result types |
| `packages/data/host-data/src/runtime/ssrm/index.ts` | Barrel exports |

### React data bindings (`@wellsfargo-starui/react`)

| File | Purpose |
|------|---------|
| `packages/react-core/host-data-react/src/runtime/useSsrmDataProvider.ts` | Hook: hub-backed `ISsrmDataProvider` |

### Grid package (`@wellsfargo-starui/grid`)

| File | Purpose |
|------|---------|
| `packages/react-grid/grid/src/ssrm/SsrmAgGrid.tsx` | Low-level SSRM AgGrid mount |
| `packages/react-grid/grid/src/ssrm/createSsrmDatasource.ts` | AG Grid `IServerSideDatasource` |
| `packages/react-grid/grid/src/ssrm/bindSsrmTicks.ts` | Tick → SSRM transactions |
| `packages/react-grid/grid/src/ssrm/createSsrmStatusBar.tsx` | Status-bar components |
| `packages/react-grid/grid/src/ssrm/expressionBridge.ts` | Expression rule mapping |
| `packages/react-grid/grid/src/ssrm/expressionBridge.test.ts` | Tests |
| `packages/react-grid/grid/src/ssrm/expressionBindings.ts` | Binding helpers |
| `packages/react-grid/grid/src/ssrm/ssrmGetRowId.ts` | Stable row ids |
| `packages/react-grid/grid/src/ssrm/ssrmGetRowId.test.ts` | Tests |
| `packages/react-grid/grid/src/ssrm/index.ts` | Barrel |
| `packages/react-grid/grid/src/widget/MarketsGridSsrmSurface.tsx` | MarketsGrid SSRM inner surface |
| `packages/react-grid/grid/src/widget/MarketsGridSsrmSurface.test.tsx` | Tests |
| `packages/react-grid/grid/src/widget/SsrmMarketsGrid.tsx` | Thin deprecated wrapper → MarketsGrid + ssrm |
| `packages/react-grid/grid/src/widget/useSsrmExpressionBridge.ts` | Customizer → worker expressions |
| `packages/react-grid/grid/src/widget/useSsrmExpressionBridge.test.tsx` | Tests |
| `packages/react-grid/grid/src/widget/resolveSsrmWithQuickFilter.ts` | Quick-filter into SSRM props |
| `packages/react-grid/grid/src/widget/resolveSsrmWithQuickFilter.test.ts` | Tests |
| `packages/react-grid/grid/src/widget/types.ssrm.test.ts` | Prop/mode tests |
| `packages/react-grid/grid/src/widget/MarketsGrid.ssrm-mode.test.tsx` | Mode guard tests |
| `packages/react-grid/grid/src/widget/MarketsGrid.core-ssrm.test.tsx` | Core routing tests |

### Widgets / hosted (`@wellsfargo-starui/grid` widgets-react)

| File | Purpose |
|------|---------|
| `packages/react-grid/widgets-react/src/container/ssrm-markets-grid-container/SsrmMarketsGridContainer.tsx` | Full MarketsGrid + provider wiring |
| `packages/react-grid/widgets-react/src/container/ssrm-markets-grid-container/useSsrmProviderDataWiring.ts` | Start/ready wiring |
| `packages/react-grid/widgets-react/src/container/ssrm-markets-grid-container/index.ts` | Barrel |
| `packages/react-grid/widgets-react/src/container/ssrm-markets-grid-container/SsrmMarketsGridContainer.test.tsx` | Tests |
| `packages/react-grid/widgets-react/src/hosted/HostedSsrmMarketsGrid.tsx` | Hosted SSRM MarketsGrid (storage/identity) |
| `packages/react-grid/widgets-react/src/container/provider-editor/transports/StompSsrmFields.tsx` | Editor fields for `stomp-ssrm` |

### Docs

| File | Purpose |
|------|---------|
| `docs/archive/marketsgrid-ssrm-chrome-design-2026-08-07.md` | Design spec |
| `2026-08-07-marketsgrid-ssrm-chrome.md` (deleted — git history) | Implementation plan |
| `docs/archive/ssrm-implementation-inventory-2026-08-07.md` | This inventory |

### App: `markets-grid-ssrm-lab`

New app under `apps/source/markets-grid-ssrm-lab/` (full lab clone). SSRM-specific entry points:

| File | Purpose |
|------|---------|
| `apps/source/markets-grid-ssrm-lab/src/ssrm/SsrmLabGrid.tsx` | Feature-tab grid: MarketsGrid + `ssrm` |
| `apps/source/markets-grid-ssrm-lab/src/ssrm/SsrmLabProviderContext.tsx` | Seeds/exposes lab SSRM provider |
| `apps/source/markets-grid-ssrm-lab/src/mockSsrmProvider.ts` | **`mock-ssrm` catalog seed** (LabRow columns, `keyColumn: 'id'`) |
| `apps/source/markets-grid-ssrm-lab/src/components/SsrmInfoRail.tsx` | Right-rail (replaces CSRM demo console) |
| `apps/source/markets-grid-ssrm-lab/src/tabs/LabFeatureTab.tsx` | Shared shell mounting `SsrmLabGrid` |

Plus the rest of the lab shell cloned from markets-grid-lab (tabs, profiles, seeds, help, vite config, `public/lab-profiles/**`, etc.).

---

## Existing files modified

### Types

| File | Change |
|------|--------|
| `packages/types/shared-types/src/dataProvider.ts` | Added `stomp-ssrm` + **`mock-ssrm`** (`MockSsrmProviderConfig`, defaults, subtype maps, `ProviderConfig` union) |

### Data / SharedWorker hub

| File | Change |
|------|--------|
| `packages/data/host-data/src/index.ts` | Export SSRM provider APIs |
| `packages/data/host-data/src/provider/index.ts` | Export SSRM adapter / interface |
| `packages/data/host-data/src/provider/ProviderClientAdapter.ts` | Capabilities for `stomp-ssrm` / `mock-ssrm` |
| `packages/data/host-data/src/runtime/protocol.ts` | SSRM RPC message kinds |
| `packages/data/host-data/src/runtime/index.ts` | Re-export SSRM plane helpers |
| `packages/data/host-data/src/runtime/client/SharedWorkerDataServicesClient.ts` | Client SSRM RPC methods + tick listener |
| `packages/data/host-data/src/runtime/worker/SharedWorkerDataServicesHub.ts` | Attach/dispose SSRM planes; fan ticks; handle SSRM RPCs |
| `packages/data/host-data/src/runtime/providers/registry.ts` | Register `stomp-ssrm` → `startStomp`, **`mock-ssrm` → `startMock`** |
| `packages/data/host-data/src/runtime/providers/registry.test.ts` | Dispatch tests for both SSRM types |
| `packages/data/host-data/src/runtime/providers/transports/stomp.ts` | Shared transport for `stomp` / `stomp-ssrm` |
| `packages/data/host-data/src/runtime/providers/transports/mock.ts` | Accept `MockProviderConfig \| MockSsrmProviderConfig` |
| `packages/data/host-data/src/runtime/ssrm/SsrmPlane.ts` | `isSsrmProviderType`: `stomp-ssrm` **or** `mock-ssrm` |
| `packages/data/host-data/src/runtime/bootstrap/createDataServicesClient.ts` | SharedWorker name bump (`:ssrm3`) for protocol/provider updates |
| `packages/data/host-data/src/runtime/bootstrap/createDataServicesWorker.ts` | Worker bootstrap alignment |
| `packages/data/host-data/src/runtime/bootstrap/createDataServicesWorker.test.ts` | Tests |

### React bindings

| File | Change |
|------|--------|
| `packages/react-core/host-data-react/src/runtime/index.tsx` | Export `useSsrmDataProvider` |

### Grid widget

| File | Change |
|------|--------|
| `packages/react-grid/grid/src/widget/types.ts` | `MarketsGridSsrmProps`, `ssrm` on `MarketsGridProps`, mode helpers |
| `packages/react-grid/grid/src/widget/MarketsGrid.tsx` | Route to SSRM surface when `ssrm` set |
| `packages/react-grid/grid/src/widget/MarketsGridHost.tsx` | Host plumbing / remount keys for SSRM |
| `packages/react-grid/grid/src/widget/QuickSearch.tsx` | SSRM quick-filter path |
| `packages/react-grid/grid/src/widget/ensureAgGridModules.ts` | Ensure SSRM enterprise modules |
| `packages/react-grid/grid/src/index.ts` | Public exports |
| `packages/react-grid/package.json` | Package metadata / exports as needed |
| `packages/react-grid/grid/src/widget/MarketsGridHost.test.tsx` | Host tests |
| `packages/react-grid/grid/src/widget/QuickSearch.test.tsx` | Quick-search tests |

### Widgets / provider editor / hosted

| File | Change |
|------|--------|
| `packages/react-grid/widgets-react/src/index.ts` | Export SSRM container / hosted |
| `packages/react-grid/widgets-react/src/hosted/index.ts` | Export `HostedSsrmMarketsGrid` |
| `packages/react-grid/widgets-react/src/container/provider-editor/DataProviderEditor.tsx` | UI for `stomp-ssrm` + **`mock-ssrm`** |
| `packages/react-grid/widgets-react/src/container/provider-editor/tabs/ConnectionTab.tsx` | Fields routing for SSRM types |
| `packages/react-grid/widgets-react/src/container/provider-editor/useProviderProbe.ts` | Probe/test for `mock-ssrm` via `probeMock` |
| `packages/react-grid/widgets-react/src/container/provider-editor/ensureProviderEditorAgGridModules.ts` | Module registration |
| `packages/react-grid/widgets-react/src/container/provider-editor/ensureProviderEditorAgGridModules.test.ts` | Tests |

### Tooling / AG Grid alignment

| File | Change |
|------|--------|
| `scripts/run-app.mjs` | Register `markets-grid-ssrm-lab` (port **5320**, broker **`none`** after mock-ssrm) |
| `apps/scripts/makeTarballApp.mjs` | Tarball port for SSRM lab |
| `packages/core/package.json` | AG Grid 36 alignment |
| `packages/design-system/package.json` | AG Grid 36 alignment |

### `stomp-marketsgrid-minimal`

| File | Change |
|------|--------|
| `apps/source/stomp-marketsgrid-minimal/src/App.tsx` | Seed `stomp-ssrm`, mount `HostedSsrmMarketsGrid` when `?ssrm=1` |
| `apps/source/stomp-marketsgrid-minimal/src/stompProvider.ts` | SSRM catalog draft |
| `apps/source/stomp-marketsgrid-minimal/src/stompProvider.test.ts` | Tests |
| `apps/source/stomp-marketsgrid-minimal/src/App.test.tsx` | SSRM path tests |
| `apps/source/stomp-marketsgrid-minimal/src/test/setupMocks.ts` | Test mocks |
| `apps/source/stomp-marketsgrid-minimal/README.md` | Docs |
| `apps/source/stomp-marketsgrid-minimal/package.json` | App metadata |

### `markets-grid-ssrm-lab` (post–mock-ssrm switch)

| File | Change |
|------|--------|
| `apps/source/markets-grid-ssrm-lab/src/ssrm/SsrmLabProviderContext.tsx` | Seed **`mock-ssrm`** instead of `stomp-ssrm` |
| `apps/source/markets-grid-ssrm-lab/src/ssrm/SsrmLabGrid.tsx` | Prefer lab `columnDefs`; default `keyColumn: 'id'` |
| `apps/source/markets-grid-ssrm-lab/src/components/SsrmInfoRail.tsx` | Document mock-ssrm / no broker |
| `apps/source/markets-grid-ssrm-lab/src/tabs/LabFeatureTab.tsx` | Subtitle: mock-ssrm ticks |
| `apps/source/markets-grid-ssrm-lab/src/tabs/HomeTab.tsx` | Example `keyColumn: 'id'` |
| `apps/source/markets-grid-ssrm-lab/src/main.tsx` | Error copy (hub, not STOMP) |
| `apps/source/markets-grid-ssrm-lab/README.md` | Mock SSRM docs |
| ~~`apps/source/markets-grid-ssrm-lab/src/stompSsrmProvider.ts`~~ | **Removed** (replaced by `mockSsrmProvider.ts`) |

---

## Key behavioral details

1. **Chrome parity:** SSRM uses full `MarketsGrid` host; only the row model differs.
2. **Field parity for lab:** `mock-ssrm` reuses the CSRM mock position generator so profiles/examples that reference `cusip`, `bidPrice`, `dailyPnL`, etc. work.
3. **Broker:** Lab does **not** need `stomp-view-server`. Minimal app still does for `stomp-ssrm`.
4. **Worker cache:** SharedWorker name includes a protocol suffix (`:ssrm3`). After hub/provider changes, close all tabs or bump the suffix if a stale worker is pinned.
5. **Catalog seed version:** Lab uses `MOCK_SSRM_CFG_VERSION` + `localStorage` key `markets-grid-ssrm-lab.mock-ssrm-cfg-version` to re-persist the provider row when the seed changes.

---

## How to verify

```bash
# Packages
npm run build --workspace=@wellsfargo-starui/types
npm run build --workspace=@wellsfargo-starui/data
npm run build --workspace=@wellsfargo-starui/grid

# Lab (mock-ssrm, no broker)
npm run app -- markets-grid-ssrm-lab
# Open http://127.0.0.1:5320/ → Overview → expect CUSIP/Bid columns and Rows: 500

# Minimal STOMP SSRM (broker required)
npm run app -- stomp-marketsgrid-minimal
# Open …/?ssrm=1
```

---

## Status note

Committed branch history covers the SSRM foundation + MarketsGrid chrome + lab app (initially on `stomp-ssrm`).

**Uncommitted / in working tree at doc time** (mock-ssrm lab switch):

- New: `apps/source/markets-grid-ssrm-lab/src/mockSsrmProvider.ts`
- Deleted: `apps/source/markets-grid-ssrm-lab/src/stompSsrmProvider.ts`
- Modified: types `dataProvider.ts`, registry / mock transport / `SsrmPlane`, provider editor, lab SSRM wiring, `scripts/run-app.mjs`, SharedWorker name bump
