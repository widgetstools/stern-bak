# star-demo-ssrm + SSRM Colour-Linking Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An SSRM sibling of `apps/source/star-demo` on port 5176, with OpenFin colour linking behaving exactly as it does under CSRM.

**Architecture:** Platform first, app last. Worker: `SetFilterValuesRequest` gains group scoping so a publisher can fetch keys for unloaded group descendants / select-all. Hosted layer: `GridLinkSelectionBuilder` becomes awaitable behind a sequence guard; a new SSRM-aware builder resolves group and select-all selections through the worker; `mode: 'rowId'` gets a resolver-based receive path. Container/hosted wrappers forward the props star-demo's blotter needs. Finally the app is cloned with three identity breaks.

**Tech Stack:** TypeScript, React 19, AG Grid 36 (`ag-grid-community` types only in packages), Vitest 4, npm workspaces (`npm`, never `pnpm`/`yarn`).

## Global Constraints

- Every `tsconfig` in `packages/<bucket>/<pkg>/` extends `../../../tsconfig.base.json`.
- Filenames match the case of the primary export (`camelCase` for function modules, `PascalCase` for components). No kebab in `packages/` outside the documented carve-outs.
- Conventional commits: `feat(pkg):`, `fix(pkg):`, `test:`, `docs:`, `chore:`.
- After every task: run that package's tests. After the last task: `npx turbo typecheck build test` must be green and `docs/current-features.md` updated (Task 10).
- TDD throughout: write the test, watch it fail, implement, watch it pass. If a test passes before the implementation exists, the test is wrong — fix it first.
- Working directory for package tests: `cd packages/data` or `cd packages/react-grid`, then `npx vitest run <path>`.

---

### Task 1: Group-scoped set-filter values in the worker

The publisher-side fix for group selection and select-all: the worker must answer "what are the distinct key-column values under this group path (or the whole current query)". `ISsrmDataProvider.getSetFilterValues` and the `ssrm-set-filter-values` RPC already exist and pass the request through verbatim, so widening the request type is the entire wire change.

**Files:**
- Modify: `packages/data/host-data/src/runtime/ssrm/types.ts` (SetFilterValuesRequest, ~line 73)
- Modify: `packages/data/host-data/src/runtime/ssrm/QueryEngine.ts` (`getSetFilterValues`, ~line 220)
- Test: `packages/data/host-data/src/runtime/ssrm/QueryEngine.groupValues.test.ts` (new)

**Interfaces:**
- Produces: `SetFilterValuesRequest` gains `groupKeys?: string[]` and `rowGroupCols?: Array<{ field: string }>`. `QueryEngine.getSetFilterValues(req)` returns distinct values of `req.column` among rows matching filter + quick filter + group path. No signature change anywhere else — `SsrmServer`, `SsrmPlane`, hub, client, and `SsrmProviderClientAdapter.getSetFilterValues` all pass the request object through untouched.

- [ ] **Step 1: Write the failing test**

```ts
// packages/data/host-data/src/runtime/ssrm/QueryEngine.groupValues.test.ts
import { describe, expect, it } from 'vitest';
import { QueryEngine } from './QueryEngine.js';
import { RowStore } from './RowStore.js';

function seeded() {
  const store = new RowStore({ keyColumn: 'positionId' });
  store.replaceSnapshot([
    { positionId: 'P1', book: 'A', desk: 'RATES', px: 10 },
    { positionId: 'P2', book: 'A', desk: 'RATES', px: 20 },
    { positionId: 'P3', book: 'A', desk: 'FX', px: 30 },
    { positionId: 'P4', book: 'B', desk: 'RATES', px: 40 },
  ]);
  return new QueryEngine({ store });
}

describe('getSetFilterValues group scoping', () => {
  it('scopes values to a group path', () => {
    const engine = seeded();
    const values = engine.getSetFilterValues({
      column: 'positionId',
      groupKeys: ['A'],
      rowGroupCols: [{ field: 'book' }],
    });
    expect(values.sort()).toEqual(['P1', 'P2', 'P3']);
  });

  it('scopes to a nested group path', () => {
    const engine = seeded();
    const values = engine.getSetFilterValues({
      column: 'positionId',
      groupKeys: ['A', 'RATES'],
      rowGroupCols: [{ field: 'book' }, { field: 'desk' }],
    });
    expect(values.sort()).toEqual(['P1', 'P2']);
  });

  it('ANDs the group path with the filter model', () => {
    const engine = seeded();
    const values = engine.getSetFilterValues({
      column: 'positionId',
      filterModel: { desk: { filterType: 'text', type: 'equals', filter: 'RATES' } },
      groupKeys: ['A'],
      rowGroupCols: [{ field: 'book' }],
    });
    expect(values.sort()).toEqual(['P1', 'P2']);
  });

  it('behaves exactly as before when no groupKeys are given', () => {
    const engine = seeded();
    const values = engine.getSetFilterValues({ column: 'book' });
    expect(values.sort()).toEqual(['A', 'B']);
  });

  it('returns every key for an empty group path with rowGroupCols set (select-all)', () => {
    const engine = seeded();
    const values = engine.getSetFilterValues({
      column: 'positionId',
      groupKeys: [],
      rowGroupCols: [{ field: 'book' }],
    });
    expect(values.sort()).toEqual(['P1', 'P2', 'P3', 'P4']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/data && npx vitest run host-data/src/runtime/ssrm/QueryEngine.groupValues.test.ts`
Expected: FAIL — the two group-scoped tests return all 4 ids (groupKeys ignored); the others pass.

- [ ] **Step 3: Widen the request type**

In `types.ts`, extend `SetFilterValuesRequest`:

```ts
export interface SetFilterValuesRequest {
  column: string;
  /** Optional filter model to scope unique values (other columns). */
  filterModel?: Record<string, unknown> | null;
  /** Active quick-filter text (scopes uniques like CSRM). */
  quickFilterText?: string | null;
  /**
   * Optional group path to scope values to (colour-link publishing for a
   * selected group row whose descendants are not loaded client-side).
   * `groupKeys[i]` is the group value at `rowGroupCols[i].field`.
   * An empty array with `rowGroupCols` set means "the whole current query"
   * (select-all).
   */
  groupKeys?: string[];
  rowGroupCols?: Array<{ field: string }>;
}
```

