# SSRM Engine

The SSRM (server-side row model) engine is a transport-agnostic data service
that powers server-driven grid queries, aggregations, and real-time updates. It
is a pure computational component — driven through a single, well-defined
interface (`ICacheIngest`) — so it can run in any host: a SharedWorker, a web
page, Node.js, or any other runtime.

The hub is **one host** of this engine, not its owner. Any transport (STOMP,
REST poller, Kafka bridge, in-page mock) can feed it; any query consumer can
read it.

---

## Contract surfaces

### 1. Ingest (transport → engine)

```ts
interface ICacheIngest {
  replaceSnapshot(rows: object[]): void;
  upsert(rows: object[]): void;
  remove(ids: string[]): void;
}
```

Transport implementations call these three methods to mutate the cache. The
engine guarantees last-value-wins semantics: if the same row id arrives twice
in one update, the last value wins. Aggregates (totals, subtotals, pivots)
recompute immediately from state.

### 2. Query (consumer → engine)

```ts
interface SsrmServer {
  getRows(request: SsrmGetRowsRequest): SsrmGetRowsResponse;
  getSetFilterValues(field: string): SetFilterValueList;
  getStatusBar(request: StatusBarRequest): StatusBarData;
  getDetailRows(rowIndex: number): DetailRowsResponse;
}
```

Consumer applications call these four methods to retrieve filtered, sorted,
grouped, and aggregated results. Results are memoized by request hash
(revision-keyed) to avoid redundant computation.

### 3. Publish (engine → consumer)

```ts
interface SsrmServer {
  onTick(handler: (event: TickEvent) => void): Unsubscribe;
  onFlush(handler: (event: FlushEvent) => void): Unsubscribe;  // Task 2+
}
```

The engine broadcasts tick events whenever a mutation affects the output
surface (not on every upsert — filtered-out rows do not tick). Flush events
signal the end of a batch (Task 2 onwards).

---

## Recipe: any transport drives the engine

A transport is any object that calls `ICacheIngest`. Here is a complete example
using an in-memory fake — the pattern adapts to HTTP, message queues, or
WebSocket listeners:

```ts
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

// Use it:
const engine = new SsrmServer({ keyColumn: 'id' });
const transport = fakeTransport(engine);

transport.snapshot(500);  // engine sees 500 rows
transport.tick('P7', 9_999);  // engine updates row P7, recomputes aggregates
const result = engine.getRows({ startRow: 0, endRow: 100 });  // query it
```

---

## Guarantees

1. **Last-value-wins cache**: if the same row id arrives multiple times in a
   single update, the final state reflects only the last value. Partial
   updates (upserts) merge with existing rows.

2. **Recompute-from-state aggregates**: every query reads the current cache
   and recomputes totals, subtotals, pivots, and grand totals. No separate
   aggregate store; the cache is the source of truth.

3. **Revision-keyed memoization**: results are cached by a hash of the query
   request. Only cache invalidation on mutation; identical queries within the
   same revision (between ticks) reuse the prior result.
