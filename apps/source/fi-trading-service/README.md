# fi-trading-service

A fixed-income trading data service: realistic positions, trades, security
master, market data, orders and tax lots, served over STOMP-on-WebSocket and
backed by a DuckDB + Parquet corpus.

It exists because the in-repo mock generator, while wide, is not a trading
dataset — every row random-walks independently, no analytic derives from a
cashflow, and trades don't reconcile to the positions they claim to belong to.
See the plan for the full rationale and the phase list.

## Status: Phase 1 of 14

What works today is the **wire**. The datasets behind it are still a synthetic
stand-in.

- [x] STOMP-over-WebSocket server: framing, sessions, destinations, snapshot
      chunking, backpressure, heartbeats, live batching
- [x] Verified compatible with the existing browser transport — the session
      tests decode every frame with the *real* client parser, and one test
      drives a real socket end to end
- [ ] Domain core: calendars, curves, cashflow analytics, instruments
- [ ] Columnar hot store, DuckDB corpus, order entry, simulators

## Run it

```bash
cd apps && npm install          # once, from the apps install root
cd source/fi-trading-service
npm run dev                     # tsx watch, or: npm run build && npm start
```

Then point a MarketsGrid blotter at it with one of the configs in
[`examples/providerConfigs.json`](./examples/providerConfigs.json). **No client
changes are required** — the browser STOMP transport takes its subscribe topic,
trigger and end token from configuration.

`GET /health` reports liveness and the live session count.

## Wire contract

```
subscribe : /snapshot/{dataset}/{clientId}
trigger   : /snapshot/{dataset}/{clientId}/{rate}[/{batchSize}]

historical, positions only:
subscribe : /snapshot/positions/{clientId}/{asOfDate}
trigger   : /snapshot/positions/{clientId}/{asOfDate}[/{batchSize}]
```

Datasets: `positions`, `trades`, `securityMaster`, `marketData`, `orders`,
`taxLots`. `{rate}` is aggregate row-updates per second, honoured exactly;
`0` means snapshot only.

Four details are load-bearing, and each is pinned by a test:

1. **Batch size is 500.** It matches the hub's `LATE_JOIN_CHUNK_SIZE` and the
   client's default `snapshotChunkSize`. When all three agree, the hub adopts
   the broadcast encoding for its replay cache for free; when they don't, every
   late-joining window forces a full re-encode of the whole cache.
2. **The snapshot sentinel must not occur in data.** The client tests
   `snapshotEndToken` as a case-insensitive *substring* against every frame
   body *before* parsing it, so a row containing the word "success" would
   truncate the snapshot and the remainder would be misread as live deltas.
   The sentinel carries `__SNAPSHOT_COMPLETE__` (and the legacy `Success:` for
   configs that omit a token), and `assertNoSentinelCollision` guards the data.
3. **Full rows on the wire, never partials.** The hub does a whole-row
   `cache.set(key, row)`, so a partial row wipes every field it omits.
   `thinDeltas` thins the hub-to-window hop only — the hub computes those
   patches itself by diffing complete rows.
4. **An 8-digit segment is a date, not a rate.** The client's
   `parseAsOfDateSegment` accepts bare `YYYYMMDD`, so
   `/snapshot/positions/trd1/20260315` is historical. We resolve it the same
   way and reject out-of-range rates explicitly.

## Layout

```
src/wire/       frame codec, parser, session, destinations, pump, batcher
src/datasets/   RowSource contract + the phase-1 synthetic book
src/config.ts   env -> typed config, clamped at the edge
```

`StompServer` is the only module that imports `ws`; everything below it depends
on the narrow `WireSocket` shape, which is what lets the whole protocol layer be
tested without a network.

## Tests

```bash
npm test
npm run test:coverage    # gate: 70% lines/statements/functions/branches
npm run typecheck
```

`src/test/support/FakeStompClient.ts` decodes with `fastStompParser` imported
straight from the platform source tree rather than a vendored copy — a copy
could drift, and the drift would be invisible exactly when it mattered.
