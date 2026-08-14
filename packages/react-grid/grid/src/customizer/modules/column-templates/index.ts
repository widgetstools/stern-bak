/**
 * Column templates — passive state holder for reusable template definitions.
 * No `transformColumnDefs`, no `SettingsPanel`. Downstream modules
 * (column-customization) read this state via `ctx.getModuleState` and fold
 * the template chain through `resolveTemplates`.
 *
 * Priority 5 places this BEFORE column-customization (10) so its state is
 * settled by the time the customization walker reads it.
 */
import type { Module } from '@wellsfargo-starui/core';
import { migrateThemedStyle } from '@wellsfargo-starui/core';
import {
  INITIAL_COLUMN_TEMPLATES,
  type ColumnDataType,
  type ColumnTemplate,
  type ColumnTemplatesState,
} from '@wellsfargo-starui/core';

export const COLUMN_TEMPLATES_MODULE_ID = 'column-templates';

export const columnTemplatesModule: Module<ColumnTemplatesState> = {
  id: COLUMN_TEMPLATES_MODULE_ID,
  name: 'Templates',
  schemaVersion: 1,
  priority: 5,

  // INITIAL_COLUMN_TEMPLATES is deep-frozen — spreading its outer leaves
  // `templates` / `typeDefaults` as frozen references that throw on
  // mutation in strict mode. Return a fully-mutable fresh shape here.
  getInitialState: () => ({ templates: {}, typeDefaults: {} }),

  serialize: (state) => state,

  deserialize: (data) => {
    if (!data || typeof data !== 'object') return { templates: {}, typeDefaults: {} };
    const raw = data as Partial<ColumnTemplatesState>;
    const templates =
      raw.templates && typeof raw.templates === 'object' && !Array.isArray(raw.templates)
        ? { ...(raw.templates as Record<string, ColumnTemplate>) }
        : {};
    // Lift legacy flat style overrides into the themed `{ dark, light }`
    // wrapper. Same-value-in-both-slots so existing templates render
    // identically until the user authors per-theme variants.
    for (const id of Object.keys(templates)) {
      const t = templates[id];
      if (!t) continue;
      const cell = migrateThemedStyle(t.cellStyleOverrides as never);
      const hdr = migrateThemedStyle(t.headerStyleOverrides as never);
      const merged = { ...t };
      if (cell !== undefined) merged.cellStyleOverrides = cell;
      else delete merged.cellStyleOverrides;
      if (hdr !== undefined) merged.headerStyleOverrides = hdr;
      else delete merged.headerStyleOverrides;
      templates[id] = merged;
    }
    return {
      templates,
      typeDefaults:
        raw.typeDefaults && typeof raw.typeDefaults === 'object' && !Array.isArray(raw.typeDefaults)
          ? (raw.typeDefaults as Partial<Record<ColumnDataType, string>>)
          : {},
    };
  },
};

export { INITIAL_COLUMN_TEMPLATES };
export { resolveTemplates } from '@wellsfargo-starui/core';
export {
  snapshotTemplate,
  snapshotTemplateUpdate,
  pickTemplateFields,
  addTemplateReducer,
  removeTemplateReducer,
  updateTemplateReducer,
  renameTemplateReducer,
  type SnapshotTemplateDeps,
} from '@wellsfargo-starui/core';
export type {
  ColumnTemplate,
  ColumnTemplatesState,
  ColumnDataType,
  RowGroupingTemplate,
} from '@wellsfargo-starui/core';
