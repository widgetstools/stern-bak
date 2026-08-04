import type { ColDef } from 'ag-grid-community';
import type { MarketsGridProps } from '@wellsfargo-starui/grid';
import { baseColumns, defaultColDef, pickColumns } from '../data/columns';
import { HELP } from '../help';
import type { LabDemoProfileEntry } from '../profiles/labProfileKit';
import {
  ALERTS_ACTIVE_PROFILE_ID,
  ALERTS_DEMO_PROFILES,
  ALERTS_GRID_ID,
  CALCULATED_ACTIVE_PROFILE_ID,
  CALCULATED_DEMO_PROFILES,
  CALCULATED_GRID_ID,
  COLUMN_GROUPS_ACTIVE_PROFILE_ID,
  COLUMN_GROUPS_DEMO_PROFILES,
  COLUMN_GROUPS_GRID_ID,
  CONDITIONAL_ACTIVE_PROFILE_ID,
  CONDITIONAL_DEMO_PROFILES,
  CONDITIONAL_GRID_ID,
  FORMATTER_TOOLBAR_ACTIVE_PROFILE_ID,
  FORMATTER_TOOLBAR_DEMO_PROFILES,
  FORMATTER_TOOLBAR_GRID_ID,
  FORMATTING_ACTIVE_PROFILE_ID,
  FORMATTING_DEMO_PROFILES,
  FORMATTING_GRID_ID,
  LIVE_ACTIVE_PROFILE_ID,
  LIVE_DEMO_PROFILES,
  LIVE_GRID_ID,
  OVERVIEW_ACTIVE_PROFILE_ID,
  OVERVIEW_DEMO_PROFILES,
  OVERVIEW_GRID_ID,
  QUICK_FILTERS_ACTIVE_PROFILE_ID,
  QUICK_FILTERS_DEMO_PROFILES,
  QUICK_FILTERS_GRID_ID,
  RENDERERS_ACTIVE_PROFILE_ID,
  RENDERERS_DEMO_PROFILES,
  RENDERERS_GRID_ID,
  SMART_EDIT_ACTIVE_PROFILE_ID,
  SMART_EDIT_DEMO_PROFILES,
  SMART_EDIT_GRID_ID,
  BULK_UPDATE_ACTIVE_PROFILE_ID,
  BULK_UPDATE_DEMO_PROFILES,
  BULK_UPDATE_GRID_ID,
  PLUS_MINUS_ACTIVE_PROFILE_ID,
  PLUS_MINUS_DEMO_PROFILES,
  PLUS_MINUS_GRID_ID,
  SHORTCUTS_ACTIVE_PROFILE_ID,
  SHORTCUTS_DEMO_PROFILES,
  SHORTCUTS_GRID_ID,
  EDITING_ACTIVE_PROFILE_ID,
  EDITING_DEMO_PROFILES,
  EDITING_GRID_ID,
  VISUAL_EXCEL_ACTIVE_PROFILE_ID,
  VISUAL_EXCEL_DEMO_PROFILES,
  VISUAL_EXCEL_GRID_ID,
  STRESS_ACTIVE_PROFILE_ID,
  STRESS_DEMO_PROFILES,
  STRESS_GRID_ID,
} from '../profiles/catalogs';
import type { LabStreamOptions } from '../demo/types';

type GridChrome = Pick<
  MarketsGridProps,
  | 'showFiltersToolbar'
  | 'showFormattingToolbar'
  | 'showEditingToolbar'
  | 'showSmartEditToolbar'
  | 'showBulkUpdateToolbar'
  | 'showEditHistoryToolbar'
  | 'showVisualExcelExport'
  | 'showProfileSelector'
  | 'showSaveButton'
  | 'showSettingsButton'
  | 'sideBar'
  | 'statusBar'
  | 'rowHeight'
>;

export interface LabFeatureConfig {
  tabId: string;
  providerId: string;
  title: string;
  subtitle: string;
  help: string;
  gridId: string;
  componentName: string;
  profiles: LabDemoProfileEntry[];
  activeProfileId: string;
  stream?: LabStreamOptions;
  getColumnDefs: () => ColDef[];
  defaultColDef?: ColDef;
  /** Append live tick interval from the demo console to the subtitle. */
  subtitleIncludesTickMs?: boolean;
  grid?: GridChrome;
}

