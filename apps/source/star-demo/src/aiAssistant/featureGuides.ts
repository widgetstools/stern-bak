/**
 * Worked configuration examples for each customizer module, served to the
 * model on demand by the `get_feature_guide` tool.
 *
 * WHY A TOOL AND NOT THE SYSTEM PROMPT: this material is ~10x the size of the
 * prompt and most of it is irrelevant to any single request. Paying for it on
 * every turn would be waste; fetching one guide when the model is about to
 * configure that feature is not. `list_grid_modules` advertises which ids have
 * a guide.
 *
 * SOURCE OF TRUTH: every example is lifted from the running `markets-grid-lab`
 * app (`apps/source/markets-grid-lab/src/seeds/*`), which mounts these exact
 * configs against a real grid — so they are demonstrated-working shapes, not
 * shapes inferred from type definitions. When the lab's seeds change, these
 * should be re-checked against them.
 */

import { COLUMN_IMPORT_GUIDES } from './columnImportGuides';
import { SUMMARY_PANEL_GUIDES } from './summaryPanelGuide';
import { buildGeneralSettingsGuide } from './generalSettingsCatalog';
import { buildFormatCatalogGuide } from './formatCatalog';

export interface FeatureGuide {
  /** Matches a `GRID_MODULES` id, so the model can go straight to
   *  get_module_settings / update_module_settings with the same key. */
  id: string;
  title: string;
  summary: string;
  /** Shapes + worked examples. Markdown, fenced JSON where it helps. */
  detail: string;
  /**
   * Module ids this guide documents BEYOND its own `id`. Needed because a
   * guide can cover several modules at once (`editing` covers five), and a
   * strict id match would then tell the model those modules have no guide —
   * which is how they became effectively undiscoverable. Declared next to
   * the guide so a new one can't forget to register itself.
   */
  covers?: readonly string[];
}

const CONDITIONAL_STYLING = `## conditional-styling

A rule paints cells or rows when a boolean expression is true. Rules live in
\`{ "rules": [ ... ] }\` and each one is:

\`\`\`json
{
  "id": "unique-string",
  "name": "Losers",
  "enabled": true,
  "priority": 10,
  "scope": { "type": "cell", "columns": ["dailyPnL", "unrealizedPnL"] },
  "expression": "value < 0",
  "style": {
    "dark":  { "color": "#ee8e8e", "fontWeight": "600" },
    "light": { "color": "#a02a2a", "fontWeight": "600" }
  },
  "flash": { "enabled": true, "target": "cells", "mode": "oneShot", "color": "rose", "durationMs": 600 },
  "indicator": { "icon": "arrow-down", "position": "top-left", "target": "cells", "color": "#ee8e8e" }
}
\`\`\`

\`flash\`, \`indicator\`, \`animation\`, \`activeDurationMs\` and \`valueFormatter\` are
TOP-LEVEL properties of the rule. Nesting them inside \`style\` is the common
mistake — it parses, saves, and paints nothing.

### Expression syntax

- \`value\` (or \`x\`) — the cell's own current value. Do NOT write \`[value]\`: that
  reads a column literally named "value", yields null, and the rule silently
  never matches.
- \`[columnId]\` — another column on the same row.
- \`data.fieldPath\` — dotted path into the raw row object.
- \`[columnId.old]\` / \`[columnId.new]\` — the PREVIOUS and current value of a
  column, for tick/diff rules. Only these see the change; \`value\` is not
  populated when the rule is timed (see activeDurationMs).
- Functions: \`IF(...)\`, \`ABS(...)\`, \`SUM(...)\`, plus arithmetic and comparisons.
  Full grammar and the complete function catalog (44 functions):
  get_feature_guide("expression-dsl").

### Transient rules — activeDurationMs

\`activeDurationMs\` makes a rule fire-and-revert: when a value change makes the
expression true, the style + flash + indicator apply for that many ms, then
drop automatically. This is how tick indicators are built.

### Recipe — red/green arrows for 700 ms on every tick

Two rules on the same column, one per direction:

\`\`\`json
[
  {
    "id": "tick-up-marketValue",
    "name": "Market value ticked up",
    "enabled": true,
    "priority": 6,
    "scope": { "type": "cell", "columns": ["marketValue"] },
    "expression": "[marketValue.new] > [marketValue.old]",
    "style": {
      "dark":  { "color": "#7fdf9b", "fontWeight": "600" },
      "light": { "color": "#1f7a34", "fontWeight": "600" }
    },
    "indicator": { "icon": "arrow-up", "position": "top-left", "target": "cells", "color": "#7fdf9b" },
    "activeDurationMs": 700
  },
  {
    "id": "tick-down-marketValue",
    "name": "Market value ticked down",
    "enabled": true,
    "priority": 6,
    "scope": { "type": "cell", "columns": ["marketValue"] },
    "expression": "[marketValue.new] < [marketValue.old]",
    "style": {
      "dark":  { "color": "#ee8e8e", "fontWeight": "600" },
      "light": { "color": "#a02a2a", "fontWeight": "600" }
    },
    "indicator": { "icon": "arrow-down", "position": "top-left", "target": "cells", "color": "#ee8e8e" },
    "activeDurationMs": 700
  }
]
\`\`\`

Add \`"flash": { "enabled": true, "target": "cells", "mode": "oneShot", "color": "emerald", "durationMs": 500 }\`
(and \`"rose"\` for the down rule) when the user also wants the cell surface to
blink. A magnitude variant: \`"expression": "ABS([midPrice.new] - [midPrice.old]) > 0.05"\`.

### Indicator placement convention

The badge sits OPPOSITE the content alignment so it never covers the value:

- numeric / right-aligned columns → \`top-left\`, \`bottom-left\`, \`left-middle\`
- text / left-aligned columns → \`top-right\`, \`bottom-right\`, \`right-middle\`

\`target\` may be \`cells\`, \`headers\` or \`cells+headers\`.

### Flash

\`{ "enabled": true, "target": "cells" | "headers" | "cells+headers" | "row",
   "mode": "oneShot" | "pulse", "color": <palette name>, "durationMs": 700 }\`

\`oneShot\` blinks once on match (the "value changed" cue); \`pulse\` keeps
pulsing while the rule matches (an "in alarm" cue — loud at scale). Colours are
palette names, not hex: amber, emerald, rose, sky, violet, teal, orange, slate.
A row-scope rule may only use \`target: "row"\`.

### Other per-rule options

- \`animation\`: \`{ "enabled": true, "kind": "spin" | "spin-reverse" | "pulse", "durationMs": 1000 }\`
  animates the value glyph itself — pair with a format that renders an emoji.
- \`valueFormatter\`: same \`ValueFormatterTemplate\` shape column-customization
  uses, applied only while the rule matches. An alternative way to show
  direction: format the matching cell as \`[Green]"▲ "#,##0.00\`.`;

