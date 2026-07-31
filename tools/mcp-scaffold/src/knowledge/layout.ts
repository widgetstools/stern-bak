/** Layout (gc-profile) knowledge — user-facing "layout", wire format stays `kind: gc-profile`. */

/** Customizer module ids → current schemaVersion (for validation hints). */
export const LAYOUT_MODULE_SCHEMA_VERSIONS: Record<string, number> = {
  'general-settings': 3,
  'column-templates': 1,
  'column-customization': 10,
  'calculated-columns': 1,
  'column-groups': 1,
  'conditional-styling': 1,
  'visual-excel': 1,
  'smart-edit': 2,
  'bulk-update': 1,
  'plus-minus': 1,
  'shortcuts': 1,
  'data-change-history': 1,
  'alerts': 1,
  'saved-filters': 1,
  'toolbar-visibility': 1,
  'grid-state': 1,
};

export const CONFIGURABLE_RENDERER_IDS = [
  'pill',
  'heatmap',
  'percent-bar',
  'trend-arrow',
  'sparkline',
  'multi-line',
  'icon-text',
  'country-flag',
  'rating-delta',
  'time-since',
  'allocation-bar',
] as const;

export type ConfigurableRendererId = (typeof CONFIGURABLE_RENDERER_IDS)[number];

export interface LayoutExportPayload {
  schemaVersion: 1;
  kind: 'gc-profile';
  exportedAt: string;
  profile: {
    name: string;
    gridId: string;
    state: Record<string, { v: number; data: unknown }>;
  };
}

export interface ConfigOrCodeRule {
  patterns: RegExp[];
  approach: 'layout' | 'code' | 'both' | 'monorepo';
  artifacts: string[];
  tools: string[];
  rationale: string;
}

