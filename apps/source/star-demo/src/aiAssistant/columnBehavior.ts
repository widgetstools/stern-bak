/**
 * Argument handling for `set_column_behavior` — the half of the formatter
 * toolbar and the Column Customization tab that isn't styling.
 *
 * `set_column_style` covers how a column *looks*. This covers how it *behaves*:
 * which editor opens on a double-click, which filter its header offers, whether
 * it can be dragged into the row-group panel and what it aggregates to, and
 * which saved column template it inherits from.
 *
 * Two invariants are copied from the engine's reducers rather than reinvented
 * (`packages/core/engine/src/customizer/modules/column-customization/formattingActions.ts`):
 *
 *  1. **Picking an editor also unlocks the cell.** `cellEditor.kind` without
 *     `editable: true` is a silent no-op — AG-Grid never opens the editor.
 *  2. **A filter kind implies `enabled: true`** and drops any prior
 *     `multiFilters` override, because the streamSafe wrappers carry their own
 *     multi+set composition and a stale override force-casts them back.
 */

export const CELL_EDITOR_KINDS = [
  'agTextCellEditor',
  'agNumberCellEditor',
  'agSelectCellEditor',
  'agRichSelectCellEditor',
  'agLargeTextCellEditor',
  'agDateCellEditor',
  'agCheckboxCellEditor',
] as const;
export type CellEditorKind = (typeof CELL_EDITOR_KINDS)[number];

export const FILTER_KINDS = [
  'agTextColumnFilter',
  'agNumberColumnFilter',
  'agDateColumnFilter',
  'agSetColumnFilter',
  'agMultiColumnFilter',
  'streamSafeMultiColumnFilter',
  'streamSafeMultiNumberColumnFilter',
  'streamSafeMultiDateColumnFilter',
] as const;
export type FilterKind = (typeof FILTER_KINDS)[number];

export const FILTER_BUTTONS = ['apply', 'clear', 'reset', 'cancel'] as const;
export const AGG_FUNCS = ['sum', 'min', 'max', 'count', 'avg', 'first', 'last', 'custom'] as const;
export type AggFuncName = (typeof AGG_FUNCS)[number];

export interface CellEditorConfig {
  kind: CellEditorKind;
  values?: Array<string | number>;
  valuesSource?: string;
  params?: Record<string, unknown>;
}

export interface FilterConfig {
  enabled?: boolean;
  kind?: FilterKind;
  floatingFilter?: boolean;
  debounceMs?: number;
  buttons?: Array<(typeof FILTER_BUTTONS)[number]>;
  setFilterOptions?: Record<string, unknown>;
}

export interface GroupingConfig {
  enableRowGroup?: boolean;
  enableValue?: boolean;
  enablePivot?: boolean;
  aggFunc?: AggFuncName;
  customAggExpression?: string;
  allowedAggFuncs?: string[];
}

export interface NormalizedColumnBehavior {
  colIds: string[];
  editor?: CellEditorConfig;
  clearEditor: boolean;
  filter?: FilterConfig;
  clearFilter: boolean;
  grouping?: GroupingConfig;
  templateId?: string;
  clearTemplate: boolean;
  sortable?: boolean;
  filterable?: boolean;
  resizable?: boolean;
  headerTooltip?: string;
}

export type BehaviorResult =
  | { ok: true; value: NormalizedColumnBehavior }
  | { ok: false; error: string };

/** `"none"` is how the model clears a slot — JSON null round-trips badly
 *  through some tool-calling stacks, and `undefined` means "don't touch". */
function isNone(v: unknown): boolean {
  return v === 'none' || v === null;
}