const CALCULATED_COLUMNS = `## calculated-columns

Virtual columns computed from an expression, stored as
\`{ "virtualColumns": [ ... ] }\`. The engine re-evaluates a cell whenever a
dependency changes, so conditional-styling flashes ride through to derived
columns too.

\`\`\`json
{
  "colId": "calc_dollarDur",
  "headerName": "Dollar Dur",
  "expression": "[marketValue] * [modifiedDuration] / 100",
  "cellDataType": "currency",
  "valueFormatterTemplate": { "kind": "preset", "preset": "currency", "options": { "maximumFractionDigits": 0 } },
  "position": 102,
  "initialWidth": 130
}
\`\`\`

More worked expressions from the lab:

- \`"[dailyPnL] + [mtdPnL] + [ytdPnL]"\` — simple sum.
- \`"IF([modifiedDuration] > 0, [yieldToMaturity] / [modifiedDuration], null)"\` —
  guard a divide-by-zero by returning null.
- \`"([askPrice] - [bidPrice]) * 100"\` — spread in bps.
- \`"IF([modifiedDuration] < 3, \\"Short\\", IF([modifiedDuration] < 7, \\"Mid\\", \\"Long\\"))"\` —
  nested IF producing a text bucket (use \`cellDataType: "text"\`).

\`position\` is the insertion index; omit to append. \`cellDataType\` is one of
text, number, currency, boolean, date, dateString, object.`;