- [ ] **Step 4: Implement group scoping in `QueryEngine.getSetFilterValues`**

Replace the method body. Keep the existing predicate logic; add the group check. Route the base row set through `collectFilteredCached` so a publish immediately after a block load reuses the memoised scan:

```ts
getSetFilterValues(req: SetFilterValuesRequest): string[] {
  const fm = { ...(req.filterModel ?? {}) } as Record<string, unknown>;
  delete fm[req.column];

  const groupKeys = req.groupKeys;
  const groupCols = req.rowGroupCols ?? [];
  const inGroupPath = (row: Row): boolean => {
    if (!groupKeys) return true;
    return groupKeys.every(
      (gk, i) => String(row[groupCols[i]?.field ?? ''] ?? '') === gk,
    );
  };

  // Reuses the per-query memo (revision-bound), then narrows by group path.
  const filtered = this.collectFilteredCached(
    Object.keys(fm).length > 0 ? fm : null,
    req.quickFilterText,
  );
  const seen = new Set<string>();
  for (const row of filtered) {
    if (!inGroupPath(row)) continue;
    const v = row[req.column];
    seen.add(v == null ? '' : String(v));
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}
```

Note: this replaces the previous `store.getUniqueValuesFiltered` call path entirely — same observable results (the existing `QueryEngine.test.ts` set-filter tests must stay green), now memo-backed.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/data && npx vitest run host-data/src/runtime/ssrm/`
Expected: PASS, including all pre-existing `QueryEngine.test.ts` set-filter-values tests.

- [ ] **Step 6: Commit**

```bash
git add packages/data/host-data/src/runtime/ssrm/types.ts packages/data/host-data/src/runtime/ssrm/QueryEngine.ts packages/data/host-data/src/runtime/ssrm/QueryEngine.groupValues.test.ts
git commit -m "feat(data): group-scoped SSRM set-filter values for link publishing"
```

---

### Task 2: Awaitable selection builders with a sequence guard

**Files:**
- Modify: `packages/react-grid/widgets-react/src/hosted/gridContextLink.ts` (`GridLinkSelectionBuilder`, ~line 73)
- Modify: `packages/react-grid/widgets-react/src/hosted/useGridContextLink.ts` (publish effect, ~lines 213–244)
- Test: `packages/react-grid/widgets-react/src/hosted/useGridContextLink.async.test.tsx` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `GridLinkSelectionBuilder` returns `GridLinkSelectionContext | null | Promise<GridLinkSelectionContext | null>`. The publish effect awaits it; a selection change that fires while a previous build is in flight discards the stale result (never broadcasts it). Existing sync builders (`buildSelectionContext`, `buildRowIdContext`) satisfy the type unchanged.

- [ ] **Step 1: Write the failing test**

Follow the mock pattern of the existing `useGridContextLink` tests in the same directory (fake `gridApi` event-emitter + fake fdc3 with recorded `broadcast`). Core cases:

```tsx
// packages/react-grid/widgets-react/src/hosted/useGridContextLink.async.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGridContextLink } from './useGridContextLink.js';
import type { GridLinkSelectionContext } from './gridContextLink.js';

function makeGridApi() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    addEventListener: (ev: string, fn: () => void) => {
      (listeners.get(ev) ?? listeners.set(ev, new Set()).get(ev)!).add(fn);
    },
    removeEventListener: (ev: string, fn: () => void) => listeners.get(ev)?.delete(fn),
    fire: (ev: string) => [...(listeners.get(ev) ?? [])].forEach((f) => f()),
    getSelectedNodes: () => [],
    getFilterModel: () => ({}),
    getColumn: () => null,
    setFilterModel: vi.fn(),
  };
}

const fdc3 = (broadcasts: GridLinkSelectionContext[]) => ({
  broadcast: vi.fn(async (c: GridLinkSelectionContext) => { broadcasts.push(c); }),
  addContextListener: vi.fn(() => () => {}),
  joined: null,
});

describe('async selection builders', () => {
  it('awaits a promise-returning builder and broadcasts its result', async () => {
    const broadcasts: GridLinkSelectionContext[] = [];
    const api = makeGridApi();
    const build = vi.fn(async () => ({
      type: 'starui.gridSelection', criteria: { positionId: ['P1'] },
    }));
    renderHook(() => useGridContextLink({
      gridApi: api as never,
      fdc3: fdc3(broadcasts) as never,
      instanceId: 'i1',
      config: { enabled: true, mode: 'fields', buildContext: build },
    }));

    await act(async () => { api.fire('selectionChanged'); await Promise.resolve(); });

    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0].criteria).toEqual({ positionId: ['P1'] });
  });

  it('discards a stale in-flight build when a newer selection lands', async () => {
    const broadcasts: GridLinkSelectionContext[] = [];
    const api = makeGridApi();
    let release1!: () => void;
    const gate = new Promise<void>((r) => { release1 = r; });
    let call = 0;
    const build = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        await gate; // first build resolves only after the second fires
        return { type: 't', criteria: { positionId: ['STALE'] } };
      }
      return { type: 't', criteria: { positionId: ['FRESH'] } };
    });
    renderHook(() => useGridContextLink({
      gridApi: api as never,
      fdc3: fdc3(broadcasts) as never,
      instanceId: 'i1',
      config: { enabled: true, mode: 'fields', buildContext: build },
    }));

    await act(async () => {
      api.fire('selectionChanged');           // build 1, parked on the gate
      api.fire('selectionChanged');           // build 2, resolves immediately
      await Promise.resolve();
      release1();                             // now build 1 resolves — too late
      await Promise.resolve(); await Promise.resolve();
    });

    expect(broadcasts.map((b) => b.criteria.positionId)).toEqual([['FRESH']]);
  });

  it('still supports plain synchronous builders', async () => {
    const broadcasts: GridLinkSelectionContext[] = [];
    const api = makeGridApi();
    renderHook(() => useGridContextLink({
      gridApi: api as never,
      fdc3: fdc3(broadcasts) as never,
      instanceId: 'i1',
      config: {
        enabled: true, mode: 'fields',
        buildContext: () => ({ type: 't', criteria: { positionId: ['SYNC'] } }),
      },
    }));
    await act(async () => { api.fire('selectionChanged'); await Promise.resolve(); });
    expect(broadcasts).toHaveLength(1);
  });
});
```

Adjust the fake `fdc3` shape to whatever `UseFdc3ChannelResult` actually requires (read `useFdc3Channel.ts` first and mirror the existing test's fake). If an existing test file already fakes it, import/copy that helper.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/react-grid && npx vitest run widgets-react/src/hosted/useGridContextLink.async.test.tsx`
Expected: the async cases FAIL — the current publish handler treats the returned promise as a truthy context and broadcasts a Promise object (or drops it), and there is no staleness guard.

