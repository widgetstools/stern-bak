/**
 * OpenAI-style function-calling tool schemas for the AI Assistant.
 *
 * These are sent verbatim in the `tools` array of every
 * `/v1/chat/completions` request (see `llmClient.ts`) and dispatched by
 * `useToolExecutor.ts` when the model calls one. `config`/`style` payloads
 * are kept loose (plain `object`) rather than fully discriminated JSON
 * Schema — `systemPrompt.ts` teaches the model the exact shapes, and
 * `useToolExecutor` runs the same runtime validation the manual UI would
 * before applying anything, feeding validation failures back as the tool
 * result so the model can repair and retry.
 *
 * This assistant runs in its own standalone OpenFin window (opened from a
 * dock button) — there is no live MarketsGrid in this window. Every tool
 * that touches a grid's customization takes an explicit `targetGridId`
 * (a Component Registry entry id, e.g. "grid-test") and reads/writes that
 * grid's *persisted* profile via `ConfigManager.profiles` — see
 * `useToolExecutor.ts`. `list_grids` is how the model discovers valid ids.
 */

import { DIRECTION_ICON_KEYS, FLASH_COLORS } from './ruleFeatures';
import { FEATURE_GUIDE_IDS } from './featureGuides';
import { STYLE_TARGETS, HORIZONTAL_ALIGNS, VERTICAL_ALIGNS } from './columnStyle';
import { MODULE_COLLECTIONS } from './moduleCollections';

/** Modules that hold addressable items — the enum for the generic item tools. */
const COLLECTION_MODULE_IDS = [...new Set(MODULE_COLLECTIONS.map((c) => c.moduleId))];

export type ToolName =
  | 'list_grids'
  | 'list_data_providers'
  | 'get_grid_columns'
  | 'list_grid_instances'
  | 'describe_data_fields'
  | 'list_grid_customizations'
  | 'list_grid_modules'
  | 'get_feature_guide'
  | 'get_module_settings'
  | 'update_module_settings'
  | 'list_module_items'
  | 'add_module_item'
  | 'update_module_item'
  | 'remove_module_item'
  | 'create_blotter'
  | 'open_blotter'
  | 'rename_blotter'
  | 'delete_blotter'
  | 'set_grid_provider'
  | 'create_data_provider'
  | 'update_data_provider'
  | 'delete_data_provider'
  | 'add_calculated_column'
  | 'remove_calculated_column'
  | 'add_conditional_styling_rule'
  | 'update_conditional_styling_rule'
  | 'remove_conditional_styling_rule'
  | 'set_column_style'
  | 'clear_column_style';

/** Tools that only read state — safe to auto-execute without user confirmation. */
export const READ_ONLY_TOOLS: readonly ToolName[] = [
  'list_grids',
  'list_data_providers',
  'get_grid_columns',
  'describe_data_fields',
  'list_grid_instances',
  'list_grid_customizations',
  'list_grid_modules',
  'get_feature_guide',
  'get_module_settings',
  'list_module_items',
];

export function isReadOnlyTool(name: string): name is (typeof READ_ONLY_TOOLS)[number] {
  return (READ_ONLY_TOOLS as readonly string[]).includes(name);
}

