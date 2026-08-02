# STOMP FI View Server

TypeScript STOMP fixture server: **synthetic fixed-income positions/trades** over WebSocket, snapshot → **Success:** completion line → live updates **only for rows delivered in that snapshot**.

Default listen: **8081** (so it can run beside the original on 8080).

### Connecting from existing Node clients

Use **`ws://localhost:8081`**, not `8080`. Options:

- **Environment:** `WS_URL=ws://localhost:8081` before running your client.

If nothing listens on `8081`, the TCP connection fails (`ECONNREFUSED`). Start the view server: `cd apps/source/stomp-view-server && npm run build && npm start`.

### Troubleshooting

| Symptom | Likely cause |
|--------|----------------|
| Connection refused | View server not running, or wrong port (use **8081**). |
| TCP connects but STOMP hangs | Rare CRLF issue — fixed in server frame parsing; rebuild `stomp-view-server`. |
| Browser app still fails | Point `WebSocket` / stomp URL at **`ws://<host>:8081`** (same host as where the server runs). |
| Process exits with **code 130** or you see **`^C`** in the terminal | You pressed **Ctrl+C** — that stops the server on purpose. |
| Server disappears mid-run (no **^C**) | Often **out-of-memory**: 20k rows with `ROW_PROFILE=wide` is heavy. Lower **`DEFAULT_SNAPSHOT_ROWS`** / **`snapshot-rows`** header, or run Node with more heap: `NODE_OPTIONS=--max-old-space-size=8192 npm start`. |
| Error logged from **`[snapshot]`** / **`[live]`** | An exception during send/update — check the stack trace; the server should stay up after our handlers log it. |

## Protocol compatibility

Protocol contract (`src/protocol/contract.ts`):

- `CONNECT` / `STOMP` → `CONNECTED` (`version:1.2`, `server:stomp-fixed-income/1.0.0`, `heart-beat:0,0`)
- Subscribe: `/snapshot/positions`, `/snapshot/trades`, or `/snapshot/{type}/{clientId}`
- Subscribe (historical positions): `/snapshot/positions/{clientId}/{asOfDate}` — **separate from live** so concurrent live + historical providers do not cross-receive
- Trigger (live stream): `/snapshot/{type}/{rate}[/{batchSize}]` or `/snapshot/{type}/{clientId}/{rate}[/{batchSize}]`
- Trigger (historical positions, snapshot only): `/snapshot/positions/{clientId}/{asOfDate}[/{batchSize}]` — subscribe to the same path **without** `{batchSize}`; `asOfDate` is `YYYY-MM-DD` or `YYYYMMDD`; every row gets that `asOfDate`; **no live updates** after completion
- Snapshot batches: `content-type:application/json`, `message-type:snapshot` (legacy path includes these)
- Completion: body starts with `Success: All …`
- Live: JSON array of one-or-more rows, `message-type:live-update`

## Rate semantics — the trigger `rate` is honoured exactly

The `{rate}` segment of the live trigger is the target **aggregate
row-updates per second**. `/snapshot/positions/TRADER001/10000` means
10 000 row-updates/sec — delivered exactly, via an elapsed-time budget
(fractional rows carry across ticks), regardless of timer resolution.
The live loop ticks every `LIVE_TICK_MS` (default 40 ms), so
10 000/sec arrives as ~25 frames/sec × ~400 rows. Requests above
`MAX_LIVE_ROWS_PER_SEC` are clamped (logged). `rate=0` = snapshot only.

**Update shape (both modes).** Rows are drawn **uniformly at random**
from the delivered set; each drawn row mutates a random, correlated
subset of at most **15 hot trading fields** (price → valuations → PnL,
spread ↔ yield/zSpread/OAS, DV01/PV01/CS01; small subsets dominate) —
never the whole record, because real feeds don't re-mark every field
at once. Positions pool: `currentPrice`, `marketValue`, `totalValue`,
`pnl`, `unrealizedPnl`, `dailyPnl`, `mtdPnl`, `ytdPnl`, `yield`,
`spread`, `zSpread`, `oas`, `dv01`, `pv01`, `cs01`. Trades pool:
`price`, `yield`, `spread`, `accruedInterest`, `totalConsideration`,
`fxRate`, `baseCurrencyAmount`.