const COLUMN_CUSTOMIZATION = `## column-customization

Per-column presentation, keyed by colId under \`{ "assignments": { ... } }\`.

**Before hand-writing a number, currency, percent, date or bond-price format,
read get_feature_guide("value-formats").** There is a pre-canned catalogue of
51 named formats — red/parenthesised negatives, green/red P&L, six currencies,
32nds tick pricing, ISO and US dates — and using one means the user can then
edit it from the formatter toolbar, which a hand-rolled format string doesn't
guarantee.

\`\`\`json
{
  "assignments": {
    "midPrice": {
      "colId": "midPrice",
      "headerName": "Mid (3dp)",
      "initialWidth": 100,
      "valueFormatterTemplate": { "kind": "preset", "preset": "number", "options": { "minimumFractionDigits": 3, "maximumFractionDigits": 3 } }
    }
  }
}
\`\`\`

### Three kinds of value formatter

1. \`{ "kind": "preset", "preset": "number" | "currency" | "percent" | "date" | "datetime" | "duration", "options": { ...Intl options } }\`
   — e.g. \`{ "signed": true }\`, \`{ "minimumFractionDigits": 2 }\`,
   \`{ "year": "numeric", "month": "2-digit", "day": "2-digit" }\`.
2. \`{ "kind": "excelFormat", "format": "<Excel format string>" }\` — sections are
   \`positive;negative;zero;text\`. Colour tags \`[Green]\` \`[Red]\` \`[Blue]\`
   \`[Yellow]\` \`[Cyan]\` \`[Magenta]\` resolve to design-system tokens, so they
   read correctly in both themes. Worked examples from the lab:
   - \`[Green]"▲ "#,##0.00;[Red]"▼ "#,##0.00;"—"\` — signed direction arrows.
   - \`[Green]+0.000%;[Red]-0.000%;"·"\` — coloured signed percent.
   - \`[>=1000000][Green]"💎 "#,##0.0,,"M";[>=1000][Blue]#,##0.0,"K";#,##0\` —
     magnitude tiers (a trailing comma divides by a thousand).
   - \`"⚡ "0.00" bps"\`, \`"📅 "yyyy-mm-dd\` — literal prefixes.
3. \`{ "kind": "tick", "tick": "TICK32" }\` — US-Treasury 32nds pricing.

Note the sign-based arrows in (2) reflect whether the VALUE is positive or
negative. For arrows that reflect a change against the previous value, use a
conditional-styling diff rule instead.

### Naming a column

Every column tool resolves a column from whatever the user called it — the id
(\`marketValue\`), the header on screen (\`Market Value\`), or a loose form
(\`market value\`, \`MARKETVALUE\`). **You don't need get_grid_columns first.**
An exact colId always wins; a name matching two columns is refused with both
named rather than guessed at; a name matching nothing comes back with the near
misses. A rename is picked up immediately, so after you relabel a column the
user's next request can call it by its new name.

This applies to column ARGUMENTS only. Field names inside an EXPRESSION (a
conditional rule, a calculated column, a filter model) are opaque strings that
nothing resolves — check those against get_grid_columns or
describe_data_fields.

### The two simple ones have their own tools

- **Rename a header** → \`rename_column({ column, newName })\`, or \`renames\`
  for several at once. Not set_column_style — that's for appearance.
- **Hide / show** → \`set_column_visibility({ hide, show })\`, or \`showOnly\`
  for "just show me these three" (it hides every other column for you). Not
  set_column_layout — that's for reordering, pinning and resizing.

Both write the same fields the general tools would (\`headerName\`,
\`initialHide\` + the grid-state snapshot); they exist so the obvious request
is one obvious call.

### Alignment, and the cells-vs-headers trap

A column has TWO independent themed style slots:

- \`cellStyleOverrides\` — the values
- \`headerStyleOverrides\` — the header label

They are separate. Right-aligning a column's cells leaves its header where it
was, which reads as "the alignment didn't work". When the user says "align the
column", set both — \`set_column_style\` with \`target: "cells+headers"\`.

\`\`\`json
{
  "colId": "marketValue",
  "cellStyleOverrides":   { "dark": { "alignment": { "horizontal": "right" } }, "light": { "alignment": { "horizontal": "right" } } },
  "headerStyleOverrides": { "dark": { "alignment": { "horizontal": "right" } }, "light": { "alignment": { "horizontal": "right" } } }
}
\`\`\`

\`alignment\` is \`{ "horizontal": "left" | "center" | "right", "vertical": "top" | "middle" | "bottom" }\`.
Write it into BOTH theme slots — alignment doesn't vary by theme, and a
one-sided write disappears when the user flips themes.

For every column at once, don't loop: the module has grid-wide baselines,
\`globalCellStyle\` and \`globalHeaderStyle\`, with the same themed shape. The
engine layers global → per-column, so a column with its own explicit alignment
keeps it. \`set_column_style\` with \`allColumns: true\` writes these. To drop a
baseline later, \`update_module_settings\` with \`{ "globalCellStyle": {} }\`.

### Everything else the formatting toolbar writes

set_column_style covers the whole toolbar surface, not just colour: \`underline\`,
\`fontSize\`, \`borders\` (per side, merged — \`{ "bottom": { "width": 1, "color":
"#3a4552", "style": "solid" } }\`) with \`clearBorders\`, \`headerName\` to rename a
column, \`editable\`, and \`renderer\` for a visual cell renderer.

### Cell renderers

An assignment can name a visual renderer instead of plain text — pills,
heatmaps, sparklines, percent bars, country flags. Use them when a glance should
convey magnitude or category faster than digits. See
get_feature_guide("cell-renderers") for the catalogue and config shapes, and
call list_cell_renderers for the live list of ids.

**Renderer XOR value format.** A renderer paints the whole cell, so it hides any
value format underneath it. Setting a format therefore drops the column's
renderer — the engine's own toolbar does the same. To keep both, set the
renderer LAST, or in the same \`set_column_style\` call as the format.

### The behavioural half — set_column_behavior

The same assignment also carries how a column behaves. That is a separate tool
(\`set_column_behavior\`) writing sibling fields, so the two compose freely.

\`\`\`json
{
  "colId": "quantity",
  "cellEditor": { "kind": "agNumberCellEditor", "params": { "min": 0, "precision": 0 } },
  "editable": true,
  "filter": { "enabled": true, "kind": "streamSafeMultiNumberColumnFilter", "floatingFilter": true, "debounceMs": 200 },
  "rowGrouping": { "enableRowGroup": true, "enableValue": true, "aggFunc": "sum" },
  "templateIds": ["tpl_numeric"],
  "sortable": true,
  "resizable": true,
  "headerTooltip": "Executed quantity"
}
\`\`\`

- **Editors.** \`agTextCellEditor\`, \`agNumberCellEditor\`, \`agSelectCellEditor\`,
  \`agRichSelectCellEditor\`, \`agLargeTextCellEditor\`, \`agDateCellEditor\`,
  \`agCheckboxCellEditor\`. The two select editors take \`values\` (a static list)
  or \`valuesSource\`: \`"{{providerName.key}}"\`, resolved from AppData each time
  the editor opens, so the list tracks live data. Setting any editor flips
  \`editable: true\` — without it AG-Grid never opens the editor, which is the
  classic "I picked a dropdown and nothing happens".
- **Filters.** On a live blotter use the \`streamSafe*\` kinds
  (\`streamSafeMultiColumnFilter\` text, \`…NumberColumnFilter\`, \`…DateColumnFilter\`).
  Each is an \`agMultiColumnFilter\` bundling the typed filter with a set filter,
  plus a floating-filter input that stays typeable while rows tick. The number
  one parses \`>100\`, \`1-50\`, \`>0 and <50\`, \`1,2,3\`; the date one parses ISO,
  month names, quarters and \`today\`/\`yesterday\`. Plain \`agTextColumnFilter\` etc.
  still work for static grids.
- **Grouping flags.** \`enableRowGroup\` / \`enablePivot\` / \`enableValue\` control
  what the user can drag where in the tool panel; \`aggFunc\` is what the column
  rolls up to when grouped (\`"custom"\` additionally needs
  \`customAggExpression\`, e.g. \`"SUM([value]) * 1.1"\`). What the grid groups BY
  is \`set_row_grouping\` — a different thing.
- **Templates.** \`templateIds\` points at entries in the column-templates module.
  Applying one replaces the reference rather than appending. A template id that
  doesn't exist is rejected, since a dangling reference silently does nothing.

### What the toolbar can do that this can't

**Auto Format.** The toolbar's Auto Format walks the live field catalogue and
infers a format per column from its data type. It needs a running grid, which
this assistant doesn't have. Achieve the same by reading
\`describe_data_fields\` and setting formats per column explicitly — say that's
what you're doing rather than claiming Auto Format ran.`;

