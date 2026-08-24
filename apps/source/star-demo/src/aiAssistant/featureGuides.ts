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

export interface FeatureGuide {
  /** Matches a `GRID_MODULES` id, so the model can go straight to
   *  get_module_settings / update_module_settings with the same key. */
  id: string;
  title: string;
  summary: string;
  /** Shapes + worked examples. Markdown, fenced JSON where it helps. */
  detail: string;
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
- Functions: \`IF(...)\`, \`ABS(...)\`, \`SUM(...)\`, \`LOG10(...)\`, plus arithmetic
  and comparisons.

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

Per-column presentation, keyed by colId under \`{ "assignments": { ... } }\`:

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

### Cell renderers

An assignment can name a visual renderer instead of plain text — pills,
heatmaps, sparklines, percent bars, country flags — configured per column in
the same assignment object. Use them when a glance should convey magnitude or
category faster than digits.`;

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

const GENERAL_SETTINGS = `## general-settings

Grid-wide AG-Grid options, shallow-merged — send only the keys you change.

AG-Grid's own change flash (distinct from a conditional rule's flash: this one
fires on ANY value change to ANY cell, with one global colour):

\`\`\`json
{ "enableCellChangeFlash": true, "cellChangeFlashColor": "sky", "cellFlashDuration": 350, "cellFadeDuration": 800 }
\`\`\`

The lab ships three presets: fast (350/800), standard (500/1000) and heavy
(700/1400) flash/fade pairs. Use the native flash for "something changed
anywhere"; use a conditional-styling rule when the cue must depend on WHAT
changed or in which direction.

Other frequently-set keys: \`rowHeight\`, \`headerHeight\`, \`gridDensity\`
("compact" | "normal" | "ultra"), \`pagination\` + \`paginationPageSize\`,
\`animateRows\`, \`rowSelection\`, \`sideBar\`, \`statusBar\`, and row grouping /
pivot toggles.`;

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

\`collection\` only needs passing when a module has more than one (alerts).

Prefer the specialised tools where they exist — add_conditional_styling_rule,
add_calculated_column, set_column_style — because they validate the shape,
fill in defaults and keep light/dark in sync. Reach for the generic ones for
everything else.

Everything NOT in this table is a settings object: read it with
get_module_settings and change it with update_module_settings, which
shallow-merges so you only send the keys you're changing. That covers
general-settings, smart-edit, bulk-update, plus-minus, shortcuts,
data-change-history, visual-excel, toolbar-visibility, toolbar-date-settings
and grid-state.`;

export const FEATURE_GUIDES: ReadonlyArray<FeatureGuide> = [
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
    title: 'General settings — grid-wide options and native flash',
    summary: 'Row height, density, pagination, animations, and AG-Grid\'s built-in cell-change flash.',
    detail: GENERAL_SETTINGS,
  },
];

export const FEATURE_GUIDE_IDS: readonly string[] = FEATURE_GUIDES.map((g) => g.id);

export function findFeatureGuide(id: string | undefined): FeatureGuide | undefined {
  return FEATURE_GUIDES.find((g) => g.id === id);
}
