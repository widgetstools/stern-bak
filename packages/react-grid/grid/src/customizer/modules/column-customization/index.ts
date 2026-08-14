/**
 * Column Customization — per-column override layer.
 *
 * Merges user-defined `ColumnAssignment`s (styling, formatting, filter
 * config, row-grouping, cellEditor/cellRenderer) into the host's column
 * definitions. Runs AFTER column-templates (priority 10) so the resolver
 * sees the settled template chain.
 *
 * Side effects (CSS rule injection) live on the platform's per-grid
 * ResourceScope — no file-level state, cleaned up in one pass when the
 * grid is destroyed.
 */
import type { Module } from '@wellsfargo-starui/core';
import { migrateThemedStyle } from '@wellsfargo-starui/core';
import {
  INITIAL_COLUMN_CUSTOMIZATION,
  type ColumnCustomizationState,
} from '@wellsfargo-starui/core';
import type { ColumnTemplatesState } from '../column-templates';
import { COLUMN_TEMPLATES_MODULE_ID } from '../column-templates';
import { applyAssignments, reinjectCSS } from '@wellsfargo-starui/core';
import {
  ColumnSettingsEditor,
  ColumnSettingsList,
  ColumnSettingsPanel,
} from './ColumnSettingsPanel';

export const COLUMN_CUSTOMIZATION_MODULE_ID = 'column-customization';