const COLUMN_GROUPS = `## column-groups

Nested header groups, stored as \`{ "groups": [ ... ] }\`:

\`\`\`json
{
  "groupId": "g_pricing",
  "headerName": "Pricing",
  "marryChildren": true,
  "openByDefault": true,
  "headerStyle": { "bold": true },
  "children": [
    { "kind": "col", "colId": "bidPrice", "show": "always" },
    { "kind": "col", "colId": "midPrice", "show": "always" },
    { "kind": "col", "colId": "askPrice", "show": "open" }
  ]
}
\`\`\`

This is a header BAND, not row grouping — to roll rows up under a column use
set_row_grouping instead.

\`show\` is \`always\` (visible collapsed and expanded), \`open\` (only when the
group is expanded) or \`closed\`. \`marryChildren: true\` stops a child being
dragged out of the group. Groups may nest — a child can itself be a group node.
\`headerStyle.color\` / \`.background\` are single CSS strings, NOT theme-aware
pairs, so prefer \`bold\` and let the surrounding tokens carry the theme.`;

const SAVED_FILTERS = `## saved-filters

Named filter pills, stored as \`{ "filters": [ ... ] }\`. Each pill carries a
raw AG-Grid filter model:

\`\`\`json
{
  "filters": [
    { "id": "qf-rates", "label": "Rates", "active": true,
      "filterModel": { "assetClass": { "filterType": "set", "values": ["Rates"] } } },
    { "id": "qf-losers", "label": "P&L losers", "active": false,
      "filterModel": { "dailyPnL": { "filterType": "number", "type": "lessThan", "filter": 0 } } },
    { "id": "qf-wide-oas", "label": "OAS > 300", "active": false,
      "filterModel": { "oas": { "filterType": "number", "type": "greaterThan", "filter": 300 } } }
  ]
}
\`\`\`

Common \`filterType\` values: \`set\` (with \`values\`), \`number\` (with \`type\`:
equals / lessThan / greaterThan / inRange), \`text\` (contains / equals /
startsWith), \`date\`. Exactly one pill should normally start \`active\`.`;

