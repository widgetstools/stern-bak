# MarketsGrid SSRM Chrome Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SSRM MarketsGrid use the full MarketsGrid host chrome (customizer, formatter, edit toolbar, filters, profiles) by teaching `MarketsGrid` an `ssrm` prop that swaps the inner AG Grid surface to server-side row model.

**Architecture:** Keep `MarketsGridHost` unchanged for chrome. Add discriminated `ssrm` props on `MarketsGrid`. When set, mount an SSRM surface that reuses `createSsrmDatasource` / `bindSsrmTicks` / expression bindings instead of `rowData`. `SsrmMarketsGridContainer` switches from thin `SsrmMarketsGrid` to full `MarketsGrid`. Live customizer module state bridges to `provider.configureExpressions` via `toSsrmExpressionRules`.

**Tech Stack:** React, AG Grid 36 Enterprise (SSRM), Vitest, existing `@wellsfargo-starui/grid` + `widgets-react` + SharedWorker `stomp-ssrm` plane.

**Spec:** `docs/superpowers/specs/2026-08-07-marketsgrid-ssrm-chrome-design.md`

## Global Constraints

- AG Grid APIs must be v33+ compliant (project uses 36.x); no deprecated grid APIs.
- CSRM path unchanged when `ssrm` is absent — do not break `HostedMarketsGrid` / `MarketsGridContainer`.
- No second SharedWorker; no `@ssrm-grid` dependency.
- `rowModelType` is initial-only — remount surface when SSRM provider/mode changes.
- When `ssrm` is set, never call CSRM `applyProviderToGrid` / `useProviderDataWiring`.
- Worker owns calc/style/alerts for SSRM — do not double-apply the same rules on the client.
- Frequent commits; TDD where tests are specified.

---

## File map

| File | Responsibility |
|------|----------------|
| `packages/react-grid/grid/src/widget/types.ts` | `MarketsGridSsrmProps` + discriminated `MarketsGridProps` |
| `packages/react-grid/grid/src/widget/MarketsGridSsrmSurface.tsx` | SSRM `AgGridReact` mount (new) |
| `packages/react-grid/grid/src/widget/MarketsGridSsrmSurface.test.tsx` | Surface wiring tests (new) |
| `packages/react-grid/grid/src/widget/MarketsGridSurface.tsx` | CSRM only (unchanged behavior) |
| `packages/react-grid/grid/src/widget/MarketsGridHost.tsx` | Plumb `ssrm` → choose surface |
| `packages/react-grid/grid/src/widget/MarketsGrid.tsx` | Plumb `ssrm` through shell |
| `packages/react-grid/grid/src/widget/useSsrmExpressionBridge.ts` | Live module → worker rules (new) |
| `packages/react-grid/grid/src/widget/useSsrmExpressionBridge.test.tsx` | Bridge tests (new) |
| `packages/react-grid/grid/src/widget/SsrmMarketsGrid.tsx` | Thin alias → MarketsGrid or deprecate |
| `packages/react-grid/widgets-react/.../SsrmMarketsGridContainer.tsx` | Render full MarketsGrid + chrome |
| `packages/react-grid/widgets-react/.../HostedSsrmMarketsGrid.tsx` | Pass storage/theme/identity when available |
| `apps/source/stomp-marketsgrid-minimal/...` | Demo already uses hosted SSRM; verify chrome |

---

### Task 1: Discriminated `ssrm` props on MarketsGrid

**Files:**
- Modify: `packages/react-grid/grid/src/widget/types.ts`
- Create: `packages/react-grid/grid/src/widget/types.ssrm.test.ts`
- Test: `packages/react-grid/grid/src/widget/types.ssrm.test.ts`

**Interfaces:**
- Produces: `MarketsGridSsrmProps`, updated `MarketsGridProps<TData>` discriminated union

- [ ] **Step 1: Write the failing type-level / runtime helper test**

