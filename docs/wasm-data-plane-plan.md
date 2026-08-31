# WASM data-plane engine — design & delivery plan

**Branch:** `feature/wasm-data-plane` (off `feature/llm_bot`)
**Status:** PLAN — no implementation yet
**Trigger met:** product roadmap calls for **~20,000 full-row updates/sec per
provider with multiple blotters subscribing** — above the >10-15k threshold
set in [`performance-upgrades-2026-08.md`](./performance-upgrades-2026-08.md) §6.

---

## 1. Problem statement, with today's numbers

After the August 2026 campaign (fast STOMP parser, batch cap), the
SharedWorker at **4k updates/sec** of ~1.1KB full rows measures:

| worker cost | share |
|---|---|
| body `JSON.parse` + frame handling (`handleFrame`) | ~20% |
| columnar encode (`tryEncodeColumnar` + `TextEncoder`) | ~28% |
| GC (allocation churn from decoded rows) | ~5% |
| STOMP framing (fast parser) | <2% |
| **idle** | **~40%** |

Extrapolated linearly to **20k updates/sec (~22MB/s wire)**, the JS data
plane needs ~3x the non-idle budget — the single worker thread saturates
around 7-8k rows/sec, timers starve again (the `maxBufferedRows` cap keeps
batches bounded but cadence stretches), and every additional subscribing
blotter adds fan-out `postMessage` cost on the same saturated thread.

Root economic fact (measured twice in this repo — columnar decode vs
`JSON.parse` A/B, and the fast-parser analysis): **reading bytes is cheap;
materializing JavaScript objects is the cost.** The only design that
escapes it keeps row data out of the JS heap entirely.

## 2. Goals / non-goals

**Goals**
1. Sustain ≥20k full-row updates/sec per provider at ≤30% worker-thread
   CPU for the data plane, with headroom for 2-3 concurrent hot providers.
2. Fan-out cost per additional subscriber ≈ one buffer copy, not a
   re-encode.
3. Zero behavioral change observable by windows: same wire events
   (`delta-bin` COL1/JSON, `delta-patch`, replay chunks), same conflation
   semantics (`uniqueKeys`), same projection and thin-delta rules.
4. JS fallback always available per provider (`dataPlane: 'js'`), same
   pattern as `stompImpl`.

**Non-goals**
- Rewriting the control plane (catalog/IndexedDB, provider lifecycle,
  template/AppData resolution, stats, inspector) — stays TypeScript; it is
  <1% CPU and API-bound.
- Changing the window side. AG Grid consumes JS row objects; window decode
  is out of scope (its levers remain `thinDeltas`/`projectFields`).
- WASM threads. Parallelism comes from per-provider sub-workers (§6);
  SharedArrayBuffer/COOP/COEP is explicitly avoided in v1.

## 3. Architecture

```
SharedWorker (hub)
├─ TS control plane (unchanged): catalog, lifecycle, templates, stats
├─ per-provider SUB-WORKER (new, TS shell)
│   ├─ WebSocket (JS API — owns the socket)
│   ├─ fast STOMP framing (existing TS; already <2%)
│   └─ WASM CORE (Rust, one instance per sub-worker)
│       bytes in ──► simd-style JSON parse → TAPE
│                    key extraction · projection · conflation
│                    row cache (arena) · thin-delta diff
│                    COL1 encode ──► bytes out
└─ fan-out: hub relays the encoded ArrayBuffer to every subscriber port
            (postMessage clone of the same bytes — no per-port re-encode)
```

The **boundary is bytes-only** in both directions:
- in: `feed_frame(ptr, len)` — the STOMP body copied once into WASM memory
  (one memcpy; text frames go through `TextEncoder` first, binary frames
  copy directly).
- out: `take_emit(ptr) → (ptr, len)` — the encoded COL1/JSON frame copied
  once out of WASM memory into a fresh `ArrayBuffer` for `postMessage`
  (WASM linear memory itself is not transferable; the copy is the price
  and it is one memcpy per emit, not per row).

No JS row objects exist anywhere in the hot path.

## 4. WASM core design (Rust)

**Toolchain**: Rust stable + `wasm-bindgen` (thin — prefer raw
`#[no_mangle]` exports with a hand-written TS loader to keep glue minimal
and auditable) + `wasm-opt`. Build artifacts (`.wasm` + loader TS) are
**committed prebuilt** into `packages/data/host-data/wasm/` so `npm
install` consumers never need a Rust toolchain (Artifactory/no-lockfile
constraint). A `wasm/BUILD.md` documents regeneration; CI check compares a
committed hash. Size budget: ≤300KB optimized.

**Internal representation — the tape**: schema-less parsed JSON as a flat
tape (`simd-json`-crate tape or a purpose-built variant): sequence of
`(type, key-ref, value)` entries per row; strings interned per provider
epoch. Field NAMES are interned once (feeds repeat the same ~50 keys
forever) — key lookup becomes integer compare, which also makes projection
and diffing integer-indexed.

**Modules**
1. `json_tape`: parse UTF-8 JSON array-of-rows → tape. Target ≥800MB/s
   (simd-json class); even a scalar Rust parser at ~300MB/s meets budget
   (22MB/s wire = <10% of one core).
2. `project`: precompiled projection table (field-id set from
   `columnDefinitions` + `keyColumn`, dotted paths flattened at init) —
   marks tape entries in/out. O(entries).
