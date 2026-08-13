# SSRM Engine Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the SSRM engine a shrinkwrapped, transport-agnostic module with a coordinated publish window that guarantees consistent numbers/aggregates across N grids, session-scaled memo sizing, per-session expression rules, and built-in observability.

**Architecture:** The engine (`RowStore`/`QueryEngine`/`SsrmServer`) already computes every aggregate by recomputation-from-state, so conflation can never corrupt numbers — this plan formalises that boundary as a public subpath export driven only through `ICacheIngest`, adds a revision-stamped windowed flush inside the engine (hosts fan it out; cache ingest stays immediate), and threads `sessionId` through expression rules so ten differently-customised blotters stop clobbering each other. Origin requirement: traders open 10+ position blotters with different sort/group/filter/aggregation; wire cost must scale as `grids × viewport`, never `grids × dataset`.

**Tech Stack:** TypeScript, Vitest 4 (`cd packages/data && npx vitest run <path>`), npm 10 workspaces, Turborepo. No new dependencies.

## Global Constraints

- Cache ingest is NEVER throttled or gated — `upsert` applies the moment a frame arrives. Only *notification* (tick fan-out) is windowed.
- Aggregates remain recompute-from-state. No incremental/delta-maintained sums anywhere.
- `publishWindowMs` default is **0 (passthrough — today's per-frame behaviour)** in the engine; the star-demo-ssrm seed opts in at **200**. Existing hub tests run without fake timers and must stay green at the default.
- The engine directory `packages/data/host-data/src/runtime/ssrm/` must not import from `../worker/`, `../client/`, `../providers/`, or `../bootstrap/` (enforced by test in Task 1).
- Back-compat: every new parameter is optional; omitting it preserves current behaviour (global expression rules, unwindowed ticks, static memo size).
- Per CLAUDE.md: `npm` only, conventional commits, update `docs/current-features.md` in the same change as each feature, complexity ceilings 800 LOC/file.
- Run package tests from the package dir: `cd /Users/develop/wfh/stern-bak/packages/data && npx vitest run …`. Full gate at the end: `npx turbo typecheck build test` from the repo root.

## File Map

| File | Role in this plan |
|---|---|
| `packages/data/package.json` | new `./ssrm-engine` subpath export (Task 1) |
| `packages/data/host-data/src/runtime/ssrm/index.ts` | engine barrel — flush API + stats exports |
| `packages/data/host-data/src/runtime/ssrm/SsrmServer.ts` | windowed flush, per-session rules API, session-scaled memo, stats |
| `packages/data/host-data/src/runtime/ssrm/QueryEngine.ts` | per-session compiled rules, `setOrderCacheSize`, memo counters |
| `packages/data/host-data/src/runtime/ssrm/SsrmPlane.ts` | pass-throughs incl. `publishWindowMs` from cfg |
| `packages/data/host-data/src/runtime/ssrm/engineBoundary.test.ts` | import-guard (Task 1) |
| `packages/data/host-data/src/runtime/ssrm/engineContract.test.ts` | standalone any-transport contract + consistency acceptance |
| `packages/data/host-data/src/runtime/worker/SharedWorkerDataServicesHub.ts` | fan from flush events; introspect wiring |
| `packages/data/host-data/src/runtime/protocol.ts` | `sessionId?` on configure-expressions RPC |
| `packages/data/host-data/src/runtime/client/SharedWorkerDataServicesClient.ts` | ditto |
| `packages/data/host-data/src/provider/SsrmProviderClientAdapter.ts` | sends `sessionId` on configure |
| `packages/react-grid/grid/src/ssrm/createSsrmStatusBar.tsx` | tick-driven refresh instead of 150 ms poll |
| `docs/latest/ssrm-engine.md` | shrinkwrap contract doc (Task 1) |
| `apps/source/star-demo-ssrm/public/seed.json` | `publishWindowMs: 200` opt-in (Task 8) |
| `scripts/bench-ssrm.mjs` | window on/off comparison (Task 8) |

---

### Task 1: Shrinkwrap boundary — subpath export, import guard, standalone contract test

The engine is already transport-free in spirit (`ICacheIngest` is the only ingest door). This task makes that a public, enforced contract so ANY transport (STOMP, REST poller, kafka bridge, in-page mock) can drive it — in a SharedWorker, a page, or Node.

**Files:**
- Modify: `packages/data/package.json` (exports map, after the `"./runtime"` entry)
- Create: `packages/data/host-data/src/runtime/ssrm/engineBoundary.test.ts`
- Create: `packages/data/host-data/src/runtime/ssrm/engineContract.test.ts`
- Create: `docs/latest/ssrm-engine.md`

**Interfaces:**
- Consumes: existing `SsrmServer`, `ICacheIngest`, `SsrmGetRowsRequest`, `ViewportInterestScope` from `./index.js`.
- Produces: import specifier `@wellsfargo-starui/data/ssrm-engine` (resolves to the ssrm `index`); the contract test file that Tasks 2/6/8 extend.

- [ ] **Step 1: Write the failing boundary test** — the engine must not reach the hub/client/transports:

```ts
// packages/data/host-data/src/runtime/ssrm/engineBoundary.test.ts
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE_DIR = join(__dirname);
const FORBIDDEN = ['../worker/', '../client/', '../providers/', '../bootstrap/'];

describe('ssrm engine boundary', () => {
  it('imports nothing from worker, client, providers, or bootstrap', () => {
    const offenders: string[] = [];
    for (const f of readdirSync(ENGINE_DIR)) {
      if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue;
      const src = readFileSync(join(ENGINE_DIR, f), 'utf8');
      for (const bad of FORBIDDEN) {
        if (src.includes(`from "${bad}`) || src.includes(`from '${bad}`)) {
          offenders.push(`${f} -> ${bad}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it** — `cd packages/data && npx vitest run host-data/src/runtime/ssrm/engineBoundary.test.ts`. Expected: PASS already (the engine is clean today); this test exists to KEEP it clean. If it fails, list the offending import in the task notes and stop — that is a real coupling to remove first.

- [ ] **Step 3: Write the failing contract test** — a fake transport drives the engine end-to-end with no hub, no worker, no STOMP:

```ts
// packages/data/host-data/src/runtime/ssrm/engineContract.test.ts
import { describe, expect, it } from 'vitest';
import { SsrmServer } from './index.js';
import type { ICacheIngest } from './index.js';

/** Any transport is just something that calls ICacheIngest. */
function fakeTransport(sink: ICacheIngest) {
  return {
    snapshot: (n: number) =>
      sink.replaceSnapshot(
        Array.from({ length: n }, (_, i) => ({
          id: `P${i}`, book: i % 2 ? 'A' : 'B', px: i,
        })),
      ),
    tick: (id: string, px: number) => sink.upsert([{ id, px }]),
    drop: (id: string) => sink.remove([id]),
  };
}

const BASE = {
  startRow: 0, endRow: 100, filterModel: {}, sortModel: [],
  groupKeys: [], rowGroupCols: [], valueCols: [], pivotCols: [], pivotMode: false,
};

describe('ssrm engine contract (transport-agnostic)', () => {
  it('serves blocks, aggregates, and ticks driven purely through ICacheIngest', () => {
    const engine = new SsrmServer({ keyColumn: 'id' });
    const transport = fakeTransport(engine);
    const ticks: unknown[] = [];
    engine.onTick((e) => ticks.push(e));

    transport.snapshot(500);
    expect(engine.getRows(BASE).rowCount).toBe(500);

    transport.tick('P7', 9_999);
    const sum = engine.getRows({
      ...BASE, valueCols: [{ field: 'px', aggFunc: 'sum' }],
    }).grandTotalData?.px;
    // Recompute-from-state: the aggregate reflects the tick immediately.
    expect(sum).toBe(((499 * 500) / 2) - 7 + 9_999);

    transport.drop('P7');
    expect(engine.getRows(BASE).rowCount).toBe(499);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 4: Run it** — same command, `engineContract.test.ts`. Expected: PASS (this pins the existing contract; it goes RED only if the boundary regresses). Both tests are characterisation guards — commit them even though they pass first try; note in the commit that they pin, not drive, behaviour.

- [ ] **Step 5: Add the subpath export** in `packages/data/package.json`, directly after the `"./runtime"` entry (match its style exactly):

```json
"./ssrm-engine": {
  "types": "./host-data/dist/runtime/ssrm/index.d.ts",
  "import": "./host-data/dist/runtime/ssrm/index.js"
},
```

- [ ] **Step 6: Verify resolution** — `cd /Users/develop/wfh/stern-bak && npm run build:packages && node -e "import('@wellsfargo-starui/data/ssrm-engine').then(m => console.log(typeof m.SsrmServer))"` run from `packages/data` consumers won't work in bare node; instead verify via the repo's consumer tsconfig: `grep ssrm-engine tsconfig.consumer.json` shows the mapping after `build:packages` (gen-consumer-tsconfig picks exports up automatically). Expected: a path mapping exists.

- [ ] **Step 7: Write `docs/latest/ssrm-engine.md`** — one page: the three contract surfaces (ingest = `ICacheIngest`; query = `getRows`/`getSetFilterValues`/`getStatusBar`/`getDetailRows`; publish = `onTick` now, `onFlush` after Task 2), the any-transport recipe (the fakeTransport pattern from Step 3, verbatim), and the guarantees list (last-value-wins cache, recompute-from-state aggregates, revision-keyed memo). State explicitly: the hub is ONE host of this engine, not its owner.

- [ ] **Step 8: Commit**

```bash
git add packages/data/package.json packages/data/host-data/src/runtime/ssrm/engineBoundary.test.ts packages/data/host-data/src/runtime/ssrm/engineContract.test.ts docs/latest/ssrm-engine.md tsconfig.consumer.json
git commit -m "feat(data): shrinkwrap the SSRM engine behind a public transport-agnostic contract"
```

---

### Task 2: Windowed, revision-stamped flush inside the engine

**Files:**
- Modify: `packages/data/host-data/src/runtime/ssrm/SsrmServer.ts`
- Modify: `packages/data/host-data/src/runtime/ssrm/index.ts` (export `SsrmFlushEvent`)
- Test: extend `packages/data/host-data/src/runtime/ssrm/engineContract.test.ts`

**Interfaces:**
- Consumes: `RowStore.onTick` (`TickEvent { type: 'rows'|'snapshot'; keys?; columns?; rows?; revision }`), `store.getRevision()`.
- Produces (Tasks 3/7/8 rely on these exact shapes):

```ts
export interface SsrmFlushEvent {
  type: 'rows' | 'snapshot';
  /** Union of changed keys since the last flush (empty for snapshot). */
  keys: string[];
  /** Union of changed columns since the last flush. */
  columns: string[];
  /** Store revision AT FLUSH TIME — the consistency stamp. */
  revision: number;
  /** Keys accumulated before dedup — `- keys.length` were conflated. */
  updatesAccumulated: number;
}
// SsrmServerOptions gains:
//   publishWindowMs?: number;                        // default 0 = passthrough
//   setTimer?: (cb: () => void, ms: number) => unknown;  // injectable (hub pattern)
//   clearTimer?: (h: unknown) => void;
// SsrmServer gains:
//   onFlush(listener: (e: SsrmFlushEvent) => void): () => void;
//   dispose(): void;   // clears any pending window timer
```

- [ ] **Step 1: Write the failing tests** (append a `describe` to `engineContract.test.ts`):

```ts
import { SsrmServer, type SsrmFlushEvent } from './index.js';

function fakeTimers() {
  const cbs = new Map<number, () => void>();
  let id = 0;
  return {
    set: (cb: () => void) => (cbs.set(++id, cb), id),
    clear: (h: unknown) => void cbs.delete(h as number),
    fire: () => { const all = [...cbs.values()]; cbs.clear(); all.forEach((f) => f()); },
    get armed() { return cbs.size > 0; },
  };
}

describe('windowed flush', () => {
  it('passthrough by default: one flush per store tick, revision-stamped', () => {
    const engine = new SsrmServer({ keyColumn: 'id' });
    const flushes: SsrmFlushEvent[] = [];
    engine.onFlush((e) => flushes.push(e));
    engine.replaceSnapshot([{ id: 'a', px: 1 }]);
    engine.upsert([{ id: 'a', px: 2 }]);
    expect(flushes.map((f) => f.type)).toEqual(['snapshot', 'rows']);
    expect(flushes[1].keys).toEqual(['a']);
    expect(flushes[1].revision).toBe(engine.getStats().revision);
  });

  it('accumulates and key-conflates across a window, flushing once', () => {
    const t = fakeTimers();
    const engine = new SsrmServer({
      keyColumn: 'id', publishWindowMs: 200, setTimer: t.set, clearTimer: t.clear,
    });
    const flushes: SsrmFlushEvent[] = [];
    engine.onFlush((e) => flushes.push(e));
    engine.replaceSnapshot([{ id: 'a', px: 1 }, { id: 'b', px: 1 }]);
    flushes.length = 0; // snapshot flushes immediately even windowed — tested below

    engine.upsert([{ id: 'a', px: 2 }]);
    engine.upsert([{ id: 'a', px: 3 }]);
    engine.upsert([{ id: 'b', px: 2 }]);
    expect(flushes).toEqual([]);      // window open, nothing published
    t.fire();
    expect(flushes).toHaveLength(1);  // one conflated flush
    expect([...flushes[0].keys].sort()).toEqual(['a', 'b']);
    expect(flushes[0].updatesAccumulated).toBe(3); // 3 accumulated, 2 shipped
    expect(flushes[0].revision).toBe(engine.getStats().revision);
    expect(t.armed).toBe(false);      // timer disarmed until next change
  });

  it('flushes snapshot events immediately even inside a window', () => {
    const t = fakeTimers();
    const engine = new SsrmServer({
      keyColumn: 'id', publishWindowMs: 200, setTimer: t.set, clearTimer: t.clear,
    });
    const flushes: SsrmFlushEvent[] = [];
    engine.onFlush((e) => flushes.push(e));
    engine.upsert([{ id: 'a', px: 1 }]);       // opens window
    engine.replaceSnapshot([{ id: 'z', px: 0 }]); // must not wait
    expect(flushes.at(-1)?.type).toBe('snapshot');
  });
});
```

- [ ] **Step 2: Run to verify RED** — `npx vitest run host-data/src/runtime/ssrm/engineContract.test.ts`. Expected: FAIL, `engine.onFlush is not a function`.

- [ ] **Step 3: Implement in `SsrmServer`** — subscribe to `this.store.onTick` in the constructor; maintain `pendingKeys: Set<string>`, `pendingColumns: Set<string>`, `pendingCount: number`, `windowTimer: unknown | null`. On tick: if `type === 'snapshot'` → clear pending + timer, emit flush `{type:'snapshot', keys:[], columns:[], revision, updatesAccumulated:0}` synchronously. If `type === 'rows'`: when `publishWindowMs <= 0`, emit immediately (`keys` = event keys deduped, `updatesAccumulated` = event keys length); else accumulate and arm the timer once (`setTimer(flush, publishWindowMs)`); `flush()` snapshots+clears pending, stamps `store.getRevision()`, emits, disarms. `dispose()` clears the timer. Keep `onTick` public and untouched (raw path still available to hosts that want it).

- [ ] **Step 4: Run to verify GREEN**, then run the whole engine dir: `npx vitest run host-data/src/runtime/ssrm/`. Expected: all pass (existing suites unaffected — passthrough default).

- [ ] **Step 5: Commit**

```bash
git add packages/data/host-data/src/runtime/ssrm/SsrmServer.ts packages/data/host-data/src/runtime/ssrm/index.ts packages/data/host-data/src/runtime/ssrm/engineContract.test.ts
git commit -m "feat(data): revision-stamped windowed flush in the SSRM engine (default passthrough)"
```

---

### Task 3: Hub fans out from flush events; plane wires publishWindowMs from provider cfg

**Files:**
- Modify: `packages/data/host-data/src/runtime/ssrm/SsrmPlane.ts` (construct `SsrmServer` with `publishWindowMs` from `cfg.publishWindowMs ?? 0` and the hub's injectable timers; expose `onFlush`, `rowsForKeys`, `dispose`)
- Modify: `packages/data/host-data/src/runtime/worker/SharedWorkerDataServicesHub.ts` (`ensureSsrmPlane` subscribes `plane.onFlush(...)` instead of `plane.onTick(...)`; `disposeSsrmPlane` calls `plane.dispose()`)
- Test: `packages/data/host-data/src/runtime/worker/hubSsrmViewport.test.ts` (extend)

**Interfaces:**
- Consumes: `SsrmFlushEvent` from Task 2.
- Produces: `SsrmPlane.rowsForKeys(keys: string[]): Row[]` (reads fresh rows from the store — this is what makes flush conflation "free": payload built at flush time is automatically last-value-wins). The wire `SsrmTickEvent` shape is unchanged — `event.rows` now carries flush-fresh rows and `event.revision` the flush revision, so **no client change is needed**.

- [ ] **Step 1: Write the failing hub test** (append to `hubSsrmViewport.test.ts`; the file already has `makePort`, `ssrmCfg`, `emitRef`, `ssrmTicks`, `tickRows` helpers — reuse them; add a cfg variant and the hub's fake-timer option, following the `fakeSetTimer` pattern in `SharedWorkerDataServicesHub.test.ts` lines ~75–100):

```ts
describe('hub windowed fan-out', () => {
  it('publishes ONE conflated tick per window with flush-fresh rows', () => {
    const timers = makeFakeTimers(); // copy helper from SharedWorkerDataServicesHub.test.ts
    const hub = new SharedWorkerDataServicesHub({
      setTimer: timers.set, clearTimer: timers.clear,
    });
    const port = makePort();
    hub.handleRequest(port, {
      kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data',
      cfg: { ...ssrmCfg(), publishWindowMs: 200 } as never,
    });
    emitRef?.({ status: 'loading' });
    emitRef?.({ rows: [{ id: 'a', px: 1 }, { id: 'b', px: 1 }], replace: true });
    emitRef?.({ status: 'ready' });
    hub.handleRequest(port, {
      kind: 'ssrm-set-viewport', providerId: 'p1', sessionId: 's1',
      keys: ['a', 'b'], scope: { blockKey: 'b0', queryId: 'q1', hasFilter: false },
    });
    const before = ssrmTicks(port).length;

    emitRef?.({ rows: [{ id: 'a', px: 2 }] });
    emitRef?.({ rows: [{ id: 'a', px: 3 }] }); // same key twice in window
    emitRef?.({ rows: [{ id: 'b', px: 2 }] });
    expect(ssrmTicks(port).length).toBe(before); // window open

    timers.tick();
    const delivered = ssrmTicks(port).slice(before);
    expect(delivered).toHaveLength(1);
    const rows = (delivered[0] as never as { event: { rows: Array<{ id: string; px: number }> } }).event.rows;
    // Conflated: 'a' once, carrying the LAST value.
    expect(rows.find((r) => r.id === 'a')?.px).toBe(3);
    expect(rows).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify RED** — ticks currently arrive per frame (3 ticks, not 0-then-1).
- [ ] **Step 3: Implement** — `SsrmPlane` builds `SsrmServer` with `publishWindowMs: cfg.publishWindowMs ?? 0` plus the timers the hub already injects for its own sweepers (thread `setTimer`/`clearTimer` from the hub through `ensureSsrmPlane` into the plane constructor). Hub: replace the `plane.onTick((event) => this.fanSsrmTick(...))` subscription with `plane.onFlush((flush) => this.fanSsrmFlush(providerId, plane, flush))` where `fanSsrmFlush` reuses the existing per-session body of `fanSsrmTick` but sources rows via `plane.rowsForKeys(interestedKeys)` (and `plane.enrichRows`) instead of `event.rows`; the `wantsUnmatchedRows` full-set path uses `plane.rowsForKeys(flush.keys)`. Keep the existing `fanSsrmTick` name if simpler — the test only observes the wire.
- [ ] **Step 4: Run hub + engine + client suites** — `npx vitest run host-data/src/runtime/`. Expected: all green (default 0 keeps existing tests frame-coupled).
- [ ] **Step 5: Commit** — `git commit -m "feat(data): hub fans SSRM ticks from windowed flushes with flush-fresh rows"`

---

### Task 4: Status bar refreshes on ticks, not on a 150 ms poll

**Files:**
- Modify: `packages/react-grid/grid/src/ssrm/createSsrmStatusBar.tsx`
- Test: `packages/react-grid/grid/src/ssrm/createSsrmStatusBar.test.tsx` (extend)

**Interfaces:**
- Consumes: `provider.onSsrmTick(handler): Unsubscribe` (already on `ISsrmDataProvider`).
- Produces: no API change; `refreshThrottleMs` becomes the *minimum spacing* between tick-driven loads, with a 2 s idle fallback poll.

- [ ] **Step 1: Write the failing test** (append; run from `packages/react-grid`):

```tsx
it('reloads on tick arrival instead of free-running polling', async () => {
  vi.useFakeTimers();
  const tickHandlers: Array<() => void> = [];
  const p = {
    getStatusBar: vi.fn(async () => ({
      totalRows: 1, filteredRows: 1, selectedRows: 0, aggregations: [], revision: 1,
    })),
    onSsrmTick: (h: () => void) => { tickHandlers.push(h); return () => {}; },
  } as never;
  render(<SsrmTotalRowsStatusPanel api={api} provider={p} refreshThrottleMs={100} />);
  await vi.advanceTimersByTimeAsync(0);
  const initial = (p as { getStatusBar: { mock: { calls: unknown[] } } }).getStatusBar.mock.calls.length;

  tickHandlers.forEach((h) => h());
  await vi.advanceTimersByTimeAsync(100);
  expect((p as never as { getStatusBar: { mock: { calls: unknown[] } } }).getStatusBar.mock.calls.length)
    .toBe(initial + 1);

  // No ticks: only the slow 2s fallback may fire, not a 150ms free-run.
  await vi.advanceTimersByTimeAsync(1_000);
  expect((p as never as { getStatusBar: { mock: { calls: unknown[] } } }).getStatusBar.mock.calls.length)
    .toBe(initial + 1);
  vi.useRealTimers();
});
```

- [ ] **Step 2: RED** — current code polls every `refreshThrottleMs` (150 ms), so the 1 s advance adds ~6 calls.
- [ ] **Step 3: Implement** in the panel effect: subscribe `provider.onSsrmTick` when available → schedule `load()` throttled to `refreshThrottleMs` (leading edge, one trailing); replace `setInterval(load, refreshThrottleMs)` with `setInterval(load, 2_000)` as the no-tick fallback (mock/status-only hosts). Unsubscribe in cleanup.
- [ ] **Step 4: GREEN** + full ssrm dir: `npx vitest run grid/src/ssrm/`.
- [ ] **Step 5: Commit** — `git commit -m "perf(grid): SSRM status panels refresh on ticks with idle fallback, not free-running polls"`

---

### Task 5: Memo sized by live session count; prove ten sorts share one filter scan

**Files:**
- Modify: `packages/data/host-data/src/runtime/ssrm/QueryEngine.ts` (add `setOrderCacheSize(n: number): void` — mutable field replaces the readonly; evict LRU down if shrunk)
- Modify: `packages/data/host-data/src/runtime/ssrm/SsrmServer.ts` (on `setViewportInterest`/`clearViewportInterest`, call `this.query.setOrderCacheSize(Math.max(24, this.viewportInterest.size * 8))`)
- Test: `packages/data/host-data/src/runtime/ssrm/QueryEngine.cache.test.ts` (extend)

**Interfaces:**
- Produces: `QueryEngine.setOrderCacheSize(n: number)`; sizing rule `max(24, sessions × 8)` (a blotter consumes up to 4 memo kinds + headroom for filter variants).

- [ ] **Step 1: Failing tests:**

```ts
it('ten sorts of one filter share a single filtered-set scan', () => {
  const { store, engine } = seeded(50);
  const filterModel = { book: { filterType: 'text', type: 'equals', filter: 'A' } };
  const spy = vi.spyOn(store, 'iterate');
  for (let s = 0; s < 10; s++) {
    engine.getRows({ ...base, filterModel, sortModel: [{ colId: 'px', sort: s % 2 ? 'asc' : 'desc' }], startRow: 0, endRow: 5 });
  }
  // One store scan for the shared filtered set; sorts memoise independently.
  expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
});

it('grows the memo with session count so 10 blotters do not thrash', () => {
  const s = new SsrmServer({ keyColumn: 'id' });
  for (let i = 0; i < 10; i++) {
    s.setViewportInterest(`sess${i}`, ['a'], { blockKey: 'b0', queryId: `q${i}` });
  }
  // 10 sessions × 8 = 80 — verify via distinct query shapes all staying warm:
  s.replaceSnapshot(Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, px: i })));
  const spy = vi.spyOn(s.store, 'iterate');
  for (let q = 0; q < 30; q++) {
    s.getRows({ ...base, filterModel: { px: { filterType: 'number', type: 'greaterThan', filter: q } }, startRow: 0, endRow: 5 });
  }
  spy.mockClear();
  for (let q = 0; q < 30; q++) {
    s.getRows({ ...base, filterModel: { px: { filterType: 'number', type: 'greaterThan', filter: q } }, startRow: 0, endRow: 5 });
  }
  expect(spy).not.toHaveBeenCalled(); // all 30 shapes still memoised
});
```

- [ ] **Step 2: RED** — the second test fails with the static 24-entry LRU (30 shapes × 2 kinds evict each other).
  Note: if the FIRST test also fails, that is a genuine finding (the filtered-scan memo is not shared as believed) — fix `collectFilteredCached` keying before proceeding, do not weaken the test.
- [ ] **Step 3: Implement**, **Step 4: GREEN** (`npx vitest run host-data/src/runtime/ssrm/`), **Step 5: Commit** — `git commit -m "perf(data): SSRM query memo scales with live session count"`

---

### Task 6: Per-session expression rules

**Files:**
- Modify: `packages/data/host-data/src/runtime/ssrm/QueryEngine.ts` (rules + compiled keyed by `sessionId ?? ''`; `configureExpressions(rules, sessionId?)`; `enrich(row, sessionId?)` resolves session rules ?? global; `getRows(request, sessionId?)`, `enrichRows(rows, sessionId?)`, `calculatedFields(sessionId?)`)
- Modify: `packages/data/host-data/src/runtime/ssrm/SsrmServer.ts` + `SsrmPlane.ts` (thread `sessionId?` through the same methods; `clearViewportInterest` also drops that session's rules)
- Modify: `packages/data/host-data/src/runtime/protocol.ts:414-419` (`sessionId?: string` on `SsrmConfigureExpressionsRequest`)
- Modify: `packages/data/host-data/src/runtime/client/SharedWorkerDataServicesClient.ts:704-712` (`ssrmConfigureExpressions(providerId, rules, sessionId?)`)
- Modify: `packages/data/host-data/src/provider/SsrmProviderClientAdapter.ts` (`configureExpressions` sends `this.sessionIdOrNull ?? undefined`)
- Modify: `packages/data/host-data/src/runtime/worker/SharedWorkerDataServicesHub.ts` (`handleSsrmRequest` passes `req.sessionId` to `plane.configureExpressions`; `ssrm-get-rows` already carries `sessionId` — pass it to `plane.getRows`; flush fan enriches per session: `plane.enrichRows(rows, subId)`)
- Test: extend `engineContract.test.ts` + `hubSsrmViewport.test.ts`

**Interfaces:**
- Produces: `configureExpressions(rules: ExpressionRule[], sessionId?: string)` everywhere in the chain; omitted `sessionId` = global rules (exact current behaviour — the expression bridge keeps working unchanged until hosts opt in).

- [ ] **Step 1: Failing engine test** (append to `engineContract.test.ts`):

```ts
describe('per-session expression rules', () => {
  it('two sessions with different calculated columns never see each other's', () => {
    const engine = new SsrmServer({ keyColumn: 'id' });
    engine.replaceSnapshot([{ id: 'a', px: 10 }]);
    engine.configureExpressions([{ id: 'c1', kind: 'calculated', field: 'twice', expression: '[px] * 2' }], 'sessA');
    engine.configureExpressions([{ id: 'c2', kind: 'calculated', field: 'half', expression: '[px] / 2' }], 'sessB');

    const rowA = engine.getRows({ ...BASE }, 'sessA').rowData[0];
    const rowB = engine.getRows({ ...BASE }, 'sessB').rowData[0];
    expect(rowA.twice).toBe(20);
    expect(rowA.half).toBeUndefined();
    expect(rowB.half).toBe(5);
    expect(rowB.twice).toBeUndefined();
  });

  it('sessionless configure keeps today's global behaviour', () => {
    const engine = new SsrmServer({ keyColumn: 'id' });
    engine.replaceSnapshot([{ id: 'a', px: 10 }]);
    engine.configureExpressions([{ id: 'g', kind: 'calculated', field: 'g', expression: '[px] + 1' }]);
    expect(engine.getRows({ ...BASE }, 'anybody').rowData[0].g).toBe(11);
  });
});
```

- [ ] **Step 2: RED**, **Step 3: implement engine layer**, **Step 4: GREEN on engine dir.**
- [ ] **Step 5: Failing hub test** — session A configures rules via the RPC with `sessionId`, session B without; assert A's `ssrm-get-rows` reply rows carry A's calculated field and B's do not. Reuse the attach/emit scaffolding from `hubSsrmViewport.test.ts`; the RPC reply arrives as an `ssrm-rpc` event on the port (`getRows` field).
- [ ] **Step 6: Implement transport thread-through** (protocol, client, adapter, hub). **Step 7: GREEN** on `npx vitest run host-data/src/runtime/ host-data/src/provider/`.
- [ ] **Step 8: Grid regression** — `cd packages/react-grid && npx vitest run grid/src/widget/useSsrmExpressionBridge.lifecycle.test.tsx widgets-react/src/container/ssrm-markets-grid-container/`. Expected: green untouched (bridge stays global until hosts pass a session).
- [ ] **Step 9: Commit** — `git commit -m "feat(data): per-session SSRM expression rules — ten customised blotters stop clobbering each other"`

---

### Task 7: Observability — memo and flush counters in stats and hub introspection

**Files:**
- Modify: `packages/data/host-data/src/runtime/ssrm/QueryEngine.ts` (count `memoHits`/`memoMisses` in `memo()`; expose `getMemoStats()`)
- Modify: `packages/data/host-data/src/runtime/ssrm/SsrmServer.ts` (`getStats()` gains `sessions`, `memoHits`, `memoMisses`, `flushes`, `updatesAccumulated`, `keysFlushed` — conflation ratio derivable)
- Modify: `packages/data/host-data/src/runtime/worker/hubIntrospect.ts` (per-provider `ssrm?: <the stats object>` via `this.ssrmPlanes.get(id)?.plane.getStats()` — follow the file's existing row-building pattern)
- Test: extend `engineContract.test.ts` + `packages/data/host-data/src/runtime/worker/hubCatalogRpc.test.ts` if introspect is covered there (check `grep -l buildIntrospect host-data/src/runtime/worker/*.test.ts` and extend that file)

- [ ] **Step 1: Failing engine test:**

```ts
it('counts memo hits/misses and flush conflation', () => {
  const engine = new SsrmServer({ keyColumn: 'id' });
  engine.replaceSnapshot([{ id: 'a', px: 1 }]);
  engine.getRows(BASE); engine.getRows(BASE);
  const s = engine.getStats();
  expect(s.memoMisses).toBeGreaterThanOrEqual(1);
  expect(s.memoHits).toBeGreaterThanOrEqual(1);
  expect(s.sessions).toBe(0);
  expect(s.flushes).toBeGreaterThanOrEqual(1);
});
```

- [ ] **Step 2: RED → implement → GREEN → introspect wiring + its test → commit** — `git commit -m "feat(data): SSRM plane observability — memo and flush-conflation counters in stats and introspect"`

---

### Task 8: Consistency acceptance, seed opt-in, bench, docs, full gate

**Files:**
- Test: extend `engineContract.test.ts` (acceptance) 
- Modify: `apps/source/star-demo-ssrm/public/seed.json` (provider payload gains `"publishWindowMs": 200`)
- Modify: `scripts/bench-ssrm.mjs` (after the live-ticks section: construct a windowed engine with injected timers, pump 25 frames, fire the window, report flushes + conflation ratio vs passthrough)
- Modify: `docs/current-features.md` (SSRM query-plane section: flush window, per-session rules, session-scaled memo, `./ssrm-engine` export, observability — one bullet each)
- Modify: `docs/latest/ssrm-engine.md` (add `onFlush` to the publish contract)

- [ ] **Step 1: Write the acceptance tests** — the user's stated requirement, verbatim in test form:

```ts
describe('cross-grid consistency acceptance', () => {
  const CRITERIA = {
    ...BASE,
    filterModel: { book: { filterType: 'text', type: 'equals', filter: 'A' } },
    sortModel: [{ colId: 'px', sort: 'desc' as const }],
    valueCols: [{ field: 'px', aggFunc: 'sum' }],
  };

  it('two sessions with identical criteria get the IDENTICAL result at one revision', () => {
    const engine = new SsrmServer({ keyColumn: 'id' });
    engine.replaceSnapshot(Array.from({ length: 1000 }, (_, i) => ({
      id: `r${i}`, book: i % 2 ? 'A' : 'B', px: i,
    })));
    const a = engine.getRows(CRITERIA, 'gridA');
    const b = engine.getRows(CRITERIA, 'gridB');
    expect(b.grandTotalData).toBe(a.grandTotalData); // same memo object — bit-identical
    expect(b.rowData).toEqual(a.rowData);
  });

  it('a spike that retreats within one window leaves only the final value, for every grid', () => {
    const t = fakeTimers();
    const engine = new SsrmServer({
      keyColumn: 'id', publishWindowMs: 200, setTimer: t.set, clearTimer: t.clear,
    });
    engine.replaceSnapshot([{ id: 'a', book: 'A', px: 10 }, { id: 'b', book: 'A', px: 20 }]);
    const sumBefore = engine.getRows(CRITERIA).grandTotalData?.px;
    engine.upsert([{ id: 'a', px: 1_000_000 }]); // spike…
    engine.upsert([{ id: 'a', px: 12 }]);        // …and retreat, same window
    t.fire();
    const sumA = engine.getRows(CRITERIA, 'gridA').grandTotalData?.px;
    const sumB = engine.getRows(CRITERIA, 'gridB').grandTotalData?.px;
    expect(sumA).toBe(32);          // only the final value — never the spike
    expect(sumB).toBe(sumA);
    expect(sumBefore).toBe(30);
  });
});
```

- [ ] **Step 2: Run** — expected GREEN by construction after Tasks 2–6; if any fails, that is a real defect in a prior task — fix there, not here.
- [ ] **Step 3: Seed opt-in** — add `"publishWindowMs": 200` beside `"keyColumn": "positionId"` in the star-demo-ssrm seed's data-provider payload; run `node apps/source/star-demo-ssrm/scripts/validate-seed.mjs`.
- [ ] **Step 4: Bench + e2e** — extend `scripts/bench-ssrm.mjs`, run `npm run bench:ssrm` and record windowed-vs-passthrough fan counts in the commit message. Then from `apps/`: start `stomp-view-server`, run `npx playwright test e2e/star-demo-ssrm-smoke.spec.ts e2e/ssrm-viewport-ticks.spec.ts`. The smoke's cell-tick assertion validates the 200 ms window end-to-end in the real app (20 s poll ≫ window).
- [ ] **Step 5: Docs** — `docs/current-features.md` + `docs/latest/ssrm-engine.md` updates described above.
- [ ] **Step 6: Full gate** — `cd /Users/develop/wfh/stern-bak && npx turbo typecheck build test`. Expected: 21/21 tasks.
- [ ] **Step 7: Commit** — `git commit -m "feat(ssrm): consistency acceptance, windowed publish opt-in for star-demo-ssrm, bench + docs"`

---

## Explicitly out of scope (from the recommendation tiers, deferred by design)

- Edit writeback (`ssrm-upsert` RPC) — needs its own spec; flagged as Tier-2 item 3.
- Historical `asOfDate` for SSRM — own spec (Tier-2 item 4).
- Columnar `RowStore`, quickselect cold path, Rust/WASM — Tier-4, revisit with scale numbers.
- Configurable conflation interval on the *server* and per-event firehose mode — declined earlier.

## Self-review notes

- Spec coverage: shrinkwrap → Task 1; window+consistency → Tasks 2, 3, 8; memo sizing → Task 5; per-session rules → Task 6; observability → Task 7; client alignment → Task 4. Status-bar/pill client paths beyond the panel poll stay tick-driven and inherit the window automatically (bindSsrmTicks and useFilterCounts are downstream of ticks).
- Type consistency: `SsrmFlushEvent` (Task 2) consumed by Tasks 3/8; `setOrderCacheSize` (Task 5) called from `SsrmServer`; `configureExpressions(rules, sessionId?)` signature identical across engine/plane/client/adapter in Task 6.
- Known risk, called out where it bites: Task 5's shared-filter-scan test may expose that the filtered-set memo is NOT shared across sorts — treat as a finding to fix, not a test to weaken.
