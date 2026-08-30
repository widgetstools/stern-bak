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

## 6. Parallelism: sub-workers first (independent of WASM)

Phase 1 (pure TS, no WASM) moves each provider's socket+parse+conflate
into a dedicated `Worker` spawned by the SharedWorker, transferring
encoded frames to the hub for fan-out. This alone multiplies capacity by
cores and de-risks the WASM step (the WASM core later slots into the
sub-worker unchanged). COOP/COEP never needed.

## 7. Delivery phases

| Phase | Deliverable | Exit criteria |
|---|---|---|
| **0. Bench + goldens** (~2-3d) | Captured real frame corpora (slim/wide/sparse); differential harness JS-vs-X; perf bench script with budget thresholds | Corpus committed; JS baseline numbers recorded |
| **1. Sub-worker split** (~4-5d) | Per-provider TS sub-worker; hub relays encoded frames; flag `dataPlane: 'subworker'` | 20k/s sustained across ≥2 providers on a 4-core box; all transport tests green; soak 1h minimized+visible |
| **2. WASM core: parse→conflate→encode** (~2-3wk) | Rust core (modules 1-3, 6) inside the sub-worker; cache still TS-fed from tape *only when features require it* (thinDeltas off ⇒ no materialization at all); flag `dataPlane: 'wasm'` | Differential harness: byte-identical emits vs JS on the corpus; 20k/s at ≤30% of one core |
| **3. Cache/diff/replay in WASM** (~2wk) | Modules 4, 5, 7; JS row cache retired from the data plane; `get_rows_json` for the rare readers | thinDeltas parity on corpus; late-join replay parity; memory flat over 8h soak |
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

- Approve Phase 1 (sub-workers) immediately? It is pure TS and pays for
  itself even if WASM is later rejected.
- `wasm-bindgen` glue vs hand-rolled loader (plan prefers hand-rolled for
  auditability — revisit after a Phase 2 spike).
- Whether Phase 3 retires the JS cache entirely or keeps lazy
  materialization permanently for `getData()`/probe (plan: keep lazy).
