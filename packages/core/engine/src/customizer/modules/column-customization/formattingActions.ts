/**
 * Pure reducers for column-customization state mutations.
 *
 * The `FormattingToolbar` in markets-grid originally shipped its writer
 * helpers as closures that closed over a `GridStore` reference. That
 * pattern blocked two things we care about:
 *   - Unit-testing the writers in isolation (no store boilerplate).
 *   - Re-using them from other surfaces (shared-preset services, future
 *     undo/redo stacks, cross-grid workspace stores).
 *
 * This module hosts the same behaviors as PURE functions with the shape:
 *   (…args) => (prev: ColumnCustomizationState | undefined) => next
 *
 * That makes them drop-in reducers for `store.setModuleState(MODULE_ID, …)`
 * AND independently testable. Every reducer is reference-safe — it
 * returns a new `assignments` map when anything actually changes, and
 * the same reference when nothing did.
 *
 * Scope: only writers that live inside column-customization's state
 * shape (`assignments` + `valueFormatterTemplate` + `templateIds`). The
 * `saveCurrentAsTemplate` helper that additionally reads
 * column-customization and writes column-templates lives in a sibling
 * file.
 */
import type {
  BorderSpec,
  CellStyleOverrides,
  CellEditorKind,
  ColumnAssignment,
  ColumnCustomizationState,
  ColumnFilterConfig,
  FilterKind,
  ValueFormatterTemplate,
} from './state';
import type { AutoFormatAssignment } from '../../../colDef/fieldFormatCatalog/types.js';
// Relative on purpose — package self-imports create a barrel cycle.
import {
  getActiveTheme,
  patchActiveStyle,
  resolveActiveStyle,
} from '../../../colDef';

export const COLUMN_CUSTOMIZATION_MODULE_ID = 'column-customization';

/** Where a cell-vs-header override lives inside a ColumnAssignment. */
export type TargetKind = 'cell' | 'header';

/**
 * Whether a write is scoped to the user's selected columns (lands on
 * `assignments[colId]`) or applied as a global baseline across every
 * column (lands on `globalCellStyle` / `globalHeaderStyle`). Per-column
 * overrides win over the global baseline at render time.
 */
export type ScopeKind = 'selected' | 'all';

/**
 * Which value-formatter slot a write targets — `'number'` writes to
 * `globalCellNumberFormatter` (number columns) and `'date'` writes to
 * `globalCellDateFormatter` (date columns). Only relevant for the
 * `'all'` scope on formatters; per-column writes land on the column's
 * single `valueFormatterTemplate` regardless of kind.
 */
export type FormatterKind = 'number' | 'date';

export function overrideKey(
  target: TargetKind,
): 'cellStyleOverrides' | 'headerStyleOverrides' {
  return target === 'header' ? 'headerStyleOverrides' : 'cellStyleOverrides';
}

/** Which top-level state field holds the global baseline for a target. */
export function globalKey(
  target: TargetKind,
): 'globalCellStyle' | 'globalHeaderStyle' {
  return target === 'header' ? 'globalHeaderStyle' : 'globalCellStyle';
}

/**
 * Drop keys whose value is `undefined`. Used after a `stripUndefined`
 * merge so "clear" patches actually remove the key rather than leaving
 * a present-but-undefined slot that downstream flatteners treat as a
 * real value.
 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj };
  for (const k of Object.keys(out)) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

/**
 * Merge a partial CellStyleOverrides patch into an existing one, leaf by
 * leaf. `undefined` values in the patch clear the corresponding leaf.
 * Returns `undefined` when the merge leaves an empty object — lets
 * callers drop the whole cell/header section from an assignment.
 */
export function mergeOverrides(
  base: CellStyleOverrides | undefined,
  patch: Partial<CellStyleOverrides>,
): CellStyleOverrides | undefined {
  const next: CellStyleOverrides = { ...(base ?? {}) };

  if (patch.typography !== undefined) {
    const merged = stripUndefined({ ...(next.typography ?? {}), ...patch.typography });
    next.typography = Object.keys(merged).length > 0 ? merged : undefined;
  }
  if (patch.colors !== undefined) {
    const merged = stripUndefined({ ...(next.colors ?? {}), ...patch.colors });
    next.colors = Object.keys(merged).length > 0 ? merged : undefined;
  }
  if (patch.alignment !== undefined) {
    const merged = stripUndefined({ ...(next.alignment ?? {}), ...patch.alignment });
    next.alignment = Object.keys(merged).length > 0 ? merged : undefined;
  }
  if (patch.borders !== undefined) {
    const merged = stripUndefined({ ...(next.borders ?? {}), ...patch.borders });
    next.borders = Object.keys(merged).length > 0 ? merged : undefined;
  }

  const clean = stripUndefined(
    next as unknown as Record<string, unknown>,
  ) as CellStyleOverrides;
  return Object.keys(clean).length > 0 ? clean : undefined;
}

