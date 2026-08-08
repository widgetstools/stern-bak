# Overview — kitchen-sink

This tab demonstrates **every major MarketsGrid module** on one grid.
On first mount, profile **00 · Kitchen sink** installs automatically; use
the toolbar **profile selector** to switch among six curated layouts.

| Profile | Focus |
| --- | --- |
| **00 · Kitchen sink** | Full CS + calc + groups + formatters + flash |
| **01 · Trader P&L** | P&L rules + compact column set |
| **02 · Risk desk** | Risk metrics + yield watch rules |
| **03 · Groups collapsed** | Column groups mostly closed |
| **04 · Calc heavy** | Eleven virtual columns front-loaded |
| **05 · Minimal** | Identifier + mid only, rules stripped |

Import JSON from [`public/lab-profiles/overview/`](../../public/lab-profiles/overview/).
Grid ID: `lab-overview-v7`. Reset install:

```js
localStorage.removeItem('lab-demo-profiles-v2:lab-overview-v7');
localStorage.removeItem('markets-grid-bundle:lab-overview-v7');
```

## What's in the default profile (00)

### Conditional Styling — 6 rules
Open `Tools → Style Rules`. Losers/winners on P&L, high-yield pulse,
wide bid/ask, junk-rated **row** scope, price-changed flash on ticks.

### Calculated Columns — 4 virtual columns (overview subset)
`P&L Total`, `Carry/Risk`, `Dollar Dur`, `B/A bps (calc)` — profile
**04 · Calc heavy** adds the full **11**-column lab set.

### Column Groups — nested headers
Pricing + P&L open by default; other groups collapsed.

### Column Customization + General Settings
Formatter presets on bid/mid/ask/yields/P&L; native cell flash enabled with
`cellFlashDuration: 700` ms (see **Grid Options → DEFAULT COLDEF** for flash-on-change
and colour swatches).

## Seed source

[`src/seeds/`](../../src/seeds/) · catalogs
[`src/profiles/catalogs/overviewCatalog.ts`](../../src/profiles/catalogs/overviewCatalog.ts)
· installer [`src/data/useLabDemoProfiles.ts`](../../src/data/useLabDemoProfiles.ts).