Create `packages/react-grid/grid/src/widget/types.ssrm.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { MarketsGridProps, MarketsGridSsrmProps } from './types.js';

/** Runtime guard used by host/surface — implement in types.ts next to the types. */
import { isMarketsGridSsrmMode } from './types.js';

describe('isMarketsGridSsrmMode', () => {
  it('is true when ssrm.provider is present', () => {
    const ssrm: MarketsGridSsrmProps = {
      provider: { id: 'p1' } as MarketsGridSsrmProps['provider'],
      keyColumn: 'positionId',
    };
    const props = { gridId: 'g1', columnDefs: [], ssrm } as MarketsGridProps;
    expect(isMarketsGridSsrmMode(props)).toBe(true);
  });

  it('is false for CSRM rowData props', () => {
    const props = {
      gridId: 'g1',
      columnDefs: [],
      rowData: [],
    } as MarketsGridProps;
    expect(isMarketsGridSsrmMode(props)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/develop/wfh/stern-bak/packages/react-grid && npx vitest run grid/src/widget/types.ssrm.test.ts`

Expected: FAIL — `isMarketsGridSsrmMode` / `MarketsGridSsrmProps` not exported.

- [ ] **Step 3: Add types + guard**

In `types.ts`:

1. Import `ISsrmDataProvider` from `@wellsfargo-starui/data` (type-only).
2. Add:

```ts
export interface MarketsGridSsrmProps {
  provider: ISsrmDataProvider;
  keyColumn?: string;
  getQuickFilterText?: () => string;
  cacheBlockSize?: number;
}

export function isMarketsGridSsrmMode(
  props: Pick<MarketsGridProps, 'ssrm'>,
): props is MarketsGridProps & { ssrm: MarketsGridSsrmProps } {
  return props.ssrm?.provider != null;
}
```

3. Change `MarketsGridProps` so `rowData` is required only in CSRM mode. Practical approach that keeps the large existing interface maintainable:

- Keep the existing interface body.
- Change `rowData: TData[]` → `rowData?: TData[]`.
- Add optional `ssrm?: MarketsGridSsrmProps`.
- Document: when `ssrm` is set, `rowData` is ignored; when absent, callers must pass `rowData` (CSRM containers already do).

Full TypeScript discriminated unions that split the entire 300-line props type are optional; the runtime guard is the load-bearing contract for the host.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/develop/wfh/stern-bak/packages/react-grid && npx vitest run grid/src/widget/types.ssrm.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/react-grid/grid/src/widget/types.ts \
  packages/react-grid/grid/src/widget/types.ssrm.test.ts
git commit -m "$(cat <<'EOF'
feat(grid): add MarketsGrid ssrm prop types and mode guard