/**
 * Generated from the mirrored Grid Options catalogue rather than written by
 * hand — 100+ keys is far too many to keep accurate in prose, and the old
 * hand-written version covered barely a tenth of them, so the model guessed
 * key names that write cleanly and do nothing.
 */
const GENERAL_SETTINGS = `${buildGeneralSettingsGuide()}
### AG-Grid's native change flash

Distinct from a conditional rule's flash: this one fires on ANY value change to
ANY cell, with one global colour.

\`\`\`json
{ "enableCellChangeFlash": true, "cellChangeFlashColor": "sky", "cellFlashDuration": 350, "cellFadeDuration": 800 }
\`\`\`

Useful pairs: fast (350/800), standard (500/1000), heavy (700/1400). Use the
native flash for "something changed anywhere"; use a conditional-styling rule
when the cue must depend on WHAT changed or in which direction.`;

const ALERTS = `## alerts

Data-driven alerts, stored as \`{ "rules": [...], "history": [...], "settings": {...} }\`.
\`history\` is written by the runtime when rules fire — read it, never write it.

A rule:

\`\`\`json
{
  "id": "alert-wide-spread",
  "name": "Spread blew out",
  "enabled": true,
  "priority": 10,
  "severity": "warning",
  "trigger": { "kind": "dataChange", "column": "bidAskWidthBps", "operator": "greaterThan", "value": 50 },
  "message": "{column} on {rowId} hit {value} (was {prev})",
  "channels": ["toast"],
  "debounceMs": 5000
}
\`\`\`

- \`trigger.kind\` is \`dataChange\` (a column crossing a threshold), \`relativeChange\`
  (a move relative to the previous value) or \`rowChange\` (any change on a row).
- \`message\` supports the \`{value}\`, \`{prev}\`, \`{rowId}\` and \`{column}\`
  placeholders, substituted when the alert fires.
- \`debounceMs\` is per-rule; without it the module's \`settings.defaultDebounceMs\`
  applies. On a fast feed, an undebounced rule is a firehose — set one.

Add and edit rules with add_module_item / update_module_item / remove_module_item
on moduleId "alerts", collection "rules"; module-wide options live in
\`settings\` and go through update_module_settings.`;

const MODULE_ITEMS = `## Working with module items

Most grid features are a collection of addressable items inside one module.
The generic tools address any of them uniformly:

- \`list_module_items(targetGridId, moduleId, collection?)\` — items with their ids
- \`add_module_item(targetGridId, moduleId, item)\` — append (id generated if absent)
- \`update_module_item(targetGridId, moduleId, itemId, patch)\` — shallow-merge ONE item
- \`remove_module_item(targetGridId, moduleId, itemId)\`

| moduleId | collection | id field |
|---|---|---|
| conditional-styling | rules | id |
| calculated-columns | virtualColumns | colId |
| column-groups | groups | groupId |
| saved-filters | filters | id |
| alerts | rules (and read-only history) | id |
| column-customization | assignments | colId |
| column-templates | templates | id |
| plus-minus | nudges | id |
| shortcuts | shortcuts | id |
| summary-panel | widgets | id |

\`collection\` only needs passing when a module has more than one (alerts).

Prefer the specialised tools where they exist — add_conditional_styling_rule,
add_calculated_column, set_column_style — because they validate the shape,
fill in defaults and keep light/dark in sync. Reach for the generic ones for
everything else.

Everything NOT in this table is a settings object: read it with
get_module_settings and change it with update_module_settings, which
shallow-merges so you only send the keys you're changing. That covers
general-settings, smart-edit, bulk-update, data-change-history,
visual-excel, toolbar-visibility, toolbar-date-settings.

Three modules are BOTH: \`plus-minus\`, \`shortcuts\` and \`alerts\` carry a
\`settings\` object alongside their collection. Use update_module_settings for
the settings half and the item tools for the collection half — a settings
write does not touch the items, and vice versa.
and grid-state.`;