export interface OpenAIToolSchema {
  type: 'function';
  function: {
    name: ToolName;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * The rich, top-level rule properties — flash, indicator badge, glyph
 * animation and the timed active window. Shared verbatim by the add and
 * update schemas so the two can't drift.
 *
 * These are NOT part of `style`: putting them there is the natural guess and
 * it silently paints nothing, so the descriptions say so explicitly. Enum
 * values come from the engine's own catalogs (see `ruleFeatures.ts`).
 */
const RULE_FEATURE_PROPERTIES = {
  activeDurationMs: {
    type: 'number',
    description:
      'Makes the rule TRANSIENT: when a value change makes the expression true, the rule paints for this many ms and then reverts on its own. This is how you build tick indicators — pair it with an expression comparing a column to its previous value, e.g. "[marketValue] > [marketValue.old]". Omit for a rule that stays on for as long as it matches.',
  },
  indicator: {
    type: 'object',
    description:
      'Small badge drawn on matching cells/headers: { "icon": <key>, "color"?: CSS colour, "target"?: "cells" | "headers" | "cells+headers", "position"?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "left-middle" | "right-middle" }. Direction icons: ' +
      `${DIRECTION_ICON_KEYS.join(', ')}. Any key from the catalog is valid — an unknown key is rejected with the full list.`,
  },
  flash: {
    type: 'object',
    description:
      'Flash the cell/row surface when the rule matches: { "enabled": true, "target"?: "cells" | "headers" | "cells+headers" | "row", "mode"?: "oneShot" | "pulse", "color"?: ' +
      `${FLASH_COLORS.join(' | ')}, "durationMs"?: number (default 700) }. "target" must match the rule's scope — row rules flash "row", cell rules flash cells/headers.`,
  },
  animation: {
    type: 'object',
    description:
      'Animate the matching cell\'s value glyph (not the cell surface): { "enabled": true, "kind"?: "spin" | "spin-reverse" | "pulse", "durationMs"?: number }. Cell-scope rules only; pair with a value format that renders an emoji/icon.',
  },
} as const;

const TARGET_GRID_ID_PROPERTY = {
  targetGridId: { type: 'string', description: 'The grid\'s registry id, from list_grids (e.g. "grid-test"). Always call list_grids first if you don\'t already know it.' },
};

export const TOOL_SCHEMAS: OpenAIToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'list_grids',
      description: 'List the MarketsGrid blotters registered on the dock (id, display name). Call this before referencing any grid by id, and whenever the user doesn\'t say which grid they mean.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_data_providers',
      description: 'List the current user’s saved data-provider configurations (id, name, type). Call this before proposing an update to an existing provider.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_grid_columns',
      description: 'List the columns of a grid (colId, headerName, cellDataType), derived from its bound data provider. Always call this before referencing a column id in another tool call — never guess a colId.',
      parameters: {
        type: 'object',
        properties: { ...TARGET_GRID_ID_PROPERTY },
        required: ['targetGridId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_blotter',
      description:
        'Open a registered blotter on screen — the same thing clicking its dock button does. Use it when the user says "show me X", and after a change they will want to look at.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          asWindow: { type: 'boolean', description: 'Override how it opens; defaults to the registry entry\'s own setting.' },
        },
        required: ['targetGridId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'describe_data_fields',
      description:
        'List the fields a data feed produces — by providerId, or by mock dataType BEFORE any provider exists. Use this whenever you need a field name and the grid has no provider bound yet, or the user is asking for something new ("a blotter showing spread", "highlight when yield moves"). Never invent a column name: a rule or filter on a field that does not exist saves cleanly and then silently never matches.',
      parameters: {
        type: 'object',
        properties: {
          providerId: { type: 'string', description: 'An existing provider, from list_data_providers.' },
          dataType: {
            type: 'string',
            enum: ['positions', 'trades', 'orders', 'custom'],
            description: 'Ask what a mock feed of this shape would produce, without creating one. "positions" and "trades" are rich fixed-income datasets; "orders"/"custom" are a sparse legacy shape.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_grid_instances',
      description:
        'List the open/saved windows (instances) of a blotter alongside its template row. Each dock launch of a non-singleton blotter clones the template into its own config row, so a grid can have several. Your changes are applied to the template AND every instance, so you rarely need this — use it to explain where a change landed, or when the user says a window still looks different.',
      parameters: {
        type: 'object',
        properties: { ...TARGET_GRID_ID_PROPERTY },
        required: ['targetGridId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_blotter',
      description: 'Create a new MarketsGrid blotter: registers it as a launchable component (hosted at the /#/blotters/marketsgrid route) and adds a dock button that opens it. Optionally binds a data provider so it shows data immediately.',
      parameters: {
        type: 'object',
        properties: {
          displayName: { type: 'string', description: 'Name shown on the dock button and as the blotter caption, e.g. "Credit Blotter".' },
          providerId: { type: 'string', description: 'Optional data-provider id to bind as the live feed — get one from list_data_providers, or create one first with create_data_provider.' },
          addToDock: { type: 'boolean', description: 'Add a dock button for it. Defaults to true.' },
          asWindow: { type: 'boolean', description: 'true (default) opens it as its own OpenFin window; false docks it as a view in the workspace window.' },
          openNow: {
            type: 'boolean',
            description: 'Open the blotter on screen as soon as it is created. Defaults to TRUE — the user should see the thing they asked for, not have to hunt for it on the dock. Pass false only when they explicitly asked you to just set it up for later.',
          },
        },
        required: ['displayName'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_grid_customizations',
      description: 'List what a grid currently has: calculated columns, conditional-styling rules (with their ids), and which columns are styled. Call this before updating or removing anything — rule ids come from here.',
      parameters: {
        type: 'object',
        properties: { ...TARGET_GRID_ID_PROPERTY },
        required: ['targetGridId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_grid_modules',
      description: 'List every configurable module of a grid and what each one controls. Use this to discover where a setting lives — every option the grid\'s Settings drawer exposes is reachable through get_module_settings / update_module_settings.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_feature_guide',
      description:
        'Read the worked configuration reference for one grid feature — exact JSON shapes, expression syntax and copy-ready examples taken from the MarketsGrid reference app. Call this BEFORE configuring a feature you have not configured in this conversation, especially conditional-styling (flash / indicator badges / tick rules), value formatters and calculated-column expressions. It costs one cheap round trip and prevents guessing at a shape that saves cleanly but paints nothing.',
      parameters: {
        type: 'object',
        properties: {
          featureId: {
            type: 'string',
            enum: [...FEATURE_GUIDE_IDS],
            description: 'Which guide to read. Same id as the module in list_grid_modules.',
          },
        },
        required: ['featureId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_module_settings',
      description: 'Read a grid module\'s current settings as JSON. Call this before update_module_settings so you know the existing values and exact key names.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          moduleId: { type: 'string', description: 'Module id from list_grid_modules, e.g. "general-settings".' },
        },
        required: ['targetGridId', 'moduleId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_module_settings',
      description: 'Set options on a grid module. `settings` is shallow-merged, so supplying one key leaves all other options untouched. This is how you change grid-wide behaviour — e.g. moduleId "general-settings" with { "enableCellChangeFlash": true, "cellChangeFlashColor": "emerald" }, or { "rowHeight": 24, "gridDensity": "ultra" }, or { "pagination": true, "paginationPageSize": 50 }. For calculated columns, styling rules and column styles prefer the dedicated add/update/remove tools, which preserve per-item ids.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          moduleId: { type: 'string', description: 'Module id from list_grid_modules.' },
          settings: { type: 'object', description: 'Keys to set, merged over the current settings.' },
        },
        required: ['targetGridId', 'moduleId', 'settings'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_module_items',
      description:
        'List the addressable items a grid module holds — conditional-styling rules, calculated columns, column groups, saved-filter pills, alert rules, per-column assignments, column templates. Returns each item with its id, so you can then update or remove exactly one. Call this before update_module_item / remove_module_item.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          moduleId: { type: 'string', enum: [...COLLECTION_MODULE_IDS], description: 'Module holding the collection.' },
          collection: { type: 'string', description: 'Only needed when a module has more than one collection (alerts: "rules" or "history").' },
        },
        required: ['targetGridId', 'moduleId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_module_item',
      description:
        'Append one item to a module collection — an alert rule, a saved-filter pill, a column group, a column template, and so on. Use the dedicated tools where they exist (add_conditional_styling_rule, add_calculated_column, set_column_style) since they validate and fill in defaults; use this for everything else. Call get_feature_guide first for the item shape. An id is generated when the item has none.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          moduleId: { type: 'string', enum: [...COLLECTION_MODULE_IDS] },
          collection: { type: 'string', description: 'Only needed when the module has more than one collection.' },
          item: { type: 'object', description: 'The complete item object, shaped as the module stores it.' },
        },
        required: ['targetGridId', 'moduleId', 'item'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_module_item',
      description:
        'Patch ONE item in a module collection by id, leaving its siblings untouched. The patch is shallow-merged over the item, so send only the keys you are changing. Get ids from list_module_items.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          moduleId: { type: 'string', enum: [...COLLECTION_MODULE_IDS] },
          collection: { type: 'string', description: 'Only needed when the module has more than one collection.' },
          itemId: { type: 'string', description: 'Id of the item to patch, from list_module_items.' },
          patch: { type: 'object', description: 'Keys to set, merged over the existing item.' },
        },
        required: ['targetGridId', 'moduleId', 'itemId', 'patch'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_module_item',
      description: 'Delete ONE item from a module collection by id. Get ids from list_module_items.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          moduleId: { type: 'string', enum: [...COLLECTION_MODULE_IDS] },
          collection: { type: 'string', description: 'Only needed when the module has more than one collection.' },
          itemId: { type: 'string' },
        },
        required: ['targetGridId', 'moduleId', 'itemId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rename_blotter',
      description: 'Change a blotter\'s display name. Its id stays the same, and any dock buttons are retitled to match.',
      parameters: {
        type: 'object',
        properties: { ...TARGET_GRID_ID_PROPERTY, displayName: { type: 'string' } },
        required: ['targetGridId', 'displayName'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_blotter',
      description: 'Delete a blotter: removes its registry entry and any dock buttons pointing at it. Its saved settings are left behind, so recreating it under the same name restores them.',
      parameters: {
        type: 'object',
        properties: { ...TARGET_GRID_ID_PROPERTY },
        required: ['targetGridId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_data_provider',
      description: 'Update an existing data provider — rename it, or change config fields. Supplied `config` keys are merged over the existing ones; `providerType` cannot change.',
      parameters: {
        type: 'object',
        properties: {
          providerId: { type: 'string', description: 'From list_data_providers.' },
          name: { type: 'string' },
          description: { type: 'string' },
          config: { type: 'object', description: 'Partial config; merged over the existing config.' },
        },
        required: ['providerId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_data_provider',
      description:
        'Delete a data-provider configuration. Reports any blotters still bound to it — rebind those with set_grid_provider or they will show no data. Confirm with the user before calling this: other grids may depend on the provider.',
      parameters: {
        type: 'object',
        properties: { providerId: { type: 'string', description: 'From list_data_providers.' } },
        required: ['providerId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_calculated_column',
      description: 'Remove a calculated column from a grid by its colId.',
      parameters: {
        type: 'object',
        properties: { ...TARGET_GRID_ID_PROPERTY, colId: { type: 'string' } },
        required: ['targetGridId', 'colId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_conditional_styling_rule',
      description: 'Modify an existing conditional-styling rule — enable/disable it, or change its name, priority, expression, scope, style, flash, indicator, animation or timed active window. Only the fields you supply change. Get ruleId from list_grid_customizations.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          ruleId: { type: 'string' },
          enabled: { type: 'boolean' },
          name: { type: 'string' },
          priority: { type: 'number' },
          expression: { type: 'string' },
          scope: { type: 'object' },
          style: { type: 'object' },
          ...RULE_FEATURE_PROPERTIES,
        },
        required: ['targetGridId', 'ruleId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_conditional_styling_rule',
      description: 'Delete a conditional-styling rule. Get ruleId from list_grid_customizations.',
      parameters: {
        type: 'object',
        properties: { ...TARGET_GRID_ID_PROPERTY, ruleId: { type: 'string' } },
        required: ['targetGridId', 'ruleId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clear_column_style',
      description: 'Remove all styling and formatting from one column, returning it to defaults.',
      parameters: {
        type: 'object',
        properties: { ...TARGET_GRID_ID_PROPERTY, colId: { type: 'string' } },
        required: ['targetGridId', 'colId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_grid_provider',
      description: 'Bind (or re-bind) an EXISTING blotter to a data provider. Use this to point a grid at a different feed — it does not require recreating the blotter.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          providerId: { type: 'string', description: 'Data-provider id from list_data_providers or create_data_provider.' },
          mode: { type: 'string', enum: ['live', 'historical'], description: 'Which feed slot to bind; defaults to "live".' },
        },
        required: ['targetGridId', 'providerId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_data_provider',
      description: 'Create a new data-provider configuration. `config` shape depends on `providerType` — see the system prompt for the exact fields of each provider type.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Display name for the provider.' },
          description: { type: 'string' },
          providerType: {
            type: 'string',
            enum: ['stomp', 'rest', 'websocket', 'socketio', 'mock', 'appdata'],
          },
          config: {
            type: 'object',
            description: 'Provider-type-specific config object, e.g. for `mock`: { providerType: "mock", dataType: "positions" | "trades" | "orders" | "custom" }.',
          },
        },
        required: ['name', 'providerType', 'config'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_calculated_column',
      description: 'Add a new calculated (virtual) column to a grid, computed from other columns via an expression. Column refs in the expression use bracket syntax, e.g. `[price] * [quantity]`.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          colId: { type: 'string', description: 'Unique id for the new column (no spaces, e.g. "notional").' },
          headerName: { type: 'string' },
          expression: { type: 'string', description: 'DSL expression, e.g. "[price] * [quantity]" or "IF([modifiedDuration] < 3, \\"Short\\", \\"Long\\")".' },
          cellDataType: { type: 'string', enum: ['text', 'number', 'boolean', 'date', 'dateString', 'object'] },
          position: { type: 'number', description: 'Optional 0-based index to insert at; omit to append at the end.' },
        },
        required: ['targetGridId', 'colId', 'headerName', 'expression'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_conditional_styling_rule',
      description: 'Add a rule that highlights cells or rows on a grid when an expression matches. Provide BOTH a light and a dark variant of the style so the rule renders correctly in either theme. Optionally attach a flash, an indicator badge, a glyph animation, or a timed active window (activeDurationMs) for tick-style indicators.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          name: { type: 'string' },
          scope: {
            type: 'object',
            description: 'Either { "type": "row" } to paint the whole row, or { "type": "cell", "columns": ["colId", ...] } to paint specific columns.',
          },
          expression: {
            type: 'string',
            description:
              'Expression evaluated per row, e.g. "[spreadBps] > 50". It can also compare a column against its PREVIOUS value via the .old / .new suffixes — "[marketValue] > [marketValue.old]" is true on an upward tick. Always reference columns as [colId]; the bare `value` / `x` variables are not populated for timed rules.',
          },
          style: {
            type: 'object',
            description: '{ "light": { "backgroundColor"?, "color"? }, "dark": { "backgroundColor"?, "color"? } } — CSS colour strings (hex or rgb/rgba).',
          },
          priority: { type: 'number', description: 'Lower runs first; omit to run last.' },
          ...RULE_FEATURE_PROPERTIES,
        },
        required: ['targetGridId', 'name', 'scope', 'expression', 'style'],
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
          formatPreset: {
            type: 'string',
            enum: ['currency', 'percent', 'number', 'date', 'datetime', 'duration'],
            description: 'Applies to cell values. With allColumns it sets the grid-wide number or date formatter, depending on the preset.',
          },
        },
        required: ['targetGridId'],
        additionalProperties: false,
      },
    },
  },
];
