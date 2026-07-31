# Editing

Unified demo for the **Smart Edit family** — all editing modules on one grid.

## Modules on this tab

| Module | Toolbar | Keyboard |
|--------|---------|----------|
| [Smart Edit](./smart-edit.md) | × ÷ + − Set… operand | +/- when Plus/Minus off; K/M/B in cell editor |
| [Bulk Update](./bulk-update.md) | Replace selection with one value | — |
| [Plus / Minus](./plus-minus.md) | — | +/- nudge rules |
| [Shortcuts](./shortcuts.md) | — | Letter keys (H/M/L…) |
| [Edit History](./edit-history.md) | Undo / Redo row | — |

Stream is **paused** on this tab so edits are not overwritten by ticks.

## Try the full flow

1. Open the **Editing** tab — Smart Edit, Bulk Update, and History toolbars are visible.
2. **Smart Edit:** drag-select qty cells → operand `0.5` → **×** → **Undo** in history toolbar.
3. **Bulk Update:** select `currency` cells → set `EUR` from dropdown → apply.
4. **Plus/Minus:** focus qty → press **`+`** (when Plus/Minus module enabled in profile).
5. **Shortcuts:** focus qty → press **`H`** (when shortcuts seeded in profile).
6. **K/M/B:** double-click qty → type `2.5M` → Enter (Smart Edit magnitude parsing).
7. **Settings → Data Change History** — inspect journal sources; toggle **Suspend** on profile `06`.

## Profiles

| Profile | Demonstrates |
|---------|--------------|
| **00 · Full curriculum** | All modules on |
| **01 · Smart Edit only** | Toolbar + K/M/B |
| **02 · Bulk text** | Currency distinct values |
| **03 · Bulk date** | Maturity date bulk set |
| **04 · Plus/Minus nudges** | Two nudge rules |
| **05 · Letter shortcuts** | H/M/L on qty |
| **06 · History suspended** | Recording paused |
| **07 · Preview before apply** | Smart Edit preview dialog |
| **08 · All ops enabled** | Full Smart Edit op set |
| **09 · Low confirm threshold** | Confirm at 5 cells |
| **10 · K/M/B only** | Magnitude parsing, no letter/+/- modules |
| **11 · All modules off** | Baseline grid |

Import [`public/lab-profiles/editing/`](../../public/lab-profiles/editing/) for offline bundles.

Individual module tabs (**Bulk Update**, **Plus / Minus**, **Shortcuts**) remain for focused demos.