EOF
)"
```

---

### Task 2: `MarketsGridSsrmSurface` (SSRM AgGrid mount)

**Files:**
- Create: `packages/react-grid/grid/src/widget/MarketsGridSsrmSurface.tsx`
- Create: `packages/react-grid/grid/src/widget/MarketsGridSsrmSurface.test.tsx`
- Reuse: `packages/react-grid/grid/src/ssrm/createSsrmDatasource.ts`, `bindSsrmTicks.ts`, `createSsrmStatusBar.ts`, `expressionBindings.ts`
- Reference: `packages/react-grid/grid/src/ssrm/SsrmAgGrid.tsx` (behavior to port, not duplicate chrome)

**Interfaces:**
- Consumes: `MarketsGridSsrmProps`, same surface plumbing props as CSRM surface (`gridRef`, `gridOptions`, `theme`, `columnDefs`, …)
- Produces: `MarketsGridSsrmSurface` memo component

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React, { createRef } from 'react';
import type { AgGridReact } from 'ag-grid-react';

const setGridOption = vi.fn();
const api = { setGridOption, isDestroyed: () => false };

vi.mock('ag-grid-react', () => ({
  AgGridReact: (props: { onGridReady?: (e: { api: typeof api }) => void }) => {
    React.useEffect(() => {
      props.onGridReady?.({ api });
    }, [props]);
    return React.createElement('div', {
      'data-testid': 'ag-ssrm',
      'data-row-model': (props as { rowModelType?: string }).rowModelType,
    });
  },
}));

const createSsrmDatasource = vi.fn(() => ({ getRows: vi.fn() }));
const bindSsrmTicks = vi.fn(() => () => {});
vi.mock('../ssrm/createSsrmDatasource.js', () => ({ createSsrmDatasource }));
vi.mock('../ssrm/bindSsrmTicks.js', () => ({ bindSsrmTicks }));
vi.mock('../ssrm/createSsrmStatusBar.js', () => ({
  createSsrmStatusBar: () => ({ statusBar: { statusPanels: [] }, context: {} }),
}));
vi.mock('./buildStreamSafeComponents.js', () => ({
  buildStreamSafeComponents: () => ({}),
}));
vi.mock('./nativeScrollbarWidth.js', () => ({
  measureNativeScrollbarWidth: () => 15,
}));
vi.mock('./useRestoreCellFocusOnWindowFocus.js', () => ({
  useRestoreCellFocusOnWindowFocus: () => {},
}));

import { MarketsGridSsrmSurface } from './MarketsGridSsrmSurface.js';

describe('MarketsGridSsrmSurface', () => {
  beforeEach(() => {
    setGridOption.mockClear();
    createSsrmDatasource.mockClear();
    bindSsrmTicks.mockClear();
  });

  it('mounts serverSide and binds datasource + ticks on ready', async () => {
    const provider = {
      id: 'p-ssrm',
      getConfig: () => ({ blockSize: 100, keyColumn: 'positionId' }),
      getColumnDefs: () => [],
    } as never;
    const gridRef = createRef<AgGridReact>();
    const onReady = vi.fn();

    render(
      <MarketsGridSsrmSurface
        gridRef={gridRef}
        gridOptions={{}}
        hostOverrideKeys={new Set()}
        theme={undefined}
        columnDefs={[{ field: 'positionId' }]}
        ssrm={{ provider, keyColumn: 'positionId' }}
        sideBar={false}
        statusBar={undefined}
        defaultColDef={undefined}
        onGridReady={onReady}
        onGridPreDestroyed={() => {}}
      />,
    );

    await waitFor(() => {
      expect(createSsrmDatasource).toHaveBeenCalledWith(
        provider,
        expect.objectContaining({ keyColumn: 'positionId' }),
      );
      expect(setGridOption).toHaveBeenCalledWith(
        'serverSideDatasource',
        expect.anything(),
      );
      expect(bindSsrmTicks).toHaveBeenCalled();
      expect(onReady).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/develop/wfh/stern-bak/packages/react-grid && npx vitest run grid/src/widget/MarketsGridSsrmSurface.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `MarketsGridSsrmSurface`**

Port the SSRM-specific pieces from `SsrmAgGrid.tsx` into a surface that matches CSRM surface props shape:

- Accept `ssrm: MarketsGridSsrmProps` instead of `rowData`.
- Set `rowModelType="serverSide"`, `cacheBlockSize`, `maxBlocksInCache={20}`.
- `getRowId` / `getChildCount` / `getRowClass` from `expressionBindings`.
- On ready: `createSsrmDatasource` + `bindSsrmTicks`; call parent `onGridReady`.
- Cleanup unbind on unmount / preDestroy.
- Merge `createSsrmStatusBar` with host `statusBar` (SSRM panels win for row counts when both define overlapping panels — prefer concatenating SSRM panels after host panels, or replace entirely if host statusBar undefined).
- Spread `stripSurfaceManagedGridOptions(gridOptions)` like CSRM surface, but **never** pass `rowData`.
- Pass `modules={[AllEnterpriseModule]}` after gridOptions (same as SsrmAgGrid).
- Include stream-safe components + scrollbarWidth + cellSelection parity with CSRM surface where safe.

Export from the same widget folder; do not change CSRM `MarketsGridSurface` behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/develop/wfh/stern-bak/packages/react-grid && npx vitest run grid/src/widget/MarketsGridSsrmSurface.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/react-grid/grid/src/widget/MarketsGridSsrmSurface.tsx \
  packages/react-grid/grid/src/widget/MarketsGridSsrmSurface.test.tsx
git commit -m "$(cat <<'EOF'
feat(grid): add MarketsGridSsrmSurface for server-side row model

EOF
)"
```

