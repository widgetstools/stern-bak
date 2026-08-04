import type { FeatureGuide, FeatureGuidePropRow } from './types';
import { CONDITIONAL_TAB_CS_RULES, LIVE_TAB_CS_RULES } from '../seeds/conditionalStyling';
import { serializeConfig } from './serializeConfig';

/** Mount props shared by every MarketsGrid in the lab — prepended to each guide's props. */
export const BASE_PROPS: FeatureGuidePropRow[] = [
  { name: 'gridId', type: 'string', note: 'Stable id; scopes the stored profile/config in localStorage.' },
  { name: 'rowData', type: 'TData[]', note: 'Row objects. The mock stream pushes delta updates here.' },
  { name: 'columnDefs', type: 'ColDef[]', note: 'ag-grid column definitions.' },
  { name: 'rowIdField', type: "string | string[]", default: "'id'", note: 'Primary key used for delta updates.' },
  { name: 'storage', type: 'StorageAdapterFactory', note: 'Where profiles persist — localStorage in the lab.' },
  { name: 'onReady', type: '(handle: MarketsGridHandle) => void', note: 'Fires when grid + module platform are ready.' },
];

const showProfileSelector: FeatureGuidePropRow = {
  name: 'showProfileSelector', type: 'boolean', default: 'true', note: 'Profile picker in the toolbar (save/clone/export).',
};
const showSaveButton: FeatureGuidePropRow = {
  name: 'showSaveButton', type: 'boolean', default: 'true', note: 'Explicit Save of the current config to the active profile.',
};
const showSettingsButton: FeatureGuidePropRow = {
  name: 'showSettingsButton', type: 'boolean', default: 'true', note: 'Opens the Settings sheet — the main place you configure modules.',
};

