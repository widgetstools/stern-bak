# Formatter selector redesign — unified, category-tabbed picker

**Date:** 2026-06-18
**Status:** Approved design — ready for implementation plan
**Area:** `packages/react-grid/grid/src/customizer/ui/FormatterPicker` + `widget/formatter`

## Problem

Users find the value-format selector in the formatting toolbar confusing:

1. **Nested pop-out.** The format selector is a popover (`CompactFormatterPicker`,
   360px). Inside it, the `ⓘ` button opens a *second* popover
   (`ExcelReferencePopover`, 420px of Excel examples), held open by special
   `popoverStack` logic. The two panels overlap and fight for the same space —
   the reference panel hides the selector's own preset grid, and users can't
   tell which panel they're "in." (See the user-supplied screenshot: opening
   the selector then clicking `ⓘ` stacks two panels.)
2. **Not intuitive — "which formatter do I apply?"** Presets render the Excel
   *code* (`#,##0.00`) rather than a sample of the result.
3. **Redundancy.** The selector's preset grid and the reference pop-out's
   examples are the same kind of content (label + code + sample) rendered twice
   in two different popovers, and some formats live in only one of them.

## Decisions (locked with the user)

- **Layout:** Vertical category **rail** (not a top tab strip) — "Option C".
- **Implementation:** shadcn components — `Tabs` (`orientation="vertical"`),
  `ScrollArea`, `Button`, `Tooltip` from `@wellsfargo-starui/ui` (all already present).
- **Category visibility:** show **only the categories that fit the column's data
  type**, with an **always-on Custom** tab appended.
- **Aesthetic:** matches the design system — resolved `--ds-*` tokens, `--radius:
  2px` (sharp corners), Inter / JetBrains Mono, `--ds-elevation-overlay` shadow,
  active-item `--ds-primary-soft` fill + 2px primary inset rail. Confirmed
  against a token-accurate mockup.
- **Completeness:** every formatter that exists today must remain reachable.

## Scope

**In scope:** rebuild the **compact (toolbar popover) presentation**
(`CompactFormatterPicker`) as a unified, vertically-tabbed selector. Remove the
nested `ExcelReferencePopover`; fold its examples inline into the Custom tab.

**Non-goals (unchanged):**
- `InlineFormatterPicker` (editor presentation) — stays as-is. It consumes the
  same preset catalog, so it inherits the newly-promoted presets for free.
- `ModuleFormat` toolbar quick controls (currency / % / thousands / decimals± /
  tick selects) — untouched.
- The value model (`ValueFormatterTemplate`) and all downstream resolvers —
  untouched. Existing `fmt-picker-toolbar*` test-ids preserved.

## Category model (data layer)

Today categories are *derived* from preset id-prefixes (`groupKeyForPreset`) and
the picker shows one flat list per data type. Replace with an **explicit
`category` field** on each `FormatterPreset`.

### Promote example-only formats into real presets

These formats currently live **only** in `EXCEL_EXAMPLES` (the reference
pop-out). Promote them to first-class presets so nothing is lost when the
pop-out is deleted:

| Promoted preset | Category | Template |
|---|---|---|
| No-thousands | number | `0.00` |
| Red-only | negatives | `#,##0.00;[Red]#,##0.00` |
| Green-up / red-down | conditional | `[>0][Green]▲0.00;[<0][Red]▼0.00;0.00` |
| Thresholds | conditional | `[>100][Red]0;[<=100][Green]0;0` |
| Prefix text | text | `"PX " @` |

### Expanded Text category

Text grows from 2 presets to ~9. Case transforms require `kind: 'expression'`
templates (compiled via `new Function('x','data', …)`), the same mechanism the
boolean presets already use. **Caveat:** expression formatters are CSP-unsafe —
under a `strict` expression policy they fall back to identity. Prefix/suffix stay
as CSP-safe Excel `@` formats.

| Preset | Kind | Template |
|---|---|---|
| Default (pass-through) | excel | `@` |
| UPPERCASE | expression | `String(x).toUpperCase()` |
| lowercase | expression | `String(x).toLowerCase()` |
| Title Case | expression | `String(x).replace(/\b\w/g, c => c.toUpperCase())` |
| camelCase | expression | `String(x).replace(/[-_\s]+(.)?/g,(_,c)=>c?c.toUpperCase():'').replace(/^./,c=>c.toLowerCase())` |
| Capitalize first | expression | `String(x).charAt(0).toUpperCase()+String(x).slice(1)` |
| Trim whitespace | expression | `String(x).trim()` |
| Prefix: `PX ` | excel | `"PX " @` |
| Suffix: ` units` | excel | `@" units"` |