export function normalizeColumnBehaviorArgs(args: Record<string, unknown>): BehaviorResult {
  const colIds: string[] = [];
  if (typeof args.colId === 'string' && args.colId) colIds.push(args.colId);
  if (Array.isArray(args.colIds)) {
    for (const id of args.colIds) {
      if (typeof id !== 'string' || !id) return { ok: false, error: 'colIds must be an array of column-id strings.' };
      if (!colIds.includes(id)) colIds.push(id);
    }
  } else if (args.colIds !== undefined) {
    return { ok: false, error: 'colIds must be an array of column-id strings.' };
  }
  if (colIds.length === 0) {
    // Unlike styling, none of these have a grid-wide slot to write to.
    return { ok: false, error: 'Missing target column(s): pass colId or colIds. There is no allColumns form — editors, filters and template refs are per-column.' };
  }

  const editor = isNone(args.editor) ? undefined : normalizeEditor(args.editor);
  if (isErr(editor)) return { ok: false, error: editor.error };
  const filter = isNone(args.filter) ? undefined : normalizeFilter(args.filter);
  if (isErr(filter)) return { ok: false, error: filter.error };
  const grouping = normalizeGrouping(args.grouping);
  if (isErr(grouping)) return { ok: false, error: grouping.error };

  for (const flag of ['sortable', 'filterable', 'resizable'] as const) {
    if (args[flag] !== undefined && typeof args[flag] !== 'boolean') {
      return { ok: false, error: `${flag} must be a boolean.` };
    }
  }
  if (args.headerTooltip !== undefined && typeof args.headerTooltip !== 'string') {
    return { ok: false, error: 'headerTooltip must be a string.' };
  }
  const templateGiven = args.templateId !== undefined;
  if (templateGiven && !isNone(args.templateId) && (typeof args.templateId !== 'string' || !args.templateId)) {
    return { ok: false, error: 'templateId must be a template id string, or "none" to drop the reference.' };
  }

  const value: NormalizedColumnBehavior = {
    colIds,
    editor,
    clearEditor: isNone(args.editor),
    filter,
    clearFilter: isNone(args.filter),
    grouping,
    templateId: templateGiven && !isNone(args.templateId) ? (args.templateId as string) : undefined,
    clearTemplate: templateGiven && isNone(args.templateId),
    sortable: args.sortable as boolean | undefined,
    filterable: args.filterable as boolean | undefined,
    resizable: args.resizable as boolean | undefined,
    headerTooltip: args.headerTooltip as string | undefined,
  };

  const touched =
    value.editor !== undefined || value.clearEditor ||
    value.filter !== undefined || value.clearFilter ||
    value.grouping !== undefined || value.templateId !== undefined || value.clearTemplate ||
    value.sortable !== undefined || value.filterable !== undefined ||
    value.resizable !== undefined || value.headerTooltip !== undefined;
  if (!touched) {
    return {
      ok: false,
      error: 'Nothing to change — supply at least one of editor, filter, grouping, templateId, sortable, filterable, resizable or headerTooltip.',
    };
  }
  return { ok: true, value };
}

function isErr(v: unknown): v is { error: string } {
  return typeof v === 'object' && v !== null && 'error' in v;
}

function normalizeEditor(raw: unknown): CellEditorConfig | undefined | { error: string } {
  if (raw === undefined) return undefined;
  // A bare string is the common case ("make it a dropdown") — accept it.
  const obj = typeof raw === 'string' ? { kind: raw } : raw;
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return { error: `editor must be a kind string or an object { kind, values?, valuesSource?, params? }. Kinds: ${CELL_EDITOR_KINDS.join(', ')}.` };
  }
  const { kind, values, valuesSource, params } = obj as Record<string, unknown>;
  if (typeof kind !== 'string' || !(CELL_EDITOR_KINDS as readonly string[]).includes(kind)) {
    return { error: `editor.kind must be one of: ${CELL_EDITOR_KINDS.join(', ')}.` };
  }
  const out: CellEditorConfig = { kind: kind as CellEditorKind };
  if (values !== undefined) {
    if (!Array.isArray(values) || values.some((v) => typeof v !== 'string' && typeof v !== 'number')) {
      return { error: 'editor.values must be an array of strings or numbers.' };
    }
    out.values = values as Array<string | number>;
  }
  if (valuesSource !== undefined) {
    if (typeof valuesSource !== 'string' || !/^\{\{.+\..+\}\}$/.test(valuesSource)) {
      return { error: 'editor.valuesSource must look like "{{providerName.key}}" — it is resolved from AppData when the editor opens.' };
    }
    out.valuesSource = valuesSource;
  }
  if (params !== undefined) {
    if (typeof params !== 'object' || params === null || Array.isArray(params)) {
      return { error: 'editor.params must be an object of editor-specific AG-Grid params.' };
    }
    out.params = params as Record<string, unknown>;
  }
  if ((out.values || out.valuesSource) && kind !== 'agSelectCellEditor' && kind !== 'agRichSelectCellEditor') {
    return { error: `values / valuesSource only apply to agSelectCellEditor and agRichSelectCellEditor, not ${kind}.` };
  }
  return out;
}