---

### Task 3: Plumb `ssrm` through MarketsGrid shell + host

**Files:**
- Modify: `packages/react-grid/grid/src/widget/MarketsGridHost.tsx`
- Modify: `packages/react-grid/grid/src/widget/MarketsGrid.tsx`
- Create: `packages/react-grid/grid/src/widget/MarketsGrid.ssrm-mode.test.tsx`

**Interfaces:**
- Consumes: `isMarketsGridSsrmMode`, `MarketsGridSsrmSurface`
- Produces: Host chooses surface; remount `key={`ssrm:${provider.id}`}` vs `key="csrm"`

- [ ] **Step 1: Write the failing integration test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('./MarketsGridSurface.js', () => ({
  MarketsGridSurface: () => <div data-testid="csrm-surface" />,
}));
vi.mock('./MarketsGridSsrmSurface.js', () => ({
  MarketsGridSsrmSurface: () => <div data-testid="ssrm-surface" />,
}));
// Mock heavy host chrome deps as needed (controller, toolbars) — prefer
// rendering MarketsGridHost with the minimum props if exports allow,
// otherwise test a tiny exported helper `resolveMarketsGridSurfaceKind(props)`.

import { resolveMarketsGridSurfaceKind } from './MarketsGridHost.js';

describe('resolveMarketsGridSurfaceKind', () => {
  it('selects ssrm when ssrm.provider set', () => {
    expect(
      resolveMarketsGridSurfaceKind({
        ssrm: { provider: { id: 'x' } as never },
      }),
    ).toBe('ssrm');
  });
  it('selects csrm otherwise', () => {
    expect(resolveMarketsGridSurfaceKind({ rowData: [] })).toBe('csrm');
  });
});
```

If exporting a helper from Host is cleaner than mounting the full host, do that — keep chrome mount in Step 3.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/develop/wfh/stern-bak/packages/react-grid && npx vitest run grid/src/widget/MarketsGrid.ssrm-mode.test.tsx`

Expected: FAIL

- [ ] **Step 3: Wire host + shell**

1. In `MarketsGridHost.tsx`:
   - Extend host props with optional `ssrm?: MarketsGridSsrmProps` and make `rowData` optional.
   - Export:

```ts
export function resolveMarketsGridSurfaceKind(
  props: { ssrm?: MarketsGridSsrmProps; rowData?: unknown },
): 'ssrm' | 'csrm' {
  return props.ssrm?.provider ? 'ssrm' : 'csrm';
}
```

   - Replace the single `<MarketsGridSurface …/>` with:

```tsx
{kind === 'ssrm' && ssrm ? (
  <MarketsGridSsrmSurface
    key={`ssrm:${ssrm.provider.id}`}
    gridRef={gridRef}
    gridOptions={gridOptions}
    hostOverrideKeys={hostOverrideKeys}
    theme={theme}
    columnDefs={columnDefs}
    ssrm={ssrm}
    rowHeight={rowHeight}
    headerHeight={headerHeight}
    animateRows={animateRows}
    sideBar={sideBar}
    statusBar={statusBar}
    defaultColDef={defaultColDef}
    getContextMenuItems={getContextMenuItems}
    onGridReady={handleGridReady}
    onGridPreDestroyed={onGridPreDestroyed}
    includeAllStreamSafeFilters={includeAllStreamSafeFilters}
  />
) : (
  <MarketsGridSurface
    key="csrm"
    gridRef={gridRef}
    /* existing CSRM props including rowData! */
    rowData={rowData ?? []}
    …
  />
)}
```