3. `conflate`: open-addressing hash `key → tape ref`, last-write-wins;
   size cap + timer flush signaled from TS (`flush_live()` export).
   `uniqueKeys` semantics preserved (map-built batches flagged).
4. `cache`: per-provider row store in an arena keyed by row id — the tape
   refs of the latest full row. Epoch-based reclamation: arenas swap on
   snapshot replace; incremental compaction amortized on flush (no GC).
5. `diff` (thinDeltas): field-level compare of incoming tape row vs cached
   tape row via interned-key + value-slice compare → patch set `{k, s, d}`
   matching today's `delta-patch` wire shape.
6. `encode`: COL1 writer (same format as `columnarCodec.ts` — MAGIC,
   presence/null bitmaps, f64/bool/str/json columns) emitting into an
   output arena; JSON fallback writer for non-qualifying frames.
7. `replay`: dirtied-bucket pre-encoded chunk store (ports today's
   `ensureReplayChunks` semantics) — buckets of 500, re-encode only dirty
   buckets, chunks handed out as edge copies.
8. `stats`: counters (rows, frames, conflated, flushes, arena bytes)
   exported for the hub inspector.

**Error policy**: any panic/parse failure in the core → TS shell logs,
tears down the WASM instance, and **falls back to the JS data plane for
that provider** (flag flip + provider restart). Fail-soft, never wedge.

**TS↔WASM contract** (v1, all exports synchronous):

```
init(config_ptr, len)            // projection table, keyColumn, thinDeltas,
                                 // wireFormat, caps — serialized JSON config
feed_body(ptr, len) -> status    // one STOMP MESSAGE body (snapshot or live)
flush_live() -> emit_count       // timer/cap flush; then read emits
next_emit(out_desc_ptr) -> bool  // {kind, ptr, len, uniqueKeys, replace}
snapshot_complete()              // seals snapshot phase (mirrors current FSM)
get_rows_json(ptr) -> (ptr,len)  // RARE materialization: getData()/probe —
                                 // encodes cache to JSON once, on demand
reset() / drop_provider()
```

TS shell owns: WebSocket, STOMP framing, timers (`throttleMs` cadence →
calls `flush_live`), status/reconnect FSM, and moving emitted buffers to
the hub for fan-out.

## 5. What each existing feature maps to

| Today (TS) | In the WASM plan |
|---|---|
| `bufferedDispatch` conflate+throttle+cap | `conflate` module; timer stays in TS, cap inside WASM |
| `createFieldProjector` | `project` (precompiled at `init`) |
| hub `slot.cache` (JS Map) | `cache` arena; `getData()`/probe materialize on demand via `get_rows_json` |
| thin-delta `rowDiff` | `diff` on tape |
| `columnarCodec.tryEncodeColumnar` | `encode` (same wire format — windows unchanged) |
| `ensureReplayChunks` | `replay` |
| snapshot buffering FSM | stays TS; bodies stream into WASM either way |

## 5b. Option B — adopt Perspective as the data-plane engine instead of writing one

[Perspective](https://github.com/perspective-dev/perspective) (FINOS, ex-JPMorgan,
Apache-2.0) is a C++→WASM columnar streaming engine built for exactly this
workload — real-time ticking tables in banks. Packages were renamed in
2025: `@finos/perspective` (last 3.8.0) → **`@perspective-dev/client` +
`@perspective-dev/server`** (5.3.0 at time of writing). Facts below were
verified against current docs/source discussions (2026-08-30).

### What it gives us, mapped to the hub's data-plane responsibilities

| Hub responsibility | Perspective primitive | Verified? |
|---|---|---|
| Parse incoming JSON without JS materialization | `Table.update(jsonString)` — CSV/JSON-rows/JSON-columns/NDJSON strings parsed **inside the engine**; maintainer ordering: Arrow (best) > JSON strings > JS objects (much worse) | yes — loading-data guide, discussion #2995 |
| Keyed cache + conflation | `index` primary key → `update()` upserts in place; `remove([keys])`; partial-column updates allowed (missing columns omitted) | yes — update/remove guide |
| Delta fan-out | `view.on_update(cb, { mode: "row" })` → **Arrow buffer of the updated rows**; one `Server` hosts tables for **many `Client`s** | yes — perspective-js `View` API; 3.0 architecture |
| Late-join snapshot | `view.to_arrow()` / `to_json()` / `to_columns()` with row/column windows | yes |
| Hosting in our SharedWorker | `perspective.worker(new SharedWorker(url))` is documented (with a "needs special consideration" caveat); 3.x Server API is **2 methods over `[uint8_t]` protobuf**, Client is Rust/WASM needing only a duplex byte stream — i.e. transport-agnostic (`Session.handle_request` + `poll`), MessagePort-bridgeable | yes — custom-worker guide, 3.0 announcement, PR #2615 |
| Projection | schema fixed at table creation; fields outside the schema are dropped on ingest | yes (schema inference docs) |
| Engine size | `perspective.inline.js` 5.7MB (engine inlined; loaded once in the SharedWorker), 8KB worker shim | yes — npm pack |
| **Bonus**: views with `group_by`/`split_by`/aggregates/expressions/sorts run **in the engine** | could serve summary-panel digests and pivots server-side instead of `forEachNode` scans in windows | yes (core feature) |

### Costs and open questions (must be settled by the spike, not assumed)