// ─── Writers: style overrides ──────────────────────────────────────────

/**
 * Build a reducer that merges `patch` into the cell-or-header overrides.
 *
 * Scope semantics:
 *   - `'selected'` (default) — applies to every listed column's per-column
 *     assignment slot. Empty `colIds` is a no-op.
 *   - `'all'` — applies to the matching global state field
 *     (`globalCellStyle` / `globalHeaderStyle`). `colIds` is ignored.
 *
 * Both paths route through the active theme via `patchActiveStyle` so the
 * inactive theme's slot stays untouched.
 */
export function writeOverridesReducer(
  colIds: readonly string[],
  target: TargetKind,
  patch: Partial<CellStyleOverrides>,
  scope: ScopeKind = 'selected',
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return (prev) => {
    // Seed a fresh state when prev is undefined so reducers work on
    // first-write paths. Callers that care about identity still get a
    // new object when there's real work to do.
    const base: ColumnCustomizationState = prev ?? { assignments: {} };
    const theme = getActiveTheme();

    if (scope === 'all') {
      // Global baseline — single themed slot at the state root, no per-
      // column traversal. Active-theme merge preserves the inactive slot.
      const gKey = globalKey(target);
      const currentActive = resolveActiveStyle(base[gKey], theme);
      const mergedActive = mergeOverrides(currentActive, patch);
      const mergedThemed = patchActiveStyle(base[gKey], theme, mergedActive);
      const next: ColumnCustomizationState = { ...base };
      if (mergedThemed === undefined) delete next[gKey];
      else next[gKey] = mergedThemed;
      return next;
    }

    if (colIds.length === 0) return base;

    const key = overrideKey(target);
    const assignments = { ...base.assignments };
    for (const colId of colIds) {
      const a: ColumnAssignment = assignments[colId] ?? { colId };
      // Pull the active-theme slot, merge the patch, write it back —
      // the other theme's slot is preserved untouched.
      const currentActive = resolveActiveStyle(a[key], theme);
      const mergedActive = mergeOverrides(currentActive, patch);
      const mergedThemed = patchActiveStyle(a[key], theme, mergedActive);
      const next: ColumnAssignment = { ...a };
      if (mergedThemed === undefined) delete next[key];
      else next[key] = mergedThemed;
      assignments[colId] = next;
    }
    return { ...base, assignments };
  };
}

/** Typography-only convenience — merges `{ typography: patch }`. */
export function applyTypographyReducer(
  colIds: readonly string[],
  target: TargetKind,
  patch: {
    bold?: boolean | undefined;
    italic?: boolean | undefined;
    underline?: boolean | undefined;
    fontSize?: number | undefined;
  },
  scope: ScopeKind = 'selected',
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return writeOverridesReducer(colIds, target, { typography: patch }, scope);
}

/** Colors-only convenience — merges `{ colors: patch }`. */
export function applyColorsReducer(
  colIds: readonly string[],
  target: TargetKind,
  patch: { text?: string | undefined; background?: string | undefined },
  scope: ScopeKind = 'selected',
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return writeOverridesReducer(colIds, target, { colors: patch }, scope);
}

/** Horizontal-alignment convenience — merges `{ alignment: patch }`. */
export function applyAlignmentReducer(
  colIds: readonly string[],
  target: TargetKind,
  patch: { horizontal?: 'left' | 'center' | 'right' | undefined },
  scope: ScopeKind = 'selected',
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return writeOverridesReducer(colIds, target, { alignment: patch }, scope);
}

/**
 * Write (or clear with `spec: undefined`) a border on one or more sides.
 * `sides` is free-form so callers can do one-side or all-sides in a
 * single reducer.
 */
export function applyBordersReducer(
  colIds: readonly string[],
  target: TargetKind,
  sides: ReadonlyArray<'top' | 'right' | 'bottom' | 'left'>,
  spec: BorderSpec | undefined,
  scope: ScopeKind = 'selected',
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  const borders: NonNullable<CellStyleOverrides['borders']> = {};
  for (const side of sides) borders[side] = spec;
  return writeOverridesReducer(colIds, target, { borders }, scope);
}