- [ ] **Step 3: Implement**

`gridContextLink.ts` — widen the type:

```ts
export type GridLinkSelectionBuilder = (
  api: GridApi,
  opts: { instanceId: string; rowIdField: readonly string[] },
) => GridLinkSelectionContext | null | Promise<GridLinkSelectionContext | null>;
```

`useGridContextLink.ts` — replace the `onSelectionChanged` body inside the publish effect:

```ts
const publishSeqRef = useRef(0);
// ... inside the effect:
const onSelectionChanged = () => {
  if (applyingRemoteRef.current) return;
  const seq = ++publishSeqRef.current;
  void (async () => {
    let context: GridLinkSelectionContext | null;
    try {
      context = await build(gridApi, { instanceId: sourceId, rowIdField: fields });
    } catch {
      return; // a failed build publishes nothing; the next selection retries
    }
    // A newer selection superseded this build while it was in flight.
    if (seq !== publishSeqRef.current) return;
    if (!context) return;
    context.type = contextType;
    context.channel = channelRef.current ?? undefined;
    if (debugRef.current) {
      // eslint-disable-next-line no-console
      console.debug('[gridLink] publish', { self: sourceId, channel: channelRef.current ?? null, context });
    }
    void broadcast(context);
    onPublishRef.current?.(context);
  })();
};
```

(`publishSeqRef` is declared at hook top level with the other refs, not inside the effect.)

- [ ] **Step 4: Run tests to verify they pass — including every pre-existing link test**

Run: `cd packages/react-grid && npx vitest run widgets-react/src/hosted/`
Expected: PASS. The pre-existing `useGridContextLink` / `gridContextLink` tests are the CSRM regression suite the spec requires.

- [ ] **Step 5: Commit**

```bash
git add packages/react-grid/widgets-react/src/hosted/gridContextLink.ts packages/react-grid/widgets-react/src/hosted/useGridContextLink.ts packages/react-grid/widgets-react/src/hosted/useGridContextLink.async.test.tsx
git commit -m "feat(grid): awaitable link selection builders with staleness guard"
```

---

### Task 3: SSRM selection builder (group + select-all via the worker)

**Files:**
- Create: `packages/react-grid/widgets-react/src/hosted/ssrmGridContextLink.ts`
- Test: `packages/react-grid/widgets-react/src/hosted/ssrmGridContextLink.test.ts` (new)
- Modify: `packages/react-grid/widgets-react/src/hosted/index.ts` (export)

**Interfaces:**
- Consumes: `ISsrmDataProvider.getSetFilterValues(req: SetFilterValuesRequest): Promise<string[]>` (Task 1 widened the request); `GridLinkSelectionBuilder` (Task 2, awaitable); `GRID_LINK_CONTEXT_TYPE`, `GridLinkSelectionContext` from `gridContextLink.js`.
- Produces:

```ts
export interface SsrmSelectionBuilderDeps {
  provider: Pick<ISsrmDataProvider, 'getSetFilterValues'>;
  keyColumn: string;
  /** Current quick-filter text, if the surface has one. */
  getQuickFilterText?: () => string;
}
export function createSsrmSelectionContextBuilder(
  deps: SsrmSelectionBuilderDeps,
): GridLinkSelectionBuilder;
```

Behaviour contract (CSRM parity):
1. Leaf selections publish `criteria[field] = values` from loaded row data — identical to `buildSelectionContext`.
2. A selected group row publishes the worker's distinct key values for that group path (`node.getRoute()` for `groupKeys`; `api.getRowGroupColumns()` for `rowGroupCols`), ANDed with the current filter model and quick filter.
3. Select-all (`api.getServerSideSelectionState()` → `{ selectAll: true, toggledNodes }`) publishes the whole current query's key values minus the toggled-off rows.
4. Empty selection publishes empty `criteria` (peers clear), exactly like CSRM.

- [ ] **Step 1: Write the failing test**

