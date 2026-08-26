/**
 * Wire schemas for the column-mutation tools — layout, row grouping, styling
 * and behaviour.
 *
 * Split out of `toolSchemas.ts` for size: between them these five carry the
 * whole formatter-toolbar and Column Customization surface, and their
 * descriptions are where the model learns the vocabulary (renderer ids, filter
 * kinds, editor kinds, Excel format strings), so they are long by necessity.
 */
import { STYLE_TARGETS, HORIZONTAL_ALIGNS, VERTICAL_ALIGNS } from './columnStyle';
import { CELL_EDITOR_KINDS, FILTER_KINDS, AGG_FUNCS } from './columnBehavior';
import { TARGET_GRID_ID_PROPERTY, INSTANCE_ID_PROPERTY, type OpenAIToolSchema } from './toolSchemaShared';

export const COLUMN_TOOL_SCHEMAS: OpenAIToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'rename_column',
      description:
        'Rename a column header — "call this column Symbol", "rename the ISIN header", "change Market Value to Mkt Val". One call, two arguments. Name the column however the user did (its id, its current header label, or a loose form like "market value") and it is resolved for you; you do NOT need get_grid_columns first. Use `renames` to relabel several at once.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          ...INSTANCE_ID_PROPERTY,
          column: { type: 'string', description: 'The column to rename — its id ("marketValue"), its current header ("Market Value"), or a loose form ("market value").' },
          newName: { type: 'string', description: 'The label to show in the header.' },
          renames: {
            type: 'object',
            description: 'Several at once: { "<column>": "<new header>", … }, e.g. { "isin": "ISIN Code", "Market Value": "Mkt Val" }. Use instead of column/newName.',
          },
        },
        required: ['targetGridId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_column_visibility',
      description:
        'Hide or show columns — "hide ISIN", "hide the maturity and coupon columns", "bring back the trader column", "show only ticker, price and quantity". Name columns however the user did (id, header label, or a loose form); they are resolved for you, so you do NOT need get_grid_columns first. This is the tool for visibility on its own; set_column_layout is for reordering, pinning and resizing.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          ...INSTANCE_ID_PROPERTY,
          hide: { type: 'array', items: { type: 'string' }, description: 'Columns to hide.' },
          show: { type: 'array', items: { type: 'string' }, description: 'Columns to bring back.' },
          showOnly: {
            type: 'array',
            items: { type: 'string' },
            description: 'Show exactly these and hide every other column — for "just show me X, Y and Z". Pass it on its own, without hide/show.',
          },
        },
        required: ['targetGridId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_column_layout',
      description:
        'Move, hide, show, pin or resize columns. This is the tool for "reorder the columns", "hide the ISIN column", "move ticker first", "pin cusip to the left", "make notional wider". Order may be partial — the columns you name lead and the rest keep their current order. Get exact colIds from get_grid_columns first; unknown ids are rejected. NOTE: this is about individual columns. For nested header bands see column-groups, and for rolling rows up under a column use set_row_grouping.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          ...INSTANCE_ID_PROPERTY,
          order: {
            type: 'array',
            items: { type: 'string' },
            description: 'Column ids in the order you want them, left to right. Partial lists are fine — named columns move to the front, everything else follows unchanged.',
          },
          hide: { type: 'array', items: { type: 'string' }, description: 'Column ids to hide.' },
          show: { type: 'array', items: { type: 'string' }, description: 'Column ids to un-hide.' },
          pinLeft: { type: 'array', items: { type: 'string' }, description: 'Pin these to the left edge so they stay put while scrolling.' },
          pinRight: { type: 'array', items: { type: 'string' }, description: 'Pin these to the right edge.' },
          unpin: { type: 'array', items: { type: 'string' }, description: 'Return these to the scrolling area.' },
          width: { type: 'object', description: 'Pixel widths keyed by colId, e.g. { "marketValue": 140 }.' },
        },
        required: ['targetGridId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_row_grouping',
      description:
        'Group ROWS under one or more columns — "group by sector", "break the blotter down by trader then desk", "roll up market value by currency". Pass several colIds for nested grouping, in order. Pass an empty array to flatten the grid again. Optionally aggregate numeric columns across each group. This is NOT the same as column groups, which band column HEADERS together and are configured on the column-groups module.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          ...INSTANCE_ID_PROPERTY,
          groupBy: {
            type: 'array',
            items: { type: 'string' },
            description: 'Column ids to group rows by, outermost first. Empty array clears grouping.',
          },
          aggregations: {
            type: 'object',
            description: 'Aggregation per column shown at group level, e.g. { "marketValue": "sum", "dv01": "sum" }. One of: sum, min, max, count, avg, first, last.',
          },
        },
        required: ['targetGridId', 'groupBy'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_column_style',
      description:
        'Style existing columns: horizontal/vertical ALIGNMENT, text and background colour, bold/italic, or a number/date format preset. Merges into whatever styling the column already has. Target one column (colId), several (colIds) or every column at once (allColumns) — and choose whether it hits the cells, the headers, or both via `target`. Aligning a column\'s values does NOT move its header: pass target "cells+headers" when the user says "align the column".',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          ...INSTANCE_ID_PROPERTY,
          colId: { type: 'string', description: 'A single column id, from get_grid_columns.' },
          colIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Several column ids in one call — cheaper and more consistent than one call per column.',
          },
          allColumns: {
            type: 'boolean',
            description:
              'Apply to EVERY column via the grid-wide baseline (one write instead of one per column). Use this for "right-align all columns". Columns with their own explicit styling keep it — per-column settings win over the baseline.',
          },
          target: {
            type: 'string',
            enum: [...STYLE_TARGETS],
            description: 'Which surface to style. Defaults to "cells". Use "headers" or "cells+headers" to move/paint the header.',
          },
          align: {
            type: 'string',
            enum: [...HORIZONTAL_ALIGNS],
            description: 'Horizontal alignment. Numeric columns normally read best right-aligned, text left-aligned.',
          },
          verticalAlign: { type: 'string', enum: [...VERTICAL_ALIGNS], description: 'Vertical anchoring within the cell/header.' },
          colors: {
            type: 'object',
            description: '{ "light"?: { "text"?, "background"? }, "dark"?: { "text"?, "background"? } } — CSS colour strings. Supply both themes unless the user asked for one.',
          },
          bold: { type: 'boolean' },
          italic: { type: 'boolean' },
          underline: { type: 'boolean' },
          fontSize: { type: 'number', description: 'Text size in pixels.' },
          borders: {
            type: 'object',
            description:
              'Borders keyed by side, e.g. { "bottom": { "width": 1, "color": "#3a4552", "style": "solid" } }. Sides: top, right, bottom, left; styles: solid, dashed, dotted. Merged per side, so setting one keeps the others.',
          },
          clearBorders: { type: 'boolean', description: 'Remove all borders from the target.' },
          headerName: { type: 'string', description: 'Rename the column\'s header label.' },
          editable: { type: 'boolean', description: 'Whether users can edit cells in this column.' },
          renderer: {
            type: 'object',
            description:
              'Visual cell renderer: { "id": "pill" | "heatmap" | "percent-bar" | …, "config": { … } }, or just the id string for the zero-config ones. Call list_cell_renderers for the catalogue and get_feature_guide("cell-renderers") for config shapes. An unknown id is rejected rather than written.',
          },
          clearRenderer: { type: 'boolean', description: 'Return the column to plain text rendering.' },
          formatPreset: {
            type: 'string',
            enum: ['currency', 'percent', 'number', 'date', 'datetime', 'duration'],
            description: 'Shorthand for the common case. With allColumns it sets the grid-wide number or date formatter, depending on the preset.',
          },
          formatter: {
            type: 'object',
            description:
              'Full value formatter, superseding formatPreset. One of: { "kind": "preset", "preset": …, "options": { …Intl options } }, { "kind": "excelFormat", "format": "[Green]\\"▲ \\"#,##0.00;[Red]\\"▼ \\"#,##0.00" }, or { "kind": "tick", "tick": "TICK32" } for 32nds bond pricing.',
          },
        },
        required: ['targetGridId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_column_behavior',
      description:
        'Set how columns BEHAVE (set_column_style covers how they look): which cell editor opens on edit, which filter the header offers and whether the floating-filter row shows, the row-group/pivot/value tool-panel flags and aggregation, which saved column template the column inherits, and the sortable/filterable/resizable flags. Per-column only — there is no allColumns form. Composes with set_column_style on the same column.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          ...INSTANCE_ID_PROPERTY,
          colId: { type: 'string', description: 'A single column id, from get_grid_columns.' },
          colIds: { type: 'array', items: { type: 'string' }, description: 'Several column ids in one call.' },
          editor: {
            type: 'object',
            description:
              'Cell editor: a kind string, or { "kind", "values"?, "valuesSource"?, "params"? }. Kinds: ' +
              CELL_EDITOR_KINDS.join(', ') +
              '. `values` (a static list) and `valuesSource` ("{{providerName.key}}", resolved from AppData when the editor opens) apply only to agSelectCellEditor / agRichSelectCellEditor. Setting an editor also makes the column editable — without that flag AG-Grid never opens it. Pass "none" to remove the editor.',
          },
          filter: {
            type: 'object',
            description:
              'Column filter: a kind string, or { "kind"?, "enabled"?, "floatingFilter"?, "debounceMs"?, "buttons"?, "setFilterOptions"? }. Kinds: ' +
              FILTER_KINDS.join(', ') +
              '. On a live-updating blotter prefer the streamSafe* kinds — their floating-filter input stays typeable while data ticks, and they already bundle a set filter alongside the typed one. Pass "none" to remove filtering config.',
          },
          grouping: {
            type: 'object',
            description:
              'Row-group / pivot behaviour for this column: { "enableRowGroup"?, "enableValue"?, "enablePivot"?, "aggFunc"?, "customAggExpression"?, "allowedAggFuncs"? }. aggFunc is one of ' +
              AGG_FUNCS.join(', ') +
              '; "custom" additionally requires customAggExpression, e.g. "SUM([value]) * 1.1". This is what the column contributes WHEN grouped — use set_row_grouping to choose what the grid groups BY.',
          },
          templateId: {
            type: 'string',
            description:
              'Apply a saved column template to these columns (replaces any template reference they already carry). Templates live in the column-templates module — list them with list_module_items. Pass "none" to drop the reference.',
          },
          sortable: { type: 'boolean' },
          filterable: { type: 'boolean', description: 'Whether the column can be filtered at all. filter.enabled:false takes precedence over this.' },
          resizable: { type: 'boolean' },
          headerTooltip: { type: 'string', description: 'Tooltip shown when hovering the column header.' },
        },
        required: ['targetGridId'],
        additionalProperties: false,
      },
    },
  },
];