/**
 * Set (or clear with `headerName: undefined`) the column's display caption.
 * Lives on the assignment root and writes through to AG-Grid's
 * `colDef.headerName` via the column-customization transform.
 */
export function applyHeaderNameReducer(
  colIds: readonly string[],
  headerName: string | undefined,
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return (prev) => {
    const base: ColumnCustomizationState = prev ?? { assignments: {} };
    if (colIds.length === 0) return base;

    const trimmed = headerName?.trim();
    const value = trimmed && trimmed.length > 0 ? trimmed : undefined;

    const assignments = { ...base.assignments };
    for (const colId of colIds) {
      const a: ColumnAssignment = assignments[colId] ?? { colId };
      const next: ColumnAssignment = { ...a };
      if (value === undefined) delete next.headerName;
      else next.headerName = value;
      assignments[colId] = next;
    }
    return { ...base, assignments };
  };
}

/**
 * Set (or clear with `editable: undefined`) the column's `editable` flag.
 * Maps directly to AG-Grid's `colDef.editable` so cells in the targeted
 * columns become editable / locked.
 */
export function applyEditableReducer(
  colIds: readonly string[],
  editable: boolean | undefined,
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return (prev) => {
    const base: ColumnCustomizationState = prev ?? { assignments: {} };
    if (colIds.length === 0) return base;

    const assignments = { ...base.assignments };
    for (const colId of colIds) {
      const a: ColumnAssignment = assignments[colId] ?? { colId };
      const next: ColumnAssignment = { ...a };
      if (editable === undefined) delete next.editable;
      else next.editable = editable;
      assignments[colId] = next;
    }
    return { ...base, assignments };
  };
}

// ─── Writers: cell editor + filter (formatter quick-pick surface) ─────

/**
 * Set or clear the structured `cellEditor` config on each column.
 *
 * Quick-pick surface — the formatter's editor dropdown writes the kind
 * here. Existing `params` / `values` / `valuesSource` stay intact when
 * the kind changes (preserves any tuning the user did from the column
 * settings panel). Passing `undefined` removes the cellEditor entirely.
 *
 * Side effect: setting a kind also flips `editable: true` on the
 * assignment so AG-Grid actually opens the editor — without that
 * flag, picking an editor is a silent no-op (the user's reported
 * confusion). Passing `undefined` leaves `editable` alone so the
 * user can keep a column editable with the default text editor by
 * clearing the kind without unlocking → re-locking.
 */
export function applyCellEditorKindReducer(
  colIds: readonly string[],
  kind: CellEditorKind | undefined,
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return (prev) => {
    const base: ColumnCustomizationState = prev ?? { assignments: {} };
    if (colIds.length === 0) return base;

    const assignments = { ...base.assignments };
    for (const colId of colIds) {
      const a: ColumnAssignment = assignments[colId] ?? { colId };
      const next: ColumnAssignment = { ...a };
      if (kind === undefined) {
        delete next.cellEditor;
      } else {
        const existing = a.cellEditor;
        next.cellEditor = existing
          ? { ...existing, kind }
          : { kind };
        // Auto-enable editing — picking an editor is meaningless when
        // the cell is locked. Only set explicitly when not already
        // true so we don't bump a `false` that the user set on
        // purpose to a `true` they didn't ask for; instead, force it
        // to `true` (this matches user intent: "I picked an editor,
        // so I want to edit").
        next.editable = true;
      }
      assignments[colId] = next;
    }
    return { ...base, assignments };
  };
}

/**
 * Update the `values` / `valuesSource` of an existing structured
 * `cellEditor` config. Only meaningful when the column already has
 * `cellEditor.kind` set (otherwise the patch is a no-op — the
 * resolver only emits values when a kind is present). Used by the
 * formatter's "values source" popover for select / rich-select
 * editors. Either field can be set independently — passing
 * `undefined` clears that field. The other field is preserved so
 * callers can flip modes without losing their work.
 */
export function applyCellEditorValuesReducer(
  colIds: readonly string[],
  patch: { values?: Array<string | number> | undefined; valuesSource?: string | undefined },
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return (prev) => {
    const base: ColumnCustomizationState = prev ?? { assignments: {} };
    if (colIds.length === 0) return base;

    const assignments = { ...base.assignments };
    for (const colId of colIds) {
      const a = assignments[colId];
      if (!a?.cellEditor) continue;
      const nextEditor = { ...a.cellEditor };
      if ('values' in patch) {
        if (patch.values === undefined) delete nextEditor.values;
        else nextEditor.values = patch.values;
      }
      if ('valuesSource' in patch) {
        if (patch.valuesSource === undefined) delete nextEditor.valuesSource;
        else nextEditor.valuesSource = patch.valuesSource;
      }
      assignments[colId] = { ...a, cellEditor: nextEditor };
    }
    return { ...base, assignments };
  };
}

