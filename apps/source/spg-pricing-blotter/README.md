# SPG Pricing Blotter

A structured-products trader's book over the platform's **server-side row
model**, backed by a real server: SQLite is the source of truth, a
STOMP-over-WebSocket feed streams it into the SharedWorker WASM engine, and
`MarketsGrid` serves blocks from there. 2,500 CLO/CMBS/RMBS/ABS/CDO tranches,
seeded from a committed file.

```
npm run dev            # server (:8091) + app (:5401) together
npm run server         # just the server
npm run server:reset   # drop server/data → next boot re-seeds from the seed file
npm run seed:regenerate# rebuild server/seed/spg-positions.json (deterministic)
```

## The demo's spine — the write lifecycle

Every write path the grid has funnels through ONE seam
(`src/trading/serverWriteProvider.ts` wraps `ISsrmDataProvider.applyEdits`),
so each of these inherits the same commit lifecycle with no per-feature
wiring:

- a double-click cell edit,
- **a paste covering hundreds of rows** of Price / Prior Px (select a range,
  paste from Excel — the SSRM paste guard refuses if target rows aren't
  loaded, then the batch commits as one),
- Smart Edit / Bulk Update / plus-minus / undo-redo (the editing-core seam),
- the CSV import's Save.

Cell states, painted from `CellStateStore` via `cellClassRules`:

| state | look | meaning |
|---|---|---|
| staged | amber fill | value lives only in this grid (CSV import before Save) |
| **pending** | **yellow border** | sent; the server has NOT committed yet |
| — | clear + flash | committed — the flash is the server's own post-commit echo |
| failed | red border | server refused (unknown cusip, non-writable field) — click the header chip to clear |

The confirmation is honest end-to-end: the server commits to SQLite, waits
`SPG_ACK_DELAY_MS` (default 650, so the yellow window is visible; try
`SPG_ACK_DELAY_MS=3000 npm run server`), acks the REST call (border clears),
and broadcasts the re-derived row over the feed — which is why **Mkt Value**
and **Px Chg %** (server-computed) move a beat after the price you typed, and
why the worker's edit overlay releases (the echo confirms it).

## CSV bulk import

**Import CSV** takes a `cusip,price` file (header/BOM/quotes tolerated,
per-line errors reported). Rows are validated against the server first — an
unknown cusip can never upsert a phantom row into the engine — previewed
old → new, then **staged**: applied to the grid amber, committed only by
**Save n to server** (or rolled back by **Discard**, which restores the
server's rows).

## What it exercises in SSRM MarketsGrid

Engine-backed sort/filter on every column (typed `maturityDate` date column
sorts/filters as instants), quick search, set filters with server-scoped
value lists, row grouping + aggregation from the columns tool panel,
engine-backed status bar counts, profiles (save/restore incl. group
expansion), formatting + editing toolbars, Excel export from the engine's
filtered book, the block cache + transaction-first ticks (ambient drift on
yield/spread/PnL streams live; marks only move when a trader moves them).

## Server

`server/server.mjs` — plain Node (`node:http` + `ws` + `node:sqlite`, zero
native deps). STOMP contract identical to `stomp-view-server` (what the
`stomp-ssrm` provider speaks): subscribe `/snapshot/positions/{clientId}`,
trigger `/snapshot/positions/{clientId}/{driftRowsPerSec}/{batchSize}`,
`snapshot` batches → `snapshot-complete` ("Success…") → `live-update`s. REST:
`POST /api/updates` (per-row verdicts; one bad row never strands a 500-row
paste), `POST /api/lookup`, `GET /health`. The SQLite file survives restarts
(`server/data/`, gitignored); writable columns are whitelisted server-side.
