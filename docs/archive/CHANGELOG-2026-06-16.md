# Changelog — 2026-06-16 onward

Summary of features, improvements, and bug fixes landed **on or after 2026-06-16**.
For work through 2026-06-15 see [`CHANGELOG-2026-06-15.md`](./CHANGELOG-2026-06-15.md).

**Status key**

| Status | Meaning |
|--------|---------|
| **Committed** | Present in git history (`git log --since=2026-06-16`) |
| **Working tree** | Implemented locally; not yet committed at time of writing |

---

## Committed (git)

| Date | Commit | Summary |
|------|--------|---------|
| 2026-06-16 | `7248d735` | docs: add changelog for work since 2026-06-15 |
| 2026-06-16 | `6e71b3de` | build: build apps from source, drop tarball deps, exclude Angular |
| 2026-06-16 | `f1713025` | chore: pin playwright-core override to 1.61.0-beta build |
| 2026-06-16 | `3c4be91d` | fix(build): stable dep ranges, standalone propagate, remove stockflux demo |
| 2026-06-16 | `49c39a4b` | perf(host-data): default snapshots to columnar + small first replay chunk |
| 2026-06-16 | `3ed96863` | revert(host-data): drop small first replay chunk (no-op behind reassembler) |
| 2026-06-16 | `73d3c96c` | feat(stomp-view-server): randomize currentPrice + pnl per live tick |
| 2026-06-16 | `bdea0951` | chore(stomp-view-server): default to 20k high-frequency + check in .env |

### Build & tooling (`6e71b3de`, `3c4be91d`, `f1713025`)

- Apps consume `@wellsfargo-starui/*` from **source** (Vite aliases + workspace symlinks); tarball `file:` deps removed from the apps workspace.
- Angular buckets excluded from the consumer build/typecheck/test pipeline.
- `propagate.mjs` runs standalone; dependency ranges stabilized.
- `stockflux` demo removed.

### Host-data columnar default (`49c39a4b`, `3ed96863`)

- Snapshot replay encoding defaults to **columnar** where applicable.
- A “small first replay chunk” experiment was reverted — behavior was a no-op behind `SnapshotReassembler`.

### STOMP test feed (`73d3c96c`, `bdea0951`)

- `stomp-view-server` randomizes `currentPrice` and `pnl` on each live tick for more realistic stress.
- Default profile targets **20k rows** high-frequency; `.env` checked in for reproducible local runs.

---

## Working tree — MarketsGrid / host-data / OpenFin fixes

The items below were implemented in the 2026-06-16–17 session. They are reflected in the working tree and in [`current-features.md`](../current-features.md), [`hub-fanout-optimizations.md`](../hub-fanout-optimizations.md), and [`blotter-performance-roadmap.md`](../blotter-performance-roadmap.md), but were **not yet committed** when this document was written.

---

### 1. Fan-out worker pool (multi-blotter STOMP performance)

**Problem:** With three or more blotter windows open, the SharedWorker’s serial `postMessage` fan-out loop saturated and the third+ window felt stalled during snapshot replay and live ticks.

**Solution:** Dedicated fan-out workers parallelize per-subscriber delivery off the SharedWorker thread.

| Aspect | Detail |
|--------|--------|
| Model | **One fan-out worker per hub `subId`** — spawned on `attach`, terminated on `detach` / port close |
| Hub keeps | STOMP parse, cache upsert, binary/columnar encode (once per frame) |
| Workers do | Prepare per-subscriber envelopes; hub posts to the client `MessagePort` |
| Bypass | `delta-bin`, large buffered `delta-patch`, and `stats` post **directly from the hub** (no extra hop) |
| Disable | `localStorage.STARUI_FANOUT_POOL_SIZE = '0'` (enabled by default when `Worker` is available) |
| Asset | `data-services-fanout-worker.mjs` (sibling of `data-services-worker.mjs`) |

**Hardening**

- Partial fan-out failure retries only failed `subId`s inline — no duplicate delivery.
- Worker `error` handler + broadcast job timeout fail fast with inline hub fallback.
- Stale-slot recycle on re-attach; evict order documented in pool.
- `stats` bypasses fan-out workers (low volume, introspect path).

**Key files**

- `packages/data/host-data/src/runtime/worker/FanOutWorkerPool.ts`
- `packages/data/host-data/src/runtime/worker/fanOutProtocol.ts`
- `packages/data/host-data/src/runtime/worker/fanOutBroadcast.ts`
- `packages/data/host-data/src/runtime/worker/fanOutWorkerEntry.ts`
- `packages/data/host-data/src/runtime/worker/SharedWorkerDataServicesHub.ts`
- `packages/data/host-data/src/runtime/worker/entry.ts`
- `packages/data/host-data/scripts/buildWorker.mjs`

**Tests:** `FanOutWorkerPool.test.ts`, `fanOutBroadcast.test.ts`, hub fan-out pool tests in `SharedWorkerDataServicesHub.test.ts`.

