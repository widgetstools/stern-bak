/**
 * The `summary-panel` feature guide, split out of `featureGuides.ts` to stay
 * under its 800-line ceiling (see CLAUDE.md) — same reason
 * `columnImportGuides.ts` exists as its own sibling file.
 */
import type { FeatureGuide } from './featureGuides';

const SUMMARY_PANEL_GUIDE = `## summary-panel

A single dock panel pinned to the RIGHT of the blotter — a vertical sidebar
with one TAB per widget, the same shape as this assistant's own analysis side
panel. Each tab shows a digest, chart, table, heatmap, or narrative computed
from the grid's OWN CURRENT ROWS, refreshed automatically as the grid ticks.

The five kinds — the sidebar renders the same things this window's analysis
panel does:

- \`digest\` — per-column stats and plain-sentence observations.
- \`chart\` — any of the chart kinds, captioned. Set \`chartKind\` to pick one;
  omit it and the result's shape decides. Pivot the query for a stacked/grouped
  chart split by category.
- \`table\` — the result table WITH its computed analysis and an honest
  "showing N of M matching rows" footer.
- \`heatmap\` — the same table with cells shaded by magnitude.
- \`text\` — narrative YOU write, in \`text\` rather than \`query\`. Supports
  \`**bold**\`, \`\`inline code\`\`, \`- \` bullets and line breaks; it is rendered
  as text, so do not put HTML in it. Use it to caption a group of tabs, call
  out what to watch, or record the reading behind the other cards.

  It is the ONE card that does not recompute when rows tick, so anything
  numeric in it goes stale while the tabs around it stay live. Set \`asOf\` to
  say what the note is current as of ("the 14:32 close", "start of day") and
  the card stamps it "As of … · not live". With that stamp, quoting numbers is
  fine — it is the unlabelled stale number that misleads. Without it the card
  falls back to "Written note · does not update", so a reader is never left
  assuming it is live.

It is one panel, not one panel per widget: every widget you add becomes another
tab in that sidebar rather than another pane competing for space, so adding a
fifth widget costs nothing in layout and never shrinks the other four. Each
widget gets the sidebar's full height when its tab is selected. Aim for four or
five well-chosen tabs — a sidebar of a dozen tabs is a tab bar nobody reads.
Give every widget a SHORT \`title\`: it is the tab label, and a long one
crowds the others out. Configured exactly like alerts or
saved filters: widgets live in \`{ "widgets": [...] }\`, edited with
add_module_item / update_module_item / remove_module_item on moduleId
"summary-panel", collection "widgets" (see get_feature_guide("module-items")).
The panel only renders when the host has turned it on (\`showSummaryPanel\`) —
if a user asks for one and nothing appears, say so rather than assuming the
widget config is wrong.

A widget:

\`\`\`json
{
  "id": "conc-sector",
  "title": "Sector concentration",
  "kind": "digest",
  "query": { "groupBy": ["issuerSector"], "aggregate": [{ "column": "marketValue", "fn": "sum" }] }
}
\`\`\`

\`query\` is the EXACT same DataQuery shape query_grid_data already uses —
\`columns\`, \`filter\`, \`groupBy\`, \`aggregate\`, \`pivotBy\`, \`sortBy\`, \`limit\`. No
new vocabulary: whatever you'd pass to query_grid_data to answer "what does
this look like right now" is what a widget's \`query\` runs on every refresh —
a widget is not fed a snapshot, it re-runs its own query against the live
rows each time.

### Three kinds

- \`"digest"\` — per-column stats and a synopsis line (the same digest
  summarize_grid_data produces). Best for a running total or an at-a-glance
  top-N breakdown. \`query.columns\` picks which fields to summarize;
  \`query.groupBy\`'s FIRST entry buckets it — a digest groups by one column,
  unlike chart/heatmap which accept several.
- \`"chart"\` — runs \`query\` and draws whichever chart fits the result (bar,
  line, pie, scatter, …), same auto-pick logic as query_grid_data's own
  \`chart: "auto"\`. Needs \`groupBy\` + \`aggregate\` to produce something worth
  drawing. Set \`chartKind\` to override the auto pick — same enum
  query_grid_data's \`chart\` argument takes, minus \`"heatmap"\` (that's its own
  widget kind here, not a chart pick).
- \`"heatmap"\` — runs \`query\` and shades the resulting table by magnitude
  instead of drawing a chart. Add \`pivotBy\` for a two-dimensional cross-tab
  (e.g. desk × currency) — same pivot rules as set_row_grouping /
  query_grid_data: \`pivotBy\` needs \`groupBy\`, and needs \`aggregate\` to fill
  the cells.

### Worked examples

**Concentration by sector** (digest):
\`\`\`json
{ "id": "conc-sector", "title": "Sector concentration", "kind": "digest",
  "query": { "groupBy": ["issuerSector"], "aggregate": [{ "column": "marketValue", "fn": "sum" }] } }
\`\`\`

**DV01 by tenor bucket** (chart):
\`\`\`json
{ "id": "dv01-tenor", "title": "DV01 by tenor", "kind": "chart", "chartKind": "bar",
  "query": { "groupBy": ["tenorBucket"], "aggregate": [{ "column": "dv01", "fn": "sum" }], "sortBy": { "column": "tenorBucket" } } }
\`\`\`

**Maturity ladder** (digest, bucketed):
\`\`\`json
{ "id": "maturity-ladder", "title": "Maturity ladder", "kind": "digest",
  "query": { "groupBy": ["maturityBucket"], "aggregate": [{ "column": "notional", "fn": "sum" }] } }
\`\`\`
A \`maturityBucket\`-style column has to already exist on the row (or be added
as a calculated-columns bucket expression, e.g. \`IF([yearsToMaturity] < 2,
"0-2y", IF([yearsToMaturity] < 5, "2-5y", "5y+"))\` — see
get_feature_guide("calculated-columns")) — the widget's query only
groups/aggregates, it doesn't bucket a raw value itself.

**Exposure by desk, across currency** (heatmap cross-tab):
\`\`\`json
{ "id": "exposure-heatmap", "title": "Exposure by desk \\u00d7 ccy", "kind": "heatmap",
  "query": { "groupBy": ["desk"], "pivotBy": ["currency"], "aggregate": [{ "column": "marketValue", "fn": "sum" }] } }
\`\`\`

### What NOT to do

Don't run query_grid_data first to "get" a result and then try to hand its
output to a widget — a widget re-runs its own \`query\` against the current
rows on every refresh, so it needs the QUERY, not a query's RESULT. Using
query_grid_data as a dry run to confirm a query produces something sensible
before committing it as a widget is reasonable; passing its output as the
widget itself is not — there's no field for that.
## Styling a chart widget

A chart widget takes an optional \`style\`. Use it when the user asks about
APPEARANCE — "the axis labels are too dim", "make the legend brighter", "drop
the grid lines", "colour those by sign".

\`\`\`json
{ "id": "w-exposure", "kind": "chart", "chartKind": "bar",
  "query": { "groupBy": ["desk"], "aggregate": [{ "column": "marketValue", "fn": "sum" }] },
  "style": { "labelContrast": "high", "showGrid": false } }
\`\`\`

| key | values | what it does |
|---|---|---|
| \`labelContrast\` | \`muted\` (default) · \`normal\` · \`high\` | Axis-tick and legend prominence. Chart chrome is quiet by default so the data marks carry the eye; raise it when a panel is large or the labels read too faint. |
| \`showGrid\` | boolean (default true) | Background grid lines. |
| \`showLegend\` | boolean (default true) | The legend, where the kind has one (pie). |
| \`palette\` | \`auto\` (default) · \`single\` · \`categorical\` · \`sign\` | How colour is assigned. \`auto\` uses one hue for a single series, the ramp for a pie, and red/green when the measure crosses zero. |

These are deliberately named intents, not colours. There is no hex option:
a raw colour would break in the other theme and drift the chart off-brand.
If a user asks for a specific colour, set the closest intent and say what you
did rather than declining.

**Numbers format themselves.** Result tables, chart tooltips, stat cards and
the computed commentary all render a value using its own column's format —
the same one the blotter uses — so a price keeps its decimals and a notional
scales to millions. You do not need to pre-format numbers you quote, and you
should not round them yourself.
`;

export const SUMMARY_PANEL_GUIDES: readonly FeatureGuide[] = [
  {
    id: 'summary-panel',
    title: 'Summary panel — digest/chart/table/heatmap/text widgets in a right-hand sidebar',
    summary: 'A strip of live widget cards above the toolbar, each running a DataQuery against the grid\'s current rows — same query shape as query_grid_data.',
    detail: SUMMARY_PANEL_GUIDE,
  },
];