const PIVOT = `## Pivot and grouped views

A MarketsGrid pivot is one \`set_row_grouping\` call. There is no separate pivot
tool and no pivot module to configure — the same call carries all three roles.

### The three roles

Every pivot answers "this measure, by this row dimension, across this column
dimension". Name all three or the grid renders something empty:

| Role | Argument | What it becomes | Good columns |
|---|---|---|---|
| Row dimension | \`groupBy\` | The rows down the left | sector, desk, trader, rating |
| Column dimension | \`pivotBy\` | The column headers across the top | currency, rating, side — anything LOW-cardinality |
| Measure | \`aggregations\` | The numbers in the cells | marketValue, dv01, notional |

\`\`\`json
{ "targetGridId": "grid-axe-blotter",
  "groupBy": ["issuerSector"],
  "pivotBy": ["currency"],
  "aggregations": { "marketValue": "sum" } }
\`\`\`

That reads "market value by sector, across currencies" — sectors down the side,
one column per currency, summed market value in each cell.

Rules the tool enforces, so don't work around them:

- **A pivot needs a row group.** \`pivotBy\` without \`groupBy\` is rejected: AG-Grid
  pivots values *within* row groups, so with none you get a single total row.
- **A pivot needs a measure.** \`pivotBy\` without \`aggregations\` is rejected — the
  pivot columns would exist with nothing to put in them.
- **A column can't be both dimensions.** The same colId in \`groupBy\` and
  \`pivotBy\` is rejected.
- **Cardinality matters.** Pivoting on \`cusip\` makes one column per bond.
  Pivot on something with a handful of distinct values; if the user names a
  high-cardinality column, say so and suggest the low-cardinality one.

\`pivotMode\` defaults to true whenever \`pivotBy\` is non-empty, so you rarely pass
it. Pass \`pivotMode: false\` to keep the pivot columns configured while showing a
plain grouped view.

### What disappears, and why — expect this, don't fight it

Turning a grouped or pivot view on **hides columns**, automatically:

1. **Every dimension column is hidden as an individual column.** A column being
   grouped or pivoted already shows its value in the group column / pivot
   headers, so leaving it in the body repeats that value on every row. Group by
   \`issuerSector\` and the \`issuerSector\` column itself goes away — that is
   correct, not a bug.
2. **Every non-numeric column is hidden** while grouped or pivoting. A group row
   is an aggregate; there is no sensible roll-up of \`cusip\` or \`issuerName\`
   across 400 positions, so a blotter that keeps them shows a wall of blanks.
   Anything in \`aggregations\` survives regardless of its declared type — asking
   for the number is what makes it a measure.

So a 250-column blotter grouped by sector comes back as: the group column, plus
the measures. That is the point.

**Clearing brings them back.** \`groupBy: []\` flattens the grid and restores
exactly the columns this view hid — columns the user hid by hand stay hidden.

**Overriding.** \`hideNonNumeric: false\` keeps text columns on a grouped grid.
Only pass it when the user explicitly asks; the default is what makes the view
readable. Individual columns can always be brought back afterwards with
\`set_column_layout\`'s \`show\`.

### Telling the user

The response says how many columns were hidden. Pass that on — "grouped by
sector, summing market value; the 240 non-numeric columns are hidden while
grouped" — because a user who sees their blotter go from 250 columns to 3
without explanation reads it as data loss.

### Reading the current view

\`list_grid_customizations\` and \`diagnose_grid\` report the active row grouping.
If a user says "my columns vanished", check whether the grid is grouped before
anything else — that is far and away the most likely cause.`;

const GRID_LAYOUT = `## Column layout and row grouping

Two tools, plus a third feature people confuse with them.

### set_column_layout — individual columns

Move, hide, show, pin, resize. \`order\` may be partial: the columns you name
lead, everything else keeps its current relative order.

\`\`\`json
{ "targetGridId": "grid-axe-blotter",
  "order": ["ticker", "cusip", "marketValue"],
  "hide": ["isin", "sedol"],
  "pinLeft": ["ticker"],
  "width": { "marketValue": 140 } }
\`\`\`

Where it persists, and why BOTH layers are written: column layout lives in
AG-Grid's own \`GridState\`, saved by the \`grid-state\` module and replayed on
grid-ready — so a saved snapshot WINS over per-column config. But a grid that
was never saved has no snapshot, and then only \`column-customization\`
assignments (\`initialHide\`, \`initialPinned\`, \`initialWidth\`) apply. The tool
writes both so they can't disagree. Column ORDER is snapshot-only, since
assignments have no ordering field.

### set_row_grouping — rolling rows up, and pivoting

\`\`\`json
{ "targetGridId": "grid-axe-blotter",
  "groupBy": ["issuerSector", "currency"],
  "aggregations": { "marketValue": "sum", "dv01": "sum" } }
\`\`\`

Order is outermost-first, so this groups by sector, then currency inside it.
\`groupBy: []\` flattens the grid and clears the aggregates. Aggregations are
the named AG-Grid functions: sum, min, max, count, avg, first, last.

Add \`pivotBy\` to the same call to turn it into a cross-tab. **A grouped or
pivoted grid hides its dimension columns and every non-numeric column** — that
is deliberate and it is the part users ask about, so read
get_feature_guide("pivot") before your first grouping call on a grid.

### Column groups are a different feature

Nested header bands (a "Pricing" band over bid/mid/ask) are items on the
\`column-groups\` module, not a layout call — see
get_feature_guide("column-groups"). Row grouping collapses ROWS; column groups
band HEADERS.`;

