# Plus / Minus

Keyboard **+** / **−** nudge rules for numeric editable cells — per-column step sizes and optional expression gates.

## How it works

1. Focus a cell or drag-select a range in one numeric editable column.
2. Press **+** or **=** to increment, **−** to decrement.
3. The first matching **enabled** nudge rule applies (profile order).

When **Plus / Minus** is enabled, it takes over +/- keys from Smart Edit's global increment step.

## Settings

Open **Settings → Plus / Minus** to:

- Enable the module and **Record history** (shared edit journal)
- Add nudge rules with column scope, increment/decrement step, optional expression

**Column scope:** comma-separated `colId` or `field` names. Leave empty to match all numeric editable columns.

**Expression gate:** optional — e.g. `[side] == "Long"` — nudge applies only when the expression is truthy for that row.

## Lab profiles

| Profile | What it demonstrates |
|---------|----------------------|
| **00 · Global step** | `quantityFace` ±1000 with undo/redo |
| **01 · Column rules** | qty ±100 vs mid ±0.01 |
| **02 · Expression gate** | qty ±500 only when side is Long |

Import [`public/lab-profiles/plus-minus/`](../../public/lab-profiles/plus-minus/) for offline bundles.