**Snapshot delivery is immediate.** Batches pump back-to-back from the
moment the trigger arrives (setImmediate between batches — no fixed
inter-batch delay); the only wait state is socket backpressure (16 MB
high-water, 5 ms retry).

## Extension (optional)

Clients may add optional STOMP headers on the **SEND** frame:

- **Snapshot size** (1k–20k by default env bounds): `snapshot-rows: 15000` — alias `row-count`.
- **Sparse live mode** — `live-mode: sparse` (alias `sparse-erratic`) for **positions** only: each live frame carries **partial row JSON** (`positionId` + the changed hot fields) instead of full rows. Same rate semantics and random-row/hot-field selection as the default mode; only the wire shape differs. Set env `LIVE_MODE=sparse` to make sparse the default for all streams.

Existing clients that omit these headers keep prior behavior with server defaults. (The old `updates-per-tick` header is gone — the trigger `rate` alone now sets the aggregate update rate.)

Example (stompjs):

```javascript
// Full-row live updates — exactly 10 000 row-updates/sec, random rows,
// ≤15 hot fields changed per row, snapshot batches of 500
client.send('/snapshot/positions/TRADER001/10000/500', { 'snapshot-rows': '20000' }, '');

// Sparse — same 10 000/sec but partial field deltas on the wire
client.send('/snapshot/positions/TRADER001/10000/500', {
  'snapshot-rows': '20000',
  'live-mode': 'sparse',
}, '');

// Historical positions for one as-of date (snapshot only)
// Subscribe: /snapshot/positions/TRADER001/2024-05-28
client.subscribe('/snapshot/positions/TRADER001/2024-05-28', ...);
client.send('/snapshot/positions/TRADER001/2024-05-28/50', { 'snapshot-rows': '4000' }, '');
```

## Configuration

| Variable | Default |
|----------|---------|
| `PORT` | `8081` |
| `DEFAULT_SNAPSHOT_ROWS` | `20000` |
| `MIN_SNAPSHOT_ROWS` | `1000` |
| `MAX_SNAPSHOT_ROWS` | `20000` |
| `LIVE_TICK_MS` | `40` — live frame cadence; the trigger rate is honoured exactly at any cadence, this only shapes frame size |
| `MAX_ROWS_PER_FRAME` | `2000` — hard cap per live frame (receiver decode budget); leftover rate budget carries |
| `MAX_LIVE_ROWS_PER_SEC` | `60000` (`slim`) / `10000` (`wide`) — safety clamp on the requested rate (legacy alias `SWEEP_ROWS_PER_SEC` still read) |
| `LIVE_MODE` | `legacy` (full rows) — set `sparse` for partial hot-field deltas (positions only) |
| `ROW_PROFILE` | `slim` — set `wide` for full ~8.5 KB nested records |
| `DEBUG` | unset (`1` / `true` for verbose logs) |
| `LOG_OUTBOUND` | `1` by default; set to `0` or `false` to stop printing each outbound **MESSAGE** body |
| `LOG_LIVE_EVERY` | `1` = log every live-update message; use `50` or `100` at high msg/sec to reduce noise |
| `LOG_BODY_PREVIEW` | Max characters of each MESSAGE body to print (default `400`; large snapshots truncate) |

## Scripts

```bash
npm install
npm run dev      # tsx watch
npm run build
npm start        # node dist/main.js
```

## Data

Rows are **deterministic from a seed** (stable IDs and shapes per client/topic). Instrument coverage includes gov, credit, securitized, EM, derivatives overlay, money-market styles, with wide nested payloads for grid/view testing.
