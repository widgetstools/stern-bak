# Shortcuts

Letter-key arithmetic on focused or selected **numeric editable** cells — distinct from Smart Edit **K/M/B magnitude parsing** while typing in the cell editor.

## How it works

1. Focus a cell or drag-select a range in one numeric editable column.
2. Press a configured **letter key** (e.g. **H**).
3. The first matching **enabled** shortcut applies its operation and operand to each cell in scope.

## Settings

Open **Settings → Shortcuts** to:

- Enable the module and **Record history** (shared edit journal)
- Add shortcuts with key, operation (× ÷ + −), operand value, and column scope

**Column scope:** comma-separated `colId` or `field` names. Leave empty to match all numeric editable columns.

**Not K/M/B:** typing `1.5M` in the cell editor still uses Smart Edit magnitude parsing when that feature is enabled. Shortcuts only fire on **letter keys** when the cell is **not** in edit mode.

## Lab profiles

| Profile | What it demonstrates |
|---------|----------------------|
| **00 · Curriculum** | H ×100, M +1000, L −500 on `quantityFace` |
| **01 · Multiply shortcut** | H ×100 on qty only |
| **02 · Module off** | Shortcuts disabled |

Import [`public/lab-profiles/shortcuts/`](../../public/lab-profiles/shortcuts/) for offline bundles.