export const CONFIG_OR_CODE_RULES: ConfigOrCodeRule[] = [
  {
    patterns: [
      /pill|heatmap|renderer|cell render|conditional|styling|calculated|smart edit|bulk update|saved filter|toolbar visibility|grid option|column custom|layout|formatting rule|percent.bar|trend.arrow|sparkline|multi.line|icon.text|country.flag|rating.delta|time.since|allocation.bar/i,
    ],
    approach: 'layout',
    artifacts: ['config/layouts/<name>.layout.json'],
    tools: ['starui_generate_layout', 'starui_validate_layout', 'starui_import_layout_pack'],
    rationale: 'Grid presentation and editing behavior belongs in importable layout JSON (customizer module state), not React code.',
  },
  {
    patterns: [/stomp|websocket|live data|data provider|mock provider|rest provider|provider config|snapshot topic|listener topic/i],
    approach: 'both',
    artifacts: ['config/providers/*.json', 'src/ensureStompProvider.ts'],
    tools: ['starui_generate_stomp_config', 'starui_add_provider_to_project', 'starui_setup_stomp_dev'],
    rationale: 'Provider connection is config (DataProviderConfig); bootstrap seeding is thin scaffold code.',
  },
  {
    patterns: [/appdata|asofdate|as.of|historical date|cross.grid variable/i],
    approach: 'layout',
    artifacts: ['config/providers/appdata.json'],
    tools: ['starui_generate_stomp_config', 'starui_list_provider_types'],
    rationale: 'AppData keys are provider config rows consumed by the grid toolbar — not app TSX.',
  },
  {
    patterns: [/openfin|manifest\.fin|fdc3|blotter route|view manifest|launch\.mjs|workspace|component registration/i],
    approach: 'code',
    artifacts: ['src/views/*.tsx', 'public/platform/manifest.fin.json', 'launch.mjs'],
    tools: ['starui_add_blotter_route', 'starui_generate_view_manifest', 'starui_openfin_launch_checklist'],
    rationale: 'Host routing and OpenFin registration are scaffold wiring; grid chrome inside views still uses layouts.',
  },
  {
    patterns: [/dataservices|sharedworker|vite|worker:\s*true|bootstrap|DataServicesProvider|HostedMarketsGrid mount/i],
    approach: 'code',
    artifacts: ['src/dataServices.ts', 'src/main.tsx', 'vite.config.ts'],
    tools: ['starui_scaffold_app', 'starui_diagnose_data_plane'],
    rationale: 'Data-plane plumbing is written once at scaffold time.',
  },
  {
    patterns: [/menubar|theme toggle|help sheet|status strip|app shell|shadcn|design compliance/i],
    approach: 'code',
    artifacts: ['src/components/shell/*'],
    tools: ['starui_add_shell_layout', 'starui_add_ui_component', 'starui_audit_app_design'],
    rationale: 'Application chrome uses @wellsfargo-starui/ui recipes — outside grid layout modules.',
  },
  {
    patterns: [/new cell renderer|custom renderer|gauge chart|novel renderer type/i],
    approach: 'monorepo',
    artifacts: ['packages/design-system/design-system/src/cellRendererRegistry.ts'],
    tools: ['starui_explain_import_alias'],
    rationale: 'New renderer types extend @wellsfargo-starui/design-system; MCP then generates layouts using the new renderer id.',
  },
  {
    patterns: [/custom customizer module|new module|extend customizer pipeline/i],
    approach: 'monorepo',
    artifacts: ['packages/react-grid/grid/src/customizer/modules/'],
    tools: ['starui_add_grid_module', 'starui_explain_grid_feature'],
    rationale: 'New customizer modules ship in @wellsfargo-starui/grid; layouts reference existing module ids.',
  },
  {
    patterns: [/column def|coldef|infer column|sample row/i],
    approach: 'both',
    artifacts: ['src/columnDefs.ts', 'config/layouts/*.layout.json'],
    tools: ['starui_generate_column_defs', 'starui_generate_layout'],
    rationale: 'Initial ColDefs can be code; persisted assignments and renderers belong in layouts.',
  },
  {
    patterns: [/tarball|libs\/|refresh deps|import alias|bucket/i],
    approach: 'code',
    artifacts: ['libs/*.tgz', 'package.json'],
    tools: ['starui_refresh_libs', 'starui_check_tarball_versions', 'starui_explain_import_alias'],
    rationale: 'Dependency wiring is scaffold/build concern.',
  },
];

export const DEFAULT_LAYOUT_PACK_FILES = [
  '01-pill-side-and-status.layout.json',
  '02-heatmap-notional-and-yield.layout.json',
] as const;

export function defaultPillRendererConfig(colId: string) {
  return {
    kind: 'pill' as const,
    config: {
      shape: 'pill',
      rules: [
        { value: 'BUY', bg: { dark: '#16a34a', light: '#bbf7d0' }, fg: { dark: '#ffffff', light: '#14532d' } },
        { value: 'SELL', bg: { dark: '#dc2626', light: '#fecaca' }, fg: { dark: '#ffffff', light: '#7f1d1d' } },
      ],
      fallback: {
        bg: { dark: '#374151', light: '#e5e7eb' },
        fg: { dark: '#d1d5db', light: '#374151' },
      },
    },
  };
}

export function buildColumnCustomizationModule(
  assignments: Record<string, unknown>,
): { v: number; data: { assignments: Record<string, unknown> } } {
  return {
    v: LAYOUT_MODULE_SCHEMA_VERSIONS['column-customization'],
    data: { assignments },
  };
}

export function buildSmartEditModule(enabled = true): { v: number; data: { settings: Record<string, unknown> } } {
  return {
    v: LAYOUT_MODULE_SCHEMA_VERSIONS['smart-edit'],
    data: {
      settings: {
        enabled,
        incrementStep: 1,
        magnitudeShortcutsEnabled: true,
        enabledOps: ['add', 'subtract', 'multiply', 'divide', 'set'],
        confirmThreshold: 100,
        enforceSingleColumn: false,
        previewBeforeApply: true,
        recordHistory: true,
      },
    },
  };
}
