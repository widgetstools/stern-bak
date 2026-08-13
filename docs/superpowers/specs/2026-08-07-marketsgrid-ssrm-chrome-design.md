# MarketsGrid SSRM chrome parity

**Date:** 2026-08-07  
**Status:** Implemented (Tasks 1–8 on `feature/ssrm`; demo smoke: `stomp-marketsgrid-minimal/?ssrm=1`)  
**Scope:** `stern-bak` — `@wellsfargo-starui/grid` + widgets-react hosted/containers  
**Goal:** SSRM MarketsGrid behaves like CSRM MarketsGrid: customizer drawer, formatter toolbar, edit toolbar, filters toolbar, profiles/save, and the rest of the MarketsGrid host chrome.

## Problem

Today SSRM is a parallel thin stack:

`SsrmAgGrid` → `SsrmMarketsGrid` → `SsrmMarketsGridContainer` → `HostedSsrmMarketsGrid`

That path correctly wires SharedWorker SSRM (`stomp-ssrm`, datasource, ticks, expression RPCs) but **does not** mount `MarketsGridHost`. Users lose customizer, formatter, edit toolbar, filters toolbar, profiles, and provider Custom Settings UX that CSRM `HostedMarketsGrid` / `MarketsGrid` already have.

## Decision

**MarketsGrid owns SSRM at the surface.** Consumers set an `ssrm` prop; the host chrome stays identical; only the inner `AgGridReact` mount switches from CSRM (`rowData` + transactions) to SSRM (`rowModelType: 'serverSide'` + datasource/ticks).

Rejected alternatives:

- Rebuilding chrome around `SsrmAgGrid` (duplicates GridProvider / modules / profiles).
- Keeping two hosted products forever (permanent UX drift).

## Public API

### Discriminated props on `MarketsGrid`

```ts
/** SSRM data plane — mutually exclusive with streaming CSRM rowData usage. */
export interface MarketsGridSsrmProps {
  provider: ISsrmDataProvider;
  /** Aligns with worker key / getRowId. Defaults to provider config keyColumn or 'id'. */
  keyColumn?: string;
  getQuickFilterText?: () => string;
  /** Hint for cacheBlockSize; falls back to provider config blockSize or 100. */
  cacheBlockSize?: number;
}

export type MarketsGridProps<TData = unknown> = {
  gridId: string;
  columnDefs: ColDef<TData>[];
  // …existing chrome / identity / storage props unchanged…
} & (
  | {
      /** CSRM / client-side (default). */
      ssrm?: undefined;
      rowData: TData[];
    }
  | {
      /** Server-side row model via SharedWorker SSRM plane. */
      ssrm: MarketsGridSsrmProps;
      /** Ignored when `ssrm` is set; omit or pass empty for type convenience. */
      rowData?: TData[];
    }
);
```

Rules:

- When `ssrm` is set, MarketsGrid **must not** apply CSRM `applyProviderToGrid` / `rowData` diffs.
- `rowIdField` and `ssrm.keyColumn` must agree (container resolves from provider config).
- Switching CSRM ↔ SSRM or changing SSRM `provider` identity requires a **surface remount** (`key`), because `rowModelType` is initial-only in AG Grid.

### Container / hosted

- `SsrmMarketsGridContainer` renders **`<MarketsGrid ssrm={{ provider, keyColumn }} … />`** with the same chrome defaults as CSRM MarketsGridContainer (toolbars, settings, storage when provided).
- Demo `/?ssrm=1` keeps seeding `stomp-ssrm` and mounts the SSRM container (or Hosted path) that now uses MarketsGrid chrome.
- `SsrmMarketsGrid` becomes a thin deprecated/demo alias or is removed after migration; `SsrmAgGrid` remains the low-level primitive reused by the MarketsGrid surface.
- Optional follow-up (not blocking): `HostedMarketsGrid` auto-selects SSRM vs CSRM from catalog `providerType === 'stomp-ssrm'`.

## Architecture

```
MarketsGrid
  └─ MarketsGridHost          (unchanged chrome: toolbars, settings sheet, profiles)
       └─ MarketsGridSurface  (branch)
            ├─ CSRM: AgGridReact + rowData
            └─ SSRM: AgGridReact rowModelType=serverSide
                     + createSsrmDatasource / bindSsrmTicks
                     + SSRM status bar merge
```

Data plane (already built):

- Worker: `SsrmPlane` / `QueryEngine` / hub RPCs for `stomp-ssrm`
- Client: `ISsrmDataProvider` / `SsrmProviderClientAdapter`
- React wiring: `useSsrmProviderDataWiring` (StrictMode-safe start/stop)
- Bridge: `toSsrmExpressionRules` (customizer snapshot → worker rules)