const OVERVIEW_COLUMNS = baseColumns;
const FORMATTING_COLUMNS = pickColumns([
  'cusip', 'ticker', 'instrumentDescription',
  'currency', 'compositeRating', 'issuerSector',
  'bidPrice', 'midPrice', 'askPrice', 'lastPrice',
  'priceChangePct', 'bidAskWidthBps',
  'yieldToMaturity', 'yieldToWorst', 'currentYield',
  'oas', 'zSpread',
  'modifiedDuration', 'dv01',
  'quantityFace', 'marketValue', 'avgCost',
  'unrealizedPnL', 'dailyPnL', 'mtdPnL', 'ytdPnL',
  'issueDate', 'maturityDate', 'lastUpdate',
]);
const RENDERERS_COLUMNS = pickColumns([
  'cusip', 'ticker', 'instrumentDescription',
  'assetClass', 'issuerSector', 'issuerCountryCode', 'currency', 'compositeRating',
  'bidPrice', 'midPrice', 'askPrice', 'priceChangePct',
  'yieldToMaturity', 'oas',
  'modifiedDuration', 'krdSparkline',
  'marketValue', 'unrealizedPnL', 'dailyPnL', 'ytdPnL',
  'lastUpdate',
]);
const FORMATTER_TOOLBAR_COLUMNS = pickColumns([
  'cusip', 'ticker', 'instrumentDescription',
  'assetClass', 'issuerSector', 'currency', 'compositeRating',
  'bidPrice', 'midPrice', 'askPrice', 'priceChangePct',
  'yieldToMaturity', 'oas', 'zSpread',
  'modifiedDuration', 'dv01',
  'quantityFace', 'marketValue',
  'unrealizedPnL', 'dailyPnL', 'mtdPnL', 'ytdPnL',
  'book', 'trader', 'maturityDate',
]);
const CALCULATED_COLUMNS = pickColumns([
  'cusip', 'ticker', 'instrumentDescription',
  'assetClass', 'currency', 'compositeRating',
  'bidPrice', 'midPrice', 'askPrice', 'priceChangePct',
  'yieldToMaturity', 'yieldToWorst', 'oas', 'benchmarkYield',
  'modifiedDuration', 'dv01', 'convexity', 'cs01',
  'marketValue', 'quantityFace', 'avgDailyVolume30d',
  'unrealizedPnL', 'dailyPnL', 'mtdPnL', 'ytdPnL',
]);
const CONDITIONAL_COLUMNS = pickColumns([
  'cusip', 'ticker', 'instrumentDescription',
  'assetClass', 'issuerSector', 'currency', 'compositeRating',
  'bidPrice', 'midPrice', 'askPrice', 'lastPrice', 'priceChangePct', 'bidAskWidthBps',
  'yieldToMaturity', 'yieldToWorst', 'oas',
  'modifiedDuration', 'dv01',
  'marketValue',
  'unrealizedPnL', 'dailyPnL', 'mtdPnL', 'ytdPnL',
  'maturityDate', 'lastUpdate',
]);
const QUICK_FILTERS_COLUMNS = pickColumns([
  'cusip', 'ticker', 'instrumentDescription',
  'assetClass', 'issuerSector', 'compositeRating', 'currency', 'book', 'trader',
  'bidPrice', 'midPrice', 'askPrice',
  'yieldToMaturity', 'yieldToWorst', 'oas', 'modifiedDuration',
  'marketValue', 'unrealizedPnL', 'dailyPnL', 'mtdPnL',
]);
const LIVE_COLUMNS = pickColumns([
  'cusip', 'ticker', 'instrumentDescription',
  'assetClass', 'currency', 'compositeRating',
  'bidPrice', 'midPrice', 'askPrice', 'lastPrice', 'priceChangePct', 'bidAskWidthBps',
  'yieldToMaturity', 'oas',
  'modifiedDuration', 'dv01',
  'quantityFace', 'marketValue',
  'unrealizedPnL', 'dailyPnL', 'mtdPnL', 'ytdPnL',
  'lastUpdate',
]);
const ALERTS_COLUMNS = pickColumns([
  'cusip', 'ticker', 'instrumentDescription',
  'assetClass', 'currency', 'compositeRating',
  'bidPrice', 'midPrice', 'askPrice', 'priceChangePct',
  'yieldToMaturity', 'yieldToWorst',
  'marketValue',
  'unrealizedPnL', 'dailyPnL',
  'lastUpdate',
]);

