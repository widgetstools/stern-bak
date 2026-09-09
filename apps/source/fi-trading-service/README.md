# fi-trading-service

A fixed-income trading data service: realistic positions, trades, security
master, market data, orders and tax lots, served over STOMP-on-WebSocket and
backed by a DuckDB + Parquet corpus.

It exists because the in-repo mock generator, while wide, is not a trading
dataset — every row random-walks independently, no analytic derives from a
cashflow, and trades don't reconcile to the positions they claim to belong to.
See the plan for the full rationale and the phase list.

## Status: phases 1–8 of 14, plus the scenario and strategy layers

The **pure domain layer is complete** — every price on the book is computed,
from a factor model, through the instrument's own cashflows. A demo build is
2,905 securities and 1,758 positions across ten asset classes in ~520 ms, each
row carrying 88 fields.

- [x] **Phase 1 — wire.** STOMP-over-WebSocket: framing, sessions, destinations,
      snapshot chunking, backpressure, heartbeats, live batching. Verified
      against the existing browser transport — the session tests decode every
      frame with the *real* client parser, and one test drives a real socket
      end to end
- [x] **Phase 2 — `domain/core`.** `YYYYMMDD` int dates, the rules-based SIFMA
      calendar, seven day counts, 32nds quotation, CUSIP/ISIN/SEDOL check
      digits, xoshiro128\*\* and AS241/Cholesky
- [x] **Phase 3 — `domain/curves`.** Nelson-Siegel-Svensson with frozen decays,
      Ornstein-Uhlenbeck factors on the exact transition density, credit spreads
      decomposed in log space, the MMD muni scale, rating migration
- [x] **Phase 4 — `domain/analytics`.** Schedules, accrued interest, cashflow
      projection, price/yield, duration/convexity/DV01 off the same cashflows as
      the price, key-rate durations, yield-to-worst, effective duration
- [x] **Phase 5 — `domain/instruments`.** Treasury auction ladder, STRIPS,
      callable agencies, 650 corporate issuers with real LEIs and capital
      structures
- [x] **Phase 6.** Muni serial deals and the mortgage prepayment model — refi
      S-curve, lock-in, seasoning, seasonality, burnout
- [x] **Phase 7.** SPG capital stacks (CMBS/CLO/ABS) with derived credit support,
      plus a Hull-White trinomial lattice for callable OAS
- [x] **Phase 8.** CDS on the ISDA flat-hazard model — SNAC upfront/points, CS01,
      jump-to-default, recovery01 — keyed by `issuerId` so the bond-CDS basis is
      a join
- [x] **`domain/book`.** `LiveBook`, priced off the factor model, with tax lots
      as the only source of quantity and cost
- [x] **`scenario/`** *(not in the original plan)*. Forked markets — a state is
      forked and run forward under a different draw, giving a different but
      internally consistent history rather than a shocked book. 250 worlds x 20
      business days over 1,758 positions in 236 ms
- [x] **`strategy/`** *(not in the original plan)*. A weighted-ridge hedge solver
      that verifies its own package by re-running the same forked worlds
- [ ] **Phases 9–14.** Columnar hot store, DuckDB corpus, order entry with lot
      accounting, the simulators, the realism validation suite

**What that leaves.** One of the six datasets is served: `positions` has a
`RowSource`, and `trades`, `securityMaster`, `marketData`, `orders` and
`taxLots` are in the destination grammar with nothing behind them, so
subscribing to one is an explicit protocol error rather than a silent empty
stream. Historical as-of-date streams are refused for the same reason — see
`DatasetRegistry.resolve` in [`src/datasets/registry.ts`](./src/datasets/registry.ts).
Everything remaining is storage, persistence and the write path; the financial
modelling is done.

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

## HTTP API

The scenario and strategy layers are reached over HTTP (the browser is on
another origin, so the router handles CORS and `OPTIONS`), on the `httpHandler`
hook `StompServer` already had:

| Endpoint | Answers |
|---|---|
| `GET /api/book/summary` | what the book is — asset-class split, market value, duration |
| `POST /api/scenario/scan` | run N forked worlds, describe the loss distribution |
| `POST /api/scenario/worst` | the worst world for THIS book, and why |
| `POST /api/scenario/fork` | one world replayed with and without a named shock |
| `POST /api/strategy/solve` | solve a hedge package, then verify it on the same worlds |

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