```ts
// packages/react-grid/widgets-react/src/hosted/ssrmGridContextLink.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createSsrmSelectionContextBuilder } from './ssrmGridContextLink.js';

const KEY = 'positionId';

function api(overrides: Record<string, unknown> = {}) {
  return {
    getSelectedNodes: () => [],
    getServerSideSelectionState: () => null,
    getFilterModel: () => ({}),
    getRowGroupColumns: () => [],
    ...overrides,
  } as never;
}

function provider(values: string[]) {
  return { getSetFilterValues: vi.fn(async () => values) };
}

const OPTS = { instanceId: 'i1', rowIdField: [KEY] as const };

describe('createSsrmSelectionContextBuilder', () => {
  it('publishes leaf selections from loaded data, like CSRM', async () => {
    const p = provider([]);
    const build = createSsrmSelectionContextBuilder({ provider: p, keyColumn: KEY });
    const ctx = await build(api({
      getSelectedNodes: () => [
        { group: false, data: { [KEY]: 'P1' } },
        { group: false, data: { [KEY]: 'P2' } },
      ],
    }), OPTS);
    expect(ctx?.criteria).toEqual({ [KEY]: ['P1', 'P2'] });
    expect(p.getSetFilterValues).not.toHaveBeenCalled();
  });

  it('resolves a selected group through the worker with its group path', async () => {
    const p = provider(['P1', 'P2', 'P3']);
    const build = createSsrmSelectionContextBuilder({ provider: p, keyColumn: KEY });
    const ctx = await build(api({
      getSelectedNodes: () => [{
        group: true,
        getRoute: () => ['A'],
        allLeafChildren: [],
      }],
      getRowGroupColumns: () => [{ getColDef: () => ({ field: 'book' }) }],
      getFilterModel: () => ({ desk: { filterType: 'text', type: 'equals', filter: 'RATES' } }),
    }), OPTS);

    expect(p.getSetFilterValues).toHaveBeenCalledWith({
      column: KEY,
      filterModel: { desk: { filterType: 'text', type: 'equals', filter: 'RATES' } },
      quickFilterText: '',
      groupKeys: ['A'],
      rowGroupCols: [{ field: 'book' }],
    });
    expect(ctx?.criteria).toEqual({ [KEY]: ['P1', 'P2', 'P3'] });
  });

  it('merges leaf and group contributions and de-duplicates', async () => {
    const p = provider(['P2', 'P3']);
    const build = createSsrmSelectionContextBuilder({ provider: p, keyColumn: KEY });
    const ctx = await build(api({
      getSelectedNodes: () => [
        { group: false, data: { [KEY]: 'P2' } },
        { group: true, getRoute: () => ['A'], allLeafChildren: [] },
      ],
      getRowGroupColumns: () => [{ getColDef: () => ({ field: 'book' }) }],
    }), OPTS);
    expect(ctx?.criteria[KEY].sort()).toEqual(['P2', 'P3']);
  });

  it('publishes the whole query minus toggled rows on select-all', async () => {
    const p = provider(['P1', 'P2', 'P3', 'P4']);
    const build = createSsrmSelectionContextBuilder({ provider: p, keyColumn: KEY });
    const ctx = await build(api({
      getServerSideSelectionState: () => ({ selectAll: true, toggledNodes: ['P2'] }),
    }), OPTS);

    expect(p.getSetFilterValues).toHaveBeenCalledWith({
      column: KEY,
      filterModel: {},
      quickFilterText: '',
      groupKeys: [],
      rowGroupCols: [],
    });
    expect(ctx?.criteria).toEqual({ [KEY]: ['P1', 'P3', 'P4'] });
  });

  it('publishes empty criteria when nothing is selected (peers clear)', async () => {
    const build = createSsrmSelectionContextBuilder({ provider: provider([]), keyColumn: KEY });
    const ctx = await build(api(), OPTS);
    expect(ctx?.criteria).toEqual({});
  });

  it('includes the quick filter in worker requests', async () => {
    const p = provider(['P1']);
    const build = createSsrmSelectionContextBuilder({
      provider: p, keyColumn: KEY, getQuickFilterText: () => 'alpha',
    });
    await build(api({
      getSelectedNodes: () => [{ group: true, getRoute: () => ['A'], allLeafChildren: [] }],
      getRowGroupColumns: () => [{ getColDef: () => ({ field: 'book' }) }],
    }), OPTS);
    expect(p.getSetFilterValues.mock.calls[0][0].quickFilterText).toBe('alpha');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/react-grid && npx vitest run widgets-react/src/hosted/ssrmGridContextLink.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
// packages/react-grid/widgets-react/src/hosted/ssrmGridContextLink.ts
/**
 * SSRM-aware colour-link publishing. CSRM's builder reads everything from
 * loaded row nodes; under SSRM a selected group's descendants may not be
 * loaded (`allLeafChildren` empty) and select-all reports
 * `{ selectAll, toggledNodes }` with `getSelectedNodes()` unusable. Both
 * cases resolve through the worker's group-scoped set-filter values, so the
 * broadcast carries the exact leaf keys — identical wire shape to CSRM.
 */
import type { GridApi, IRowNode } from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import {
  GRID_LINK_CONTEXT_TYPE,
  type GridLinkSelectionBuilder,
} from './gridContextLink.js';

export interface SsrmSelectionBuilderDeps {
  provider: Pick<ISsrmDataProvider, 'getSetFilterValues'>;
  keyColumn: string;
  getQuickFilterText?: () => string;
}

interface SsrmSelectAllState { selectAll: boolean; toggledNodes: string[] }

function rowGroupColsOf(api: GridApi): Array<{ field: string }> {
  const cols = (api as unknown as {
    getRowGroupColumns?: () => Array<{ getColDef(): { field?: string } }>;
  }).getRowGroupColumns?.() ?? [];
  return cols
    .map((c) => ({ field: c.getColDef().field ?? '' }))
    .filter((c) => c.field);
}

export function createSsrmSelectionContextBuilder(
  deps: SsrmSelectionBuilderDeps,
): GridLinkSelectionBuilder {
  const { provider, keyColumn, getQuickFilterText } = deps;

  return async (api, opts) => {
    const quickFilterText = getQuickFilterText?.() ?? '';
    const filterModel = (api.getFilterModel() ?? {}) as Record<string, unknown>;
    const values = new Set<string>();

    const fetchKeys = (groupKeys: string[], rowGroupCols: Array<{ field: string }>) =>
      provider.getSetFilterValues({
        column: keyColumn,
        filterModel,
        quickFilterText,
        groupKeys,
        rowGroupCols,
      });

    const selectionState = (api as unknown as {
      getServerSideSelectionState?: () => SsrmSelectAllState | null;
    }).getServerSideSelectionState?.() ?? null;

    if (selectionState?.selectAll) {
      // Whole current query, minus explicitly deselected rows.
      const toggled = new Set(selectionState.toggledNodes ?? []);
      for (const v of await fetchKeys([], [])) {
        if (!toggled.has(v)) values.add(v);
      }
    } else {
      for (const node of api.getSelectedNodes() as IRowNode[]) {
        if (node.group) {
          const route = (node as unknown as { getRoute?: () => string[] | undefined })
            .getRoute?.() ?? [];
          for (const v of await fetchKeys(route, rowGroupColsOf(api))) values.add(v);
          continue;
        }
        const data = node.data as Record<string, unknown> | undefined;
        for (const field of opts.rowIdField) {
          const v = data?.[field];
          if (v !== undefined && v !== null) values.add(String(v));
        }
      }
    }

    return {
      type: GRID_LINK_CONTEXT_TYPE,
      source: opts.instanceId,
      criteria: values.size > 0 ? { [keyColumn]: [...values] } : {},
    };
  };
}
```