export const columnCustomizationModule: Module<ColumnCustomizationState> = {
  id: COLUMN_CUSTOMIZATION_MODULE_ID,
  name: 'Column Settings',
  category: 'columns',
  schemaVersion: 10,
  dependencies: [COLUMN_TEMPLATES_MODULE_ID],
  priority: 10,

  getInitialState: () => ({ ...INITIAL_COLUMN_CUSTOMIZATION }),

  migrate(raw, fromVersion) {
    // Intra-v2 schema evolution:
    //   - schemaVersion 4 added optional `filter` per-assignment
    //   - schemaVersion 5 added optional `rowGrouping`
    //   - schemaVersion 6 (parked column_settings branch) introduced
    //     synthetic FilterKinds 'streamSafeMultiColumnFilter' and
    //     'streamSafeMultiNumberColumnFilter' + a `floatingFilterStyle`
    //     field. main never shipped those, so a v6 profile arriving
    //     here gets the synthetic kinds rewritten back to plain
    //     'agMultiColumnFilter' (and the floatingFilterStyle field is
    //     dropped — main has no place to honour it).
    //   - schemaVersion 7 lifted `cellStyleOverrides` and
    //     `headerStyleOverrides` from flat `CellStyleOverrides` into
    //     a theme-keyed `{ dark, light }` wrapper so per-column styling
    //     can differ by host theme. Flat values are duplicated into
    //     both slots on migration — same look as before until the user
    //     diverges them.
    //   - schemaVersion 8 added three optional state-root fields:
    //     `globalCellStyle`, `globalHeaderStyle`, `globalCellFormatter`.
    //     Older snapshots had no global baseline, so the migration is a
    //     no-op for these — they remain undefined and the toolbar treats
    //     the profile as "no global signal" until the user authors one.
    //   - schemaVersion 9 split `globalCellFormatter` into a number slot
    //     (`globalCellNumberFormatter`) and a date slot
    //     (`globalCellDateFormatter`) so both can coexist in one
    //     profile. v8 snapshots that carried `globalCellFormatter` lift
    //     it into the matching slot based on the template's preset:
    //     date / datetime → date slot; everything else → number slot.
    //   - schemaVersion 10 added optional `cellRendererId` +
    //     `cellRendererConfig` to per-column assignments so the user
    //     can pick a registered cell renderer (pill / heatmap / …)
    //     and author its config from the column-settings UI. The
    //     fields are additive — older snapshots load fine, the new
    //     fields just default to `undefined`.
    if (fromVersion >= 1 && fromVersion <= 10) {
      if (!raw || typeof raw !== 'object') {
        console.warn(
          '[column-customization]',
          `malformed schemaVersion ${fromVersion} snapshot; falling back to initial state.`,
        );
        return { ...INITIAL_COLUMN_CUSTOMIZATION };
      }
      const cloned = JSON.parse(JSON.stringify(raw)) as {
        assignments?: Record<string, Record<string, unknown>>;
        globalCellFormatter?: { kind?: string; preset?: string } & Record<string, unknown>;
        globalCellNumberFormatter?: unknown;
        globalCellDateFormatter?: unknown;
      };

      // v8→v9: split the single `globalCellFormatter` into number-vs-date
      // slots. Route by preset: date / datetime presets land on the
      // date slot; everything else (currency / percent / number / tick /
      // expression / excelFormat) lands on the number slot. excelFormat
      // strings can technically describe dates but the heuristic isn't
      // worth its complexity — operators can re-pick the format if it
      // was authored as a date in v8.
      if (fromVersion <= 8 && cloned.globalCellFormatter) {
        const gf = cloned.globalCellFormatter;
        const isDate =
          gf.kind === 'preset' && (gf.preset === 'date' || gf.preset === 'datetime');
        if (isDate) cloned.globalCellDateFormatter = gf;
        else cloned.globalCellNumberFormatter = gf;
        delete cloned.globalCellFormatter;
      }

      if (cloned.assignments && typeof cloned.assignments === 'object') {
        for (const colId of Object.keys(cloned.assignments)) {
          const a = cloned.assignments[colId];
          if (!a) continue;

          if (fromVersion === 6) {
            const filter = a.filter as { kind?: string; floatingFilterStyle?: string } | undefined;
            if (filter && typeof filter === 'object') {
              const k = filter.kind;
              if (k === 'streamSafeMultiColumnFilter' || k === 'streamSafeMultiNumberColumnFilter') {
                filter.kind = 'agMultiColumnFilter';
              }
              if ('floatingFilterStyle' in filter) {
                delete (filter as { floatingFilterStyle?: unknown }).floatingFilterStyle;
              }
            }
          }

          // Lift legacy flat style overrides into the themed wrapper.
          // `migrateThemedStyle` is a no-op for already-themed values.
          if (fromVersion <= 6) {
            const migratedCell = migrateThemedStyle(a.cellStyleOverrides as never);
            if (migratedCell) a.cellStyleOverrides = migratedCell as never;
            else delete a.cellStyleOverrides;

            const migratedHdr = migrateThemedStyle(a.headerStyleOverrides as never);
            if (migratedHdr) a.headerStyleOverrides = migratedHdr as never;
            else delete a.headerStyleOverrides;
          }
        }
      }
      return cloned as ColumnCustomizationState;
    }
    console.warn(
      '[column-customization]',
      `cannot migrate from schemaVersion ${fromVersion}; falling back to initial state.`,
    );
    return { ...INITIAL_COLUMN_CUSTOMIZATION };
  },

  transformColumnDefs(defs, state, ctx) {
    const templatesState = ctx.getModuleState<ColumnTemplatesState>(COLUMN_TEMPLATES_MODULE_ID);

    // CSS rule injection — one CssHandle per module, kept alive for the
    // grid's lifetime via the ResourceScope. `reinjectCSS` clears +
    // re-writes every pass; cheap because we only touch the text node.
    //
    // IMPORTANT: always run, even when assignments is empty. An empty
    // assignments map means the user cleared / undid every column
    // override — we need to CLEAR the previously-injected rules, not
    // leave them dangling. Previously this ran only when assignments
    // was non-empty, which meant Clear-All / Undo-to-empty left stale
    // `.ds-col-c-{colId}` rules in the page stylesheet.
    const cells = ctx.resources.css(`${COLUMN_CUSTOMIZATION_MODULE_ID}-cells`);
    const headers = ctx.resources.css(`${COLUMN_CUSTOMIZATION_MODULE_ID}-headers`);
    reinjectCSS(cells, headers, state, templatesState, defs);

    // Walker emits cellClass / headerClass (NOT cellStyle / headerStyle) so
    // the CSS rules above take effect without per-row recomputation. The
    // global formatter (when set) also needs the walker to plant
    // `valueFormatter` on every compatible column, so we run the walker
    // unconditionally when either per-column assignments or any global
    // baseline is present.
    const hasAnyState =
      Object.keys(state.assignments).length > 0 ||
      state.globalCellStyle !== undefined ||
      state.globalHeaderStyle !== undefined ||
      state.globalCellNumberFormatter !== undefined ||
      state.globalCellDateFormatter !== undefined;
    if (!hasAnyState) return defs;
    return applyAssignments(
      defs,
      state,
      templatesState,
      ctx.resources.expression(),
      ctx.resources.appData?.(),
    );
  },

  serialize: (state) => state,

  deserialize: (data) => {
    if (!data || typeof data !== 'object') return { ...INITIAL_COLUMN_CUSTOMIZATION };
    const raw = data as Record<string, unknown>;
    // Strip a stale `templates` field — it lived on this module in
    // pre-extract intra-v2 builds and now lives on column-templates.
    // Kept defensively so a snapshot from an older v2 build still
    // loads cleanly without dropping the rest of the state.
    const { templates: _drop, ...rest } = raw as { templates?: unknown };
    void _drop;
    // Defensive theming lift — covers same-schema-version snapshots that
    // still carry the legacy flat shape (e.g. profiles written by the
    // module before the schemaVersion was bumped). Already-themed
    // values are passed through unchanged by `migrateThemedStyle`.
    const next: ColumnCustomizationState = {
      ...INITIAL_COLUMN_CUSTOMIZATION,
      ...(rest as Partial<ColumnCustomizationState>),
    };
    if (next.assignments && typeof next.assignments === 'object') {
      const lifted: Record<string, never> = {};
      for (const [colId, a] of Object.entries(next.assignments)) {
        if (!a) continue;
        const cell = migrateThemedStyle(a.cellStyleOverrides as never);
        const hdr = migrateThemedStyle(a.headerStyleOverrides as never);
        const merged = { ...a };
        if (cell !== undefined) merged.cellStyleOverrides = cell;
        else delete merged.cellStyleOverrides;
        if (hdr !== undefined) merged.headerStyleOverrides = hdr;
        else delete merged.headerStyleOverrides;
        (lifted as Record<string, unknown>)[colId] = merged;
      }
      next.assignments = lifted as never;
    }
    return next;
  },

  // v4: native master-detail — the settings sheet picks these up
  // directly instead of rendering the flat `SettingsPanel` fallback.
  ListPane: ColumnSettingsList,
  EditorPane: ColumnSettingsEditor,
  SettingsPanel: ColumnSettingsPanel,
};