function normalizeFilter(raw: unknown): FilterConfig | undefined | { error: string } {
  if (raw === undefined) return undefined;
  const obj = typeof raw === 'string' ? { kind: raw } : raw;
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return { error: `filter must be a kind string or an object { kind?, enabled?, floatingFilter?, debounceMs?, buttons?, setFilterOptions? }. Kinds: ${FILTER_KINDS.join(', ')}.` };
  }
  const { kind, enabled, floatingFilter, debounceMs, buttons, setFilterOptions } = obj as Record<string, unknown>;
  const out: FilterConfig = {};
  if (kind !== undefined) {
    if (typeof kind !== 'string' || !(FILTER_KINDS as readonly string[]).includes(kind)) {
      return { error: `filter.kind must be one of: ${FILTER_KINDS.join(', ')}. Prefer the streamSafe* kinds on live-updating grids — their floating-filter row stays typeable while data ticks.` };
    }
    out.kind = kind as FilterKind;
  }
  for (const [name, v] of [['enabled', enabled], ['floatingFilter', floatingFilter]] as const) {
    if (v !== undefined) {
      if (typeof v !== 'boolean') return { error: `filter.${name} must be a boolean.` };
      out[name] = v;
    }
  }
  if (debounceMs !== undefined) {
    if (typeof debounceMs !== 'number' || !Number.isFinite(debounceMs) || debounceMs < 0) {
      return { error: 'filter.debounceMs must be a non-negative number of milliseconds.' };
    }
    out.debounceMs = debounceMs;
  }
  if (buttons !== undefined) {
    if (!Array.isArray(buttons) || buttons.some((b) => !(FILTER_BUTTONS as readonly unknown[]).includes(b))) {
      return { error: `filter.buttons must be an array drawn from: ${FILTER_BUTTONS.join(', ')}.` };
    }
    out.buttons = buttons as FilterConfig['buttons'];
  }
  if (setFilterOptions !== undefined) {
    if (typeof setFilterOptions !== 'object' || setFilterOptions === null || Array.isArray(setFilterOptions)) {
      return { error: 'filter.setFilterOptions must be an object, e.g. { "excelMode": "windows", "suppressMiniFilter": false }.' };
    }
    out.setFilterOptions = setFilterOptions as Record<string, unknown>;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeGrouping(raw: unknown): GroupingConfig | undefined | { error: string } {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { error: 'grouping must be an object { enableRowGroup?, enableValue?, enablePivot?, aggFunc?, customAggExpression?, allowedAggFuncs? }.' };
  }
  const { enableRowGroup, enableValue, enablePivot, aggFunc, customAggExpression, allowedAggFuncs } =
    raw as Record<string, unknown>;
  const out: GroupingConfig = {};
  for (const [name, v] of [
    ['enableRowGroup', enableRowGroup], ['enableValue', enableValue], ['enablePivot', enablePivot],
  ] as const) {
    if (v !== undefined) {
      if (typeof v !== 'boolean') return { error: `grouping.${name} must be a boolean.` };
      out[name] = v;
    }
  }
  if (aggFunc !== undefined) {
    if (typeof aggFunc !== 'string' || !(AGG_FUNCS as readonly string[]).includes(aggFunc)) {
      return { error: `grouping.aggFunc must be one of: ${AGG_FUNCS.join(', ')}.` };
    }
    out.aggFunc = aggFunc as AggFuncName;
  }
  if (customAggExpression !== undefined) {
    if (typeof customAggExpression !== 'string' || !customAggExpression) {
      return { error: 'grouping.customAggExpression must be an expression string, e.g. "SUM([value]) * 1.1".' };
    }
    out.customAggExpression = customAggExpression;
  }
  // The expression is only read when aggFunc is 'custom', so a lone
  // expression would look applied and do nothing.
  if (out.customAggExpression && out.aggFunc !== 'custom') {
    return { error: 'grouping.customAggExpression is only read when grouping.aggFunc is "custom" — pass both.' };
  }
  if (allowedAggFuncs !== undefined) {
    if (!Array.isArray(allowedAggFuncs) || allowedAggFuncs.some((f) => typeof f !== 'string')) {
      return { error: 'grouping.allowedAggFuncs must be an array of aggregation names.' };
    }
    out.allowedAggFuncs = allowedAggFuncs as string[];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Merges one column's assignment. Exported so the executor stays thin. */
export function applyColumnBehavior(
  existing: Record<string, unknown>,
  b: NormalizedColumnBehavior,
): Record<string, unknown> {
  const next = { ...existing };

  if (b.clearEditor) {
    // `editable` is deliberately left alone: a column can stay editable with
    // AG-Grid's default text editor once the structured kind is gone.
    delete next.cellEditor;
  } else if (b.editor) {
    const prev = (next.cellEditor as CellEditorConfig | undefined) ?? undefined;
    next.cellEditor = { ...prev, ...b.editor };
    next.editable = true;
  }

  if (b.clearFilter) {
    delete next.filter;
  } else if (b.filter) {
    const prev = (next.filter as FilterConfig | undefined) ?? {};
    next.filter = {
      ...prev,
      ...b.filter,
      enabled: b.filter.enabled ?? prev.enabled ?? true,
      ...(b.filter.kind ? { multiFilters: undefined } : {}),
    };
  }

  if (b.grouping) {
    next.rowGrouping = { ...(next.rowGrouping as GroupingConfig | undefined), ...b.grouping };
  }

  if (b.clearTemplate) delete next.templateIds;
  else if (b.templateId) next.templateIds = [b.templateId];

  if (b.sortable !== undefined) next.sortable = b.sortable;
  if (b.filterable !== undefined) next.filterable = b.filterable;
  if (b.resizable !== undefined) next.resizable = b.resizable;
  if (b.headerTooltip !== undefined) next.headerTooltip = b.headerTooltip;

  return next;
}

export function describeColumnBehavior(b: NormalizedColumnBehavior): string {
  const parts: string[] = [];
  if (b.editor) parts.push(`${b.editor.kind} editor (and made editable)`);
  if (b.clearEditor) parts.push('editor cleared');
  if (b.filter?.kind) parts.push(`${b.filter.kind}`);
  if (b.filter?.floatingFilter !== undefined) parts.push(b.filter.floatingFilter ? 'floating filter on' : 'floating filter off');
  if (b.filter?.enabled === false) parts.push('filtering disabled');
  if (b.clearFilter) parts.push('filter cleared');
  if (b.grouping?.aggFunc) parts.push(`${b.grouping.aggFunc} aggregation`);
  if (b.grouping?.enableRowGroup !== undefined) parts.push(b.grouping.enableRowGroup ? 'groupable' : 'not groupable');
  if (b.grouping?.enablePivot !== undefined) parts.push(b.grouping.enablePivot ? 'pivotable' : 'not pivotable');
  if (b.grouping?.enableValue !== undefined) parts.push(b.grouping.enableValue ? 'usable as a value' : 'not usable as a value');
  if (b.templateId) parts.push(`template "${b.templateId}"`);
  if (b.clearTemplate) parts.push('template reference removed');
  if (b.sortable !== undefined) parts.push(b.sortable ? 'sortable' : 'not sortable');
  if (b.filterable !== undefined) parts.push(b.filterable ? 'filterable' : 'not filterable');
  if (b.resizable !== undefined) parts.push(b.resizable ? 'resizable' : 'not resizable');
  if (b.headerTooltip !== undefined) parts.push(`header tooltip "${b.headerTooltip}"`);
  return parts.join(', ') || 'updated';
}
