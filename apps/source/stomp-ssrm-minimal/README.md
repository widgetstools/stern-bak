# STOMP SSRM + MarketsGrid — minimal demo

One `HostedSsrmMarketsGrid` on a `stomp-ssrm` catalog row: STOMP snapshot +
live ticks stream into the SharedWorker's WASM engine cache; the grid reads
blocks over RPC. Grouping, pivoting (`enablePivot` via the columns tool
panel), filtering, quick search, edits and paste all run engine-side.
A second window on the same origin shares the worker, the STOMP session and
the engine cache — that is the multi-window soak `ssrm-validate2.mjs --pages 2`
drives; the checked-in app renders a single grid.

## Run

```bash
npm run app -- stomp-ssrm-minimal
```

Starts `stomp-view-server` on `ws://localhost:8081` and the demo on `:5214`.

`?rate=N` asks the broker for N aggregate row-updates/sec (default 1000,
clamped to 60000) — the one knob a load test needs.

Wire destinations match the CSRM demo (`TRADER001`, snapshot end token `Success`).