Arbitrary prefix/suffix/other transforms go through the Custom tab.

### Category union + labels

New file `formatCategories.ts`:

```
FormatCategory =
  'number' | 'currency' | 'percent' | 'negatives' | 'conditional'
  | 'date' | 'tick' | 'text' | 'boolean'
```

`custom` is **not** a member of `FormatCategory` — it is a special always-on tab
the UI appends after the data-type categories (its content is the Excel input +
reference, not a preset list). Plus ordered label metadata and
`categoriesForDataType()` (below). The legacy
`presetGroups.ts` (`groupKeyForPreset` / `GROUP_LABELS`) is **deleted** in the
same change (superseded — no-legacy rule).

## data-type → visible categories

`categoriesForDataType(dataType)` returns the ordered, filtered set; `custom` is
always appended last:

```
number    → Number, Negatives & P&L, Conditional, Tick, Percent, Custom
currency  → Currency, Negatives & P&L, Conditional, Custom
percent   → Percent, Number, Custom
date      → Date & time, Custom
datetime  → Date & time, Custom
string    → Text, Custom
boolean   → Boolean, Text, Custom
```

The active tab defaults to the category of the currently-applied format
(via `findMatchingPreset` → its `category`), else the data type's primary
category.

## UI structure (shadcn)

`CompactFormatterPicker` body:

- **Header row** — `Current` SubLabel + live-preview chip + clear `×` (kept).
- **`<Tabs orientation="vertical">`**:
  - `<TabsList>` = left rail of category triggers with counts; active trigger
    uses `--ds-primary-soft` fill + 2px primary inset rail.
  - One `<TabsContent>` per visible category → `<ScrollArea>` of preset rows
    (**name · code · live sample**). Sample computed via `renderPreview` against
    the real column sample value, so users pick by result, not by code.
    Row click = `pickPreset(p)` + close popover (reuses the close fix already
    shipped — discrete selection dismisses).
  - **Currency** content additionally renders the `$ € £ ¥ ₹ CHF` symbol-builder
    row (`applyCurrencySymbol`).
  - **Custom** content = Excel `IconInput` + Apply/Clear + the full
    `EXCEL_EXAMPLES` list rendered **inline** (no popover).
- Popover widens to ~440px to fit the rail; height still capped by
  `--radix-popover-content-available-height` with the preset `ScrollArea` as the
  single scroll region.

## Files

- **New:** `formatCategories.ts` (category union, labels, `categoriesForDataType`);
  `CustomFormatTab.tsx` (inline Excel input + reference examples).
- **Edit:** `presetsForDataType.ts` (add `category` field; promote 5
  example-only formats; expand Text); `CompactFormatterPicker.tsx` (Tabs
  rebuild); `FormatterPicker.tsx` / `formatterPickerShared.ts` (thread categories
  through `SharedBodyProps`).
- **Delete:** `ExcelReferencePopover.tsx`, `presetGroups.ts`.
- **Untouched:** `InlineFormatterPicker.tsx`, `ModuleFormat.tsx`, value model,
  `EXCEL_EXAMPLES` data (now feeds both the Custom tab and the promoted presets).

## Testing

- **Unit:**
  - `categoriesForDataType` returns the correct ordered set per data type, with
    `custom` always last.
  - Every preset (incl. promoted + Text) has a compilable template — Excel
    formats pass `isValidExcelFormat`; expression formats compile and produce the
    expected string on a sample value (e.g. `UPPERCASE("abc") → "ABC"`,
    `camelCase("foo bar") → "fooBar"`).
- **Component:**
  - Opening the picker for a given data type renders exactly that type's tabs +
    Custom.
  - Switching a tab and clicking a preset applies the template and closes the
    popover.
  - The Custom tab renders the reference examples inline; there is **no** second
    floating popover anywhere in the flow.
  - Currency tab shows the symbol-builder row.
- Preserve existing `fmt-picker-toolbar`, `fmt-picker-toolbar-number`,
  `fmt-picker-toolbar-date` test-ids.

## Risks / open notes

- **Expression CSP fallback** — case-transform Text presets render as identity
  under `strict` expression policy. Acceptable: consistent with existing boolean
  presets; documented in the Text preset hints is optional, not required.
- **Category breadth for number columns** — number shows 6 tabs (incl. Tick).
  Verified acceptable; the rail scales vertically. If a desk finds Tick noisy on
  plain number columns, a future refinement can gate Tick behind a column hint —
  out of scope here.
- **Post-implementation:** update `docs/current-features.md` for the new
  `formatCategories` surface and the expanded Text presets; remove references to
  `ExcelReferencePopover` / `presetGroups`.
