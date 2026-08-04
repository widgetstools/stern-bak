# Stress test — big book, two engines, two windows

Every other tab in this lab runs 500 rows over 20–40 columns. Both row engines
handle that comfortably, which makes them indistinguishable — and an A/B where
both sides win tells you nothing.

This tab exists to make the difference visible. It adds two controls the shared
shell has no reason to carry:

- **Rows** — 1,000 up to 200,000, sent to the mock provider.
- **Second window** — opens another window on this same tab.

## What each engine does

| | Client row model | Perspective |
|---|---|---|
| Where the book lives | This window, in full | Once, in the SharedWorker |
| Cost of a second window | A second full copy, re-sent over the wire | A View onto the Table already there |
| What the grid materializes | Every row | The blocks the viewport asks for |
| Sort / filter / group | In this window | In the worker, over the whole book |

## Try this

1. Leave the engine on **Client row model**, set **Rows** to 50,000, and scroll.
   Note how long the first paint takes and what the window costs.
2. Click **Second window**. Watch it repeat the whole load — the snapshot is
   sent again, and the second window builds its own copy.
3. Switch both windows to **Perspective (worker-held Table)**. The first one
   builds the Table; the second attaches to the Table that already exists.
4. Sort on a column in one window. The sort runs in the worker over the whole
   book, not over the rows this window happens to be holding.
5. Push **Rows** to 200,000 and repeat. This is where the two stop being
   comparable.

## What you will not see here

**Scenarios are unavailable on the Perspective engine**, and the demo console
says so rather than offering buttons that quietly do nothing. Every scenario
patches rows through the grid's own transaction API — a client-side row model's
write path. Under Perspective the book is in the worker and the patch has
nowhere to land. A worker-side scenario is a real thing to build; it is not this.

**The wide columns are derived, not invented.** `Risk krd5Y · s2` reads the same
field as `krd5Y`. Repeating real fields keeps them sortable, filterable and
aggregatable — inert padding columns would let an engine shortcut exactly the
work this tab is trying to measure.

## Caveat on the numbers

This is a demo app on synthetic data, not a benchmark harness. Use it to see the
*shape* of the difference — first paint, second-window cost, scroll behaviour at
depth — not to quote figures. Real numbers need a real book and a profiler.