1. **Nested fields.** Perspective columns are flat scalars; our feeds carry
   dot-path fields (`rating.moody`, and 300+ nested paths on wide feeds).
   Flattening must happen upstream (server-side, or a cheap text-level
   pre-pass in the fast STOMP path) — any JS-object flatten reintroduces
   the materialization cost we are removing. *Assumption: no native nested
   support; verify.*
2. **Window-side decode.** AG Grid needs JS row objects. Arrow row deltas
   must be materialized in each window either via `apache-arrow` JS
   (5.8MB unpacked — heavy per window) or via a remote Perspective `Client`
   per window calling `view.to_json()` (the engine serializes in C++; the
   window materializes — same wall as today's COL1 decode, not worse).
   Either way the window cost is unchanged by Option B, same as Option A.
3. **Conflation cadence.** `on_update` fires per `update()` call; the
   200ms/size-capped batching we have (`bufferedDispatch`) stays in front
   of the engine to shape flush cadence — it is not replaced.
4. **Thin deltas.** Row-mode deltas are whole changed rows (all schema
   columns), not per-field patches — a wire-size regression vs
   `thinDeltas` unless sparse feeds send partial columns (which
   Perspective's partial-update ingest handles natively).
5. **No published streaming throughput numbers** for JSON-string ingest at
   20k rows/sec. The spike measures it.
6. Schema is fixed per table: a `columnDefinitions` change means a new
   table (today: provider restart — equivalent).

### Nested objects — the flattening design

Perspective columns are flat scalars; our feeds carry dot-path fields.
Governing rule: **flattening must never build JS objects** (that re-buys
the materialization cost the whole plan exists to remove). Layered:

1. **Flat at the source where we own the feed.** `stomp-view-server`
   gains a flat-keys mode (`"rating.moody": ...`); "flat-or-flattenable"
   becomes the documented feed contract. Many real feeds are flat already.
2. **Text-level rewriter in the fast STOMP path** (Phase 0 baseline,
   built as `jsonFlatten.ts` — a column-driven tokenizer rather than an
   `indexOf(':{')` rewriter, because a rewriter cannot honour `[n]` or
   skip unrequested subtrees). Measured: see "nested-feed flattening
   gate" below — fine for tick streams, not for wide full-row streams.
3. **Small Rust/WASM `JSON → Arrow` flattener** (if 2 fails its gate):
   `arrow-json` already does schema-driven JSON → Arrow record batches with
   nested-struct support; flattening struct columns into `a.b` names is a
   schema transform on top. ~500 lines, no engine semantics — a tenth of
   the bespoke-core scope — and it moves Perspective ingest onto Arrow
   IPC, its fastest documented path. Remains valuable regardless of the
   engine decision.
4. **Window side**: rows stay flat with literal dotted keys;
   `buildColumnDefs`' dotted-field accessor and the expression engine's
   `[a.b]` resolution try the flat key first, then the deep path (one
   helper each). Perspective column names may contain dots (expressions
   quote column names).

Side effect: ingest-time flattening retires the `thinDeltas` +
`projectFields` incompatibility on nested feeds (no subtree rebuilds to
confuse the differ).

**Path grammar and array policy** (settled 2026-08-30, test case
`x,y.z[0].abc`):

- Canonical paths use JS property-path syntax: dotted keys, `[n]` array
  indices, bracket-quoted keys when a key contains `.`, `[`, `]` or a
  quote (`["a.b"].z[0].abc`). A comma is an ordinary key character.
  The canonical path string IS the flat column name — for the test case,
  literally `x,y.z[0].abc`. Perspective and AG Grid both accept arbitrary
  column-name strings; downstream code must read the flat key literally
  (the `buildColumnDefs` valueGetter route, flat-key-first), never
  re-parse it as a nested path.
- Arrays are never guessed: **positional** (`z[0].abc` — fixed-shape
  arrays such as swap legs / tenor buckets; missing element → null),
  **opaque** (`z` stringified — Perspective `list_flatten: 'stringify'`
  covers scalar lists natively), or **exploded** (one row per element —
  analytics views only; incompatible with a keyed table).
- **Flattening is driven by the column definitions**: the provider's
  `columnDefinitions` + `keyColumn` enumerate every requested path (the
  set `projectFields` already walks), compiled into a segment trie. The
  extractor tracks the current path as a stack while tokenizing and
  emits a value only when the path is in the trie — so projection and
  flattening are one pass, and arrays are bounded by configuration, not
  by a cap. Paths map onto Arrow struct/list navigation cleanly for the
  `arrow-json` tier.

**Editor workflow contract** (how this meets the provider editor):

1. **Infer Fields** (`probeStomp` → `inferFields`) always runs on RAW,
   unflattened rows — the probe path bypasses projection today for the
   same reason, and flattening must never run before it.
2. The user selects inferred fields and/or adds columns manually in the
   Columns tab; both produce `columnDefinitions[].field` paths in the
   canonical grammar. The Add-column form validates the grammar and
   *warns* (does not block) when a path was not seen during inference.
3. On provider (re)start, `collectProjectionPaths(columnDefinitions,
   keyColumn)` is compiled into the flatten/projection trie — the same
   restart boundary projection has today, and the same one Perspective's
   fixed table schema implies.

Two gaps the nested-feed spike closed (2026-08-30, shipped as production
code, not spike-only): `inferFields` used to stop at arrays — it now
descends them and presents observed positional element paths
(`legs[0].rate`, capped by `maxArrayElements`, default 16); and
`collectProjectionPaths` / `createFieldProjector` split on `.` only —
inference, projection, flattening, the row-path accessors
(`getValueByPath` / `getPathAccessor` / `getPathSetter` / `composeRowId`,
now ONE implementation in `shared-types/rowPath.ts`), `buildColumnDefs`
and the Add-column validator all share the one grammar parser
(`@wellsfargo-starui/types` `fieldPath.ts`: `parseFieldPath`,
`formatFieldPath`, `appendFieldPath`, `fieldPathLeafName`,
`fieldPathSegments` memo).

Spike gate as written: nested (wide) corpus must reach the same
rows/sec budget as the flat corpus via path 2 or 3. Result below.

### Spike results — engine ingest gate (2026-08-30, `apps/source/perspective-spike`)

Real WASM engine (`@perspective-dev/client` 5.3.0, `/inline` build) in a
dedicated worker, driven from a Chromium page; 20k-row indexed table
loaded from a 13.5MB JSON-rows string; sustained ingest of **pre-generated**
JSON-string batches (400 rows / 20ms at 20k/s; 7-column sparse ticks,
the realistic feed shape) with a row-mode `on_update` Arrow delta
subscriber attached. Engine-worker CPU sampled via CDP mid-run.

| rows/sec | engine busy | update p50 / p99 | Arrow delta / batch | main thread |
|---|---|---|---|---|
| 4,000 | **~19%** | 1 / 2 ms | 24KB | 60fps, worst 18ms |
| 20,000 | **~48%** | 2 / 4 ms | 95KB | 60fps, worst 18ms |
| 40,000 | ~80% (knee) | 3 / 17 ms | 182KB | 60fps, worst 18ms |

Also: snapshot load 421ms; `to_arrow()` of all 20k rows 56–78ms / 3.96MB;
`to_json()` of a 500-row window 7–10ms; engine worker boot 182ms.

**Read-out.** Cost is linear in rows/sec with a single-core ceiling near
~50k rows/sec *including* Arrow delta serialization. At the same 4k/s
where our JS data plane (post fast-parser) measured ~60% busy for
parse+encode+GC, Perspective does ingest + delta encode for ~19% —
roughly **3× cheaper per row**, and ~6× more headroom than the JS
plane's projected ~7–8k/s saturation. The Client on the page thread is
free (60fps, worst frame 18ms at every rate).

### Spike results — hosting gate (2026-08-30, `src/hub.worker.ts` + `src/multi.ts`)

Engine hosted **inside our own SharedWorker script**, one session per
connected port, hub-side local client driving ingest, three windows each
opening the hosted table by name and subscribing to row-mode deltas.

| metric (3 windows + hub, 20k rows/sec, 15s) | result |
|---|---|
| rows/sec achieved | 19,728 |
| deltas received per window | **740 / 740** (lossless), 95KB avg, 69MB each |
| window main thread | 60fps, worst frame 17ms, 0 frames >50ms — all three |
| `to_json(500 rows)` from a window | 9–15ms |
| engine worker busy | **~90%** (vs ~48% single-client at the same rate) |
| hub `update()` latency p50 / p99 | 17 / 26 ms (vs 2 / 4 single-client) |

Two engineering findings that reshape the integration design:

1. **Perspective's own worker shim cannot host multiple sessions.** It
   keeps one module-level session and routes every port's requests
   through whichever client `init`'d last — a dedicated-worker
   assumption. Its engine-host classes are bundled but not exported, and
   the shipped `perspective-server.wasm` is a stage-0 self-extracting
   wrapper (5 exports, 0 imports), not the engine. The spike therefore
   re-implements the host (`apps/source/perspective-spike/src/engineHost.ts`,
   ~150 lines: emscripten import shims, request/response marshalling,
   session-per-port, poll) and takes the real engine bytes from the
   client's `init` message exactly as the shim does. This is the piece a
   production hub would own (or upstream as a PR — the fix is small).
2. **Per-subscriber views on one engine scale with rows × views.** Each
   window View serializes its own row delta: 48% → ~90% engine busy for
   +3 views at 20k/s with 20ms batches. Batch cadence helps but has a
   floor — same 3 views at 100ms batches: 83%; at 200ms: **66%** (each
   window still receives ~60MB of deltas per 15s regardless of cadence).
   So one engine sustains roughly 3–4 subscriber views at 20k/s.

   Product requirement (confirmed): **subscribers must have their own
   views** — per-blotter filters/sorts/pivots evaluated in the engine.
   The design that satisfies it at scale is Perspective's own
   **replicated mode** (the maintainer-recommended streaming path):
   the hub engine ingests and emits ONE row-mode Arrow delta stream
   (~48%, flat in subscriber count); each window runs a *replica* engine
   in its own worker, applies the delta with `update(arrow)` (the fastest
   ingest path), and hosts that window's views on its own core. Per-view
   cost becomes parallel by construction; hub fan-out is N `postMessage`
   copies of one buffer. The spike's `replica.html` measures this shape.

### Spike results — replicated mode (2026-08-30, `src/replica.ts`, `scripts/runReplica.mjs`)

3 windows, 20k rows/sec, 200ms batches (4,000-row Arrow deltas). Each
window: one-time `to_arrow()` snapshot from the hub, its own engine in a
dedicated worker (`perspective.worker()`), `update(arrow)` per relayed
delta, and its own view (`filter: desk == X`, `sort: pnl desc`, ~4,000
rows) with a row-mode delta subscription.

| metric | result |
|---|---|
| hub engine busy (ingest + ONE relay view) | **51%** — flat in window count (vs 66% with 3 engine-side views, 90% at 20ms batches) |
| replica engine busy (per window, own worker) | **36%** |
| relayed deltas applied per window | 74 / 74 (57MB), ~12–14ms per 4,000-row Arrow apply |
| window's own view | 74 / 74 updates, ~11.7MB of view deltas |
| window main thread | 60fps, worst frame 18ms, 0 frames >50ms — all three |
| snapshot / replica boot | 95–134ms / 153–232ms |
| `to_json(500)` on the replica view | ~20ms |

**Verdict: per-subscriber views at 20k/s are solved by replication.** Hub
cost stays ~51% regardless of subscriber count; each blotter pays ~36%
of its *own* core for a full replica + its own view. Memory per window:
one Arrow-backed copy (~4MB for 20k rows). Trade-off recorded honestly:
a replica window that is hidden should pause applying deltas (or drop
its replica and re-snapshot on show — 100–250ms), the same hidden-window
discipline as today's blotters.

### Spike results — AG Grid client-side row model from the Arrow stream (2026-08-30, `src/csrm.ts`, `scripts/runCsrm.mjs`)

Decision: grids stay on the **client-side row model for now** (SSRM later).
So the window must materialize full row objects: `to_arrow()` snapshot →
`apache-arrow` decode → 20k row objects → `createGrid` (`getRowId`,
`asyncTransactionWaitMillis: 200`, cell flash on); per relayed delta:
Arrow decode → row objects → `applyTransactionAsync({ update })`.
Perspective row-mode deltas carry full rows of the changed keys, which is
exactly what an AG `update` transaction needs (no partial-object merge).

| metric (20k rows/sec, 200ms batches = 4,000-row deltas) | 1 window | 3 windows (one renderer, see caveat) |
|---|---|---|
| snapshot decode + materialize (20k rows) | 148ms | — |
| per delta: Arrow decode / materialize / apply-call | **0.8 / 19.7 / 0.02 ms** | 0.9–1.2 / 22–32 / 0.04 ms |
| window-side share of main thread | ~10% | — |
| long tasks (15s) | **0** | W0: 2, W1: 3, leader: 20 (2.2s, max 151ms) |
| fps / worst frame | **59 / 50ms** | 60/67ms, 58/133ms, leader 52/267ms |
| AG async flushes | 37 (its own 200ms batching, ~2 deltas each) | 37 |
| hub engine busy | **31%** | **30% — flat** |

**Read-out.** A CSRM window at 20k rows/sec costs ~20ms of materialization
per 200ms (≈5µs per row object) plus AG's own transaction work, with
zero long tasks — comfortably inside budget. The 3-window degradation is
a **test-harness artifact**: Playwright pages in one context share a
single renderer main thread, so it measured three grids on one thread.
In OpenFin every view has its own renderer process, so the 1-window
column is the per-blotter truth; the shared-thread case is still
informative as the "several grids in one window" bound (~3 at 20k/s).

**CSRM materialization gate: PASS.** Remaining Phase 0 item:
nested-feed flattening (next section).

### Spike results — nested-feed flattening gate (2026-08-30, `packages/data … providers/jsonFlatten.ts`, `apps/source/perspective-spike/scripts/nestedBench.mjs`)

What exists now: `compileFlattenPlan(paths)` compiles the requested
paths (`collectFieldPaths(columnDefinitions, keyColumn)` — ALL paths, a
node may be both a column and a prefix) into a segment trie;
`flattenRow` is the object-level reference; `flattenJsonText` is the
text-level pass — it tokenises the JSON row-array text once, matches
member keys in place (length-bucketed candidates + native `startsWith`,
no key slicing or hashing), skips strings with native `indexOf`, tracks
backslashes lazily, copies each matched scalar's raw text into the flat
output and skips every unrequested subtree; no row objects are built.
Opaque columns (`risk`, `legs`) come out as JSON strings; `[n]` reads
arrays only. 23 tests, including text ≡ object equivalence on escapes,
unicode, nested arrays and pretty-printed input.

Measured in Node 22 (same V8 as the SharedWorker), 20k rows, 39
requested columns (18 flat + 21 nested incl. `legs[0].rate`,
`legs[1].schedule.end`, `tenorBuckets[9]`, `limits.var.d10`), median of 7:

| corpus / path | µs/row | MB/s | one core @ 20k rows/s |
|---|---|---|---|
| flat (1,056 B/row) `JSON.parse` — today's flat-feed cost | 4.2 | 237 | 8% |
| flat `flattenJsonText` (pass-through) | 6.5 | 155 | 13% |
| nested (1,774 B/row) `JSON.parse` | 17.1 | 99 | 34% |
| nested `JSON.parse` + `flattenRow` (objects) | 25.3 | 67 | 51% |
| nested parse + flatten + `JSON.stringify` (engine-ready text) | 34.4 | 49 | 69% |
| nested `flattenJsonText` (engine-ready text) | **19.4** | 87 | **39%** |
| ↳ scanner floor: skip everything (no columns) | 6.5 | 260 | 13% |
| sparse nested ticks (~150 B/row, 1,000-row batches) `JSON.parse` | 2.4 | 78 | 5% |
| ticks parse + flatten + stringify | 5.0 | 37 | 10% |
| ticks `flattenJsonText` | **3.6** | 51 | **7%** |

**Read-out.**

- `flattenJsonText` is the best JS route to engine-ready flat text: 1.8×
  cheaper than parse → flatten → stringify on wide rows, 1.4× on ticks,
  and it allocates no row objects (GC-quiet), which was the design rule.
- It cannot beat native `JSON.parse` by much, and no JS scanner can: a
  bare `charCodeAt` loop over a row already runs at ~260 MB/s (the
  "skip everything" floor) while V8's C++ parser does ~100 MB/s on the
  nested corpus; key matching, scalar scanning and emission are the rest.
  Wide **full-row** nested rows at 20k rows/s (35 MB/s of wire) cost
  39% of a core — 4.6× the flat feed's budget. **Gate as written: FAIL
  for the full-row shape.**
- The shape that actually streams — sparse ticks — **passes with room**:
  7% of a core at 20k ticks/s (vs 5% for `JSON.parse` alone). Wide
  snapshots are one-time: 20k nested rows flatten in ~0.4 s.

**Decision.**

1. Flat-at-source remains the feed contract (`stomp-view-server`
   flat-keys mode; zero client cost). Nested feeds are supported, not
   preferred.
2. `flattenJsonText` ships now as the JS tier for nested feeds — adequate
   for tick streams and one-time snapshots, and it also retires the
   `thinDeltas` + `projectFields` nested-path interaction.
3. The `arrow-json` WASM tier (item 3 above) is **deferred, not
   started**: only a feed that streams full wide nested rows at ≥10k
   rows/s justifies it — measure that feed first. Rust/`simd-json`-class
   parsers reach 0.5–1 GB/s, i.e. 5–10× this path, which is the number
   to beat if it is ever built.
4. **Phase 0 is complete.** Next: Phase 1 (per-provider sub-workers,
   engine-agnostic), then the Perspective integration phases.

**Hosting gate: PASS** (topology proven; sessions, naming, delivery all
correct). Remaining spike items: window-side Arrow → row-object
materialization cost; nested-feed flattening; and the single-view relay
variant to confirm flat engine cost with N windows.

**Gate verdict (ingest).** The plan's "≤30% of one core at 20k/s" was set before
any data; measured 48% *includes* per-batch Arrow delta emission the
gate didn't account for, and the roadmap's 20k/s sits well inside the
knee. **Ingest gate: PASS** (with the honest note that it is a
per-provider single-core budget — per-provider sub-workers, §6, remain
the scaling lever for several hot providers). Not yet measured (next
spike steps): SharedWorker hosting of the Server + MessagePort Client
bridge; window-side Arrow → row-object materialization cost; the
nested-feed flattener path.

### Decision matrix vs Option A (bespoke Rust core)

| Criterion | A: bespoke Rust | B: Perspective |
|---|---|---|
| Maintenance / bus-factor risk | ours to own, second language | mature, bank-proven, maintained upstream |
| Time to first production value | ~6–8 weeks | ~3–4 weeks (integration, not engine work) |
| Exact fit (nested paths, thin deltas, COL1 wire unchanged) | perfect by construction | flatten upstream; deltas are full rows; new wire format (Arrow) |
| Asset size | ≤300KB target | ~5.7MB (once, in the SharedWorker) |
| Extra capability | none | in-engine views/aggregates/pivots for summary panels |
| Fail-soft fallback | JS plane | JS plane (same flag pattern) |

**Recommendation:** Perspective is the better default *if* the spike clears
its two real unknowns (nested-field handling and JSON-string ingest rate).
Writing a bespoke engine is only justified if Perspective fails those
gates. Phase 0 below becomes a head-to-head spike.

### Phase 0 (revised): head-to-head spike, 3–5 days

1. Host a Perspective `Server` inside our existing SharedWorker script and
   bridge one window `Client` over a MessagePort (the transport-agnostic
   3.x protobuf contract) — proves the hosting model.
2. Feed the spike engine STOMP JSON bodies **as strings** from the fast
   parser at 20k rows/sec (stomp-view-server, `rate=20000`), indexed on
   `positionId`; measure worker CPU, `update()` latency, `on_update`
   Arrow delta emit cost, and conflation cadence with `bufferedDispatch`
   in front.
3. Measure window-side materialization: Arrow delta → AG Grid rows via
   `apache-arrow` vs `view.to_json()` through a remote Client, against
   today's COL1 decode.
4. Nested-field strategy: cost of a text-level flatten in the STOMP path
   vs server-side flattening; confirm dropped-field projection behavior.
5. Go/no-go gates: ≥20k rows/sec at ≤30% of one worker core; window decode
   cost ≤ today's COL1 path; nested feeds handled without JS-object
   materialization. Pass → Option B; fail → Option A as specified in §4.

## 6. Parallelism: provider sub-workers first (independent of WASM) — delivered 2026-08-30

Phase 1 (pure TS, no WASM) moves each provider's socket + parse +
conflate + **encode** off the hub thread into a per-provider worker; the
hub keeps the cache, replay, and fan-out. This multiplies capacity by
cores and de-risks the WASM step (a WASM core later slots into the
sub-worker unchanged). COOP/COEP never needed.

**Topology as built** (`dataPlane: 'subworker'` — the shipped worker
entry's DEFAULT since 2026-08-30; per-provider `cfg.dataPlane: 'hub'`
opts out via the editor's "Dedicated transport worker" switch). The plan's original wording — "a dedicated `Worker`
spawned by the SharedWorker" — is impossible in Chromium: `Worker` is
undefined inside `SharedWorkerGlobalScope` (verified by CDP probe in the
live hub; only dedicated-worker parents got nested workers in M69). The
only agent that can create workers is a window, so:

- each provider's transport runs in its own **SharedWorker**
  (`@wellsfargo-starui/data/assets/data-provider-worker.js`, name
  `starui-provider:<providerId>`, ~210 KB: transports only, no
  ConfigManager/dexie);
- the hub asks every window that attaches to such a provider
  (`provider-worker-needed`) to construct / join that worker and
  transfer its `MessagePort` (`provider-port`) — the window's
  connection is what keeps the worker alive, and the first port carries
  the transport while later ones are spares;
- the hub drives the worker over that port (`pw-start` with cfg +
  AppData snapshot, `pw-restart`, `pw-stop`, `pw-appdata` mirror,
  `pw-ping`/`pw-pong` heartbeat) and receives the transport's
  `ProviderEmitEvent`s back unchanged (`applyProviderEmit` untouched);
- **worker-owned data plane** (Phase 3, same day): the sub-worker runs
  the hub's own `applyProviderEmit` pipeline against a worker-local slot
  — row cache, bucketed replay cache, dedupe / key-drop accounting,
  thin-delta diffing, chunk encoding; one implementation, two threads.
  It ships finished wire-event templates (`pw-bcast` + per-batch meta
  for stats) that the hub fans out verbatim, and answers late-join
  replays (`pw-replay` → `pw-replay-chunks`) from its replay cache —
  answered synchronously between upstream batches, so a joining window
  is provably gap-free (the hub holds it out of live broadcasts until
  its replay run lands). Rows never enter the hub, which neither
  decodes nor encodes; chunk buffers are cloned, not transferred (the
  worker's replay cache still owns them);
- fail-soft at every step: a window that cannot supply a worker, no
  port within `providerPortTimeoutMs` (4 s), a missed start ack or
  heartbeat → spare port from another window → hub thread, recorded on
  the slot so `hub-introspect` shows where the transport really runs
  (`dataPlane`). A deferred `ProviderHandle` stands in while the port is
  in flight so attach-time overlays still replay.

**Measured** (`apps/source/stomp-marketsgrid-minimal/scripts/subworkerBench.mjs`,
2 providers × 20k rows/s from stomp-server, 200-row batches, 20 s CDP
profile windows, 16-core box):

| plane | hub thread busy | hub top costs | provider workers |
|---|---|---|---|
| `hub` (today) | **86%** | `handleFrame` 28% (parse+conflate) · columnar encode 23% + `TextEncoder` 15% · GC 7% | — |
| `subworker`, objects relayed (first cut) | 89% | structured-clone receive 30% · encode 38% | 22–26% each |
| `subworker`, encoded relay (hub still caches) | 45% | `decodeColumnar` 24% (cache feed) · GC 7% · fan-out 5% | 36–38% each |
| `subworker`, **worker-owned data plane (Phase 3)** | **11%** | `postMessage` fan-out 6–9% | 42–44% each, on their own cores |

All planes sustain 20k rows/s × 2 providers (each grid: 20,000 rows,
~115 `applyTransactionAsync` per 20 s, no snapshot loss). The evolution
is the campaign's cleanest lesson: shipping row *objects* across the
port bought nothing (structured-clone receive = the parse it replaced);
shipping worker-encoded chunks halved the hub; moving the *cache* out
too left the hub with nothing but subscriber fan-out. **Phase 1 and
Phase 3 (pure-TS form) exit criteria met** — the hub's per-provider
data-plane cost is now ~0, so capacity scales with cores until fan-out
itself saturates. Not yet run: the 1 h minimized + visible soak.

## 7. Delivery phases

| Phase | Deliverable | Exit criteria |
|---|---|---|
| **0. Bench + goldens + engine spike** (~1wk) | Captured real frame corpora (slim/wide/sparse); differential harness JS-vs-X; perf bench script with budget thresholds; **Perspective head-to-head spike (§5b)** | Corpus committed; JS baseline recorded; **engine decision made on the §5b gates** |
| **1. Sub-worker split** (~4-5d) — **delivered 2026-08-30 (§6)** | Per-provider TS sub-worker (SharedWorker per provider, window-supplied port); hub relays encoded frames; flag `dataPlane: 'subworker'` | 20k/s sustained across ≥2 providers on a 4-core box ✓ (hub 86% → 45%); all transport tests green ✓; soak 1h minimized+visible — pending |
| **2. Engine in the provider sub-worker** (~2-3wk) — **in progress; increment 1 delivered 2026-08-31**: `dataPlane: 'engine'` runs a Perspective table inside the provider's sub-worker as a measured SHADOW (JS plane still serves every window). Pinned deps `@perspective-dev/client`+`server` 5.3.0; the spike's `EngineHost` is vendored (`worker/engine/engineHost.ts`) with a loopback `MessageChannel` client; wasm registered via `init_client`/`init_server` from URLs resolved against the worker script (`buildWorker.mjs` ships `perspective-js.wasm` 0.6 MB + `perspective-server.wasm` 2.4 MB beside it); provider worker bundle 308 KB. **Two hard-won lessons:** (a) a row-mode `on_update` with no prompt consumer snowballs into near-full-table Arrow deltas (~4 MB each — saturates the worker at ANY rate); the relay must pull at a fixed cadence with real consumers. (b) raw upstream ingest is pathological — the live feed's rows are 64 nested fields and cost 0.5–1 s per 1000-row update; **flatten-first is mandatory**: with `compileFlattenPlan(columnDefinitions, keyColumn)` → 28 flat columns, the table holds 20k rows at 5k rows/s sustained (~140 ms per ~2000-row coalesced apply, ≈70 µs/row incl. object→JSON conversion). **Increment 1b (same day): TEXT-FED ingest** — the STOMP transport's new `frameTap(bodyText, rows)` hands raw frame bodies to the engine before buffering/conflation/projection; array bodies flatten at TEXT level (`flattenJsonText`) straight to engine JSON, zero row objects on the path (plain top-level keyColumn required; else object fallback). Boot gap covered by a one-shot catch-up from the worker row cache; restart (`loading`) clears the table. Measured: text path active (snapshot frames ~22 ms), but this server's LIVE stream is wide sweep frames — flattening 64-field bodies where ~60% of bytes are skipped puts `skipValue` at 16% of the worker and sweep applies at ~300 ms; worker 89% total at the effective live rate. **The ≤30% gate is NOT met yet.** Next: characterize the live frame shape (sweep sizes, whitespace), conflate/coalesce tap frames before flattening, consider flatten-at-source (`stomp-view-server` flat-keys mode — the documented feed contract — which removes the scan entirely), then the Arrow relay at fixed cadence, window replicas/views, CSRM binding. | Rust core superseded by Perspective (§5b decision); flag `dataPlane: 'engine'` ✓ shadow + text-fed ingest | 20k/s at ≤30% of one core — pending (see left) |
| **3. Cache/diff/replay out of the hub** (~2wk) — **delivered 2026-08-30 in pure TS (§6)**: the sub-worker owns cache, replay, diffing and encoding via the hub's own `applyProviderEmit`; the hub relays templates and answers nothing from local state (hub thread 86% → **11%**). The engine-resident variant of this state remains Phase 2 work inside the sub-worker. | Modules 4, 5, 7; JS row cache retired from the hub's data plane ✓; `get_rows_json` for the rare readers | thinDeltas parity (same code path by construction) ✓; late-join replay parity ✓ (gap-free join proof in §6); memory flat over 8h soak — pending |
| **4. Hardening** (~1wk) | Fail-soft fallback drills, stats/inspector wiring, docs, `wasm/BUILD.md`, size/hash CI check | Kill-switch tested live; campaign doc updated |

Total: ~6-8 weeks elapsed, mostly Phase 2-3. Phase 1 ships standalone value
in week one and is worth doing regardless of the WASM decision.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Behavioral drift vs JS (conflation/diff/projection edge cases) | Differential harness on captured corpora is the merge gate for every phase; JS plane kept as per-provider runtime fallback indefinitely |
| Rust/toolchain in an npm-only corporate env | Prebuilt committed `.wasm` + loader; regeneration documented; hash check |
| Debuggability | DWARF debug build variant; stats counters in the inspector; every arena has a high-water gauge |
| simd-json crate WASM-SIMD availability | Feature-detect; scalar fallback parser still meets budget (§4.1) |
| Memory growth (arenas) | Epoch reclamation + compaction on flush; hard cap → fail-soft to JS plane |
| Team maintainability | Core is ~single-purpose; contract is 8 functions; control plane untouched; plan requires no TS contributor to write Rust to work on the hub |
| Scope creep into control plane | Explicit non-goal (§2); review gate |

## 9. Success criteria (measured, not vibes)

1. 20k full-row updates/sec on one provider: sub-worker thread ≤30% CPU,
   conflation cadence within 1.5× of configured `throttleMs`, zero
   cap-triggered mega-batches.
2. Three providers at 20k/s each on a 4-core box: hub thread <15%, all
   subscriber windows receive full-rate conflated streams.
3. Differential harness: zero wire-level diffs vs JS plane on the corpus.
4. 8-hour soak (visible + minimized): flat WASM memory, flat JS heap.
5. Windows unchanged: no consumer code modified, `?gridspy` shows the same
   event profile.

## 10. Decision points for review

- **Engine choice: Perspective (Option B, §5b) vs bespoke Rust core
  (Option A, §4).** Plan's position: Perspective is the better default
  pending the Phase 0 spike gates; Phases 2–3 are then integration work
  (hosting the Server in the hub, MessagePort transport, Arrow/`to_json`
  delta path to windows, upstream flattening) rather than engine work.
  **Phase 0 status (2026-08-30): all gates measured** — ingest PASS,
  hosting PASS, replicated mode PASS, CSRM materialization PASS,
  nested-feed flattening PASS for the streaming (tick) shape / FAIL for
  wide full-row streams, where the answer is flat-at-source, with the
  `arrow-json` WASM tier deferred until a real feed needs it.
- **Nested feeds:** accept "flat-or-flattenable" as the feed contract and
  the JS `flattenJsonText` tier for nested feeds (ticks 7% of a core at
  20k/s), or fund the WASM flattener now (~500 lines Rust, 5–10× faster)
  on the expectation of wide full-row nested streams?
- Approve Phase 1 (sub-workers) immediately? It is pure TS and pays for
  itself even if WASM is later rejected — and it is engine-agnostic.
- `wasm-bindgen` glue vs hand-rolled loader (plan prefers hand-rolled for
  auditability — revisit after a Phase 2 spike).
- Whether Phase 3 retires the JS cache entirely or keeps lazy
  materialization permanently for `getData()`/probe (plan: keep lazy).