export const FEATURE_GUIDES: Record<string, FeatureGuide> = {
  overview: {
    id: 'overview',
    category: 'getting-started',
    summary: 'The kitchen-sink grid: filters, formatting, editing, and a profile per "lens".',
    whatWhy:
      'The Overview tab mounts MarketsGrid with most toolbars on and ships several **profiles** — each a saved snapshot of columns, styles, filters and grouping. Switch lenses from the profile selector to see how one grid serves many views. Start here to get the lay of the land, then drill into a focused tab.',
    trySteps: [
      { text: 'Open the profile selector in the toolbar and switch between the shipped lenses.' },
      { text: 'Click the Settings (gear) button to see the module list that backs the current profile.' },
      { text: 'Use the Demo Console on the right to fire a scenario and watch cells react.' },
    ],
    props: [
      { name: 'showFiltersToolbar', type: 'boolean', default: 'false', note: 'Saved-filter pill carousel.' },
      { name: 'showFormattingToolbar', type: 'boolean', default: 'false', note: 'Cell/header style + number-format toolbar.' },
      { name: 'showEditingToolbar', type: 'boolean', default: 'false', note: 'Smart-edit / bulk-update / history controls.' },
      { name: 'sideBar', type: "{ toolPanels: string[] }", note: "ag-grid side panels, e.g. ['columns','filters']." },
      { name: 'statusBar', type: '{ statusPanels: [] }', note: 'Row counts + aggregation footer.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  formatting: {
    id: 'formatting',
    category: 'formatting-display',
    summary: 'Number, date, percent and currency formatters with themed overrides.',
    whatWhy:
      'Display formatting is configured per column through the **Formatting toolbar** and persisted in the profile — no `valueFormatter` code required. Decimals, thousands separators, percent/bp scaling, and date/time patterns are all UI-driven, with separate light/dark overrides where needed. Use it whenever raw values need human-readable presentation.',
    trySteps: [
      { text: 'Select a numeric column header, then pick a format preset from the Formatting toolbar.' },
      { text: 'Export to Visual Excel — formatters are baked into the .xlsx.', hint: 'Use the export button in the toolbar.' },
    ],
    props: [
      { name: 'showFormattingToolbar', type: 'boolean', default: 'false', note: 'The format/style editor surface.' },
      { name: 'showVisualExcelExport', type: 'boolean', default: 'false', note: 'WYSIWYG styled .xlsx export button.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  renderers: {
    id: 'renderers',
    category: 'formatting-display',
    summary: 'Visual cell renderers: pills, heatmaps, sparklines, percent bars, flags.',
    whatWhy:
      'Renderers turn a cell value into a visual: a rating pill, a heatmap fill, an inline KRD sparkline, a percent bar, a country flag. They are assigned per column in the column settings and travel with the profile. Reach for them when a glance should convey magnitude or category faster than digits.',
    trySteps: [
      { text: 'Open Settings → column customization and inspect which renderer each visual column uses.' },
      { text: 'Switch profiles to compare a renderer-heavy lens against a plain one.' },
    ],
    props: [
      { name: 'defaultColDef', type: 'ColDef', note: 'Renderers tab sets autoHeight:false so bars/sparklines size cleanly.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  conditional: {
    id: 'conditional',
    category: 'formatting-display',
    summary: 'Expression-driven cell/row styling, flashes, indicators and diff rules.',
    whatWhy:
      'Conditional styling paints cells or rows from boolean **expressions** (`value < 0`, `[ask] - [bid] > 0.1`, `[mid.new] > [mid.old]`). Each rule can add colour, a one-shot or pulsing flash, and an indicator badge. Rules are authored in the Settings sheet and persisted per profile. Use them to make risk, P&L direction and ticks pop without touching grid code.',
    trySteps: [
      { text: 'Open Settings → Conditional styling and toggle a rule on/off; watch the grid update live.' },
      { text: 'Fire a price-tick scenario from the Demo Console to see diff rules (`mid.new` vs `mid.old`) flash.' },
    ],
    props: [showProfileSelector, showSaveButton, showSettingsButton],
    extraConfig: [
      {
        label: 'Conditional styling rules',
        lang: 'json',
        code: serializeConfig(CONDITIONAL_TAB_CS_RULES),
      },
    ],
  },

  toolbar: {
    id: 'toolbar',
    category: 'formatting-display',
    summary: 'The floating Formatting toolbar — paint cells and headers live.',
    whatWhy:
      'The Formatting toolbar is a floating palette for ad-hoc cell/header styling: font weight, colour, fills, borders and alignment applied to the current selection. Changes are captured into the profile so they survive reloads. It is the fastest way to demonstrate the config-driven styling pipeline interactively.',
    trySteps: [
      { text: 'Select a range of cells, then apply a fill and bold weight from the floating toolbar.' },
      { text: 'Select a column header and paint it; note cell vs header targeting.' },
      { text: 'Save the profile, reload, and confirm the styling persisted.' },
    ],
    props: [
      { name: 'showFormattingToolbar', type: 'boolean', default: 'false', note: 'Enables the floating palette.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  'visual-excel': {
    id: 'visual-excel',
    category: 'formatting-display',
    summary: 'WYSIWYG .xlsx export — formatters and style rules baked into the sheet.',
    whatWhy:
      'Visual Excel export writes an .xlsx that mirrors what is on screen: number formats, rule-generated colours, fonts and fills are all carried into Excel cells, not just raw values. Configure formatting/styling as usual, then export. Use it when stakeholders want the grid as a spreadsheet that still looks like the grid.',
    trySteps: [
      { text: 'Apply a couple of formatting and conditional-style rules.' },
      { text: 'Click the Visual Excel export button and open the downloaded file to compare.' },
    ],
    props: [
      { name: 'showVisualExcelExport', type: 'boolean', default: 'false', note: 'The export button.' },
      { name: 'showFormattingToolbar', type: 'boolean', default: 'false', note: 'So you can author the styles that get exported.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  groups: {
    id: 'groups',
    category: 'columns-layout',
    summary: 'Nested column header groups with open/closed presets.',
    whatWhy:
      'Column groups nest related columns under labelled, collapsible headers (Pricing, Yields, Risk, P&L…). Groups, their labels, styling and expand/collapse state are authored in Settings and saved per profile. Use them to tame wide blotters into scannable sections.',
    trySteps: [
      { text: 'Collapse and expand a header group directly in the grid.' },
      { text: 'Switch between the open and closed group presets via the profile selector.' },
    ],
    props: [showProfileSelector, showSaveButton, showSettingsButton],
  },

  calc: {
    id: 'calc',
    category: 'columns-layout',
    summary: 'Virtual columns computed from expressions over row fields.',
    whatWhy:
      'Calculated columns add **virtual** columns from expressions (`[ask] - [bid]`, nested `IF`, cross-field math) without changing the data source. They behave like any column — styled, grouped, aggregated, flashed. Authored in Settings → Calculated columns and saved per profile. Use them for derived analytics the feed does not provide.',
    trySteps: [
      { text: 'Open Settings → Calculated columns and read one expression.' },
      { text: 'Switch profiles to add more virtual columns; watch cell-change flash on recompute.' },
    ],
    props: [
      { name: 'defaultColDef', type: 'ColDef', note: 'This tab sets enableCellChangeFlash:true so recomputes flash.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  filters: {
    id: 'filters',
    category: 'filtering-data',
    summary: 'Saved filter pills — capture, toggle, and stack filter sets.',
    whatWhy:
      'Quick filters are named filter models pinned to the toolbar as pills (High Yield, Wide Spreads, BB-rated…). Capture the current filter state into a pill, then toggle pills to stack them with AND logic. Saved per profile. Use them to give users one-click access to the views they reach for daily.',
    trySteps: [
      { text: 'Set a column filter, then capture it as a new pill from the Filters toolbar.' },
      { text: 'Toggle two pills and confirm the row count reflects the AND of both.' },
    ],
    props: [
      { name: 'showFiltersToolbar', type: 'boolean', default: 'false', note: 'The saved-filter pill carousel.' },
      { name: 'defaultColDef', type: 'ColDef', note: 'floatingFilter:true so per-column quick filters show.' },
      { name: 'sideBar', type: "{ toolPanels: ['filters'] }", note: 'ag-grid filters panel.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  live: {
    id: 'live',
    category: 'filtering-data',
    summary: 'High-frequency streaming with tick flashes and direction styling.',
    whatWhy:
      'The Live tab drives MarketsGrid with a fast mock stream (tick interval set in the Demo Console) using ag-grid delta transactions, so only changed cells repaint. Conditional rules flash ticks and colour winners/losers. Use it to see how the grid behaves under load and how flash/diff rules read in real time.',
    trySteps: [
      { text: 'Drag the tick-interval slider in the Demo Console down to ~150ms.' },
      { text: 'Watch price cells flash and P&L cells colour by direction.' },
    ],
    props: [showProfileSelector, showSaveButton, showSettingsButton],
    extraConfig: [
      {
        label: 'Live tick + direction rules',
        lang: 'json',
        code: serializeConfig(LIVE_TAB_CS_RULES),
      },
    ],
  },

  alerts: {
    id: 'alerts',
    category: 'filtering-data',
    summary: 'Expression alerts across toast, badge and OpenFin channels.',
    whatWhy:
      'Alerts watch cell values with expressions and fire on change to one or more channels (toast, bell badge, OpenFin notification), with debounce and rate limiting. Rules are authored in Settings → Alerts and saved per profile. Use them to surface threshold breaches without users staring at the grid.',
    trySteps: [
      { text: 'Open Settings → Alerts and read a rule\'s expression and channels.' },
      { text: 'Fire a matching scenario from the Demo Console and watch the toast/badge.' },
    ],
    props: [showProfileSelector, showSaveButton, showSettingsButton],
  },

  editing: {
    id: 'editing',
    category: 'editing',
    summary: 'The full editing family: smart-edit, bulk-update, +/- and history.',
    whatWhy:
      'The Editing tab turns on the editing toolbar so you can apply arithmetic across a selection (smart-edit), replace a range with one value (bulk-update), and step changes with undo/redo history. Editable columns are configured per column. Use it to see the complete write path in one place.',
    trySteps: [
      { text: 'Select a numeric range and apply a smart-edit operation (e.g. ×1.1).' },
      { text: 'Undo it from the edit-history controls and confirm the values revert.' },
    ],
    props: [
      { name: 'showEditingToolbar', type: 'boolean', default: 'false', note: 'Smart-edit + bulk-update + history surface.' },
      { name: 'showFormattingToolbar', type: 'boolean', default: 'false', note: 'On here so edits and styling demo together.' },
      { name: 'showFiltersToolbar', type: 'boolean', default: 'false', note: 'Filter before bulk editing a subset.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  'bulk-update': {
    id: 'bulk-update',
    category: 'editing',
    summary: 'Replace a whole selection with one value — text, number or date.',
    whatWhy:
      'Bulk update writes a single value (or formula) across a rectangular selection in one action, with a confirmation step. Column editability and data type (text/number/date) are set per column. Use it for fast corrections across many rows — re-book a desk, restamp a maturity, zero a field.',
    trySteps: [
      { text: 'Select a range in an editable column.' },
      { text: 'Enter a value in the Bulk Update toolbar and apply; confirm the dialog.' },
    ],
    props: [
      { name: 'showBulkUpdateToolbar', type: 'boolean', default: 'false', note: 'The replace-selection control.' },
      { name: 'showEditHistoryToolbar', type: 'boolean', default: 'false', note: 'Undo/redo of the bulk write.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  'plus-minus': {
    id: 'plus-minus',
    category: 'editing',
    summary: 'Keyboard +/- nudges with per-column steps and expression gates.',
    whatWhy:
      'Plus/Minus binds the + and - keys to nudge the focused cell by a configured step (qty ±100, mid ±0.01), optionally gated by an expression so only valid rows respond. Rules are authored in Settings and saved per profile. Use it for fast keyboard-driven adjustments on a trading blotter.',
    trySteps: [
      { text: 'Focus an editable numeric cell and press + a few times.' },
      { text: 'Press - to nudge back down; undo from the history controls.' },
    ],
    props: [
      { name: 'showEditHistoryToolbar', type: 'boolean', default: 'false', note: 'Undo/redo of nudges.' },
      { name: 'showFiltersToolbar', type: 'boolean', default: 'false', note: 'Scope before nudging.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  shortcuts: {
    id: 'shortcuts',
    category: 'editing',
    summary: 'Letter-key arithmetic shortcuts on the focused cell.',
    whatWhy:
      'Shortcuts map letter keys to arithmetic operations on the focused numeric cell (e.g. H = ×100, M = +1000, L = −500). Distinct from K/M/B input parsing — these are operations, not units. Authored in Settings and saved per profile. Use them for power-user keyboard workflows.',
    trySteps: [
      { text: 'Focus an editable numeric cell and press a configured letter key.' },
      { text: 'Open Settings → Shortcuts to see the full key→operation map.' },
    ],
    props: [
      { name: 'showEditHistoryToolbar', type: 'boolean', default: 'false', note: 'Undo/redo of shortcut ops.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  profiles: {
    id: 'profiles',
    category: 'profiles',
    summary: 'Pre-baked configuration "lenses" you can clone, export and import.',
    whatWhy:
      'A profile is an atomic snapshot of everything you configured — columns, styles, filters, grouping, module state — saved under a `gridId`. Clone, rename, export to JSON, and import them. This tab is a gallery of ready-made lenses (Trader, Analytics, Compact, Grouped). Profiles are the unit of persistence the whole lab is built on.',
    trySteps: [
      { text: 'Pick a preset lens from the gallery and open it.' },
      { text: 'Tweak a setting, Save, reload — confirm it persisted under the profile.' },
    ],
    props: [
      showProfileSelector,
      showSaveButton,
      { name: 'appId / userId / instanceId', type: 'string', note: 'Scope keys when persisting via a ConfigService instead of localStorage.' },
    ],
  },

  stress: {
    id: 'stress',
    category: 'performance',
    summary: 'A big, wide book on both row engines — and a second window on the same one.',
    whatWhy:
      'Every other tab runs 500 rows over 20–40 columns, where both row engines are comfortable and therefore indistinguishable. This one varies the book instead of the feature: **1,000 to 200,000 rows** over ~120 columns, with the same row-engine picker every tab has.\n\nUnder the **client row model** each window materializes the whole book, so a second window costs a second full copy sent over the wire. Under **Perspective** the book lives once in the SharedWorker and each window opens a View onto it, so the second window attaches to what is already there. That is the entire reason the engine exists, and it is invisible until there is enough data for the copies to matter and more than one window to hold them.\n\nThe wide columns are **derived from real fields**, not invented — `Risk krd5Y · s2` reads the same number as `krd5Y`. Inert padding columns would let an engine shortcut exactly the work this tab is trying to measure.\n\nTreat it as a shape, not a benchmark: it is synthetic data in a demo app. Real figures need a real book and a profiler.',
    trySteps: [
      { text: 'Leave the engine on Client, set Rows to 50,000, and scroll.', hint: 'Note first paint and how the window feels at depth.' },
      { text: 'Click "Second window" and watch it load the whole book again.' },
      { text: 'Switch both windows to Perspective. The second one attaches to the Table the first built.' },
      { text: 'Sort a column under Perspective — the sort runs in the worker over the whole book, not over what this window holds.' },
      { text: 'Push Rows to 200,000 and repeat. This is where the two stop being comparable.' },
    ],
    props: [
      { name: 'rowModel', type: "'client' | 'perspective'", default: "'client'", note: 'Which engine supplies rows. Absent means client — unchanged behaviour.' },
      { name: 'perspectiveTable', type: 'PerspectiveTableLike | null', note: 'The worker-held Table. Null while attaching — the grid mounts nothing rather than a stand-in.' },
      { name: 'perspectiveKeyColumn', type: 'string', note: 'The Table index column. One scalar column only.' },
      { name: 'perspectiveQueries', type: 'PerspectiveGridQueries | null', note: 'Whole-book questions answered in the worker and pushed back.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },
};

export function getFeatureGuide(id: string): FeatureGuide | undefined {
  return FEATURE_GUIDES[id];
}
