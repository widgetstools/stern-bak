/** Static platform knowledge for MCP tools — kept free of @wellsfargo-starui/* imports. */

export interface TemplateRecommendationInput {
  needsOpenFin?: boolean;
  needsLiveData?: boolean;
  needsProviderEditor?: boolean;
  needsStaticDemo?: boolean;
  needsMockOnly?: boolean;
}

export function recommendTemplate(input: TemplateRecommendationInput) {
  if (input.needsOpenFin) {
    return {
      templateId: 'openfin-platform',
      reason: 'Full OpenFin workspace with route-hosted HostedMarketsGrid and component registration.',
      gridFeatures: { showFiltersToolbar: true, showFormattingToolbar: true, withStorage: true },
    };
  }
  if (input.needsProviderEditor && input.needsLiveData) {
    return {
      templateId: 'dataprovider-editor',
      reason: 'HostedMarketsGrid plus DataProviderEditor tabs for STOMP/REST/mock authoring.',
      gridFeatures: { withStorage: true, showFiltersToolbar: true, showFormattingToolbar: true },
    };
  }
  if (input.needsLiveData) {
    return {
      templateId: 'stomp',
      reason: 'STOMP streaming with seeded provider and stomp-view-server.',
      gridFeatures: { withStorage: true, showFiltersToolbar: true, showFormattingToolbar: true, showProfileSelector: true },
    };
  }
  if (input.needsMockOnly || input.needsLiveData === false) {
    return {
      templateId: input.needsProviderEditor ? 'mockdata-provider' : 'basic',
      reason: input.needsProviderEditor
        ? 'Mock SharedWorker stream without broker dependency.'
        : 'Static MarketsGrid — fastest path to profiles and grid chrome.',
      gridFeatures: {},
    };
  }
  return {
    templateId: 'basic',
    reason: 'Default — static data, localStorage profiles.',
    gridFeatures: {},
  };
}

export const PROVIDER_TYPES = [
  {
    type: 'stomp',
    when: 'Live snapshot + delta stream over WebSocket/STOMP (production feeds, stomp-view-server dev).',
    requiredFields: ['websocketUrl', 'listenerTopic', 'keyColumn'],
    optionalFields: ['requestMessage', 'snapshotEndToken', 'snapshotTimeoutMs', 'columnDefinitions'],
  },
  {
    type: 'mock',
    when: 'Synthetic streaming data in SharedWorker — no external broker.',
    requiredFields: ['dataType', 'rowCount'],
    optionalFields: ['updateIntervalMs', 'enableUpdates'],
  },
  {
    type: 'rest',
    when: 'Polling HTTP endpoint on an interval.',
    requiredFields: ['baseUrl', 'endpoint', 'method'],
    optionalFields: ['pollInterval', 'headers', 'auth'],
  },
  {
    type: 'appdata',
    when: 'Named values shared across grids (e.g. historical asOfDate).',
    requiredFields: ['keys'],
    optionalFields: [],
  },
] as const;

export const IMPORT_ALIAS_MAP: Record<string, { tarballDep: string; importPath: string; note: string }> = {
  '@wellsfargo-starui/grid': {
    tarballDep: '@wellsfargo-starui/react-grid',
    importPath: '@wellsfargo-starui/grid',
    note: 'Vite aliases map react-grid bucket tarball to @wellsfargo-starui/grid.',
  },
  '@wellsfargo-starui/ui': {
    tarballDep: '@wellsfargo-starui/react-ui',
    importPath: '@wellsfargo-starui/ui',
    note: 'shadcn primitives live in react-ui bucket.',
  },
  '@wellsfargo-starui/host-data': {
    tarballDep: '@wellsfargo-starui/data',
    importPath: '@wellsfargo-starui/host-data',
    note: 'SharedWorker hub and provider transports.',
  },
  '@wellsfargo-starui/widgets-react': {
    tarballDep: '@wellsfargo-starui/react-core',
    importPath: '@wellsfargo-starui/widgets-react',
    note: 'HostedMarketsGrid and provider editor.',
  },
  '@wellsfargo-starui/app': {
    tarballDep: '@wellsfargo-starui/react-core',
    importPath: '@wellsfargo-starui/app',
    note: 'StarGridApp shell for OpenFin routes.',
  },
  '@wellsfargo-starui/openfin-platform': {
    tarballDep: '@wellsfargo-starui/openfin',
    importPath: '@wellsfargo-starui/openfin-platform',
    note: 'initWorkspace, dock, ConfigManager bridge.',
  },
};

