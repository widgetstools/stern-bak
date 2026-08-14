import { type AnyModule } from '@wellsfargo-starui/core';
import {
  alertsModule,
  calculatedColumnsModule,
  columnCustomizationModule,
  columnGroupsModule,
  columnTemplatesModule,
  conditionalStylingModule,
  dataChangeHistoryModule,
  editingModule,
  generalSettingsModule,
  gridStateModule,
  savedFiltersModule,
  toolbarDateSettingsModule,
  toolbarVisibilityModule,
  visualExcelModule,
} from '../customizer/internal.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)

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
  editingModule,
  dataChangeHistoryModule,
  alertsModule,
  savedFiltersModule,
  toolbarVisibilityModule,
  toolbarDateSettingsModule,
  gridStateModule,
];
