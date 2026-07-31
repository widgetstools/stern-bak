export interface GridFeatureOption {
  key: string;
  group: 'toolbars' | 'chrome' | 'hosting' | 'theme';
  type: 'boolean' | 'string' | 'enum';
  description: string;
  defaultBasic: boolean | string;
  defaultHosted: boolean | string;
}

export const GRID_FEATURE_CATALOG: GridFeatureOption[] = [
  { key: 'showToolbar', group: 'toolbars', type: 'boolean', description: 'Primary toolbar row', defaultBasic: true, defaultHosted: true },
  { key: 'showFiltersToolbar', group: 'toolbars', type: 'boolean', description: 'Filter pill toolbar', defaultBasic: true, defaultHosted: true },
  { key: 'showFormattingToolbar', group: 'toolbars', type: 'boolean', description: 'Floating formatter toolbar', defaultBasic: true, defaultHosted: true },
  { key: 'showEditingToolbar', group: 'toolbars', type: 'boolean', description: 'Smart edit toolbar toggle', defaultBasic: false, defaultHosted: false },
  { key: 'showSaveButton', group: 'toolbars', type: 'boolean', description: 'Profile save button', defaultBasic: true, defaultHosted: true },
  { key: 'showSettingsButton', group: 'toolbars', type: 'boolean', description: 'Grid settings gear', defaultBasic: true, defaultHosted: true },
  { key: 'showProfileSelector', group: 'toolbars', type: 'boolean', description: 'Profile dropdown', defaultBasic: true, defaultHosted: false },
  { key: 'showVisualExcelExport', group: 'toolbars', type: 'boolean', description: 'Visual Excel export', defaultBasic: true, defaultHosted: true },
  { key: 'sideBar', group: 'chrome', type: 'boolean', description: 'AG Grid sideBar (columns/filters)', defaultBasic: true, defaultHosted: false },
  { key: 'statusBar', group: 'chrome', type: 'boolean', description: 'AG Grid statusBar row counts', defaultBasic: true, defaultHosted: false },
  { key: 'withStorage', group: 'hosting', type: 'boolean', description: 'ConfigManager-backed profile storage', defaultBasic: false, defaultHosted: true },
  { key: 'dataServicesMode', group: 'hosting', type: 'enum', description: 'AppData hydration: eager | lazy', defaultBasic: 'lazy', defaultHosted: 'lazy' },
  { key: 'agGridThemeVariant', group: 'theme', type: 'enum', description: 'default | blotter | comfort', defaultBasic: 'default', defaultHosted: 'auto' },
];

export function defaultGridFeatures(templateId: string): Record<string, unknown> {
  const hosted = ['stomp', 'dataprovider-editor', 'openfin-platform'].includes(templateId);
  const openfin = templateId === 'openfin-platform';
  const features: Record<string, unknown> = {};
  for (const opt of GRID_FEATURE_CATALOG) {
    if (opt.type === 'boolean') {
      if (openfin && (opt.key === 'sideBar' || opt.key === 'statusBar' || opt.key === 'showProfileSelector')) {
        features[opt.key] = false;
      } else {
        features[opt.key] = hosted ? opt.defaultHosted : opt.defaultBasic;
      }
    } else {
      features[opt.key] = hosted ? opt.defaultHosted : opt.defaultBasic;
    }
  }
  return features;
}

export function mergeGridFeatures(
  templateId: string,
  overrides?: Record<string, unknown>,
): Record<string, unknown> {
  return { ...defaultGridFeatures(templateId), ...overrides };
}
