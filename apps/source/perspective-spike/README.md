# Perspective engine spike

Phase 0 benchmark for [`docs/wasm-data-plane-plan.md`](../../../docs/wasm-data-plane-plan.md)
§5b — does the Perspective WASM engine clear the ingest gate for the
20k rows/sec, multi-blotter roadmap? **Not a product app**: no platform
aliases, no grid, no hub. It measures the engine in isolation so the
numbers are attributable.

## What it measures

1. Snapshot load — N rows as a JSON-rows string → indexed `Table`
2. Sustained ingest — `rate` rows/sec of **pre-generated** JSON-string
   update batches (7-column sparse ticks); generation never contaminates
   timing
3. Row-mode `view.on_update` Arrow deltas — count, bytes, callback cost
4. `to_arrow()` of the whole table and `to_json()` of a 500-row window
5. Page main-thread health during ingest (the `Client` runs there)

The runner additionally attaches CDP to the engine worker and samples
its CPU mid-run.

## Run

```bash
cd apps && npm install                  # once — installs @perspective-dev/client
cd source/perspective-spike && npm run dev          # http://localhost:5214
# in another terminal, from apps/:
node source/perspective-spike/scripts/run.mjs 20000 20 20000
```

Query params: `?rate=&seconds=&rows=`. Results land on `window.__spike`.

## Results so far (2026-08-30, @perspective-dev/client 5.3.0)

| rows/sec | engine busy | update p50 / p99 | Arrow delta / batch | main thread |
|---|---|---|---|---|
| 4,000 | ~19% | 1 / 2 ms | 24KB | 60fps |
| 20,000 | ~48% | 2 / 4 ms | 95KB | 60fps |
| 40,000 | ~80% (knee) | 3 / 17 ms | 182KB | 60fps |

Snapshot load 421ms (20k rows, 13.5MB JSON); `to_arrow` all rows ~60-80ms
/ 3.96MB; `to_json` 500 rows ~8ms.

## Hosting test (multi-window, one engine in OUR SharedWorker)

```bash
# dev server on :5214, then from apps/:
node source/perspective-spike/scripts/runMulti.mjs 3 20000 15   # windows, rate, seconds
```

`src/hub.worker.ts` hosts the engine via `src/engineHost.ts` (a clean
per-port-session host — Perspective's own worker shim assumes a single
session and cannot serve multiple windows; its host classes aren't
exported, and the shipped `perspective-server.wasm` is a stage-0
self-extracting wrapper, so the engine bytes come from the client's
`init` message). `multi.html` windows open the hosted table by name and
subscribe to row-mode deltas; the last window (`?leader=1`) starts ingest.

Result (3 windows + hub, 20k rows/sec): 19,728 rows/s; every window
received 740/740 deltas at 60fps; engine ~90% busy (vs ~48% single-client)
because each window View serializes its own delta — see the plan's
"one hub-side view, relay bytes" finding.

## Replicated mode (per-subscriber views, parallel by construction)

```bash
node source/perspective-spike/scripts/runReplica.mjs 3 20000 15 200   # windows, rate, seconds, batchMs
```

`replica.html` windows take one Arrow snapshot from the hub, run their
OWN engine (`perspective.worker()`, dedicated worker), apply the hub's
single relayed Arrow delta stream (`update(arrow)`), and host their own
filtered/sorted view on the replica. The runner profiles the hub shared
worker and one replica worker.

Result (3 windows, 20k rows/sec, 200ms batches): hub engine **51%** and
flat in window count; each replica engine **36%** on its own core; every
window 74/74 deltas applied, own view 74/74 updates, 60fps.

## AG Grid client-side row model from the Arrow stream

```bash
node source/perspective-spike/scripts/runCsrm.mjs 1 20000 15 200   # windows, rate, seconds, batchMs
```

`csrm.html` hosts a real AG Grid (CSRM, 20k rows, `getRowId`,
`asyncTransactionWaitMillis: 200`): Arrow snapshot → `apache-arrow` decode →
row objects → grid; per relayed delta: decode → row objects →
`applyTransactionAsync({ update })`.

Result (1 window, 20k rows/sec, 4,000-row deltas): per delta 0.8ms decode +
19.7ms materialize + 0.02ms apply-call (~10% of the main thread), zero
long tasks, 59fps, hub engine 31%. Caveat: N windows in one Playwright
context share ONE renderer thread, so multi-window CSRM numbers here
measure N grids on one thread (OpenFin views each get their own).

See the plan for read-outs and gate verdicts. Not yet covered:
nested-feed flattening.