2. In `MarketsGrid.tsx` `useMarketsGridShell`: destructure `ssrm` from props; pass through to `MarketsGridHost`. When `ssrm` is set, pass `rowData={rowData ?? []}` only to satisfy CSRM host typing if still required upstream — SSRM branch must ignore it.

3. Keep all toolbar / settings / formatting / editing chrome mounting as today (no flags forced off).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/develop/wfh/stern-bak/packages/react-grid && npx vitest run grid/src/widget/MarketsGrid.ssrm-mode.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/react-grid/grid/src/widget/MarketsGridHost.tsx \
  packages/react-grid/grid/src/widget/MarketsGrid.tsx \
  packages/react-grid/grid/src/widget/MarketsGrid.ssrm-mode.test.tsx
git commit -m "$(cat <<'EOF'
feat(grid): route MarketsGrid host to SSRM surface when ssrm prop set

EOF
)"
```

---

### Task 4: Live expression bridge hook

**Files:**
- Create: `packages/react-grid/grid/src/widget/useSsrmExpressionBridge.ts`
- Create: `packages/react-grid/grid/src/widget/useSsrmExpressionBridge.test.tsx`
- Reuse: `packages/react-grid/grid/src/ssrm/expressionBridge.ts`
- Modify: `packages/react-grid/grid/src/widget/MarketsGrid.tsx` (or Host) to call the hook when `ssrm` is set

**Interfaces:**
- Consumes: `ISsrmDataProvider`, `toSsrmExpressionRules`, `useModuleState` for calculated-columns / conditional-styling / alerts / editable modules
- Produces: `useSsrmExpressionBridge(provider, enabled: boolean): void`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';

const configureExpressions = vi.fn(async () => {});
const provider = { id: 'p1', configureExpressions } as never;

vi.mock('../customizer/hooks/useModuleState.js', () => ({
  useModuleState: (id: string) => {
    if (id === 'calculated-columns') {
      return [{ columns: [{ field: 'x', expression: '1+1' }] }];
    }
    if (id === 'conditional-styling') return [{ rules: [] }];
    if (id === 'alerts') return [{ rules: [] }];
    if (id === 'editable-columns') return [{ rules: [] }];
    return [{}];
  },
}));

import { useSsrmExpressionBridge } from './useSsrmExpressionBridge.js';

describe('useSsrmExpressionBridge', () => {
  it('pushes rules when enabled', async () => {
    renderHook(() => useSsrmExpressionBridge(provider, true));
    await waitFor(() => {
      expect(configureExpressions).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'calculated', field: 'x' }),
        ]),
      );
    });
  });

  it('no-ops when disabled', () => {
    configureExpressions.mockClear();
    renderHook(() => useSsrmExpressionBridge(provider, false));
    expect(configureExpressions).not.toHaveBeenCalled();
  });
});
```

Adjust module ids/state shapes to match real module state types in:

- `customizer/modules/calculated-columns`
- `customizer/modules/conditional-styling` (or equivalent style module id)
- `customizer/modules/alerts`
- editable module if present