const CELL_RENDERERS_GUIDE = `## Cell renderers

A renderer turns a cell value into a visual. Set one with set_column_style's
\`renderer\`; call list_cell_renderers for the catalogue. Stored as two fields on
the column assignment — the tool writes both:

\`\`\`json
{ "cellRendererId": "pill", "cellRendererConfig": { "kind": "pill", "config": { ... } } }
\`\`\`

Zero-config renderers (side, status-badge, pnl-value, rating-badge, ticker,
rfq-status, …) take the id alone. The configurable ones, with working shapes:

**pill** — coloured pill per value. Rules are matched on the cell value, with a
fallback; both colours are theme-aware:
\`\`\`json
{ "rules": [
    { "value": "AAA", "bg": { "dark": "#103418", "light": "#d6f4dd" }, "fg": { "dark": "#7fdf9b", "light": "#1f5d34" } },
    { "value": "BBB", "bg": { "dark": "#33310c", "light": "#f7f1cc" }, "fg": { "dark": "#e5dd6f", "light": "#5d551a" } } ],
  "fallback": { "bg": { "dark": "#1f2733", "light": "#e8edf2" }, "fg": { "dark": "#9aa6b2", "light": "#3d4753" } } }
\`\`\`

**heatmap** — gradient across a numeric domain:
\`\`\`json
{ "domain": { "min": 20, "max": 600 },
  "colorScale": { "min": { "dark": "#0f2b1c", "light": "#e8f4ec" },
                  "mid": { "dark": "#3a3010", "light": "#fbf0cf" },
                  "max": { "dark": "#3a1818", "light": "#fcdada" } },
  "textColor": { "dark": "#e8edf2", "light": "#1f2733" } }
\`\`\`

**percent-bar** — \`{ "max": 30, "barColor": { "dark": "#7cc7f9", "light": "#1e6fb8" }, "showValue": true }\`.
**sparkline** — for array-valued columns: \`{ "lineColor": {...}, "fillColor": {...}, "strokeWidth": 1.25 }\`.
**country-flag** — \`{ "codeField": "issuerCountryCode" }\`; also accepts a currency column (\`{ "codeField": "currency" }\`).
**time-since** — \`{ "sourceField": "lastUpdate" }\`, auto-refreshing "5m ago".
**trend-arrow** — \`{ "threshold": 0, "colorScale": { "up": {...}, "down": {...}, "flat": {...} } }\`.

**trend-arrow is about the SIGN of the value, not a change over time.** For an
arrow that appears when a value ticks up or down against its previous value, use
a conditional-styling diff rule instead — get_feature_guide("conditional-styling").

Colours here are literal hex because renderer configs aren't token-aware; always
supply both \`dark\` and \`light\` so the column reads in either theme.`;

const EDITING_GUIDE = `## Editing toolbar modules

Five settings-shaped modules, all edited with update_module_settings (shallow
merge — send only what changes). Two also hold items, edited with
add_module_item / update_module_item / remove_module_item.

**smart-edit** — bulk arithmetic on a selection.
\`{ "settings": { "enabled": true, "incrementStep": 1, "magnitudeShortcutsEnabled": true,
   "enabledOps": ["multiply","divide","add","subtract","set"], "confirmThreshold": 50,
   "enforceSingleColumn": true, "previewBeforeApply": false, "recordHistory": true } }\`

**bulk-update** — set many cells to one value.
\`{ "settings": { "enabled": true, "confirmThreshold": 50, "showDistinctValues": true,
   "maxDropdownValues": 20, "enforceSingleColumn": true, "recordHistory": true } }\`

**data-change-history** — edit history and undo.
\`{ "settings": { "enabled": true, "maxEntries": 50, "suspended": false, "unifyUndo": true,
   "recordSources": { ... } } }\`

**plus-minus** — nudge buttons. Settings \`{ "enabled": true, "recordHistory": true }\`,
plus a \`nudges\` collection: each nudge has an \`id\`, \`name\`, \`incrementStep\` and a
\`scope\` of \`{ "columnIds": [...] }\`.

**shortcuts** — keyboard operations. Settings \`{ "enabled": true, "recordHistory": true }\`,
plus a \`shortcuts\` collection: each has an \`id\`, \`name\`, an \`operation\` of
add / subtract / multiply / divide, a value, and a \`scope\`.

**visual-excel** — styled .xlsx export: \`{ "settings": { "enabled": true, "fileNamePrefix": "markets-grid" } }\`.

What you CAN'T do: these are the settings behind the toolbar, not its buttons.
Running a bulk update, applying a smart edit or undoing a user's cell edit are
live-grid actions on a selection — you configure the behaviour, the user
performs it.`;

