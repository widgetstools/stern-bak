/**
 * Fold a template chain + typeDefault + the assignment's own fields into
 * one composite `ColumnAssignment`.
 *
 * Precedence (low → high):
 *   1. `typeDefaults[colDataType]` — ONLY when the assignment has no
 *      explicit `templateIds`. An explicit `templateIds: []` opts the
 *      column out.
 *   2. Each id in `assignment.templateIds[]`, in order — later wins.
 *   3. The assignment itself — always wins last.
 *
 * Per-field merge for `cellStyleOverrides` / `headerStyleOverrides`.
 * Last-writer-wins everywhere else. `cellEditorParams`, `filter`, and
 * `rowGrouping` are opaque — the later value replaces the earlier one
 * wholesale (no deep merge).
 *
 * Aliasing contract: the returned assignment's nested leaf objects
 * (BorderSpec entries, `cellEditorParams`, `valueFormatterTemplate.options`)
 * may alias template state — do NOT mutate them in place.
 */
// Relative on purpose — package self-imports create a barrel cycle.
import type {
  ColumnAssignment,
  ColumnDataType,
} from '../../../colDef';
import { mergeCellStyleOverrides, mergeThemedStyle } from '../../../colDef';
import type { ColumnTemplate, ColumnTemplatesState } from './state';

export function resolveTemplates(
  assignment: ColumnAssignment,
  templatesState: ColumnTemplatesState,
  colDataType: ColumnDataType | undefined,
): ColumnAssignment {
  // 1. Build the ordered chain of templates to apply (low → high precedence).
  const chain: ColumnTemplate[] = [];

  if (assignment.templateIds === undefined && colDataType !== undefined) {
    const fallbackId = templatesState.typeDefaults[colDataType];
    const fallback = fallbackId ? templatesState.templates[fallbackId] : undefined;
    if (fallback) chain.push(fallback);
  }

  for (const id of assignment.templateIds ?? []) {
    const t = templatesState.templates[id];
    if (t) chain.push(t);
    // Unknown ids silently skipped — template was deleted but the
    // assignment still references it. Don't crash the grid.
  }

  if (chain.length === 0) return assignment;

  // 2. Fold chain left-to-right, then the assignment itself last.
  const out: ColumnAssignment = { colId: assignment.colId };
  for (const t of chain) applyOver(out, t);
  applyOver(out, assignment);
  return out;
}

/**
 * Layer a template-shaped or assignment-shaped object onto `target`. Per-
 * field merge for styling; last-writer-wins for everything else; opaque
 * wholesale-replace for `cellEditorParams` / `filter` / `rowGrouping`.
 */
// Loose source shape — accepts both `ColumnTemplate` (with narrowed
// `filter` / `rowGrouping`) and base `ColumnAssignment` (with `unknown`
// for those same fields). Mirrors the runtime contract: every caller
// passes one of the two and the merge logic doesn't care which.
type ApplyOverSource = Partial<Omit<ColumnTemplate, 'filter' | 'rowGrouping'>> &
  Partial<Omit<ColumnAssignment, 'filter' | 'rowGrouping'>> & {
    filter?: unknown;
    rowGrouping?: unknown;
    cellEditor?: unknown;
  };

function applyOver(
  target: ColumnAssignment,
  source: ApplyOverSource,
): ColumnAssignment {
  // Per-field merge for styling — merge per-theme so a dark-only template
  // doesn't bleed onto the light slot of a later template.
  if (source.cellStyleOverrides !== undefined) {
    target.cellStyleOverrides = mergeThemedStyle(
      target.cellStyleOverrides,
      source.cellStyleOverrides,
      mergeCellStyleOverrides,
    );
  }
  if (source.headerStyleOverrides !== undefined) {
    target.headerStyleOverrides = mergeThemedStyle(
      target.headerStyleOverrides,
      source.headerStyleOverrides,
      mergeCellStyleOverrides,
    );
  }
  // Last-writer-wins for everything else.
  // `cellEditor` lives on the narrowed ColumnAssignment from
  // column-customization, not the base type imported here. List it as
  // a string key alongside the typed ones; the for-loop reads off the
  // loose `ApplyOverSource` shape so the lookup still works.
  const keys: (keyof ColumnAssignment | 'cellEditor')[] = [
    'valueFormatterTemplate',
    'sortable',
    'filterable',
    'resizable',
    'editable',
    'cellEditorName',
    'cellEditorParams',
    'cellEditor',
    'cellRendererName',
    'cellRendererId',
    'cellRendererConfig',
    'filter',
    'rowGrouping',
    'headerName',
    'headerTooltip',
    'initialWidth',
    'initialHide',
    'initialPinned',
    'templateIds',
  ];
  for (const k of keys) {
    const v = (source as Record<string, unknown>)[k as string];
    if (v !== undefined) (target as unknown as Record<string, unknown>)[k as string] = v;
  }
  return target;
}
