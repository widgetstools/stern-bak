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
/ 3.96MB; `to_json` 500 rows ~8ms. See the plan for the read-out and gate
verdict. Not yet covered here: SharedWorker hosting, window-side Arrow
materialization, nested-feed flattening.
