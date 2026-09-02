/**
 * Generic item-level CRUD across every customizer module that holds a
 * collection.
 *
 * WHY GENERIC: the grid has 17 configurable modules, seven of which are lists
 * or maps of addressable items (rules, columns, groups, pills, templates,
 * alerts). Writing four bespoke tools per module would be ~28 tools the model
 * has to hold in its head, and each new grid module would silently be
 * unreachable until someone wrote three more. One uniform (moduleId,
 * collection, itemId) addressing scheme covers all of them, and a new module
 * becomes reachable by adding one row below.
 *
 * The specialised tools (add_conditional_styling_rule, set_column_style, …)
 * stay: they carry validation, sensible defaults and id generation for the
 * shapes users ask for most. These are the escape hatch for everything else —
 * and unlike `update_module_settings`, they patch ONE item, so the model never
 * has to resend a whole array and can't silently drop its siblings' ids.
 */

export interface CollectionSpec {
  moduleId: string;
  /** Key inside the module's state holding the collection. */
  collection: string;
  /** Property that identifies an item (also the record key when kind is 'record'). */
  idField: string;
  /** Arrays keep order; records are keyed by idField. */
  kind: 'array' | 'record';
  describes: string;
  /** Runtime-owned collections the model must not write. */
  readOnly?: boolean;
}

export const MODULE_COLLECTIONS: ReadonlyArray<CollectionSpec> = [
  {
    moduleId: 'conditional-styling',
    collection: 'rules',
    idField: 'id',
    kind: 'array',
    describes: 'Expression-driven cell/row styling rules (colour, flash, indicator, tick windows).',
  },
  {
    moduleId: 'calculated-columns',
    collection: 'virtualColumns',
    idField: 'colId',
    kind: 'array',
    describes: 'Virtual columns computed from an expression.',
  },
  {
    moduleId: 'column-groups',
    collection: 'groups',
    idField: 'groupId',
    kind: 'array',
    describes: 'Nested column group headers.',
  },
  {
    moduleId: 'saved-filters',
    collection: 'filters',
    idField: 'id',
    kind: 'array',
    describes: 'Quick-filter pills, each carrying an AG-Grid filter model.',
  },
  {
    moduleId: 'alerts',
    collection: 'rules',
    idField: 'id',
    kind: 'array',
    describes: 'Data-driven alert rules.',
  },
  {
    moduleId: 'alerts',
    collection: 'history',
    idField: 'id',
    kind: 'array',
    describes: 'Fired-alert history. Written by the runtime — read only.',
    readOnly: true,
  },
  {
    moduleId: 'column-customization',
    collection: 'assignments',
    idField: 'colId',
    kind: 'record',
    describes: 'Per-column presentation: styles, formats, widths, editors, renderers.',
  },
  {
    moduleId: 'column-templates',
    collection: 'templates',
    idField: 'id',
    kind: 'record',
    describes: 'Reusable column styling templates.',
  },
  {
    moduleId: 'plus-minus',
    collection: 'nudges',
    idField: 'id',
    kind: 'array',
    describes: 'Plus/minus nudge buttons — named increments scoped to columns.',
  },
  {
    moduleId: 'shortcuts',
    collection: 'shortcuts',
    idField: 'id',
    kind: 'array',
    describes: 'Keyboard shortcuts that apply an arithmetic operation to the selection.',
  },
  {
    moduleId: 'summary-panel',
    collection: 'widgets',
    idField: 'id',
    kind: 'array',
    describes: 'Summary-panel widgets — a digest/chart/table/heatmap/text card computed from the grid\'s current rows, rendered as a tab in a sidebar docked to the right of the blotter. Each widget\'s query field is the same DataQuery shape query_grid_data uses; a text widget carries `text` instead.',
  },
];

export function collectionsForModule(moduleId: string): CollectionSpec[] {
  return MODULE_COLLECTIONS.filter((c) => c.moduleId === moduleId);
}

export type CollectionLookup =
  | { ok: true; spec: CollectionSpec }
  | { ok: false; error: string };

/**
 * Resolves (moduleId, collection?) to a spec. `collection` may be omitted when
 * the module has exactly one — the common case; alerts is the exception.
 */
