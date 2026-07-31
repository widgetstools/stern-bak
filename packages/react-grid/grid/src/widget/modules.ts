import { type AnyModule } from '@wellsfargo-starui/engine';
import {
  alertsModule,
  bulkUpdateModule,
  calculatedColumnsModule,
  columnCustomizationModule,
  columnGroupsModule,
  columnTemplatesModule,
  conditionalStylingModule,
  dataChangeHistoryModule,
  generalSettingsModule,
  gridStateModule,
  plusMinusModule,
  savedFiltersModule,
  shortcutsModule,
  smartEditModule,
  toolbarDateSettingsModule,
  toolbarVisibilityModule,
  visualExcelModule,
} from '../customizer/index.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)

/**
 * Default module list — every shipped module, ordered the way the user's
 * profile round-trips expect. Hosts can pass `modules` to override.
 *
 * grid-state MUST run last (priority 200) so replay sees the finalized
 * column set from every structure module.
 */
export const DEFAULT_MODULES: AnyModule[] = [
  generalSettingsModule,
  columnTemplatesModule,
  columnCustomizationModule,
  calculatedColumnsModule,
  columnGroupsModule,
  conditionalStylingModule,
  visualExcelModule,
  smartEditModule,
  bulkUpdateModule,
  plusMinusModule,
  shortcutsModule,
  dataChangeHistoryModule,
  alertsModule,
  savedFiltersModule,
  toolbarVisibilityModule,
  toolbarDateSettingsModule,
  gridStateModule,
];

/**
 * Lightweight preset for embed scenarios — general settings, saved filters,
 * and grid-state replay only. Profile round-trips for advanced modules
 * (alerts, conditional styling, column customization, …) require
 * {@link DEFAULT_MODULES} or an explicit custom list.
 */
export const MINIMAL_MODULES: AnyModule[] = [
  generalSettingsModule,
  savedFiltersModule,
  gridStateModule,
];