Read those modules’ `MODULE_ID` + state field names before implementing — do not invent ids.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/develop/wfh/stern-bak/packages/react-grid && npx vitest run grid/src/widget/useSsrmExpressionBridge.test.tsx`

Expected: FAIL

- [ ] **Step 3: Implement hook + wire into MarketsGrid**

```ts
export function useSsrmExpressionBridge(
  provider: ISsrmDataProvider | null | undefined,
  enabled: boolean,
): void {
  // useModuleState for each expression module (only when enabled)
  // build MarketsGridExpressionSnapshot
  // toSsrmExpressionRules → provider.configureExpressions
  // debounce 0–50ms to coalesce customizer keystrokes if needed
}
```

Call from `MarketsGrid` shell (inside `GridProvider` so `useModuleState` works):

```ts
useSsrmExpressionBridge(ssrm?.provider, Boolean(ssrm?.provider));
```

If calculated-columns `activate()` registers client valueGetters that conflict with worker enrichment, gate activation when SSRM mode is on (module option or skip client refresh). Prefer: leave modules mounted for authoring UI, but skip client-side row mutation in `activate` when `platform` flags `ssrmMode: true` — set that flag on GridPlatform from MarketsGrid when `ssrm` is present. If that is too large, document a narrower gate: disable client `activate` side effects for calculated/style/alerts only.

Minimum for this task: bridge pushes rules; add a `/* SSRM: client activate still runs — Task 4 follow-up if double-eval appears */` only if you cannot gate cleanly in the same task. Prefer gating in-task if the activate functions already check a platform flag.

- [ ] **Step 4: Run tests**

Run: `cd /Users/develop/wfh/stern-bak/packages/react-grid && npx vitest run grid/src/widget/useSsrmExpressionBridge.test.tsx grid/src/ssrm/expressionBridge.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/react-grid/grid/src/widget/useSsrmExpressionBridge.ts \
  packages/react-grid/grid/src/widget/useSsrmExpressionBridge.test.tsx \
  packages/react-grid/grid/src/widget/MarketsGrid.tsx
git commit -m "$(cat <<'EOF'
feat(grid): bridge MarketsGrid customizer expressions to SSRM worker

EOF
)"
```

---

### Task 5: SsrmMarketsGridContainer renders full MarketsGrid chrome

**Files:**
- Modify: `packages/react-grid/widgets-react/src/container/ssrm-markets-grid-container/SsrmMarketsGridContainer.tsx`
- Modify: `packages/react-grid/widgets-react/src/container/ssrm-markets-grid-container/SsrmMarketsGridContainer.test.tsx` (create if missing)
- Keep: `useSsrmProviderDataWiring.ts`

**Interfaces:**
- Consumes: `MarketsGrid` with `ssrm={{ provider, keyColumn }}`, ready gate from wiring
- Produces: Container UI with MarketsGrid chrome defaults matching CSRM container where applicable

- [ ] **Step 1: Write / update failing container test**

Assert that when provider is ready, the container renders MarketsGrid (mock) with `ssrm` prop and chrome flags enabled:

```tsx
vi.mock('@wellsfargo-starui/grid', async () => {
  const actual = await vi.importActual<typeof import('@wellsfargo-starui/grid')>(
    '@wellsfargo-starui/grid',
  );
  return {
    ...actual,
    MarketsGrid: (props: Record<string, unknown>) =>
      React.createElement('div', {
        'data-testid': 'markets-grid',
        'data-has-ssrm': props.ssrm ? '1' : '0',
        'data-show-toolbar': String(props.showToolbar !== false),
        'data-show-settings': String(props.showSettingsButton !== false),
        'data-show-formatting': String(props.showFormattingToolbar === true),
        'data-show-editing': String(props.showEditingToolbar === true),
      }),
    SsrmMarketsGrid: () => React.createElement('div', { 'data-testid': 'legacy-ssrm' }),
  };
});
```

Expect `markets-grid` with `data-has-ssrm=1`, not `legacy-ssrm`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/develop/wfh/stern-bak/packages/react-grid && npx vitest run widgets-react/src/container/ssrm-markets-grid-container`

Expected: FAIL (still mounts SsrmMarketsGrid)

- [ ] **Step 3: Rewrite container render**

Replace `<SsrmMarketsGrid …/>` with:

```tsx
<MarketsGrid
  gridId={providerId}
  ssrm={{
    provider,
    keyColumn,
    cacheBlockSize: /* from config if present */,
  }}
  rowIdField={keyColumn}
  columnDefs={columnDefs ?? []}
  rowData={[]}
  showToolbar
  showSettingsButton
  showFormattingToolbar
  showEditingToolbar
  showFiltersToolbar
  showSaveButton
  showProfileSelector
  showColumnSelector
  /* pass through storage/host/instanceId/appId/userId when container props gain them */
  style={{ height: '100%', width: '100%' }}
/>
```

Keep ready gate: do not mount MarketsGrid until `ready` (same as today). Keep optional provider editor dialog. Pass `title` via MarketsGrid caption props if the CSRM container has an equivalent; otherwise keep a small status strip above MarketsGrid for Live/row count (CSRM often uses status bar — prefer SSRM status bar inside surface).

Extend `SsrmMarketsGridContainerProps` to accept the MarketsGrid chrome/identity props the CSRM container already forwards (`storage`, `instanceId`, `appId`, `userId`, `host`, toolbar flags) via:

```ts
extends Partial<
  Pick<
    MarketsGridProps,
    | 'storage'
    | 'instanceId'
    | 'appId'
    | 'userId'
    | 'host'
    | 'showToolbar'
    | 'showFormattingToolbar'
    | 'showEditingToolbar'
    | 'showFiltersToolbar'
    | 'showSaveButton'
    | 'showSettingsButton'
    | 'showProfileSelector'
    | 'theme'
  >
>
```

Defaults: all chrome on for parity with typical MarketsGridContainer usage.

- [ ] **Step 4: Run tests + typecheck widgets**

Run:

```bash
cd /Users/develop/wfh/stern-bak/packages/react-grid && npx vitest run widgets-react/src/container/ssrm-markets-grid-container
cd /Users/develop/wfh/stern-bak/packages/react-grid && npm run build
```

Expected: PASS + build green

- [ ] **Step 5: Commit**

```bash
git add packages/react-grid/widgets-react/src/container/ssrm-markets-grid-container
git commit -m "$(cat <<'EOF'
feat(widgets): mount full MarketsGrid chrome for SSRM container

EOF
)"
```

---

### Task 6: HostedSsrmMarketsGrid identity/storage parity

**Files:**
- Modify: `packages/react-grid/widgets-react/src/hosted/HostedSsrmMarketsGrid.tsx`
- Reference: `packages/react-grid/widgets-react/src/hosted/HostedMarketsGrid.tsx` for `useHostedView` / storage patterns
- Modify: demo `apps/source/stomp-marketsgrid-minimal/src/App.tsx` if hosted props need storage from `getPlatform()`

**Interfaces:**
- Consumes: same hosted bootstrap as HostedMarketsGrid where possible
- Produces: Hosted SSRM entry that passes `storage` / `instanceId` / `appId` / `userId` into the container

- [ ] **Step 1: Compare HostedMarketsGrid vs HostedSsrmMarketsGrid**

List props HostedMarketsGrid passes that HostedSsrm lacks. Port the minimum for profiles/save: `storage`, `instanceId`, `appId`, `userId`, `theme` resolution.

- [ ] **Step 2: Implement hosted parity**

Mirror `useHostedView` (or equivalent) from HostedMarketsGrid. Forward into `SsrmMarketsGridContainer`. Keep `providerId` + `inlineCfg` support.

- [ ] **Step 3: Update minimal demo**

In `stomp-marketsgrid-minimal` SSRM branch, pass platform storage into `HostedSsrmMarketsGrid` the same way CSRM passes it into `HostedMarketsGrid` (see App.tsx CSRM branch).

- [ ] **Step 4: Run demo unit tests**

Run: `cd /Users/develop/wfh/stern-bak/apps/source/stomp-marketsgrid-minimal && npm test -- --run`

