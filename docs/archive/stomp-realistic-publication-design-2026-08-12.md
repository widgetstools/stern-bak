# stomp-view-server: real-world publication — design (approved scope)

**Date:** 2026-08-12 · **Status:** implemented (liveBatcher.ts + connection.ts headers)
(explicitly declined: configurable conflation interval, per-event mode).

## Goal
The mock feed currently picks rows uniformly and never generates two
updates for the same key in one tick, so framing == conflation and the
SSRM pipeline never sees realistic burst behaviour.

## 1 · Bursty, skewed arrivals
In the live generator (`apps/source/stomp-view-server`, live tick path
feeding `sparseTick`), replace the uniform row picker with:
- **Zipf-like skew**: rank rows once per (re)start with a shuffled
  permutation; pick index via power-law (s ≈ 1.1) so a few hot
  instruments tick constantly, the tail rarely.
- **Poisson-ish bursts**: per tick, draw the row budget from the rate
  with variance (e.g. exponential inter-arrival accumulation) instead of
  exactly `rate × elapsed`, keeping the long-run average = requested
  rate (existing fractional-carry contract preserved).

## 2 · Key-based conflation per frame
Within each `LIVE_TICK_MS` window, collapse same-key updates
last-value-wins (merge changed-field sets) BEFORE serialising the STOMP
frame. Stamp headers: `updates-generated`, `rows-shipped` (frame
conflation visible to demos). Rate semantics change deliberately:
`rate` = generated updates/sec; shipped rows/sec ≤ rate, gap = conflated.

## Tests
- Generator: skew distribution (hot rows dominate over many ticks),
  long-run rate ≈ requested, burst variance nonzero.
- Conflation: same-key updates in one window ship once with the LAST
  values + merged field union; headers count both totals.
- Existing contract tests (rate honoured, MAX_ROWS_PER_FRAME cap,
  snapshot path untouched) stay green.

## Non-goals
Configurable conflation interval; per-event firehose mode; any change to
snapshot delivery or the SSRM worker (RowStore is already
last-value-wins, so conflated frames need no consumer change).
