# Formatter Toolbar — paint cell style live

**Six toolbar profiles** (`lab-formatter-toolbar-v2`) pre-install
**column-customization** overrides (typography, colours, borders, headers)
so you can see painted cells immediately—or pick **05 · Blank canvas** and
use only the floating palette.

| Profile | Focus |
| --- | --- |
| **00 · Painted desk** | IDs, pricing, P&L, headers pre-styled |
| **01 · Typography** | Bold · italic · underline samples |
| **02 · Bid/ask borders** | Bottom borders on bid/mid/ask |
| **03 · P&L palette** | Distinct paints on P&L columns |
| **04 · Header row** | Header overrides on CUSIP · rating · book |
| **05 · Blank canvas** | No overrides — paint yourself |

Import [`public/lab-profiles/formatter-toolbar/`](../../public/lab-profiles/formatter-toolbar/).

The **FormattingToolbar** is enabled via `<MarketsGrid showFormattingToolbar />`.
Click a column header to focus it, then paint typography, colours, borders,
and formatters. Edits flow into the active profile's column-customization
slice (same persistence as the Formatting tab).

## Try this

1. Load **00 · Painted desk** — note pre-styled CUSIP header and bid column.
2. Switch to **05 · Blank canvas** — grid resets overrides for that profile.
3. Focus **ticker**, pick a swatch on the floating toolbar, **Save**, reload.

Reset:

```js
localStorage.removeItem('lab-demo-profiles-v2:lab-formatter-toolbar-v2');
localStorage.removeItem('markets-grid-bundle:lab-formatter-toolbar-v2');
```

Seed: [`src/seeds/formatterToolbar.ts`](../../src/seeds/formatterToolbar.ts) ·
catalog [`formatterToolbarCatalog.ts`](../../src/profiles/catalogs/formatterToolbarCatalog.ts).