Expected: PASS (update mocks for new props if needed)

- [ ] **Step 5: Commit**

```bash
git add packages/react-grid/widgets-react/src/hosted/HostedSsrmMarketsGrid.tsx \
  apps/source/stomp-marketsgrid-minimal/src
git commit -m "$(cat <<'EOF'
feat(hosted): give SSRM MarketsGrid storage and identity parity

EOF
)"
```

---

### Task 7: Deprecate thin `SsrmMarketsGrid` + export cleanup

**Files:**
- Modify: `packages/react-grid/grid/src/widget/SsrmMarketsGrid.tsx`
- Modify: package exports if needed (`grid/src/index` / `widget` barrel)

- [ ] **Step 1: Turn `SsrmMarketsGrid` into a compatibility wrapper**

```tsx
/** @deprecated Prefer `<MarketsGrid ssrm={{ provider }} … />` for full chrome. */
export function SsrmMarketsGrid(props: SsrmMarketsGridProps) {
  return (
    <MarketsGrid
      gridId={props.provider.id}
      ssrm={{
        provider: props.provider,
        keyColumn: props.keyColumn,
        getQuickFilterText: props.getQuickFilterText,
      }}
      columnDefs={props.columnDefs ?? []}
      rowData={[]}
      showToolbar={Boolean(props.title)}
      /* keep chrome on so even legacy import gains toolbars */
      showSettingsButton
      showFormattingToolbar
      showEditingToolbar
      style={props.style}
      className={props.className}
      onGridReady={props.onGridReady}
    />
  );
}
```

- [ ] **Step 2: Build grid package**

Run: `cd /Users/develop/wfh/stern-bak/packages/react-grid && npm run build`

Expected: green

- [ ] **Step 3: Commit**

```bash
git add packages/react-grid/grid/src/widget/SsrmMarketsGrid.tsx
git commit -m "$(cat <<'EOF'
refactor(grid): make SsrmMarketsGrid a MarketsGrid ssrm wrapper

EOF
)"
```

---

### Task 8: Manual smoke + docs pointer

**Files:**
- Modify: `apps/source/stomp-marketsgrid-minimal/README.md` (SSRM section)
- Optional: one-line link from design spec status → implemented

- [ ] **Step 1: Manual smoke checklist**

With `stomp-view-server` on `ws://localhost:8081` and minimal app on `:5213`:

1. Open `http://localhost:5213/?ssrm=1` (hard refresh if SharedWorker name unchanged).
2. Confirm primary toolbar, settings gear, formatter toggle, edit toolbar toggle, profile/save.
3. Open customizer drawer — panels render.
4. Confirm rows load (Ready / ~20k) with Position Id columns.
5. CSRM `http://localhost:5213/` still works.

- [ ] **Step 2: Update README SSRM blurb**

Note that SSRM now uses full MarketsGrid chrome via `ssrm` prop.

- [ ] **Step 3: Commit**

```bash
git add apps/source/stomp-marketsgrid-minimal/README.md
git commit -m "$(cat <<'EOF'
docs(demo): note SSRM MarketsGrid full chrome path

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `ssrm` prop on MarketsGrid | Task 1 |
| Surface swap to SSRM AgGrid | Task 2–3 |
| Full chrome (toolbars/settings) | Task 3, 5 |
| Live expression bridge | Task 4 |
| Container uses MarketsGrid | Task 5 |
| Hosted storage/identity | Task 6 |
| SsrmMarketsGrid demoted | Task 7 |
| Demo success criteria | Task 8 |
| CSRM unchanged when no ssrm | Tasks 1–3 (guard + branch) |
| No second worker | Global constraint |

## Placeholder scan

No TBD/TODO steps. Module ids in Task 4 must be read from source at implement time (named files given). Edit/bulk “degrade gracefully” is satisfied by keeping toolbars mounted; deep server edit semantics remain a documented follow-up in the spec.
