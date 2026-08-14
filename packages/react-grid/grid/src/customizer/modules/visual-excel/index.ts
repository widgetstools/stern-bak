import type { Module } from '@wellsfargo-starui/core';
import {
  VISUAL_EXCEL_MODULE_ID,
  INITIAL_VISUAL_EXCEL,
  deserializeVisualExcelState,
  buildVisualExcelStyles,
  applyFormatExcelClasses,
  type VisualExcelState,
} from '@wellsfargo-starui/core';
import {
  CONDITIONAL_STYLING_MODULE_ID,
  type ConditionalStylingState,
} from '../conditional-styling';
import {
  COLUMN_CUSTOMIZATION_MODULE_ID,
  type ColumnCustomizationState,
} from '../column-customization';
import { VisualExcelPanel } from './VisualExcelPanel';

export { VISUAL_EXCEL_MODULE_ID };
export { exportVisualExcel, type VisualExcelExportOptions } from './exportVisualExcel';

export const visualExcelModule: Module<VisualExcelState> = {
  id: VISUAL_EXCEL_MODULE_ID,
  name: 'Visual Excel',
  category: 'data',
  schemaVersion: 1,
  priority: 21,

  getInitialState: () => structuredClone(INITIAL_VISUAL_EXCEL),

  transformColumnDefs(defs, state, ctx) {
    if (!state.settings.enabled) return defs;
    const columnCustomization = ctx.getModuleState<ColumnCustomizationState>(COLUMN_CUSTOMIZATION_MODULE_ID);
    return applyFormatExcelClasses(defs, columnCustomization);
  },

  transformGridOptions(opts, state, ctx) {
    if (!state.settings.enabled) return opts;
    const columnCustomization = ctx.getModuleState<ColumnCustomizationState>(COLUMN_CUSTOMIZATION_MODULE_ID);
    const conditionalStyling = ctx.getModuleState<ConditionalStylingState>(CONDITIONAL_STYLING_MODULE_ID);
    const excelStyles = buildVisualExcelStyles({ columnCustomization, conditionalStyling });
    return { ...opts, excelStyles };
  },

  serialize: (state) => state,
  deserialize: deserializeVisualExcelState,

  SettingsPanel: VisualExcelPanel,
};