Add to `hosted/index.ts`:

```ts
export { createSsrmSelectionContextBuilder } from './ssrmGridContextLink.js';
export type { SsrmSelectionBuilderDeps } from './ssrmGridContextLink.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/react-grid && npx vitest run widgets-react/src/hosted/ssrmGridContextLink.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add packages/react-grid/widgets-react/src/hosted/ssrmGridContextLink.ts packages/react-grid/widgets-react/src/hosted/ssrmGridContextLink.test.ts packages/react-grid/widgets-react/src/hosted/index.ts
git commit -m "feat(grid): SSRM selection builder resolving groups and select-all via worker"
```

---

### Task 4: `mode: 'rowId'` receive path under SSRM

**Files:**
- Modify: `packages/react-grid/widgets-react/src/hosted/gridContextLink.ts` (add `rowIdSetFilterResolver`)
- Modify: `packages/react-grid/widgets-react/src/hosted/useGridContextLink.ts` (receive branch)
- Test: `packages/react-grid/widgets-react/src/hosted/gridContextLink.rowIdResolver.test.ts` (new)
- Modify: `packages/react-grid/widgets-react/src/hosted/index.ts` (export)

**Interfaces:**
- Produces:

```ts
/** Receive `mode: 'rowId'` contexts as a set-filter on the key column —
 *  SSRM never calls doesExternalFilterPass, so the external-filter default
 *  cannot work there. Routes through applyGridLinkContext, so manual
 *  filters merge identically to 'fields' mode. */
export function createRowIdSetFilterResolver(keyColumn: string): GridLinkResolver;
```

- In `useGridContextLink`'s receive branch: when `mode === 'rowId'` **and** `config.resolve` is provided, route the incoming context through `applyGridLinkContext(api, context, config.resolve, prevLinkFields)` instead of `applyRowIdExternalFilter`. With no `resolve`, behaviour is byte-for-byte what it is today (CSRM unaffected).

- [ ] **Step 1: Write the failing test**

```ts
// packages/react-grid/widgets-react/src/hosted/gridContextLink.rowIdResolver.test.ts
import { describe, expect, it } from 'vitest';
import { createRowIdSetFilterResolver } from './gridContextLink.js';

describe('createRowIdSetFilterResolver', () => {
  it('maps broadcast row ids to a set-filter model on the key column', () => {
    const resolve = createRowIdSetFilterResolver('positionId');
    const model = resolve(
      { type: 't', criteria: {}, rowIds: ['P1', 'P2'] },
      null as never,
    );
    expect(model).toEqual({
      positionId: { filterType: 'set', values: ['P1', 'P2'] },
    });
  });

  it('returns null for an empty id set so the link filter clears', () => {
    const resolve = createRowIdSetFilterResolver('positionId');
    expect(resolve({ type: 't', criteria: {}, rowIds: [] }, null as never)).toBeNull();
    expect(resolve({ type: 't', criteria: {} }, null as never)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/react-grid && npx vitest run widgets-react/src/hosted/gridContextLink.rowIdResolver.test.ts`
Expected: FAIL — `createRowIdSetFilterResolver` is not exported.

- [ ] **Step 3: Implement**

In `gridContextLink.ts` (after `defaultGridLinkResolver`):

```ts
export function createRowIdSetFilterResolver(keyColumn: string): GridLinkResolver {
  return (context) => {
    const ids = context.rowIds ?? [];
    if (ids.length === 0) return null;
    return { [keyColumn]: { filterType: 'set', values: [...ids] } };
  };
}
```

In `useGridContextLink.ts`, find the receive handler branch that calls `applyRowIdExternalFilter(api, context)` for `mode === 'rowId'` and change it to:

```ts
if (mode === 'rowId' && !config?.resolve) {
  applyRowIdExternalFilter(gridApi, context);
} else {
  prevLinkFieldsRef.current = applyGridLinkContext(
    gridApi, context, config?.resolve ?? defaultGridLinkResolver, prevLinkFieldsRef.current,
  );
}
```

(Match the surrounding variable names — read the existing receive effect first; `prevLinkFieldsRef` may be named differently. Preserve the existing `applyingRemoteRef` guard wrapping.)

Export from `hosted/index.ts`:

```ts
export { createRowIdSetFilterResolver } from './gridContextLink.js';
```

- [ ] **Step 4: Run the full hosted test suite**

Run: `cd packages/react-grid && npx vitest run widgets-react/src/hosted/`
Expected: PASS — new tests green, all pre-existing rowId external-filter tests untouched (no `resolve` ⇒ old path).

- [ ] **Step 5: Commit**

```bash
git add packages/react-grid/widgets-react/src/hosted/gridContextLink.ts packages/react-grid/widgets-react/src/hosted/useGridContextLink.ts packages/react-grid/widgets-react/src/hosted/gridContextLink.rowIdResolver.test.ts packages/react-grid/widgets-react/src/hosted/index.ts
git commit -m "feat(grid): resolver-based rowId link receive for SSRM grids"
```

---

### Task 5: Forward star-demo's props through `SsrmMarketsGridContainer`

**Files:**
- Modify: `packages/react-grid/widgets-react/src/container/ssrm-markets-grid-container/SsrmMarketsGridContainer.tsx`
- Test: `packages/react-grid/widgets-react/src/container/ssrm-markets-grid-container/SsrmMarketsGridContainer.forwarding.test.tsx` (new)