**Docs:** [`hub-fanout-optimizations.md` §12](../hub-fanout-optimizations.md).

---

### 2. Silent subscriber eviction (hidden OpenFin windows)

**Problem:** The hub evicts subscribers that miss heartbeats for 45s. Hidden OpenFin views throttle `setInterval`, so pings arrive late. The hub dropped the subscription **without notifying the client** — live ticks stopped with no stale banner.

**Fixes**

| Layer | Change |
|-------|--------|
| **Protocol** | `SubscriberMeta.hidden` on ping; extended grace `SUBSCRIBER_PING_TIMEOUT_HIDDEN_MS` for hidden subscribers |
| **Client** | `SharedWorkerDataServicesClient` tags heartbeats with `document.hidden`; immediate ping on `visibilitychange` → visible |
| **Hub** | `subscription-lost` event posted to client before eviction; client auto re-attaches stored subscription |
| **Fan-out pool** | Edge cases on failed/timed-out broadcasts and orphan mappings hardened |

**Key files:** `protocol.ts`, `SharedWorkerDataServicesClient.ts`, `SharedWorkerDataServicesHub.ts`.

---

### 3. OpenFin workspace state loss on view move

**Problem:** Dragging or moving a blotter view in an OpenFin workspace could lose grid profile / customization because identity was not stable across reload and pending saves were not flushed on teardown.

**Fixes (four items)**

1. **Gate grid mount until identity resolves** (`useHostedIdentity`)
   - URL `?instanceId=` / `?id=` → ready on first paint.
   - Bare OpenFin views → `instanceId: null`, `ready: false` until `fin.me.getOptions().customData` settles.
   - 3s hard timeout → `defaultInstanceId`.
   - `HostedMarketsGrid` waits for `ready` + `configManager` + `instanceId` before mounting `MarketsGridContainer`.

2. **Flush on view teardown** (`HostedMarketsGrid`)
   - `saveAll()` on `beforeunload`, `pagehide`, OpenFin view `destroyed`, and React unmount.

3. **Stamp launch URL** (`appendLaunchIdentityParams` in `hostUrl.ts`, used in `launch.ts`)
   - Every launched view URL gets `?instanceId=` and `?id=` so workspace snapshots and reloads resolve identity synchronously.

4. **Tests:** `useHostedIdentity.openfin.test.tsx`, `hostUrl.test.ts`.

---

### 4. Multi-blotter load performance (star-demo)

**Problem:** Opening more blotter instances progressively degraded — per-window cold start, shared hub contention, and STOMP provider configured for worst-case fan-out.

**Changes**

| Area | Change |
|------|--------|
| `main.tsx` | `hubInspector={false}` on `DataHubProvider` (removes dev overlay overhead) |
| `BlottersMarketsGrid.tsx` | Removed `contextLink` test harness and no-op `dataServicesMode="eager"` |
| `seed.json` (STOMP provider `dp-121e4569-…`) | `throttleMs: 100`, `conflateEnabled: true`, `conflateByKey: positionId`, `projectFields: true`, `wireFormat: columnar` |
| `seed.json` (profiles) | `animateRows: false` on streaming profiles |

**Note:** Seed changes require an empty IndexedDB or `seedConfigReload: when-changed` on existing dev databases.

**Docs:** [`blotter-performance-roadmap.md`](../blotter-performance-roadmap.md) — Tier 1 items partially applied via seed; Tier 2 item 5 marked implemented.

---

### 5. Visibility-aware throttling (background windows)

**Problem:** Background OpenFin views still decoded and applied every live tick at full rate.

**Fix** (`useProviderDataWiring`)

- Skip `applyTransactionAsync` for live ticks while `document.hidden`.
- On `visibilitychange` → visible, run one `provider.refresh()` to replay the hub cache and catch up.

**Docs:** `blotter-performance-roadmap.md` Tier 2 §5 marked ✅ implemented.

---

### 6. STOMP auto-recovery after server disconnect

**Problem:** When the STOMP server died and recovered, the provider reconnected in the hub but blotters stayed stale/read-only until a manual page reload.

**Root cause:** Reconnect ordering (`error` → `replace:true` delta → `ready`) was not handled end-to-end; snapshot subscribers did not see mid-stream restarts.

**Fixes**

| Layer | Change |
|-------|--------|
| `SnapshotReassembler` | Accept `replace:true` during `error` phase; commit buffered rows on `ready` after `error` when `loading` was missed |
| `ProviderClientAdapter` | `onReset` deliveries update snapshot subscribers (grid updates on mid-stream STOMP restart) |
| `useProviderDataWiring` | On `ready` after `error`, clear stale banner and call `provider.refresh()` for hub cache replay |

**Tests:** `SnapshotReassembler.test.ts` (reconnect ordering), `providerStaleState.test.tsx`.

---

### 7. Refresh view — UX and live-tick regression

**Context**