/**
 * Quick-pick filter writer.
 *
 * The formatter exposes a single "primary filter" dropdown — picking
 * Text or Number writes one of the platform's streamSafe wrapper
 * kinds (`streamSafeMultiColumnFilter` for text,
 * `streamSafeMultiNumberColumnFilter` for number). Both wrappers
 * already bundle an `agMultiColumnFilter` with the typed primary
 * filter as sub-1 + `agSetColumnFilter` as sub-2, AND wire in the
 * stream-safe floating filter input so the row stays typeable under
 * live data updates. Granular tuning (debounce, sub-filter labels,
 * set-filter options) stays in the column-settings panel.
 *
 * Passing `undefined` for `primary` clears the filter config entirely
 * (column falls back to host defaults). Any `FilterKind` is accepted
 * so power-users wiring this through templates aren't constrained to
 * the quick-pick subset.
 */
export function applyFilterPrimaryKindReducer(
  colIds: readonly string[],
  primary: FilterKind | undefined,
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return (prev) => {
    const base: ColumnCustomizationState = prev ?? { assignments: {} };
    if (colIds.length === 0) return base;

    const assignments = { ...base.assignments };
    for (const colId of colIds) {
      const a: ColumnAssignment = assignments[colId] ?? { colId };
      const next: ColumnAssignment = { ...a };
      if (primary === undefined) {
        delete next.filter;
      } else {
        const existing: ColumnFilterConfig = a.filter ?? {};
        next.filter = {
          ...existing,
          enabled: true,
          kind: primary,
          // streamSafe wrappers carry their own internal multi+set
          // composition — drop any prior multiFilters override that
          // would otherwise force-cast back to a plain multi.
          multiFilters: undefined,
        };
      }
      assignments[colId] = next;
    }
    return { ...base, assignments };
  };
}

/**
 * Toggle the `floatingFilter` flag on each column's filter config. If
 * the column has no filter config yet, an enabled multi+set default is
 * created so the floating-filter row has something to render against.
 */
export function applyFloatingFilterReducer(
  colIds: readonly string[],
  on: boolean,
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return (prev) => {
    const base: ColumnCustomizationState = prev ?? { assignments: {} };
    if (colIds.length === 0) return base;

    const assignments = { ...base.assignments };
    for (const colId of colIds) {
      const a: ColumnAssignment = assignments[colId] ?? { colId };
      const existing: ColumnFilterConfig = a.filter ?? {};
      const next: ColumnAssignment = {
        ...a,
        filter: {
          ...existing,
          enabled: existing.enabled ?? true,
          floatingFilter: on,
        },
      };
      assignments[colId] = next;
    }
    return { ...base, assignments };
  };
}

// ─── Writers: formatter + templates + reset ───────────────────────────

/**
 * Set (or clear with `template: undefined`) the `valueFormatterTemplate`.
 *
 * Scope:
 *   - `'selected'` (default) — writes to each listed column's
 *     assignment. `kind` is ignored: per-column columns carry a single
 *     `valueFormatterTemplate` regardless of number-vs-date intent.
 *   - `'all'` — writes to `globalCellNumberFormatter` or
 *     `globalCellDateFormatter` depending on `kind`. Caller MUST pass
 *     the right kind so the picker's preset lands in the type-matched
 *     slot (currency / % → number; date / datetime → date). `colIds`
 *     is ignored in this branch.
 *
 * Formatter slot is template XOR renderer (same invariant as
 * {@link applyAutoFormatPlanReducer}). Setting a per-column template clears
 * any `cellRendererId` / `cellRendererConfig` first — otherwise a semantic
 * renderer (e.g. one applied by Auto Format) keeps painting the cell and the
 * manually-picked format never shows. Clearing the template leaves the
 * renderer untouched.
 */