**Interfaces:**
- Produces, added to `SsrmMarketsGridContainerProps`:
  - `'gridId' | 'defaultColDef' | 'onReady' | 'historicalDateAppDataRef'` added to the inherited `Pick<MarketsGridProps, …>` union (all four exist on `MarketsGridProps`).
  - `onEditProvider?(providerId: string | null): void` — when supplied, the container's provider-editor entry invokes it **instead of** opening the inline `ProviderEditorDialog` (star-demo opens a popout).
  - `onRowIdFieldChange?(rowIdField: string | null): void` — called with the resolved `keyColumn` once known (Task 6's hosted wrapper feeds it into the link config, mirroring `MarketsGridContainer`'s prop of the same name).
  - `gridId` defaults to `providerId` when omitted (today's behaviour).

- [ ] **Step 1: Write the failing test**

Follow the mock pattern of the existing SSRM container test (`MarketsGridSsrmSurface.test.tsx` mocks in the same package): mock `MarketsGrid` to capture props, mock `useSsrmDataProvider` to return a fake provider with `getConfig: () => ({ keyColumn: 'positionId' })`.

```tsx
// SsrmMarketsGridContainer.forwarding.test.tsx — core assertions
it('forwards gridId, defaultColDef and historicalDateAppDataRef to MarketsGrid', async () => {
  render(<SsrmMarketsGridContainer
    providerId="p1"
    gridId="star-demo-blotter"
    defaultColDef={{ floatingFilter: true }}
    historicalDateAppDataRef="positions.asOfDate"
  />);
  await waitFor(() => expect(captured.gridId).toBe('star-demo-blotter'));
  expect(captured.defaultColDef).toMatchObject({ floatingFilter: true });
  expect(captured.historicalDateAppDataRef).toBe('positions.asOfDate');
});

it('defaults gridId to providerId when omitted', async () => {
  render(<SsrmMarketsGridContainer providerId="p1" />);
  await waitFor(() => expect(captured.gridId).toBe('p1'));
});

it('forwards onReady to MarketsGrid', async () => { /* captured.onReady === handler */ });

it('reports the resolved keyColumn through onRowIdFieldChange', async () => {
  const onRowIdFieldChange = vi.fn();
  render(<SsrmMarketsGridContainer providerId="p1" onRowIdFieldChange={onRowIdFieldChange} />);
  await waitFor(() => expect(onRowIdFieldChange).toHaveBeenCalledWith('positionId'));
});

it('routes the provider-editor entry to onEditProvider when supplied', async () => {
  /* render with onEditProvider, trigger the editor entry the container renders,
     assert onEditProvider called with providerId and the inline dialog did NOT open */
});
```

Write these as complete tests (imports, mocks, `captured` plumbing) following the sibling test file's structure exactly.

- [ ] **Step 2: Run to verify failures**

Run: `cd packages/react-grid && npx vitest run widgets-react/src/container/ssrm-markets-grid-container/SsrmMarketsGridContainer.forwarding.test.tsx`
Expected: FAIL — `gridId` is always `providerId`; the other props are dropped by the destructuring.

- [ ] **Step 3: Implement**

In `SsrmMarketsGridContainerProps`, extend the `Pick` union with `'gridId' | 'defaultColDef' | 'onReady' | 'historicalDateAppDataRef'` and add:

```ts
  /** Route the provider-editor entry to a host callback (e.g. a popout)
   *  instead of the inline dialog. */
  onEditProvider?(providerId: string | null): void;
  /** Reports the provider's resolved key column (drives getRowId). Hosted
   *  wrappers feed this into the colour-link config. */
  onRowIdFieldChange?(rowIdField: string | null): void;
```

Destructure them (`gridId: gridIdProp`, `defaultColDef`, `onReady`, `historicalDateAppDataRef`, `onEditProvider`, `onRowIdFieldChange`), then:

```tsx
useEffect(() => {
  onRowIdFieldChange?.(keyColumn ?? null);
}, [onRowIdFieldChange, keyColumn]);
```

and on the `<MarketsGrid>` element:

```tsx
gridId={gridIdProp ?? providerId}
defaultColDef={defaultColDef}
onReady={onReady}
historicalDateAppDataRef={historicalDateAppDataRef}
```

For the editor entry: where the container currently opens `ProviderEditorDialog` (`setEditorOpen(true)`), call `onEditProvider ? onEditProvider(providerId) : setEditorOpen(true)`.

- [ ] **Step 4: Run the container suite**

Run: `cd packages/react-grid && npx vitest run widgets-react/src/container/ssrm-markets-grid-container/`
Expected: PASS, new and pre-existing.

- [ ] **Step 5: Commit**

```bash
git add packages/react-grid/widgets-react/src/container/ssrm-markets-grid-container/
git commit -m "feat(grid): forward host-shell props through SsrmMarketsGridContainer"
```

---

### Task 6: Colour-link wiring in `HostedSsrmMarketsGrid`

**Files:**
- Modify: `packages/react-grid/widgets-react/src/hosted/HostedSsrmMarketsGrid.tsx`
- Test: `packages/react-grid/widgets-react/src/hosted/HostedSsrmMarketsGrid.link.test.tsx` (new)

**Interfaces:**
- Consumes: `createSsrmSelectionContextBuilder` (Task 3), `createRowIdSetFilterResolver` (Task 4), Task 5's `onReady`/`onRowIdFieldChange` forwarding, and the exact wiring pattern of `HostedMarketsGrid.tsx:175–310` (gridApi state via `onReady`, `useGridLinkNotifications`, `useInteropChannel` / `linking.fdc3` transport selection, `useGridContextLink`).
- Produces: `HostedSsrmMarketsGridProps` gains `contextLink?: GridContextLinkConfig`. When enabled, the wrapper injects SSRM defaults into the config it hands `useGridContextLink`:
  - `buildContext`: caller-supplied, else `createSsrmSelectionContextBuilder({ provider, keyColumn, getQuickFilterText })`
  - `resolve` (only when `mode === 'rowId'`): caller-supplied, else `createRowIdSetFilterResolver(keyColumn)`
  - `rowIdField`: resolved key column from `onRowIdFieldChange`

The provider instance comes from the container layer; expose it by having the container accept an optional `onProviderReady?(provider: ISsrmDataProvider): void` **only if** the provider is not already reachable in the wrapper — check first: `useSsrmDataProvider` is called in the container, so add `onProviderReady` to Task 5's container changes if needed (implementer: verify, and if added, test it the same way as `onRowIdFieldChange`).

- [ ] **Step 1: Write the failing test** — mock `SsrmMarketsGridContainer` to capture props and invoke `onReady`/`onRowIdFieldChange`/`onProviderReady`; mock `useGridContextLink` to capture its args. Assert:

```
1. contextLink.enabled=true → useGridContextLink receives a config whose
   buildContext is a function (the SSRM builder) and whose rowIdField is the
   reported keyColumn.
2. mode:'rowId' → config.resolve is a function; mode:'fields' → resolve is
   the caller's value (undefined when not supplied).
3. contextLink omitted → useGridContextLink called with config undefined
   (hook inert), and no gridApi state tracking.
4. caller-supplied buildContext wins over the SSRM default.
```

Write these as complete tests following `MarketsGridSsrmSurface.test.tsx`'s mock scaffolding.

- [ ] **Step 2: Run to verify failure** — `cd packages/react-grid && npx vitest run widgets-react/src/hosted/HostedSsrmMarketsGrid.link.test.tsx` → FAIL (`contextLink` not a prop).

- [ ] **Step 3: Implement** — mirror `HostedMarketsGrid`'s block: `const [gridApi, setGridApi] = useState<GridApi | null>(null)` fed by a chained `onReady`; `linkRowIdField` state fed by `onRowIdFieldChange`; provider ref fed by `onProviderReady`; transport = `isInteropAvailable() ? interopChannel : linking.fdc3` (import both, identical to the CSRM file); `useGridLinkNotifications` gated on `contextLink?.notify === true`; assemble `effectiveContextLink` with the SSRM defaults above; call `useGridContextLink`.

- [ ] **Step 4: Run the hosted suite** — `cd packages/react-grid && npx vitest run widgets-react/src/hosted/` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/react-grid/widgets-react/src/hosted/HostedSsrmMarketsGrid.tsx packages/react-grid/widgets-react/src/hosted/HostedSsrmMarketsGrid.link.test.tsx packages/react-grid/widgets-react/src/container/ssrm-markets-grid-container/
git commit -m "feat(grid): colour-link wiring for HostedSsrmMarketsGrid"
```

---

### Task 7: Clone the app

**Files:**
- Create: `apps/source/star-demo-ssrm/**` (copy of `apps/source/star-demo`)
- Modify (within the clone): `package.json`, `vite.config.ts`, `public/seed.json`, `public/platform/manifest.fin.json`, `public/app-config.json`, `src/views/BlottersMarketsGrid.tsx`, `index.html` (title)

**Interfaces:**
- Consumes: `HostedSsrmMarketsGrid` with Tasks 5–6 landed.
- Produces: a runnable app at `http://localhost:5176`, OpenFin uuid `star-demo-ssrm`.

- [ ] **Step 1: Copy and rename**

```bash
cp -R apps/source/star-demo apps/source/star-demo-ssrm
cd apps/source/star-demo-ssrm && rm -rf node_modules dist
```

Then apply, in order:
1. `package.json`: `"name": "@wellsfargo-starui/star-demo-ssrm"`, description mentions SSRM, `client` script URL → `http://localhost:5176/platform/manifest.fin.json`.
2. `vite.config.ts`: `server: { port: 5176 }`.
3. `public/platform/manifest.fin.json`: every `"star-demo"` uuid/name → `"star-demo-ssrm"`; every `localhost:5175` → `localhost:5176`. (`grep -rn "5175\|star-demo" public/` must come back empty afterwards, excluding the string `star-demo-ssrm`.)
4. `public/app-config.json`: same sweep.
5. `public/seed.json`: the provider lives at `appConfig[10]` (catalog row `configId: "dp-121e4569-5100-4f6b-b946-c3423d8aff7c"`, `displayText: "test.dp"`). Two fields flip: the row's `"componentSubType": "stomp"` → `"stomp-ssrm"` AND `payload.providerType": "stomp"` → `"stomp-ssrm"`. Leave `websocketUrl`/`keyColumn` untouched. The row's `appId: "StarDemo"` — check how the app resolves its own appId (`platformBootstrap.ts` / `app-config.json`) and keep seed and app consistent (rename both to `StarDemoSsrm` or leave both, never half). Run `node scripts/validate-seed.mjs` afterwards.
6. `index.html`: title → `star-demo-ssrm`.

- [ ] **Step 2: Swap the blotter view**

`src/views/BlottersMarketsGrid.tsx` — change the import and element, keep every existing prop:

```tsx
import { HostedSsrmMarketsGrid } from '@wellsfargo-starui/grid/widgets/hosted';
// element:
<HostedSsrmMarketsGrid
  providerId="dp-121e4569-5100-4f6b-b946-c3423d8aff7c"  // seed.json appConfig[10].configId
  componentName="MarketsGrid"
  defaultInstanceId="star-demo-ssrm-blotter"
  documentTitle="MarketsGrid · SSRM Blotter"
  withStorage
  theme="auto"
  configManager={configManager}
  gridId="star-demo-ssrm-blotter"
  historicalDateAppDataRef="positions.asOfDate"
  onEditProvider={handleEditProvider}
  onOpenConfigBrowser={handleOpenConfigBrowser}
  showFiltersToolbar
  showFormattingToolbar
  showEditingToolbar
  defaultColDef={DEFAULT_COL_DEF}
  contextLink={{ enabled: true, mode: 'fields', notify: false }}
/>
```

Notes: verify the provider id survives your seed edits (it is the `configId` of the row whose `componentSubType` you flipped — if you regenerate ids, use the regenerated one). `onOpenConfigBrowser` — verify it exists on the hosted SSRM surface after Task 5/6; if it was not among the forwarded props (it is a `MarketsGridContainer` prop in CSRM), forward it in the same way as `onEditProvider` in Task 5 and cover it in that task's test.

- [ ] **Step 3: Adapt the app tests**

Sweep `src/**/*.test.*` (22 files): identity strings (`star-demo` → `star-demo-ssrm`), port (`5175` → `5176`), provider type (`stomp` → `stomp-ssrm`), and the blotter test's component name (`HostedMarketsGrid` → `HostedSsrmMarketsGrid` mock). Do not delete assertions — adapt them.

Run: `cd apps/source/star-demo-ssrm && npm install && npm test`
Expected: PASS (22 files).

- [ ] **Step 4: Boot it**

```bash
cd /Users/develop/wfh/stern-bak && npm run build:packages
cd apps/source/star-demo-ssrm && npm run dev &   # then:
curl -sf http://localhost:5176/ | head -3        # HTML served
```

Then `npm run typecheck` in the app. Kill the dev server.

- [ ] **Step 5: Commit**

```bash
git add apps/source/star-demo-ssrm
git commit -m "feat(apps): star-demo-ssrm — SSRM sibling of star-demo on :5176"
```

---

### Task 8: Register the app in the apps install root

**Files:**
- Modify: `apps/package.json` (workspaces list, if star-demo is enumerated there)
- Modify: `apps/README.md` and/or `docs/APPS_REPO.md` (app inventory)

- [ ] **Step 1:** `grep -n "star-demo" apps/package.json apps/README.md docs/APPS_REPO.md scripts/run-app.mjs` — mirror every star-demo registration for star-demo-ssrm (workspaces entry, run-app alias, README row). `cd apps && npm install` must resolve the new workspace cleanly (no `--legacy-peer-deps`, per repo policy).
- [ ] **Step 2:** Commit: `git add apps/package.json apps/README.md docs/APPS_REPO.md scripts/run-app.mjs && git commit -m "chore(apps): register star-demo-ssrm"` (whichever files actually changed).

---

### Task 9: e2e smoke for the new app's linking surface

The spec says no *new* e2e scope, but the cloned app must not regress the SSRM tick path it now exercises through a hosted surface. One conditional spec, gated like the existing SSRM spec.

**Files:**
- Modify: `apps/playwright.config.ts` (webServer entry for :5176)
- Create: `apps/e2e/star-demo-ssrm-smoke.spec.ts`

- [ ] **Step 1:** Add the webServer entry (mirror the 5320 SSRM-lab block, command `npm run dev -w @wellsfargo-starui/star-demo-ssrm -- --no-open --force`, port 5176).
- [ ] **Step 2:** Write the spec: navigate to `http://localhost:5176/#/blotters/marketsgrid` (confirm the route hash from `src/App.tsx` first), wait for `.ag-grid-scrolling-container .ag-row` (AG Grid 36 selector — `.ag-center-cols-container` does not exist), assert ≥ 1 row renders and no `pageerror` fires during 10 s of observation. This needs `stomp-view-server` running; follow the repo's existing pattern for STOMP-dependent specs (check how `stomp-marketsgrid-minimal` specs gate on it — if they skip when the socket is closed, do the same via a `test.skip` on a failed `ws://localhost:8081` probe).
- [ ] **Step 3:** Run it with the server up: `cd apps && npx playwright test e2e/star-demo-ssrm-smoke.spec.ts --reporter=line` → PASS (or SKIP without the STOMP server — verify both paths).
- [ ] **Step 4:** Commit: `git add apps/e2e/star-demo-ssrm-smoke.spec.ts apps/playwright.config.ts && git commit -m "test(e2e): star-demo-ssrm boot smoke"`.

---

### Task 10: Full verification + docs

- [ ] **Step 1:** `cd /Users/develop/wfh/stern-bak && npx turbo typecheck build test` → 21/21 green.
- [ ] **Step 2:** `cd apps && npx playwright test e2e/ssrm-viewport-ticks.spec.ts --reporter=line` → 3 passed (regression on the tick path the link work touches).
- [ ] **Step 3:** Update `docs/current-features.md`:
  - SSRM query plane bucket: `SetFilterValuesRequest` group scoping (`groupKeys`/`rowGroupCols`, select-all = empty path) and that it reuses the per-query memo.
  - Hosted bucket: awaitable `GridLinkSelectionBuilder` + staleness guard; `createSsrmSelectionContextBuilder` (leaf/group/select-all contract); `createRowIdSetFilterResolver` and the resolver-based rowId receive path; `HostedSsrmMarketsGrid` `contextLink` support; `SsrmMarketsGridContainer` forwarded props (`gridId`, `defaultColDef`, `onReady`, `historicalDateAppDataRef`, `onEditProvider`, `onRowIdFieldChange`).
  - Apps note: `star-demo-ssrm` (:5176, uuid `star-demo-ssrm`, `stomp-ssrm` seed).
- [ ] **Step 4:** Commit: `git add docs/current-features.md && git commit -m "docs: inventory star-demo-ssrm and SSRM link parity"`.

---

## Self-Review Notes

- **Spec coverage:** Part 1 → Tasks 7–8; Part 2 → Task 5 (+ `onOpenConfigBrowser` caught in Task 7 Step 2 note); Part 3 gap 1 → Tasks 1+3, gap 2 → Tasks 1+3, gap 3 → Task 4, awaitable builder → Task 2; testing section → per-task TDD + Task 9–10; CSRM regression requirement → Task 2 Step 4 and Task 4 Step 4 run the full pre-existing hosted suites.
- **Known unknowns left to the implementer, deliberately:** exact receive-branch variable names in `useGridContextLink` (Task 4 says read first); whether `onProviderReady` is needed (Task 6 says verify); the seed's provider id (Task 7 says read it). Each is a read-then-adapt instruction, not a placeholder.
- **Type consistency check:** `createSsrmSelectionContextBuilder` / `SsrmSelectionBuilderDeps` (Tasks 3, 6), `createRowIdSetFilterResolver` (Tasks 4, 6), `onRowIdFieldChange(rowIdField: string | null)` (Tasks 5, 6), `SetFilterValuesRequest.groupKeys/rowGroupCols` (Tasks 1, 3) — names match across tasks.
