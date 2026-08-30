# Hidden-window out-of-memory crash: diagnosis and fix

**Status:** fixed
**Affects:** every blotter built on `MarketsGridContainer` — the fix lives in
[`packages/react-grid/widgets-react/src/container/markets-grid-container/useProviderDataWiring.ts`](../packages/react-grid/widgets-react/src/container/markets-grid-container/useProviderDataWiring.ts)
**Symptom:** a streaming blotter left minimized (or in a background tab / occluded
OpenFin window) crashes after a while with Chromium's
**"Aw, Snap! — Error code: Out of Memory"**. Time-to-crash scales inversely with
the live update rate.

---

## 1. Root cause

Two Chromium behaviors, each reasonable alone, combine into unbounded memory
growth:

1. **Chromium throttles TIMERS in hidden windows.** `setTimeout`-driven work in
   a hidden/minimized/occluded page stretches toward once per second, and under
   intensive throttling toward once per **minute**. AG Grid's async-transaction
   flush (`asyncTransactionWaitMillis`, normally 200ms here) is exactly such a
   timer.
2. **Chromium does NOT throttle `MessagePort` delivery.** The SharedWorker hub
   keeps posting conflated live batches to the window at full cadence
   regardless of visibility.

The window-side tick handler decodes each arriving batch and hands it to
`api.applyTransactionAsync({ add, update })` — which **queues** it inside AG
Grid until the flush timer fires. Hidden, the queue is filled ~10x/sec and
drained ~1x/min. Every queued entry retains its decoded row arrays, so the
renderer heap grows monotonically until the process is killed.

The platform's own policy is that hidden blotters must keep applying ticks
(window-local alerting, instant correctness on restore — the old
hidden-pause dormancy was deliberately removed). The old code comment even
noted that "flush timers stretch toward 1s/1min" — but read it as a staleness
concern, not a memory one.

---

## 2. Evidence

All measured on the `stomp-marketsgrid-minimal` app (20k rows, STOMP feed via
the SharedWorker hub), driven by a Playwright harness that forced a GC before
every heap sample.

- **Visible window: no leak.** Multiple 5–6 minute runs at both 1000 and 4000
  row-updates/sec show the heap plateauing (~520MB at 4000/sec) and holding
  flat for the whole window. Whatever the OOM is, it is not a foreground leak.
- **The heap is dominated by decoded wire batches.** V8's sampling heap
  profiler at steady state attributed **442.5MB of 522MB live heap** to
  `decodeColumnar` (`packages/data/host-data/src/runtime/wire/columnarCodec.ts`)
  — the decoded row arrays sitting in AG Grid's transaction queue between
  flushes. That is the population that grows without bound once the flush
  timer is throttled.
- **Live reproduction in a real browser.** A real Chrome window running the
  app was minimized while the feed streamed; the tab died with
  "Aw, Snap! — Out of Memory" within minutes. A second, earlier crash occurred
  the same way during normal use.
- **Why automation never caught it** (and never will without care):
  Playwright/CDP launches Chromium with `--disable-background-timer-throttling`,
  `--disable-backgrounding-occluded-windows`, and
  `--disable-renderer-backgrounding` **by default**. Even with those flags
  restored via `ignoreDefaultArgs` and the window minimized at the OS level,
  the automated page kept reporting `document.hidden === false`. Backgrounded
  behavior effectively cannot be reproduced under test automation — a real,
  human-driven browser is required. Treat any "runs fine in the harness"
  result as saying nothing about hidden-window behavior.

---

## 3. The fix

Drain AG Grid's queue **on message arrival** whenever the document is hidden —
delivery is the one signal background throttling never starves, so the drain
needs no timer:

```ts
// useProviderDataWiring.ts (inside the provider-wiring effect)
const drainIfHidden = (): void => {
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return;
  try {
    liveApi.flushAsyncTransactions();
  } catch {
    /* grid mid-teardown */
  }
};
```

Called immediately after every `gridApply.applyTick(...)` in the tick handler
(both the keyed and the no-`rowIdField` branches).

Properties worth noting:

- **The trading policy is preserved verbatim.** Hidden blotters still apply
  every tick; alerts stay live; the grid is correct the instant the window is
  restored. Only the *queueing* behavior changes.
- **Zero cost while visible.** The guard is a single `visibilityState` check;
  normal timer batching is untouched in the foreground.
- **Bounded by construction.** The queue can never hold more than one
  conflated batch while hidden, because each arrival drains it synchronously.
  Memory becomes proportional to row count, not to hidden time.
- **Cheap while hidden.** The browser skips paint for hidden pages, so the
  per-batch flush costs model-update work only, at the hub's conflated cadence
  (~10 batches/sec at a 100ms provider throttle).

## 4. Verification

- Two unit tests in `useProviderDataWiring.test.ts` pin the behavior:
  a tick with `document.visibilityState === 'hidden'` calls
  `flushAsyncTransactions()` synchronously; a visible tick does not
  (timer batching stays in charge).
- Foreground behavior re-verified by the existing wiring suite (19/19) and the
  streaming benchmarks (no regression in long-task totals).
- **Not verified end-to-end:** a multi-hour minimized-real-Chrome soak. Test
  automation cannot enter the throttled state (see §2), so the honest check is
  real usage: leave a streaming blotter minimized and confirm memory holds
  flat in Task Manager.

## 5. Related knobs and residual exposure

- The same mechanism protects OpenFin workspace blotters — minimized/occluded
  OpenFin windows are subject to the same Chromium throttling.
- `thinDeltas: true` on a provider shrinks each queued batch (changed fields
  only) and independently reduced streaming main-thread cost ~20–40% in
  benchmarks; it complements but does not replace this fix — a thin queue that
  grows forever still OOMs eventually.
- Any FUTURE code path that calls `applyTransactionAsync` from a message/event
  handler (rather than a timer) inherits the same hazard and should reuse the
  arrival-driven drain pattern.