export const FEATURE_GUIDES: ReadonlyArray<FeatureGuide> = [
  {
    id: 'cell-renderers',
    title: 'Cell renderers — pills, heatmaps, bars, sparklines, flags',
    summary: 'Turning a cell value into a visual, with the config shape for each configurable renderer.',
    detail: CELL_RENDERERS_GUIDE,
  },
  {
    id: 'editing',
    title: 'Editing toolbar — smart edit, bulk update, history, nudges, shortcuts',
    summary: 'The five modules behind the editing toolbar and what each setting controls.',
    detail: EDITING_GUIDE,
    covers: ['smart-edit', 'bulk-update', 'plus-minus', 'shortcuts', 'data-change-history', 'visual-excel'],
  },
  {
    id: 'pivot',
    title: 'Pivot and grouped views — the three roles, and what gets hidden',
    summary: 'Building a cross-tab with groupBy / pivotBy / aggregations, and why a grouped grid hides its dimension and non-numeric columns.',
    detail: PIVOT,
  },
  {
    id: 'grid-state',
    title: 'Column layout and row grouping',
    summary: 'Moving, hiding, pinning and resizing columns, and grouping rows with aggregates — plus how they differ from column groups.',
    detail: GRID_LAYOUT,
  },
  {
    id: 'module-items',
    title: 'Module items — the generic create/update/remove path',
    summary: 'How to address any item in any grid module, and which modules are settings objects instead.',
    detail: MODULE_ITEMS,
  },
  {
    id: 'alerts',
    title: 'Alerts — data-driven alert rules',
    summary: 'Threshold, relative-change and row-change alert rules with severities, channels and debouncing.',
    detail: ALERTS,
  },
  {
    id: 'conditional-styling',
    title: 'Conditional styling — colour, flash, indicators, tick rules',
    summary: 'Expression-driven cell/row painting, one-shot and pulse flashes, indicator badges, and transient tick rules that compare a value against its previous value.',
    detail: CONDITIONAL_STYLING,
  },
  {
    id: 'calculated-columns',
    title: 'Calculated columns — virtual columns from an expression',
    summary: 'Derived columns computed per row, re-evaluated whenever a dependency changes.',
    detail: CALCULATED_COLUMNS,
  },
  {
    id: 'column-customization',
    title: 'Column customization — formats, widths, headers, renderers',
    summary: 'Per-column presentation: Intl presets, Excel format strings, 32nds tick pricing, and visual cell renderers.',
    detail: COLUMN_CUSTOMIZATION,
  },
  {
    id: 'column-groups',
    title: 'Column groups — nested header groups',
    summary: 'Group columns under collapsible headers with per-child visibility modes.',
    detail: COLUMN_GROUPS,
  },
  {
    id: 'saved-filters',
    title: 'Saved filters — quick-filter pills',
    summary: 'Named pills backed by AG-Grid filter models.',
    detail: SAVED_FILTERS,
  },
  {
    id: 'general-settings',
    title: 'General settings — every grid-wide option, by name',
    summary: 'The complete Grid Options key list with labels, accepted values and defaults — including groupDefaultExpanded (expand all) and pivotMode.',
    detail: GENERAL_SETTINGS,
  },
  {
    id: 'value-formats',
    title: 'Value formats — the pre-canned format catalogue',
    summary: 'Named number, currency, percent, negative/P&L, tick, date, text and boolean formats, plus the Excel format-string grammar behind them.',
    detail: buildFormatCatalogGuide(),
  },
  ...COLUMN_IMPORT_GUIDES,
  ...SUMMARY_PANEL_GUIDES,
];

export const FEATURE_GUIDE_IDS: readonly string[] = FEATURE_GUIDES.map((g) => g.id);

export function findFeatureGuide(id: string | undefined): FeatureGuide | undefined {
  return FEATURE_GUIDES.find((g) => g.id === id);
}

/**
 * The guide id that documents `moduleId`, or undefined when none does.
 * Prefers an exact id match, then falls back to a guide that declares the
 * module in `covers` — so `smart-edit` resolves to `editing` rather than
 * reporting no guide at all.
 */
export function featureGuideForModule(moduleId: string): string | undefined {
  if (FEATURE_GUIDES.some((g) => g.id === moduleId)) return moduleId;
  return FEATURE_GUIDES.find((g) => g.covers?.includes(moduleId))?.id;
}
