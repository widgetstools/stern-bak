# Visual Excel — WYSIWYG `.xlsx` export

**Four toolbar profiles** (`lab-visual-excel-v1`) combine column formatters
and conditional style rules, then export what you see on screen. Import
[`public/lab-profiles/visual-excel/`](../../public/lab-profiles/visual-excel/).

## How it works

1. **Column-customization** assigns Excel format strings and themed cell paints.
2. **Conditional styling** adds expression-driven background/text colours
   (`ds-rule-*` classes on matching cells).
3. The **Visual Excel** module builds an AG Grid `excelStyles` registry from
   those formatters and rules, stamps always-on format class rules on formatted
   columns, and wires `processCellCallback` so exported values match the grid
   display (`formatValue`).

Click the **spreadsheet icon** in the primary toolbar (left of Settings) to
download. Toggle the module in **Settings → Visual Excel**.

## Profiles

| Profile | What to expect in the workbook |
| --- | --- |
| **00 · Full showcase** | Emoji/arrow P&L formatters + green/red P&L backgrounds |
| **01 · Formatters only** | Display format strings; no conditional fills |
| **02 · Style rules only** | P&L cell colours; plain numbers elsewhere |
| **03 · Module off** | Button hidden when disabled; re-enable in settings |

## Limits (current)

- Row-scoped conditional rules tint rows in the grid but Excel export reads
  **cell** classes only — row backgrounds are not exported yet.
- Global number/date formatters apply in-grid but only per-column format
  templates generate Excel number formats today.
- Style registry uses the active light theme slice when a rule omits dark styles.
