# Calculated Columns — module-driven

**Five toolbar profiles** (`lab-calculated-v5`) switch between the full
**11** virtual columns and focused subsets (P&L, risk, spreads, overview
derivatives). Import from
[`public/lab-profiles/calculated-columns/`](../../public/lab-profiles/calculated-columns/).

Default profile **00 · All virtual** seeds every expression below.
Open `Tools → Calculated Columns` to inspect or edit.

Unlike `valueGetter`-based derived columns (which live in code), these
columns are **profile state** — the expression is a string parsed by
the engine at column-build time. You can author them in the UI, save
the profile, and they ride the same persistence as any other module.

## Full catalog (profile 00)

| ColId | Header | Expression | Formatter |
| --- | --- | --- | --- |
| `calc_pnlTotal` | P&L Total | `[dailyPnL] + [mtdPnL] + [ytdPnL]` | preset `currency`, signed |
| `calc_carryRisk` | Carry/Risk | `IF([modifiedDuration] > 0, [yieldToMaturity] / [modifiedDuration], null)` | preset `number`, 2 dp |
| `calc_dollarDur` | Dollar Dur | `[marketValue] * [modifiedDuration] / 100` | preset `currency`, 0 dp |
| `calc_bidAskBps` | B/A bps (calc) | `([askPrice] - [bidPrice]) * 100` | preset `number`, 2 dp |
| `calc_riskBucket` | Risk Bucket | `IF([modifiedDuration] < 3, "Short", …)` | string |
| `calc_spreadToBench` | Sprd→Bench (bps) | `([yieldToMaturity] - [benchmarkYield]) * 100` | preset `number`, 2 dp |
| `calc_liquidityScore` | Liquidity (log) | `LOG([avgDailyVolume30d]) / LOG(10)` | preset `number`, 2 dp |
| `calc_pnlPctMkt` | P&L % of Mkt | `IF([marketValue] > 0, ([dailyPnL] / [marketValue]) * 100, null)` | preset `number` |
| `calc_cs01Notional` | CS01 × Qty | `[cs01] * [quantityFace] / 1000000` | preset `currency` |
| `calc_yieldSpread` | YTW − YTM | `[yieldToWorst] - [yieldToMaturity]` | preset `number`, 3 dp |

## Expression DSL

Field references use `[columnId]` syntax. Operators include `+ - * /`,
comparisons `== != > < >= <=`, logical `&& || !`, set membership `in`,
and built-in functions `IF`, `SUM`, `LOG`, `ABS`, and more (see
[`expression/functions.ts`](../../packages/core/engine/src/expression/functions.ts)).

```text
IF([modifiedDuration] > 0, [yieldToMaturity] / [modifiedDuration], null)
└──┬──┘ └──────────┬──────────┘ └──────────────┬────────────────┘
   IF       condition                    then-branch
```

## Recalculation

When the mock stream mutates `dailyPnL` on a row, the engine invalidates
**every calculated column that references it** for that row and AG Grid
refreshes the affected cells. Combined with `enableCellChangeFlash`,
derived values flash too — try it on **P&L Total**.

## Editing

`Tools → Calculated Columns → New` opens the master-detail editor.
Type an expression with `[fieldId]` field refs and the editor parses
in real time. Save the profile → the column persists.

## Where the seed lives

[src/seeds/calculatedColumns.ts](src/seeds/calculatedColumns.ts) —
each `VirtualColumnDef` exactly mirrors what the editor would produce.