// Re-export the narrowed `ColumnAssignment` (with concrete `filter` +
// `rowGrouping` shapes) under a distinct name so consumers can opt into
// the richer type without colliding with the base `ColumnAssignment`
// exported from colDef.
export type { ColumnAssignment as ColumnCustomizationAssignment } from '@wellsfargo-starui/core';
export type {
  ColumnAssignment,
  ColumnCustomizationState,
  ColumnFilterConfig,
  RowGroupingConfig,
  FilterKind,
  CellEditorKind,
  ColumnCellEditorConfig,
  AggFuncName,
  SetFilterOptions,
  MultiFilterEntry,
} from '@wellsfargo-starui/core';
export { INITIAL_COLUMN_CUSTOMIZATION };
export {
  applyFilterConfigToColDef,
  applyRowGroupingConfigToColDef,
  cssEscapeColId,
} from '@wellsfargo-starui/core';
export {
  useAppDataLookup,
  useAppDataProviders,
  useAppDataKeys,
  parseValuesSource,
} from './editors/CellEditorEditor';
export {
  overrideKey,
  globalKey,
  stripUndefined,
  mergeOverrides,
  writeOverridesReducer,
  applyTypographyReducer,
  applyColorsReducer,
  applyAlignmentReducer,
  applyBordersReducer,
  clearAllBordersReducer,
  applyHeaderNameReducer,
  applyEditableReducer,
  applyCellEditorKindReducer,
  applyCellEditorValuesReducer,
  applyFilterPrimaryKindReducer,
  applyFloatingFilterReducer,
  applyFormatterReducer,
  applyTemplateToColumnsReducer,
  removeTemplateRefFromAssignmentsReducer,
  clearAllStylesReducer,
  clearAllStylesInProfileReducer,
  applyAutoFormatPlanReducer,
  type TargetKind,
  type ScopeKind,
  type FormatterKind,
  type AutoFormatApplyOptions,
} from '@wellsfargo-starui/core';
