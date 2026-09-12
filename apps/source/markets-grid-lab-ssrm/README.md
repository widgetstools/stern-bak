# MarketsGrid SSRM Parity Lab (`markets-grid-lab-ssrm`)

The [Feature Lab](../markets-grid-lab/README.md)'s tabs run against the
**server-side row model** — same `LabFeatureConfig` objects, same columns,
same profile seeds, same scenarios, imported from the lab so parity cannot
drift. Its purpose is the question it answers on its landing page: **which
features does the SSRM path lack, and why.**

```bash
npm run dev        # http://localhost:5301
npm run typecheck  # tsc --noEmit (includes the shared lab modules)
npm test           # vitest
```

## How it differs from the CSRM lab

- **Data** — one worker-hosted `mock-ssrm` provider
  (`markets-grid-lab-ssrm:positions`): the SAME rich position generator the
  CSRM lab streams, ingested into the SSRM WASM engine instead of the CSRM
  row cache. No broker; no `rowData`. Blocks arrive over `ssrm-get-rows`,
  ticks as `applyServerSideTransactionAsync` transactions.
- **Home is the parity matrix** — a verdict (full / partial / gap) per lab
  feature with the mechanism behind every gap (`src/parity/parityNotes.ts`);
  each live tab repeats its own verdict above the grid.
- **Demo console** — pause / tick-interval ride `provider.restart(extra)`
  (the mock transport soft-restarts); scenarios run the lab's own
  transforms over the LOADED block rows and write the changed rows through
  `ssrm-apply-edits`, held over feed resends by the worker's edit overlay.
- **Synthetic columns** (KRD sparkline, bid/ask width — client valueGetters
  with no engine column) carry the `staruiSsrmClientExpr` brand so the
  grid's honesty lock disables sort/filter/group on them with a tooltip.
- The engine boot schema (`src/ssrm/columnTypes.ts`) types every lab field;
  a lab column added without a schema entry fails `columnTypes.test.ts`
  rather than rendering blank.

Engine facts and open engine-side items live in
[`docs/superpowers/plans/2026-09-11-ssrm-hardening-handoff.md`](../../../docs/superpowers/plans/2026-09-11-ssrm-hardening-handoff.md).