export const OVERVIEW_FEATURE: LabFeatureConfig = {
  tabId: 'overview',
  providerId: 'mock-positions-overview',
  title: 'Overview — kitchen-sink',
  subtitle: `${OVERVIEW_DEMO_PROFILES.length} profiles · multi-module seed · pick a lens in the profile selector`,
  help: HELP.overview,
  gridId: OVERVIEW_GRID_ID,
  componentName: 'Overview',
  profiles: OVERVIEW_DEMO_PROFILES,
  activeProfileId: OVERVIEW_ACTIVE_PROFILE_ID,
  stream: { rowCount: 500, updateIntervalMs: 500 },
  getColumnDefs: () => OVERVIEW_COLUMNS,
  grid: {
    showFiltersToolbar: true,
    showFormattingToolbar: true,
    showEditingToolbar: true,
    showProfileSelector: true,
    showSaveButton: true,
    showSettingsButton: true,
    sideBar: { toolPanels: ['columns', 'filters'] },
    statusBar: {
      statusPanels: [
        { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
        { statusPanel: 'agFilteredRowCountComponent', align: 'left' },
        { statusPanel: 'agSelectedRowCountComponent', align: 'center' },
        { statusPanel: 'agAggregationComponent', align: 'right' },
      ],
    },
  },
};

export const FORMATTING_FEATURE: LabFeatureConfig = {
  tabId: 'formatting',
  providerId: 'mock-positions-formatting',
  title: 'Formatting',
  subtitle: `${FORMATTING_DEMO_PROFILES.length} profiles · preset · Excel · tick · themed overrides · globals`,
  help: HELP.formatting,
  gridId: FORMATTING_GRID_ID,
  componentName: 'Formatting',
  profiles: FORMATTING_DEMO_PROFILES,
  activeProfileId: FORMATTING_ACTIVE_PROFILE_ID,
  stream: { rowCount: 500, updateIntervalMs: 600 },
  getColumnDefs: () => FORMATTING_COLUMNS,
  grid: {
    showFormattingToolbar: true,
    showEditingToolbar: true,
    showVisualExcelExport: true,
    showProfileSelector: true,
    showSaveButton: true,
    showSettingsButton: true,
  },
};

const VISUAL_EXCEL_COLUMNS = pickColumns([
  'cusip', 'ticker', 'instrumentDescription',
  'currency', 'compositeRating', 'issuerSector',
  'bidPrice', 'midPrice', 'askPrice', 'lastPrice',
  'priceChangePct', 'bidAskWidthBps',
  'yieldToMaturity', 'yieldToWorst', 'currentYield',
  'oas', 'zSpread',
  'modifiedDuration', 'dv01',
  'quantityFace', 'marketValue', 'avgCost',
  'unrealizedPnL', 'dailyPnL', 'mtdPnL', 'ytdPnL',
  'issueDate', 'maturityDate', 'lastUpdate',
]);

export const VISUAL_EXCEL_FEATURE: LabFeatureConfig = {
  tabId: 'visual-excel',
  providerId: 'mock-positions-visual-excel',
  title: 'Visual Excel',
  subtitle: `${VISUAL_EXCEL_DEMO_PROFILES.length} profiles · WYSIWYG .xlsx · formatters + style rules`,
  help: HELP.visualExcel,
  gridId: VISUAL_EXCEL_GRID_ID,
  componentName: 'VisualExcel',
  profiles: VISUAL_EXCEL_DEMO_PROFILES,
  activeProfileId: VISUAL_EXCEL_ACTIVE_PROFILE_ID,
  stream: { rowCount: 500, updateIntervalMs: 600 },
  getColumnDefs: () => VISUAL_EXCEL_COLUMNS,
  grid: {
    showFormattingToolbar: true,
    showEditingToolbar: true,
    showVisualExcelExport: true,
    showProfileSelector: true,
    showSaveButton: true,
    showSettingsButton: true,
  },
};

export const RENDERERS_FEATURE: LabFeatureConfig = {
  tabId: 'renderers',
  providerId: 'mock-positions-renderers',
  title: 'Cell Renderers',
  subtitle: `${RENDERERS_DEMO_PROFILES.length} profiles · pills · heatmaps · sparklines · bars · flags`,
  help: HELP.renderers,
  gridId: RENDERERS_GRID_ID,
  componentName: 'Renderers',
  profiles: RENDERERS_DEMO_PROFILES,
  activeProfileId: RENDERERS_ACTIVE_PROFILE_ID,
  stream: { rowCount: 500, updateIntervalMs: 600 },
  getColumnDefs: () => RENDERERS_COLUMNS,
  defaultColDef: { ...defaultColDef, autoHeight: false },
  grid: {
    showProfileSelector: true,
    showSaveButton: true,
    showSettingsButton: true,
  },
};

export const FORMATTER_TOOLBAR_FEATURE: LabFeatureConfig = {
  tabId: 'toolbar',
  providerId: 'mock-positions-formatter-toolbar',
  title: 'Formatter Toolbar',
  subtitle: `${FORMATTER_TOOLBAR_DEMO_PROFILES.length} profiles · floating palette · cell + header paint`,
  help: HELP.formatterToolbar,
  gridId: FORMATTER_TOOLBAR_GRID_ID,
  componentName: 'Formatter Toolbar',
  profiles: FORMATTER_TOOLBAR_DEMO_PROFILES,
  activeProfileId: FORMATTER_TOOLBAR_ACTIVE_PROFILE_ID,
  stream: { rowCount: 500, updateIntervalMs: 600 },
  getColumnDefs: () => FORMATTER_TOOLBAR_COLUMNS,
  grid: {
    showFormattingToolbar: true,
    showEditingToolbar: true,
    showProfileSelector: true,
    showSaveButton: true,
    showSettingsButton: true,
  },
};

export const COLUMN_GROUPS_FEATURE: LabFeatureConfig = {
  tabId: 'groups',
  providerId: 'mock-positions-column-groups',
  title: 'Column Groups',
  subtitle: `${COLUMN_GROUPS_DEMO_PROFILES.length} profiles · 8 nested groups · open/closed presets`,
  help: HELP.columnGroups,
  gridId: COLUMN_GROUPS_GRID_ID,
  componentName: 'Column Groups',
  profiles: COLUMN_GROUPS_DEMO_PROFILES,
  activeProfileId: COLUMN_GROUPS_ACTIVE_PROFILE_ID,
  stream: { rowCount: 500, updateIntervalMs: 600 },
  getColumnDefs: () => OVERVIEW_COLUMNS,
  grid: {
    showProfileSelector: true,
    showSaveButton: true,
    showSettingsButton: true,
  },
};

export const CALCULATED_FEATURE: LabFeatureConfig = {
  tabId: 'calc',
  providerId: 'mock-positions-calculated',
  title: 'Calculated Columns',
  subtitle: `${CALCULATED_DEMO_PROFILES.length} profiles · up to 11 virtual columns · nested IF · cross-field math`,
  help: HELP.calculatedColumns,
  gridId: CALCULATED_GRID_ID,
  componentName: 'Calculated',
  profiles: CALCULATED_DEMO_PROFILES,
  activeProfileId: CALCULATED_ACTIVE_PROFILE_ID,
  stream: { rowCount: 500, updateIntervalMs: 500 },
  getColumnDefs: () => CALCULATED_COLUMNS,
  defaultColDef: { ...defaultColDef, enableCellChangeFlash: true },
  grid: {
    showProfileSelector: true,
    showSaveButton: true,
    showSettingsButton: true,
  },
};

export const CONDITIONAL_FEATURE: LabFeatureConfig = {
  tabId: 'conditional',
  providerId: 'mock-positions-conditional',
  title: 'Conditional Styling',
  subtitle: `${CONDITIONAL_DEMO_PROFILES.length} profiles · up to 13 rules · flash · diff · row scope · indicators`,
  help: HELP.conditionalStyling,
  gridId: CONDITIONAL_GRID_ID,
  componentName: 'Conditional Styling',
  profiles: CONDITIONAL_DEMO_PROFILES,
  activeProfileId: CONDITIONAL_ACTIVE_PROFILE_ID,
  stream: { rowCount: 500, updateIntervalMs: 500 },
  getColumnDefs: () => CONDITIONAL_COLUMNS,
  grid: {
    showProfileSelector: true,
    showSaveButton: true,
    showSettingsButton: true,
  },
};

export const QUICK_FILTERS_FEATURE: LabFeatureConfig = {
  tabId: 'filters',
  providerId: 'mock-positions-quick-filters',
  title: 'Quick filter buttons',
  subtitle: `${QUICK_FILTERS_DEMO_PROFILES.length} profiles · saved filter pills · toggle · capture · AND stack`,
  help: HELP.quickFilters,
  gridId: QUICK_FILTERS_GRID_ID,
  componentName: 'QuickFilters',
  profiles: QUICK_FILTERS_DEMO_PROFILES,
  activeProfileId: QUICK_FILTERS_ACTIVE_PROFILE_ID,
  stream: { rowCount: 400, updateIntervalMs: 700 },
  getColumnDefs: () => QUICK_FILTERS_COLUMNS,
  defaultColDef: { ...defaultColDef, floatingFilter: true },
  grid: {
    showFiltersToolbar: true,
    showProfileSelector: true,
    showSaveButton: true,
    showSettingsButton: true,
    sideBar: { toolPanels: ['filters'] },
    statusBar: {
      statusPanels: [
        { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
        { statusPanel: 'agFilteredRowCountComponent', align: 'left' },
      ],
    },
  },
};

export const LIVE_FEATURE: LabFeatureConfig = {
  tabId: 'live',
  providerId: 'mock-positions-live',
  title: 'Live Updates',
  subtitle: `${LIVE_DEMO_PROFILES.length} profiles`,
  help: HELP.liveUpdates,
  gridId: LIVE_GRID_ID,
  componentName: 'Live Updates',
  profiles: LIVE_DEMO_PROFILES,
  activeProfileId: LIVE_ACTIVE_PROFILE_ID,
  stream: { rowCount: 500, updateIntervalMs: 400 },
  getColumnDefs: () => LIVE_COLUMNS,
  subtitleIncludesTickMs: true,
  grid: {
    showProfileSelector: true,
    showSaveButton: true,
    showSettingsButton: true,
  },
};

export const ALERTS_FEATURE: LabFeatureConfig = {
  tabId: 'alerts',
  providerId: 'mock-positions-alerts',
  title: 'Alerts',
  subtitle: `${ALERTS_DEMO_PROFILES.length} profiles · triggers · channels · debounce · rate limit`,
  help: HELP.alerts,
  gridId: ALERTS_GRID_ID,
  componentName: 'Alerts',
  profiles: ALERTS_DEMO_PROFILES,
  activeProfileId: ALERTS_ACTIVE_PROFILE_ID,
  stream: { rowCount: 250, updateIntervalMs: 600 },
  getColumnDefs: () => ALERTS_COLUMNS,
  grid: {
    showProfileSelector: true,
    showSaveButton: true,
    showSettingsButton: true,
  },
};

const SMART_EDIT_COLUMNS = pickColumns([
  'cusip', 'ticker', 'quantityFace', 'midPrice', 'marketValue', 'dailyPnL',
]).map((col) =>
  col.field === 'quantityFace' || col.field === 'midPrice'
    ? { ...col, editable: true, cellDataType: 'number' as const }
    : col,
);

export const SMART_EDIT_FEATURE: LabFeatureConfig = {
  tabId: 'smart-edit',
  providerId: 'mock-positions-smart-edit',
  title: 'Smart Edit',
  subtitle: `${SMART_EDIT_DEMO_PROFILES.length} profiles · bulk update · arithmetic · +/- · K/M/B`,
  help: HELP.smartEdit,
  gridId: SMART_EDIT_GRID_ID,
  componentName: 'SmartEditLab',
  profiles: SMART_EDIT_DEMO_PROFILES,
  activeProfileId: SMART_EDIT_ACTIVE_PROFILE_ID,
  stream: { rowCount: 200, updateIntervalMs: 500, enableUpdates: false },
  getColumnDefs: () => SMART_EDIT_COLUMNS,
  grid: {
    showSmartEditToolbar: true,
    showEditHistoryToolbar: true,
    showFiltersToolbar: true,
    showFormattingToolbar: false,
    showProfileSelector: true,
    showSaveButton: true,
    showSettingsButton: true,
  },
};

const BULK_UPDATE_COLUMNS = pickColumns([
  'cusip', 'ticker', 'currency', 'quantityFace', 'maturityDate', 'midPrice',
]).map((col) => {
  if (col.field === 'currency') {
    return { ...col, editable: true, cellDataType: 'text' as const };
  }
  if (col.field === 'quantityFace') {
    return { ...col, editable: true, cellDataType: 'number' as const };
  }
  if (col.field === 'maturityDate') {
    return { ...col, editable: true, cellDataType: 'dateString' as const };
  }
  return col;
});

export const BULK_UPDATE_FEATURE: LabFeatureConfig = {
  tabId: 'bulk-update',
  providerId: 'mock-positions-bulk-update',
  title: 'Bulk Update',
  subtitle: `${BULK_UPDATE_DEMO_PROFILES.length} profiles · replace selection with one value · text · number · date`,
  help: HELP.bulkUpdate,
  gridId: BULK_UPDATE_GRID_ID,
  componentName: 'BulkUpdateLab',
  profiles: BULK_UPDATE_DEMO_PROFILES,
  activeProfileId: BULK_UPDATE_ACTIVE_PROFILE_ID,
  stream: { rowCount: 200, updateIntervalMs: 500, enableUpdates: false },
  getColumnDefs: () => BULK_UPDATE_COLUMNS,
  grid: {
    showBulkUpdateToolbar: true,
    showEditHistoryToolbar: true,
    showFiltersToolbar: true,
    showFormattingToolbar: false,
    showProfileSelector: true,
    showSaveButton: true,
    showSettingsButton: true,
  },
};

const PLUS_MINUS_COLUMNS = pickColumns([
  'cusip', 'ticker', 'side', 'quantityFace', 'midPrice', 'marketValue',
]).map((col) => {
  if (col.field === 'quantityFace' || col.field === 'midPrice') {
    return { ...col, editable: true, cellDataType: 'number' as const };
  }
  return col;
});

export const PLUS_MINUS_FEATURE: LabFeatureConfig = {
  tabId: 'plus-minus',
  providerId: 'mock-positions-plus-minus',
  title: 'Plus / Minus',
  subtitle: `${PLUS_MINUS_DEMO_PROFILES.length} profiles · keyboard nudge rules · expression gates · undo`,
  help: HELP.plusMinus,
  gridId: PLUS_MINUS_GRID_ID,
  componentName: 'PlusMinusLab',
  profiles: PLUS_MINUS_DEMO_PROFILES,
  activeProfileId: PLUS_MINUS_ACTIVE_PROFILE_ID,
  stream: { rowCount: 200, updateIntervalMs: 500, enableUpdates: false },
  getColumnDefs: () => PLUS_MINUS_COLUMNS,
  grid: {
    showEditHistoryToolbar: true,
    showFiltersToolbar: true,
    showFormattingToolbar: false,
    showProfileSelector: true,
    showSaveButton: true,
    showSettingsButton: true,
  },
};

const SHORTCUTS_COLUMNS = pickColumns([
  'cusip', 'ticker', 'quantityFace', 'midPrice', 'marketValue',
]).map((col) => {
  if (col.field === 'quantityFace' || col.field === 'midPrice') {
    return { ...col, editable: true, cellDataType: 'number' as const };
  }
  return col;
});

export const SHORTCUTS_FEATURE: LabFeatureConfig = {
  tabId: 'shortcuts',
  providerId: 'mock-positions-shortcuts',
  title: 'Shortcuts',
  subtitle: `${SHORTCUTS_DEMO_PROFILES.length} profiles · letter-key ops · undo · not K/M/B`,
  help: HELP.shortcuts,
  gridId: SHORTCUTS_GRID_ID,
  componentName: 'ShortcutsLab',
  profiles: SHORTCUTS_DEMO_PROFILES,
  activeProfileId: SHORTCUTS_ACTIVE_PROFILE_ID,
  stream: { rowCount: 200, updateIntervalMs: 500, enableUpdates: false },
  getColumnDefs: () => SHORTCUTS_COLUMNS,
  grid: {
    showEditHistoryToolbar: true,
    showFiltersToolbar: true,
    showFormattingToolbar: false,
    showProfileSelector: true,
    showSaveButton: true,
    showSettingsButton: true,
  },
};

const EDITING_COLUMNS = pickColumns([
  'cusip', 'ticker', 'currency', 'quantityFace', 'maturityDate', 'midPrice', 'marketValue', 'dailyPnL',
]).map((col) => {
  if (col.field === 'currency') {
    return { ...col, editable: true, cellDataType: 'text' as const };
  }
  if (col.field === 'quantityFace' || col.field === 'midPrice') {
    return { ...col, editable: true, cellDataType: 'number' as const };
  }
  if (col.field === 'maturityDate') {
    return { ...col, editable: true, cellDataType: 'dateString' as const };
  }
  return col;
});

export const EDITING_FEATURE: LabFeatureConfig = {
  tabId: 'editing',
  providerId: 'mock-positions-editing',
  title: 'Editing',
  subtitle: `${EDITING_DEMO_PROFILES.length} profiles · Smart Edit · Bulk Update · +/- · Shortcuts · History`,
  help: HELP.editing,
  gridId: EDITING_GRID_ID,
  componentName: 'EditingLab',
  profiles: EDITING_DEMO_PROFILES,
  activeProfileId: EDITING_ACTIVE_PROFILE_ID,
  stream: { rowCount: 200, updateIntervalMs: 500, enableUpdates: false },
  getColumnDefs: () => EDITING_COLUMNS,
  grid: {
    showEditingToolbar: true,
    showFormattingToolbar: true,
    showFiltersToolbar: true,
    showProfileSelector: true,
    showSaveButton: true,
    showSettingsButton: true,
  },
};

/**
 * Stress test — the only tab whose columns and row count are not fixed here.
 * `StressTestTab` overrides `getColumnDefs` with the wide generated set and
 * drives `rowCount` from its own picker, because varying both live is the
 * point of the tab.
 */
export const STRESS_FEATURE: LabFeatureConfig = {
  tabId: 'stress',
  providerId: 'mock-positions-stress',
  title: 'Stress test — big book, two engines',
  subtitle: 'Wide columns at depth · switch the row engine and open a second window',
  help: HELP.stressTest,
  gridId: STRESS_GRID_ID,
  componentName: 'Stress',
  profiles: STRESS_DEMO_PROFILES,
  activeProfileId: STRESS_ACTIVE_PROFILE_ID,
  stream: { rowCount: 10_000, updateIntervalMs: 500 },
  getColumnDefs: () => OVERVIEW_COLUMNS,
  subtitleIncludesTickMs: true,
  grid: {
    showProfileSelector: true,
    showSaveButton: true,
    showSettingsButton: true,
    sideBar: { toolPanels: ['columns', 'filters'] },
    statusBar: {
      statusPanels: [
        { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
        { statusPanel: 'agFilteredRowCountComponent', align: 'left' },
        { statusPanel: 'agAggregationComponent', align: 'right' },
      ],
    },
  },
};