| Action | Behavior |
|--------|----------|
| **Refresh view** | `IDataProvider.refresh()` — hub cache replay only, no STOMP reconnect |
| **Reload from source** | `restart()` — full upstream re-fetch |

#### Bug A — No user feedback

**Before:** `refresh-provider` RPC replayed cache silently.

**After:** `replayCacheToPort` emits `status: loading` → chunked `delta-bin` → `status: ready`. `MarketsGridContainer` overlay shows “Refreshing {provider}” / “Replaying cached snapshot…” when `isRefetching && resolvedSubKey`.

#### Bug B — Live updates stop after Refresh view

**Root cause:** After cache refresh, `SnapshotReassembler` left `settled = false` and `phase = 'loading'`, so subsequent live ticks buffered in `tail` instead of reaching `onTick`.

**Fix:** After `onCacheRefresh` on `ready`, restore `settled = true` and `phase = 'ready'`.

**Test:** `SnapshotReassembler.test.ts` — live tick after cache refresh replay.

**Key files:** `SharedWorkerDataServicesHub.ts` (`replayCacheToPort`), `SnapshotReassembler.ts`, `MarketsGridContainer.tsx`.

---

### 8. Build worker source map fix

**Problem:** Renaming `defaultEntry.js` → `data-services-worker.mjs` left `//# sourceMappingURL=defaultEntry.js.map` in the bundle; Vite warned because only `data-services-worker.mjs.map` existed.

**Fix:** `buildWorker.mjs` `publishWorkerAsset()` rewrites `sourceMappingURL` and renames `.map` files for both `data-services-worker.mjs` and `data-services-fanout-worker.mjs`.

---

## Test coverage added / updated

| Suite | Coverage |
|-------|----------|
| `FanOutWorkerPool.test.ts` | Pool lifecycle, broadcast, worker errors |
| `fanOutBroadcast.test.ts` | Envelope preparation |
| `SharedWorkerDataServicesHub.test.ts` | Fan-out pool integration, `refresh-provider` replay, stale subscriber eviction |
| `SnapshotReassembler.test.ts` | STOMP reconnect ordering, cache refresh + live tick |
| `providerStaleState.test.tsx` | Stale banner clear + auto-refresh on reconnect |
| `useHostedIdentity.openfin.test.tsx` | Identity gate, URL stamp, OpenFin customData timeout |
| `hostUrl.test.ts` | `appendLaunchIdentityParams` |

---

## Manual verification checklist

Use this before treating the working-tree fixes as release-ready:

1. **Multi-blotter:** Launch 3+ blotters; confirm load time stays acceptable under live STOMP.
2. **Workspace drag:** Customize a blotter, drag view between workspace positions, restore workspace — state persists.
3. **STOMP chaos:** Stop `stomp-view-server`, wait for stale banner, restart server — blotters auto-recover without manual Reload.
4. **Refresh view:** Toolbar → Refresh view — overlay appears, rows replay, **live ticks continue**.
5. **Hidden window:** Background a blotter for >45s, bring forward — ticks resume (cache replay on visible).
6. **Reload from source:** Use when hub cache is empty after a long outage (Refresh view alone is insufficient).

---

## Known follow-ups (not in this changelog)

- E2e specs for “Refresh view → live ticks continue” and “STOMP kill/restart auto-recovery” at integration level.
- Production-build soak (not Vite dev) with N blotters on target hardware.
- Framework defaults for `throttleMs` / `conflateByKey` / `wireFormat` still require per-provider seed or ConfigService config — not global engine defaults.
- `fin.View.getCurrentSync().identity.name` as `instanceId` fallback (discussed, not implemented).
- `contextLink` can be re-enabled for link testing without `debug: true`.

---

## Related documentation

- [`MARKETSGRID_PERF_AND_MEMORY_AUDIT.md`](./MARKETSGRID_PERF_AND_MEMORY_AUDIT.md) — full-stack MarketsGrid performance + memory audit
- [`MEMORY_LEAK_AUDIT.md`](./MEMORY_LEAK_AUDIT.md) — proactive leak audit + monitoring playbook (host-data layer)
- [`hub-fanout-optimizations.md`](../hub-fanout-optimizations.md) — fan-out architecture and §12 worker pool
- [`blotter-performance-roadmap.md`](../blotter-performance-roadmap.md) — remaining performance backlog
- [`MARKETSGRID_USAGE_GUIDE.md`](../MARKETSGRID_USAGE_GUIDE.md) — production integration layers
- [`STOMP_DATAPROVIDER_MARKETSGRID_GUIDE.md`](../STOMP_DATAPROVIDER_MARKETSGRID_GUIDE.md) — STOMP + MarketsGrid wiring
- [`PROFILE_PERSISTENCE.md`](../PROFILE_PERSISTENCE.md) — identity scoping in production
- [`E2E_STATUS.md`](./E2E_STATUS.md) — Playwright inventory (`stale-data-disconnect`, `hosted-markets-grid`, OpenFin suite)