## Behavior requirements (full chrome parity)

| Area | Behavior |
|------|----------|
| Customizer drawer | Same SettingsSheet / modules as CSRM |
| Formatter toolbar | Same UI; cell styles that need worker enrichment use SSRM expression bindings (`ssrmCellStyle` etc.), not CSRM-only row listeners |
| Edit toolbar | Same UI; cell edit / bulk paths that assume CSRM node APIs are adapted or safely no-op with clear status where unsupported |
| Filters toolbar | Same UI; filter model flows into SSRM `getRows` request (AG Grid SSRM filter model) |
| Profiles / Save | Same storage / profile manager |
| Provider Custom Settings | `providerGridHost` works for `stomp-ssrm` editor sections |
| Expressions | Live: module state → `toSsrmExpressionRules` → `provider.configureExpressions`. Do **not** double-apply the same calc/style/alerts on client and worker |
| Status bar | Merge or replace pipeline panels with SSRM status panels from `createSsrmStatusBar` where counts must come from the worker |
| Grouping / pivot / agg | Driven by SSRM getRows; `getChildCount` / group key helpers from existing SSRM bindings |

## Implementation plan (files)

1. **`packages/react-grid/grid/src/widget/types.ts`** — Add `MarketsGridSsrmProps` and discriminated `MarketsGridProps`.
2. **`packages/react-grid/grid/src/widget/MarketsGridSurface.tsx`** (and/or `MarketsGridSsrmSurface.tsx`) — Branch mount; reuse `grid/src/ssrm/*` helpers; remount `key` includes mode + provider id.
3. **`packages/react-grid/grid/src/widget/MarketsGrid.tsx` / `MarketsGridHost.tsx`** — Plumb `ssrm` through shell → host → surface without changing chrome layout.
4. **Expression live bridge** — Hook in host/container: subscribe calculated/style/alert/editable module snapshots → `configureExpressions`. Gate client-side transforms that conflict with worker enrichment.
5. **`packages/react-grid/widgets-react/.../SsrmMarketsGridContainer.tsx`** — Render full `MarketsGrid` with `ssrm` + chrome flags; keep `useSsrmProviderDataWiring`; drop bare `SsrmMarketsGrid` as the primary UI.
6. **`HostedSsrmMarketsGrid` / demo App** — Ensure storage/theme/identity parity with HostedMarketsGrid where already available on the hosted shell.
7. **Tests** — Unit: props discrimination / surface remount key; expression bridge wiring. Demo smoke: `/?ssrm=1` shows toolbar + settings + rows.

## Non-goals (this change)

- Second SharedWorker or `@ssrm-grid` dependency.
- Changing CSRM MarketsGrid default behavior when `ssrm` is absent.
- Rewriting the worker QueryEngine (already in place).
- Full OpenFin multi-window SSRM soak (follow-up).

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| `rowModelType` initial-only | Remount surface when mode/provider changes |
| CSRM transactions on SSRM grid | Container must skip `useProviderDataWiring` / `applyProviderToGrid` when SSRM |
| Dual expression evaluation | Worker owns calc/style/alerts for SSRM; disable conflicting client transforms |
| Edit/bulk CSRM assumptions | Keep toolbar; verify APIs; degrade gracefully with status text if a segment is unsafe |
| Filter model shape | Rely on AG Grid SSRM filter request; add adapter only if worker expects a different shape |
| Status bar conflicts | Prefer SSRM panels for row counts; keep non-conflicting pipeline panels |
| Stale SharedWorker after hub changes | Keep worker name bump discipline (`:ssrmN`) when protocol changes |

## Success criteria

1. `/?ssrm=1` (or Hosted SSRM entry) shows MarketsGrid primary toolbar, settings/customizer drawer, formatter toggle, edit toolbar toggle, filters toolbar (when enabled), and profile/save controls.
2. Grid loads STOMP SSRM rows (server-side model) with the same column defs / key column as today.
3. Customizer expression changes reach the worker via `configureExpressions` and affect displayed rows without requiring a full page reload.
4. CSRM `HostedMarketsGrid` path is unchanged when `ssrm` is not set.

## Open follow-ups (explicitly later)

- Single `HostedMarketsGrid` entry that branches on `providerType`.
- Deprecate/remove `SsrmMarketsGrid` widget export after one release.
- Deep edit-history / bulk-update SSRM semantics if product requires server round-trips.