export function applyFormatterReducer(
  colIds: readonly string[],
  template: ValueFormatterTemplate | undefined,
  scope: ScopeKind = 'selected',
  kind: FormatterKind = 'number',
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return (prev) => {
    const base: ColumnCustomizationState = prev ?? { assignments: {} };

    if (scope === 'all') {
      const key: 'globalCellNumberFormatter' | 'globalCellDateFormatter' =
        kind === 'date' ? 'globalCellDateFormatter' : 'globalCellNumberFormatter';
      const next: ColumnCustomizationState = { ...base };
      if (template === undefined) delete next[key];
      else next[key] = template;
      return next;
    }

    if (colIds.length === 0) return base;

    const assignments = { ...base.assignments };
    for (const colId of colIds) {
      const a: ColumnAssignment = assignments[colId] ?? { colId };
      const next: ColumnAssignment = { ...a };
      if (template === undefined) {
        delete next.valueFormatterTemplate;
      } else {
        next.valueFormatterTemplate = template;
        // Template XOR renderer: a semantic cell renderer (e.g. from Auto
        // Format) paints the cell itself and ignores the value formatter,
        // so clear it here or the user's manual format would never show.
        delete next.cellRendererId;
        delete next.cellRendererConfig;
      }
      assignments[colId] = next;
    }
    return { ...base, assignments };
  };
}

/**
 * Swap the templateIds chain on each column to exactly `[templateId]`.
 * Matches the toolbar UX where picking a template replaces (not layers
 * on top of) whatever was there before — the settings panel is the
 * surface for composing multiple templates.
 */
export function applyTemplateToColumnsReducer(
  colIds: readonly string[],
  templateId: string,
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return (prev) => {
    const base: ColumnCustomizationState = prev ?? { assignments: {} };
    if (colIds.length === 0 || !templateId) return base;

    const assignments = { ...base.assignments };
    for (const colId of colIds) {
      const a: ColumnAssignment = assignments[colId] ?? { colId };
      assignments[colId] = { ...a, templateIds: [templateId] };
    }
    return { ...base, assignments };
  };
}

/**
 * Strip a template id from every column's `templateIds` chain. Used
 * after a template is deleted from column-templates so no assignment
 * carries a dangling reference. Harmless if the id isn't referenced
 * anywhere — returns the same state reference.
 *
 * If removing the id leaves an empty chain, `templateIds` is deleted
 * entirely so the assignment falls back to typeDefaults on resolve
 * (matching the "no explicit templateIds" branch in resolveTemplates).
 */
export function removeTemplateRefFromAssignmentsReducer(
  templateId: string,
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return (prev) => {
    const base: ColumnCustomizationState = prev ?? { assignments: {} };
    if (!templateId) return base;

    let mutated = false;
    const assignments = { ...base.assignments };
    for (const [colId, a] of Object.entries(base.assignments)) {
      if (!a.templateIds || !a.templateIds.includes(templateId)) continue;
      mutated = true;
      const next: ColumnAssignment = { ...a };
      const filtered = a.templateIds.filter((id) => id !== templateId);
      if (filtered.length === 0) delete next.templateIds;
      else next.templateIds = filtered;
      assignments[colId] = next;
    }
    return mutated ? { ...base, assignments } : base;
  };
}

/**
 * Reset each listed column to a bare `{ colId }` assignment, dropping
 * overrides, formatter, filter, grouping, and template references.
 */
export function clearAllStylesReducer(
  colIds: readonly string[],
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return (prev) => {
    const base: ColumnCustomizationState = prev ?? { assignments: {} };
    if (colIds.length === 0) return base;

    const assignments = { ...base.assignments };
    for (const colId of colIds) {
      assignments[colId] = { colId };
    }
    return { ...base, assignments };
  };
}

/**
 * Nuke every column-customization assignment in the active profile.
 * Used by the "Clear all styles" button on the formatter toolbar +
 * popped panel, which now wipes the whole profile's style state rather
 * than just the selected columns.
 *
 * What it does clear:
 *   - All `assignments[*]` — every column's cellStyleOverrides,
 *     headerStyleOverrides, valueFormatterTemplate, templateIds,
 *     filter, rowGrouping, and any structural overrides.
 *
 * What it preserves:
 *   - The column-templates module (saved templates survive — users
 *     expect explicit Save/Delete to govern template lifecycle).
 *   - typeDefaults on the column-templates side (cross-module, not
 *     touched here).
 *   - Other module states (conditional-styling, calculated-columns,
 *     column-groups, etc.). If the user wants a full profile reset,
 *     that's a separate "reset profile" action.
 *
 * Returns a fresh `{ assignments: {} }`. Profile-level auto-save picks
 * it up through the normal module-state change pipeline.
 */