export const BUCKET_GRAPH: Record<string, { members: string[]; dependsOn: string[] }> = {
  'design-system': { members: ['@wellsfargo-starui/design-system', '@wellsfargo-starui/icons-svg'], dependsOn: [] },
  'react-ui': { members: ['@wellsfargo-starui/ui'], dependsOn: ['design-system'] },
  shared: {
    members: ['@wellsfargo-starui/engine', '@wellsfargo-starui/types', '@wellsfargo-starui/shared-types', '@wellsfargo-starui/host'],
    dependsOn: ['design-system'],
  },
  'react-grid': { members: ['@wellsfargo-starui/grid'], dependsOn: ['design-system', 'shared'] },
  data: {
    members: ['@wellsfargo-starui/host-data', '@wellsfargo-starui/host-data-react', '@wellsfargo-starui/host-config'],
    dependsOn: ['shared'],
  },
  'react-core': {
    members: ['@wellsfargo-starui/app', '@wellsfargo-starui/widgets-react', '@wellsfargo-starui/config-browser'],
    dependsOn: ['react-grid', 'data', 'react-ui'],
  },
  openfin: { members: ['@wellsfargo-starui/openfin-platform', '@wellsfargo-starui/host-openfin'], dependsOn: ['data', 'react-core'] },
};

export const GRID_MODULES = [
  { id: 'generalSettingsModule', label: 'General settings', optIn: false },
  { id: 'columnTemplatesModule', label: 'Column templates', optIn: false },
  { id: 'columnCustomizationModule', label: 'Column customization', optIn: false },
  { id: 'smartEditModule', label: 'Smart edit', optIn: true, enables: 'showEditingToolbar' },
  { id: 'bulkUpdateModule', label: 'Bulk update', optIn: true, enables: 'showEditingToolbar' },
  { id: 'visualExcelModule', label: 'Visual Excel export', optIn: true, enables: 'showVisualExcelExport' },
  { id: 'alertsModule', label: 'Alerts', optIn: true },
  { id: 'savedFiltersModule', label: 'Saved filters', optIn: false },
  { id: 'gridStateModule', label: 'Grid state (layouts)', optIn: false },
] as const;

export const GRID_FEATURE_DOCS: Record<string, { summary: string; modules: string[]; cost: string }> = {
  showFiltersToolbar: {
    summary: 'Filter pill toolbar above the grid.',
    modules: ['savedFiltersModule'],
    cost: 'Low',
  },
  showFormattingToolbar: {
    summary: 'Floating cell formatter toolbar.',
    modules: ['columnCustomizationModule', 'conditionalStylingModule'],
    cost: 'Low',
  },
  showEditingToolbar: {
    summary: 'Smart edit / bulk update / edit history toolbar row.',
    modules: ['smartEditModule', 'bulkUpdateModule', 'dataChangeHistoryModule'],
    cost: 'Medium',
  },
  showVisualExcelExport: {
    summary: 'Export grid visual layout to Excel.',
    modules: ['visualExcelModule'],
    cost: 'Medium',
  },
  sideBar: {
    summary: 'AG Grid columns/filters side panel.',
    modules: [],
    cost: 'Low',
  },
  withStorage: {
    summary: 'ConfigManager-backed profile persistence (required for HostedMarketsGrid production).',
    modules: ['gridStateModule'],
    cost: 'Low — requires SharedWorker + ConfigManager',
  },
};

export const USE_CASE_GRID_PRESETS: Record<string, Record<string, unknown>> = {
  'read-only-dashboard': {
    showFiltersToolbar: true,
    showFormattingToolbar: false,
    showSaveButton: false,
    showProfileSelector: false,
    sideBar: false,
    statusBar: true,
  },
  'trader-blotter': {
    showFiltersToolbar: true,
    showFormattingToolbar: true,
    showProfileSelector: true,
    showSaveButton: true,
    sideBar: true,
    statusBar: true,
    withStorage: true,
  },
  'risk-analytics': {
    showFiltersToolbar: true,
    showFormattingToolbar: true,
    showEditingToolbar: false,
    showVisualExcelExport: true,
    sideBar: true,
    statusBar: true,
  },
};

export const EMPTY_GRID_TROUBLESHOOTING = [
  { check: 'SharedWorker enabled', fix: 'vite.config: staruiConsumerViteConfig(..., { worker: true })' },
  { check: 'DataServicesProvider wraps app', fix: 'main.tsx mounts <DataServicesProvider services={dataServices}>' },
  { check: 'Provider selected in grid toolbar', fix: 'Alt+Shift+P / Cmd+Shift+P → pick live provider' },
  { check: 'STOMP server running', fix: 'npm run dev:stomp → ws://localhost:8081/health returns healthy' },
  { check: 'Provider config saved', fix: 'Run ensureStompProvider or create via DataProviderEditor' },
  { check: 'Snapshot completed', fix: 'Wait for snapshotEndToken (default "Success") before live deltas' },
  { check: 'keyColumn matches row data', fix: 'keyColumn must match STOMP JSON field used for row identity' },
  { check: 'Static basic template', fix: 'basic template uses rowData prop — no provider needed' },
];

export const WIRE_STOMP_STEPS = [
  '1. Scaffold stomp template or add dataServices.ts + DataServicesProvider',
  '2. Copy/start stomp-view-server (npm run dev:stomp)',
  '3. Create StompProviderConfig (starui_generate_stomp_config)',
  '4. Seed with ensureStompProvider() on app boot',
  '5. Use HostedMarketsGrid with dataServices + withStorage',
  '6. Open provider toolbar → select your STOMP provider',
  '7. Verify /health then snapshot request on listenerTopic',
];