export function resolveCollection(moduleId: unknown, collection: unknown): CollectionLookup {
  if (typeof moduleId !== 'string' || !moduleId) {
    return { ok: false, error: 'Missing required field: moduleId.' };
  }
  const candidates = collectionsForModule(moduleId);
  if (candidates.length === 0) {
    const known = [...new Set(MODULE_COLLECTIONS.map((c) => c.moduleId))].join(', ');
    return {
      ok: false,
      error: `Module "${moduleId}" has no addressable item collection. Modules that do: ${known}. For settings-style modules use get_module_settings / update_module_settings instead.`,
    };
  }
  if (collection === undefined) {
    if (candidates.length === 1) return { ok: true, spec: candidates[0] };
    return {
      ok: false,
      error: `Module "${moduleId}" has several collections — pass one of: ${candidates.map((c) => c.collection).join(', ')}.`,
    };
  }
  const match = candidates.find((c) => c.collection === collection);
  if (!match) {
    return {
      ok: false,
      error: `"${String(collection)}" is not a collection of "${moduleId}". Valid: ${candidates.map((c) => c.collection).join(', ')}.`,
    };
  }
  return { ok: true, spec: match };
}

/** Items of a collection, normalised to an array regardless of storage kind. */
export function readItems(
  moduleData: Record<string, unknown> | undefined,
  spec: CollectionSpec,
): Array<Record<string, unknown>> {
  const raw = moduleData?.[spec.collection];
  if (spec.kind === 'array') {
    return Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
  }
  if (!raw || typeof raw !== 'object') return [];
  // Record-backed collections don't always store the key on the item itself
  // (templates historically didn't), so fold it in for uniform addressing.
  return Object.entries(raw as Record<string, Record<string, unknown>>).map(([key, value]) => ({
    [spec.idField]: key,
    ...value,
  }));
}

export function itemId(item: Record<string, unknown>, spec: CollectionSpec): string | undefined {
  const id = item[spec.idField];
  return typeof id === 'string' ? id : undefined;
}

/** Writes an array of items back into the shape the module stores. */
export function writeItems(
  spec: CollectionSpec,
  items: Array<Record<string, unknown>>,
): unknown {
  if (spec.kind === 'array') return items;
  const out: Record<string, unknown> = {};
  for (const item of items) {
    const id = itemId(item, spec);
    if (id) out[id] = item;
  }
  return out;
}

/**
 * Every customizer module a grid profile carries, with what each controls.
 *
 * These are the same module ids the grid's own Settings drawer edits, so
 * anything configurable through the UI is reachable via
 * get_module_settings / update_module_settings.
 */
export const GRID_MODULES: ReadonlyArray<{ id: string; describes: string }> = [
  { id: 'general-settings', describes: 'Grid-wide AG-Grid options: rowHeight, headerHeight, gridDensity, pagination, animateRows, enableCellChangeFlash, cellChangeFlashColor, cellFlashDuration, cellFadeDuration, rowSelection, sideBar, statusBar, row grouping/pivot toggles, and ~80 more.' },
  { id: 'column-customization', describes: 'Per-column styling, formatting, filters, row-grouping and cell editors (assignments keyed by colId).' },
  { id: 'calculated-columns', describes: 'Virtual columns computed from an expression.' },
  { id: 'conditional-styling', describes: 'Expression-driven cell/row highlighting, flash and indicator rules.' },
  { id: 'column-groups', describes: 'Nested column group headers.' },
  { id: 'saved-filters', describes: 'Named quick-filter pills backed by AG-Grid filter models.' },
  { id: 'column-templates', describes: 'Reusable column styling templates and per-type defaults.' },
  { id: 'grid-state', describes: 'Live AG-Grid state: column order, widths, sort, filters, pagination.' },
  { id: 'toolbar-visibility', describes: 'Which toolbars and toolbar buttons are shown.' },
  { id: 'toolbar-date-settings', describes: 'Historical-date toolbar behaviour.' },
  { id: 'smart-edit', describes: 'Smart-edit (fill/increment) behaviour.' },
  { id: 'bulk-update', describes: 'Bulk value-update behaviour.' },
  { id: 'plus-minus', describes: 'Plus/minus nudge-editing behaviour.' },
  { id: 'shortcuts', describes: 'Keyboard shortcut bindings.' },
  { id: 'data-change-history', describes: 'Edit-history tracking and undo depth.' },
  { id: 'alerts', describes: 'Data-driven alert rules and history.' },
  { id: 'visual-excel', describes: 'Excel-style visual formatting options.' },
  { id: 'summary-panel', describes: 'Configurable digest/chart/table/heatmap/text widgets summarizing the grid\'s own current rows, shown as tabs in a sidebar docked to the right of the blotter.' },
];