export function clearAllStylesInProfileReducer(): (
  prev: ColumnCustomizationState | undefined,
) => ColumnCustomizationState {
  return (prev) => {
    const base: ColumnCustomizationState = prev ?? { assignments: {} };
    if (Object.keys(base.assignments).length === 0) return base;
    return { ...base, assignments: {} };
  };
}

// ─── Writers: auto-format (field-catalog driven) ──────────────────────

/** Options for {@link applyAutoFormatPlanReducer}. */
export interface AutoFormatApplyOptions {
  /**
   * When true (the default), columns that already carry user-authored
   * formatting are left untouched, so the action is non-destructive — it
   * only fills in columns the user hasn't styled. Pass `false` to overwrite.
   */
  onlyUnstyled?: boolean;
}

/**
 * Does an assignment already carry formatting we shouldn't clobber on a
 * non-destructive auto-format pass? Structural-only assignments (width,
 * pin, sort) don't count — auto-format never touches those.
 */
function assignmentHasFormatting(a: ColumnAssignment | undefined): boolean {
  if (!a) return false;
  return (
    a.cellStyleOverrides !== undefined ||
    a.headerStyleOverrides !== undefined ||
    a.valueFormatterTemplate !== undefined ||
    (a.templateIds !== undefined && a.templateIds.length > 0) ||
    a.cellRendererId !== undefined ||
    a.cellRendererName !== undefined
  );
}

/**
 * Apply a whole field-catalog auto-format plan in ONE state update (one
 * undo entry). Each `plan[colId]` carries the resolved
 * {@link AutoFormatAssignment} produced by `buildAutoFormatPlan` — only
 * **native formatting-system state**: a value formatter (presets or an
 * `excelFormat` string whose `[Green]`/`[Red]` tags colour the cell),
 * alignment, typography, and/or a header rename.
 *
 * Alignment + typography are written to BOTH theme slots because they're
 * theme-agnostic: the dark→light read-time fold only inherits dark under
 * light, so writing both guarantees they show whichever theme is active.
 * They share one merged patch so a column that sets both lands in a single
 * `cellStyleOverrides` entry.
 *
 * Auto Format is renderer-free by design: every matched column has any prior
 * `cellRendererId` / `cellRendererConfig` cleared so an opaque renderer can't
 * paint over (and hide) the native value formatter the plan applies. This is
 * what keeps auto-formatted columns fully editable from the formatter toolbar
 * and saveable to the active profile.
 *
 * Columns are skipped entirely when `onlyUnstyled` and they already carry
 * formatting; pass `onlyUnstyled: false` (e.g. the toolbar's Auto Format) to
 * overwrite every matched column.
 */
export function applyAutoFormatPlanReducer(
  plan: Record<string, AutoFormatAssignment>,
  options: AutoFormatApplyOptions = {},
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  const onlyUnstyled = options.onlyUnstyled !== false;
  return (prev) => {
    const base: ColumnCustomizationState = prev ?? { assignments: {} };
    const colIds = Object.keys(plan);
    if (colIds.length === 0) return base;

    let mutated = false;
    const assignments = { ...base.assignments };
    for (const colId of colIds) {
      const spec = plan[colId];
      const existing = assignments[colId];
      if (onlyUnstyled && assignmentHasFormatting(existing)) continue;

      const a: ColumnAssignment = existing ?? { colId };
      const next: ColumnAssignment = { ...a };

      // Renderer-free: drop any opaque cell renderer so the native value
      // formatter below actually shows and stays toolbar-editable.
      delete next.cellRendererId;
      delete next.cellRendererConfig;

      if (spec.valueFormatterTemplate !== undefined) {
        next.valueFormatterTemplate = spec.valueFormatterTemplate;
      }
      if (spec.headerName !== undefined) next.headerName = spec.headerName;

      // Alignment + typography both live in cellStyleOverrides — merge them
      // into a single themed patch written to both slots.
      if (spec.alignment !== undefined || spec.typography !== undefined) {
        const patch: Partial<CellStyleOverrides> = {};
        if (spec.alignment !== undefined) patch.alignment = { horizontal: spec.alignment };
        if (spec.typography !== undefined) patch.typography = { ...spec.typography };
        next.cellStyleOverrides = {
          dark: mergeOverrides(a.cellStyleOverrides?.dark, patch) ?? (patch as CellStyleOverrides),
          light: mergeOverrides(a.cellStyleOverrides?.light, patch) ?? (patch as CellStyleOverrides),
        };
      }

      assignments[colId] = next;
      mutated = true;
    }
    return mutated ? { ...base, assignments } : base;
  };
}
