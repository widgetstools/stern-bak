/**
 * The OpenAI-shaped tool schemas sent on every request.
 *
 * Split out of `tools.ts` (which owns the tool vocabulary: names and the
 * read-only set) purely for size — the schemas are the bulk of the surface
 * and the repo caps files at 800 lines. The column-mutation schemas were
 * split off again for the same reason and are appended from
 * `columnToolSchemas.ts`; the two share `toolSchemaShared.ts`.
 */
import { DIRECTION_ICON_KEYS, FLASH_COLORS } from './ruleFeatures';
import { FEATURE_GUIDE_IDS } from './featureGuides';
import { COLUMN_TOOL_SCHEMAS } from './columnToolSchemas';
import { TARGET_GRID_ID_PROPERTY, INSTANCE_ID_PROPERTY, type OpenAIToolSchema } from './toolSchemaShared';
import { MODULE_COLLECTIONS } from './moduleCollections';
import { FILTER_OPS, AGG_FNS, CHART_KINDS, SUMMARY_CHART_KINDS } from '@wellsfargo-starui/data';

/** Modules that hold addressable items — the enum for the generic item tools. */
const COLLECTION_MODULE_IDS = [...new Set(MODULE_COLLECTIONS.map((c) => c.moduleId))];

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
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          ...INSTANCE_ID_PROPERTY,
        },
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
        'Open a registered blotter on screen — the same thing clicking its dock button does. Use it when the user says "show me X", and after a change they will want to look at. Safe to call repeatedly: a template-backed blotter has one window, so this focuses the one already open rather than spawning a copy. It does NOT reload — config changes are already live, and the two that need a reload do it themselves.',
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
      description: 'Create a new MarketsGrid blotter: registers it as a launchable, TEMPLATE-BACKED component (hosted at the /#/blotters/marketsgrid route) and files it under the "Assets" dropdown menu on the dock. Optionally binds a data provider so it shows data immediately. The component has one config row — its template — which the open window reads and writes, so later edits persist to the template, apply live, and re-opening focuses the existing window instead of making a copy.',
      parameters: {
        type: 'object',
        properties: {
          displayName: { type: 'string', description: 'Name shown on the dock button and as the blotter caption, e.g. "Credit Blotter".' },
          providerId: { type: 'string', description: 'Optional data-provider id to bind as the live feed — get one from list_data_providers, or create one first with create_data_provider.' },
          addToDock: { type: 'boolean', description: 'Put it on the dock. Defaults to true.' },
          dockGroup: {
            type: 'string',
            description: 'Dock dropdown menu to file it under. Defaults to "Assets" — leave it unset unless the user names a different menu. The menu is created if it does not exist yet. Pass "" to give it its own top-level dock button instead.',
          },
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
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          ...INSTANCE_ID_PROPERTY,
        },
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
          ...INSTANCE_ID_PROPERTY,
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
          ...INSTANCE_ID_PROPERTY,
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
          ...INSTANCE_ID_PROPERTY,
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
          ...INSTANCE_ID_PROPERTY,
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
          ...INSTANCE_ID_PROPERTY,
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
          ...INSTANCE_ID_PROPERTY,
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
      description: 'Delete a blotter: removes its registry entry and any dock buttons pointing at it. Its saved settings are left behind, so recreating it under the same name restores them. Destructive — ask the user first, then pass confirm: true.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          confirm: { type: 'boolean', description: 'Set true only after the user has confirmed the deletion.' },
        },
        required: ['targetGridId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_data_provider',
      description:
        'Update an existing data provider — rename it, or change config fields. Supplied `config` keys are merged over the existing ones; `providerType` cannot change. Passing `config` reloads every open blotter bound to this provider so the change actually shows (same reload set_provider_columns does) — name/description alone do not, since those are cosmetic. ' +
        'To set columns directly, pass `config: { columnDefinitions: [...] }` — an array of { field, headerName, cellDataType?: "text"|"number"|"boolean"|"date"|"dateString"|"object", width?, filter?: boolean|string, sortable?, resizable?, hide?, cellRenderer?, valueFormatter?, valueGetter? }. field MUST match a real key the feed produces (get one from infer_provider_fields or the user, never invent it — the hub prunes rows to just these fields plus keyColumn, so a wrong name is a silently-empty column, not an error). For picking FROM known fields, set_provider_columns is usually simpler; use this when the user wants specific headers, widths, formatting or hidden columns.',
      parameters: {
        type: 'object',
        properties: {
          providerId: { type: 'string', description: 'From list_data_providers.' },
          name: { type: 'string' },
          description: { type: 'string' },
          config: { type: 'object', description: 'Partial config; merged over the existing config. See columnDefinitions shape above.' },
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
        'Delete a data-provider configuration. Reports any blotters still bound to it — rebind those with set_grid_provider or they will show no data. Destructive — ask the user first, then pass confirm: true.',
      parameters: {
        type: 'object',
        properties: {
          providerId: { type: 'string', description: 'From list_data_providers.' },
          confirm: { type: 'boolean', description: 'Set true only after the user has confirmed the deletion.' },
        },
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
        properties: { ...TARGET_GRID_ID_PROPERTY,
          ...INSTANCE_ID_PROPERTY, colId: { type: 'string' } },
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
          ...INSTANCE_ID_PROPERTY,
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
        properties: { ...TARGET_GRID_ID_PROPERTY,
          ...INSTANCE_ID_PROPERTY, ruleId: { type: 'string' } },
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
        properties: { ...TARGET_GRID_ID_PROPERTY,
          ...INSTANCE_ID_PROPERTY, colId: { type: 'string' } },
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
      name: 'list_mock_datasets',
      description:
        'List the datasets a mock provider can generate — positions, trades, and the two legacy shapes — with what each contains, its row identity, how many fields it has and how many are curated. Call this when the user wants a demo/test feed so you can offer the options rather than guessing.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_provider_fields',
      description:
        'Show the fields of a feed as a grouped picker — Identity, Pricing, Risk, Credit, P&L and so on — marking which are in the curated blotter set and which the provider currently shows. This is how you offer fields as choices instead of listing 256 names. Pass providerId for an existing provider, or dataType to browse the mock catalogue before creating one.',
      parameters: {
        type: 'object',
        properties: {
          providerId: { type: 'string', description: 'An existing provider, from list_data_providers.' },
          dataType: { type: 'string', enum: ['positions', 'trades', 'orders', 'custom'], description: 'Browse the mock catalogue without a provider.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'infer_provider_fields',
      description:
        'Probe a LIVE stomp or rest feed and see what fields it actually carries — the assistant\'s equivalent of the Data Provider Editor\'s "Probe → Fields" button, so a feed no longer has to be probed by hand before it can get columns. Opens a real connection and samples rows, so it can be slow or fail if the feed is unreachable; that failure is reported, not swallowed. Read-only — it shows a field picker (grouped like list_provider_fields, with a suggested subset starred) but saves nothing. Not applicable to mock (already has a curated catalogue — use list_provider_fields), appdata (not a row feed), or websocket/socketio (not supported yet).',
      parameters: {
        type: 'object',
        properties: {
          providerId: { type: 'string', description: 'An existing stomp or rest provider, from list_data_providers.' },
          sampleSize: { type: 'number', description: 'Rows to sample before inferring. Defaults to 200.' },
        },
        required: ['providerId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_provider_columns',
      description:
        'Choose which fields a provider exposes as columns. `preset: "curated"` restores the default blotter layout, `preset: "all"` shows the whole catalogue, `fields` sets an exact list in order, and `add`/`remove` adjust the current set. Names come from list_provider_fields for a mock provider, or infer_provider_fields for a probed stomp/rest one — an unknown one is rejected rather than silently dropped. For stomp/rest this re-probes the live feed to resolve fields, so `preset: "curated"` here means the same shallow-fields-first suggestion infer_provider_fields shows, not a hand-picked catalogue. The keyColumn of the feed is kept even if you omit it, because the hub drops rows that cannot resolve it.',
      parameters: {
        type: 'object',
        properties: {
          providerId: { type: 'string' },
          preset: { type: 'string', enum: ['curated', 'all'] },
          fields: { type: 'array', items: { type: 'string' }, description: 'Exact set, in display order.' },
          add: { type: 'array', items: { type: 'string' } },
          remove: { type: 'array', items: { type: 'string' } },
        },
        required: ['providerId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_data_provider',
      description:
        'Create a data-provider configuration. All four useful types are supported and each needs a different `config`:' + 
        ' MOCK — { providerType: "mock", dataType: "positions" | "trades" | "orders" | "custom", rowCount?, updateIntervalMs? }.' + 
        ' Generates realistic fixed-income data offline; the new provider is prepopulated with the curated blotter columns for that dataset, so it is usable immediately. Call list_mock_datasets first to show the options.' + 
        ' STOMP — { providerType: "stomp", websocketUrl, listenerTopic, keyColumn, requestMessage?, snapshotEndToken?, dataType? }. Live streaming over websockets.' + 
        ' REST — { providerType: "rest", baseUrl, endpoint, method: "GET" | "POST", keyColumn, pollInterval?, headers?, queryParams?, auth? }. Snapshot-only, no live tail.' + 
        ' APPDATA — { providerType: "appdata" } plus its variables. Key/value app state, not a row feed.' + 
        ' keyColumn is row identity and matters: the data hub keys its cache by it and silently drops rows that do not resolve one, which the user sees as an empty grid. STOMP and REST feeds save without columnDefinitions — call infer_provider_fields once the provider exists to probe it live, then set_provider_columns (preset: "curated" is a sensible default) to apply a column set.' +
        ' `config.columnDefinitions` (any provider type) is how you author columns directly instead of picking from a catalogue or a probe — an array of { field, headerName, cellDataType?: "text"|"number"|"boolean"|"date"|"dateString"|"object", width?, filter?: boolean|string, sortable?, resizable?, hide?, cellRenderer?, valueFormatter?, valueGetter? }.' +
        ' field MUST be the exact key the feed\'s rows actually carry — for stomp/rest get real ones from infer_provider_fields or from the user, never invent one: the hub prunes every incoming row down to just these fields plus keyColumn at parse time, so a wrong name produces a column that is always empty, not an error. valueGetter takes the same bracket-expression DSL as add_calculated_column ([fieldName], nested as [a.b.c]).' +
        ' Prefer infer_provider_fields + set_provider_columns when choosing FROM known fields; author columnDefinitions directly here (or via update_data_provider) when the user wants specific headers, widths, formatting or a hidden/pinned default those tools do not cover.',
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
          ...INSTANCE_ID_PROPERTY,
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
          ...INSTANCE_ID_PROPERTY,
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
      name: 'undo_last_change',
      description:
        'Reverse the most recent set of changes you made — "undo that", "put it back", "revert". Restores the affected blotters\' saved configuration to what it was before that turn. Blotter creation/deletion and data-provider changes can\'t be reversed this way; the result says so when a turn contained any.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_cell_renderers',
      description:
        'List the visual cell renderers a column can use — pills, heatmaps, sparklines, percent bars, country flags, trend arrows, and the fixed-income built-ins. Each entry says whether it needs configuration. Call this before set_column_style with a renderer; guessing an id writes cleanly and renders nothing.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'diagnose_grid',
      description:
        'Work out why a blotter looks empty, blank or wrong. Walks the whole chain in one call — provider bound and still existing, columnDefinitions and keyColumn present, columns hidden, rows grouped, styling rules disabled or pointing at columns the feed doesn\'t produce, calculated columns referencing unknown fields. Read-only: it explains, it doesn\'t fix. Reach for this the moment a user says "nothing is showing", "my grid is empty" or "the rule isn\'t working", instead of checking each thing by hand.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          ...INSTANCE_ID_PROPERTY,
        },
        required: ['targetGridId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'summarize_grid_data',
      description:
        'Read the blotter\'s ACTUAL ROWS and return a statistical summary — totals, averages, ranges and medians per numeric column, the dominant values per categorical column, and the notable highlights (what is concentrated, what is extreme, what is sparse). This is the tool for "summarize this data", "what\'s in this blotter", "give me the highlights", "how big is the book". Rows are read live from the open blotter\'s feed, so the numbers are the ones the user is looking at. The arithmetic is done for you and is exact — quote the numbers as given and never recompute them yourself.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          ...INSTANCE_ID_PROPERTY,
          columns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Which columns to describe, named however the user named them. Omit to let it pick the most-populated ones — a positions row has 250+ fields, so it caps the list.',
          },
          groupBy: { type: 'string', description: 'Also break the summary down by this column, e.g. "sector" or "desk".' },
          chart: {
            type: 'string',
            enum: [...SUMMARY_CHART_KINDS],
            description:
              'Chart to draw. Omit (or "auto") and the shape of the result decides — a few positive buckets get a pie, an ordered or dated key gets a line, many or long labels get horizontal bars, two numeric columns over raw rows get a scatter. Set it only when the user asks for one by name ("show that as a pie"), or "none" to suppress the chart. No "heatmap" here — this tool\'s result has no 2D table to shade; use query_grid_data with pivotBy for that.',
          },
          allowSample: {
            type: 'boolean',
            description: 'Only when the blotter is closed AND its feed is a mock: describe a freshly generated sample instead of failing. The values are random and are NOT what the user has seen — if you use this you MUST say so.',
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
      name: 'query_grid_data',
      description:
        'Run one analysis over the blotter\'s actual rows and get a result table back — filter, group, aggregate, sort, limit. This is for the specific questions: "top 10 positions by market value", "total notional per sector", "which bonds mature before 2030", "how many trades per desk". Composes with summarize_grid_data: summarize first for the shape, then query for the detail. Results render as a table (and a chart when grouped), so prefer one well-aimed query over narrating rows yourself.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          ...INSTANCE_ID_PROPERTY,
          columns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Columns to return, named however the user named them. Ignored when groupBy is set (the result is then the group keys plus the aggregates).',
          },
          filter: {
            type: 'array',
            description:
              'Clauses, ANDed together: { "column", "op", "value" }. Ops: ' + FILTER_OPS.join(', ') +
              '. "between" takes [min, max]; "in" takes an array; "isEmpty"/"notEmpty" take no value. Example: [{ "column": "sector", "op": "eq", "value": "Financials" }, { "column": "maturityDate", "op": "lt", "value": "2030-01-01" }].',
            items: { type: 'object' },
          },
          groupBy: {
            type: 'array',
            items: { type: 'string' },
            description: 'Roll rows up by these columns. Pair with `aggregate`; with no aggregate you get a row count per group. This is the ROW dimension of a pivot too — pair with pivotBy for a cross-tab.',
          },
          pivotBy: {
            type: 'array',
            items: { type: 'string' },
            description:
              'COLUMN dimension — turns the grouped table into a pivot (cross-tab). groupBy supplies the rows, pivotBy the columns, aggregate the measures that fill the cells; all three are required together. Use low-cardinality columns (currency, rating, sector) — pivoting on something like cusip is rejected once it would build more than 30 columns. Example: groupBy ["sector"], pivotBy ["currency"], aggregate [{ "column": "marketValue", "fn": "sum" }] reads "market value by sector, across currencies".',
          },
          aggregate: {
            type: 'array',
            description:
              'What to compute per group: { "column", "fn", "as"? }. Fns: ' + AGG_FNS.join(', ') +
              '. Example: [{ "column": "marketValue", "fn": "sum" }, { "column": "cusip", "fn": "countDistinct", "as": "names" }]. Requires groupBy (and pivotBy, if set) — for a grid-wide total use summarize_grid_data.',
            items: { type: 'object' },
          },
          sortBy: {
            type: 'object',
            description: '{ "column": "<name>", "direction": "asc" | "desc" }. Defaults to descending — which is what "top N" means.',
          },
          limit: { type: 'number', description: 'Rows to return (default 50, max 500). For "top 10", set 10 and sort descending.' },
          chart: {
            type: 'string',
            enum: [...CHART_KINDS],
            description:
              'Chart to draw. Omit (or "auto") and the shape of the result decides — a few positive buckets get a pie, an ordered or dated key gets a line, many or long labels get horizontal bars, two numeric columns over raw rows get a scatter. Set it only when the user asks for one by name ("show that as a pie"), or "none" to suppress the chart. "heatmap" shades the table\'s numeric cells by magnitude instead of drawing a separate chart — good for a grouped or pivoted result the user wants to scan at a glance ("show that as a heatmap").',
          },
          allowSample: { type: 'boolean', description: 'See summarize_grid_data — generated rows, not the user\'s data.' },
        },
        required: ['targetGridId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_profiles',
      description:
        'List a blotter\'s saved profiles (id, name, which one is the platform default). A profile is a named snapshot of the whole grid configuration — columns, styling, rules, filters, grouping. Call this before updating, deleting or switching one.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          ...INSTANCE_ID_PROPERTY,
        },
        required: ['targetGridId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_profile',
      description:
        'Save the blotter\'s current configuration as a named profile — "save this as Trading view". Captures everything the grid currently has unless fromCurrent is false, which creates an empty one.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          ...INSTANCE_ID_PROPERTY,
          name: { type: 'string', description: 'What the user should see in the profile picker, e.g. "Trading view".' },
          fromCurrent: {
            type: 'boolean',
            description: 'Capture the grid\'s current configuration. Defaults to TRUE — that is what "save this as…" means.',
          },
        },
        required: ['targetGridId', 'name'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_profile',
      description:
        'Rename a profile, and/or overwrite its contents with the blotter\'s current configuration ("update Trading view with how it looks now"). Get profileId from list_profiles.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          ...INSTANCE_ID_PROPERTY,
          profileId: { type: 'string' },
          name: { type: 'string', description: 'New display name. Omit to keep the current one.' },
          captureCurrent: { type: 'boolean', description: 'Overwrite the profile with the grid\'s current configuration.' },
        },
        required: ['targetGridId', 'profileId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_profile',
      description:
        'Delete a saved profile. The platform default profile cannot be deleted. Destructive — ask the user first, then pass confirm: true.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          ...INSTANCE_ID_PROPERTY,
          profileId: { type: 'string' },
          confirm: { type: 'boolean', description: 'Set true only after the user has confirmed.' },
        },
        required: ['targetGridId', 'profileId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'switch_profile',
      description:
        'Make a saved profile the one the blotter is showing. This reaches windows that are open right now; a window opened later starts on whichever profile it last had, so say so rather than promising more.',
      parameters: {
        type: 'object',
        properties: { ...TARGET_GRID_ID_PROPERTY,
          ...INSTANCE_ID_PROPERTY, profileId: { type: 'string' } },
        required: ['targetGridId', 'profileId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reload_grid',
      description:
        'Force the blotter to reload its current profile from disk, right now — no profile switch needed. Most tool calls already show up live without this; call it only when the user reports a change is not showing, or explicitly asks you to refresh/reload the grid, instead of telling them to switch profiles away and back.',
      parameters: {
        type: 'object',
        properties: { ...TARGET_GRID_ID_PROPERTY, ...INSTANCE_ID_PROPERTY },
        required: ['targetGridId'],
        additionalProperties: false,
      },
    },
  },
  ...COLUMN_TOOL_SCHEMAS,
];
