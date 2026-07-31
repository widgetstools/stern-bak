# Formatting — Excel formatter + preset showcase

**Six toolbar profiles** (`lab-formatting-v7`) isolate Excel P&L,
yields/spreads, pricing precision, themed overrides, and global defaults.
Import [`public/lab-profiles/formatting/`](../../public/lab-profiles/formatting/).

Profile **00 · Full showcase** pre-seeds the **column-customization**
module with every formatter kind. Open `Tools → Column Settings` — column
headers name the formatter in use.

## Excel format strings (`kind: 'excelFormat'`)

Excel formats are 4-section discriminated formats — `positive ;
negative ; zero ; text` — that support **colors**, **emojis**, **Unicode
arrows**, **conditional sections**, and **magnitude tiers**. Resolved by
SheetJS's `ssf` library; named colors (`[Red]`, `[Green]`, `[Blue]`,
`[Yellow]`, `[Cyan]`, `[Magenta]`, `[Black]`, `[White]`) map to
design-system tokens so they look right in both themes.

| Column | Format string | What it shows |
| --- | --- | --- |
| **Δ Px (▲/▼)** | `[Green]"▲ "#,##0.00;[Red]"▼ "#,##0.00;"—"` | Up/down arrow with colour by sign |
| **Δ % (signed)** | `[Green]+0.000%;[Red]-0.000%;"·"` | Coloured percent with `+/−` prefix |
| **YTM / YTW / Curr Yld 📊** | `"📊 "0.000%` | Emoji prefix + 3-dp percent |
| **OAS 🔥** | `[Yellow]"🔥 "0.00" bps"` | Coloured bps with fire emoji |
| **Z-spr ⚡** | `"⚡ "0.00" bps"` | Bolt emoji + bps suffix |
| **Convex ~** | `[Cyan]"~ "0.00;[Magenta]"~ "-0.00;"~"` | Diverging cyan/magenta colour pair |
| **Mkt Val 💎** | `[>=1000000][Green]"💎 "#,##0.0,,"M";[>=1000][Blue]#,##0.0,"K";#,##0` | Magnitude tiers — diamond at $1M+, blue at $1K+, plain otherwise |
| **Qty 💰** | `"💰 "$#,##0` | Money emoji + currency |
| **Accrued 💵** | `"💵 "$#,##0.0000` | High-precision currency with emoji |
| **Unreal ✓/✗** | `[Green]"✓ "#,##0;[Red]"✗ "#,##0;"-"` | Check/cross marks by sign |
| **P&L (D / MTD) ✓/✗** | same as above | Different label, same format |
| **P&L (YTD) ▲/▼** | `[Green]"▲ "#,##0.00;[Red]"▼ "#,##0.00;"—"` | Arrow form for the YTD lens |
| **Maturity 📅** | `"📅 "yyyy-mm-dd` | Calendar emoji + ISO date |

### How Excel colors paint cells

Excel format strings can't paint cell colour directly (AG-Grid strips
HTML from formatter output). The customizer extracts the `[Color]` tag
from the section that applies to the current value and emits a
matching `cellStyle.color` via the column-customization adapter, so the
colour AND text token both reach the rendered cell. That's why the
green/red on `▲`/`▼` actually appears as colour in the cell, not just
the bracket literal.

### Magnitude tiers

`[>=1000000][Green]"💎 "#,##0.0,,"M"` reads as:

- `[>=1000000]` — section applies when value is ≥ 1,000,000
- `[Green]` — paint the section green
- `"💎 "` — literal emoji prefix
- `#,##0.0,,` — comma-separated number, divided by 1 000 000 (each `,`
  after the token shifts the decimal three places)
- `"M"` — literal suffix

The next section handles ≥ 1 000 (with `K` suffix and blue colour), and
the fall-through handles smaller values plainly.

## Preset formatters (`kind: 'preset'`)

| Column | Preset | Notes |
| --- | --- | --- |
| **Bid / Mid (3dp)** | `preset: 'number'` | 3 decimals via `Intl.NumberFormat` |
| **Ask (4dp)** | `preset: 'number'` | 4 decimals — proves per-column precision |
| **Dur** | `preset: 'number'`, 2dp | Module default for unspecified numerics |
| **DV01** | `preset: 'number'`, 4dp | High-precision risk metric |
| **Avg Cost** | `preset: 'number'`, 3dp | Price-style precision |
| **Issued** | `preset: 'date'` | ISO date via `globalCellDateFormatter` default |

## Tick formatter (`kind: 'tick'`)

| Column | Format |
| --- | --- |
| **Last (32nds)** | `tick: 'TICK32'` — US-Treasury bond price (e.g. `99-16+`) |

## Themed colour overrides

The column-customization assignments also carry **themed** style
overrides (`cellStyleOverrides.dark` and `.light`). Three columns
demonstrate:

| Column | Dark | Light |
| --- | --- | --- |
| **Rating** | sky-on-navy + bold header | navy-on-sky + bold header |
| **Sector** | emerald-on-deep-green | deep-green-on-mint |
| **Ccy**    | violet-on-deep-purple | deep-purple-on-lavender |

Switch dark/light via the toolbar to see both palettes resolve.

## Global defaults

The column-customization state also carries module-wide defaults:

```ts
globalCellNumberFormatter: { kind: 'preset', preset: 'number',
  options: { minimumFractionDigits: 2, maximumFractionDigits: 2 } }
globalCellDateFormatter:   { kind: 'preset', preset: 'date',
  options: { year: 'numeric', month: '2-digit', day: '2-digit' } }
```

Any numeric column **without** an explicit `valueFormatterTemplate`
falls back to the global number formatter; any date column likewise
falls back to the global date formatter. Per-column settings always
win.

## Where the seed lives

[src/seeds/columnCustomization.ts](src/seeds/columnCustomization.ts) —
each assignment row, the `xl*` format-string constants, and the two
`globalCell*Formatter` defaults.
