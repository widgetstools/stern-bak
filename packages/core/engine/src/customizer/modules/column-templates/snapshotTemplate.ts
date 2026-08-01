/**
 * Pure helpers for the FormattingToolbar's "Save current as template…"
 * action.
 *
 * The v2 toolbar shipped one monolithic helper that:
 *   1. Read the column-customization state for the first selected colId.
 *   2. Read the column-templates state.
 *   3. Asked the grid API for the column's cellDataType.
 *   4. Called `resolveTemplates` to fold typeDefaults + referenced
 *      templates + overrides into an effective assignment.
 *   5. Decided whether there was anything worth saving.
 *   6. Minted a `tpl_<ts>_<rand>` id + assembled a `ColumnTemplate`.
 *   7. Dispatched a setModuleState into column-templates to persist it.
 *
 * Option A of the phase-5 plan splits the helper into two PURE pieces:
 *   - `snapshotTemplate()` owns steps 1–6 (decide what the template is).
 *   - `addTemplateReducer()` owns step 7 (add it to column-templates).
 *
 * The toolbar (or any other surface — future undo stack, shared-preset
 * service) reads the two module states once, calls `snapshotTemplate`,
 * then dispatches `addTemplateReducer(tpl)` into column-templates.
 *
 * Both functions are fully testable in isolation. `snapshotTemplate`
 * accepts an optional `deps` bag so tests can pin the generated id +
 * timestamps without touching `Date.now()` / `Math.random()`.
 */
import type {
  ColumnAssignment as NarrowedAssignment,
  ColumnCustomizationState,
  RowGroupingConfig,
} from '../column-customization/state';
// `resolveTemplates` returns the base shape (filter / rowGrouping typed
// as unknown). At runtime both flow through unchanged from the narrowed
// source on column-customization, so we type-cast at the boundary.
import type {
  ColumnDataType,
  ColumnTemplate,
  ColumnTemplatesState,
  RowGroupingTemplate,
} from './state';
import { resolveTemplates } from './resolveTemplates';

/** Strip the live-state fields from a RowGroupingConfig so the template
 *  carries capability flags + agg config only. Returns `undefined` when
 *  nothing meaningful remains (so the caller can omit the field entirely
 *  rather than persist `{}`). */
function pickRowGroupingTemplate(
  rg: RowGroupingConfig | undefined,
): RowGroupingTemplate | undefined {
  if (!rg) return undefined;
  const {
    rowGroup: _rowGroup,
    rowGroupIndex: _rowGroupIndex,
    pivot: _pivot,
    pivotIndex: _pivotIndex,
    ...rest
  } = rg;
  // Treat all-undefined as "nothing to save" — the spread above keeps
  // explicit-undefined keys, which would otherwise serialize as
  // `"enableRowGroup": undefined` and survive a round-trip as `null`.
  for (const k of Object.keys(rest)) {
    if ((rest as Record<string, unknown>)[k] === undefined) {
      delete (rest as Record<string, unknown>)[k];
    }
  }
  return Object.keys(rest).length > 0 ? (rest as RowGroupingTemplate) : undefined;
}

export interface SnapshotTemplateDeps {
  /** Override for `Date.now()`. Default uses real wall-clock. */
  readonly now?: () => number;
  /** Override for the id suffix generator (the 4-char random part).
   *  Default uses `Math.random().toString(36).slice(2, 6)`. */
  readonly idSuffix?: () => string;
}

/**
 * Compute the ColumnTemplate that `Save as template` would persist,
 * given the current column-customization + column-templates states and
 * the selected column's dataType. Returns `undefined` when:
 *
 *   - `colId` is empty / `name` is empty or whitespace,
 *   - the column has no assignment yet (nothing to capture),
 *   - the resolved assignment has NO cellStyle, NO headerStyle, and
 *     NO valueFormatterTemplate (nothing to save).
 *
 * On success returns a fully-formed ColumnTemplate (with a minted id)
 * ready to drop into `column-templates.templates[id]` via the sibling
 * `addTemplateReducer`.
 */
export function snapshotTemplate(
  cust: ColumnCustomizationState | undefined,
  tpls: ColumnTemplatesState | undefined,
  colId: string,
  name: string,
  dataType: ColumnDataType | undefined,
  deps?: SnapshotTemplateDeps,
): ColumnTemplate | undefined {
  if (!colId || !name.trim()) return undefined;

  const assignment: NarrowedAssignment | undefined = cust?.assignments?.[colId];
  if (!assignment) return undefined;

  const templatesState: ColumnTemplatesState = tpls ?? {
    templates: {},
    typeDefaults: {},
  };

  // Resolve so the saved template captures the EFFECTIVE state
  // (templates + typeDefault + this column's own overrides).
  const resolved = resolveTemplates(assignment, templatesState, dataType);

  const fields = pickTemplateFields(resolved as unknown as NarrowedAssignment);

  // "Nothing to save" guard — the snapshot must carry at least one
  // template-eligible field, otherwise a click on Save would mint an
  // empty template the user could never tell apart from another empty.
  if (Object.keys(fields).length === 0) return undefined;

  const now = (deps?.now ?? Date.now)();
  const suffix =
    (deps?.idSuffix ?? (() => Math.random().toString(36).slice(2, 6)))();
  const id = `tpl_${now}_${suffix}`;

  return {
    id,
    name: name.trim(),
    description: `Saved from ${colId}`,
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
}

/**
 * Pure projection from a (resolved) ColumnAssignment to the fields
 * eligible for capture in a template. Single source of truth for "what
 * does a template carry" — used by both `snapshotTemplate` (mint new)
 * and `updateTemplateReducer` (re-snapshot existing).
 *
 * Returns only fields that have a meaningful, non-empty value so the
 * caller can spread the result without polluting the template with
 * empty objects or explicit-`undefined` keys.
 */
export function pickTemplateFields(
  resolved: NarrowedAssignment,
): Partial<ColumnTemplate> {
  const out: Partial<ColumnTemplate> = {};

  if (
    resolved.cellStyleOverrides &&
    Object.keys(resolved.cellStyleOverrides).length > 0
  ) {
    out.cellStyleOverrides = resolved.cellStyleOverrides;
  }
  if (
    resolved.headerStyleOverrides &&
    Object.keys(resolved.headerStyleOverrides).length > 0
  ) {
    out.headerStyleOverrides = resolved.headerStyleOverrides;
  }
  if (resolved.valueFormatterTemplate) {
    out.valueFormatterTemplate = resolved.valueFormatterTemplate;
  }

  // Behavior flags — captured only when explicitly set on the assignment
  // (boolean), so an `undefined` doesn't shadow a higher-precedence
  // template's flag during apply.
  if (typeof resolved.editable === 'boolean') out.editable = resolved.editable;
  if (typeof resolved.sortable === 'boolean') out.sortable = resolved.sortable;
  if (typeof resolved.filterable === 'boolean') out.filterable = resolved.filterable;
  if (typeof resolved.resizable === 'boolean') out.resizable = resolved.resizable;

  // Editor + renderer registry keys.
  if (resolved.cellEditorName) out.cellEditorName = resolved.cellEditorName;
  if (resolved.cellEditorParams && Object.keys(resolved.cellEditorParams).length > 0) {
    out.cellEditorParams = resolved.cellEditorParams;
  }
  if (resolved.cellRendererName) out.cellRendererName = resolved.cellRendererName;

  // Structured cell-editor config — kind / values / valuesSource /
  // params. Captured wholesale (opaque last-writer-wins blob, same
  // policy as filter / rowGrouping). Skip when no kind is set,
  // because the resolver only emits cellEditor when kind is present
  // — a kindless config wouldn't change colDef behavior.
  if (resolved.cellEditor && resolved.cellEditor.kind) {
    out.cellEditor = resolved.cellEditor;
  }

  // Filter — opaque blob, captured wholesale (incl. floating-filter
  // settings, debounce, button set, multi-filter children, set-filter
  // options). Skip when the assignment's filter is empty `{}` because
  // that wouldn't represent a meaningful template trait.
  if (resolved.filter && Object.keys(resolved.filter).length > 0) {
    out.filter = resolved.filter;
  }

  // Row grouping — drop the live-state fields (rowGroup / rowGroupIndex
  // / pivot / pivotIndex) so the template carries only capability +
  // aggregation config.
  const rg = pickRowGroupingTemplate(resolved.rowGrouping);
  if (rg) out.rowGrouping = rg;

  return out;
}

/**
 * Reducer that adds a newly-snapshotted template to
 * `ColumnTemplatesState.templates`. If the id already exists it's
 * replaced (callers should check for collisions before dispatching —
 * `snapshotTemplate`'s id is timestamp + random so collisions are
 * vanishingly rare in practice).
 *
 * Returns a reducer shape matching `store.setModuleState(id, reducer)`.
 */
export function addTemplateReducer(
  tpl: ColumnTemplate,
): (prev: ColumnTemplatesState | undefined) => ColumnTemplatesState {
  return (prev) => {
    const base: ColumnTemplatesState = prev ?? {
      templates: {},
      typeDefaults: {},
    };
    return {
      ...base,
      templates: { ...base.templates, [tpl.id]: tpl },
    };
  };
}

/**
 * Compute a fresh field-set for an EXISTING template by re-snapshotting
 * the current column. Returns `undefined` when the column has nothing
 * to capture — callers should treat that as "no change" rather than
 * "wipe the template clean".
 *
 * Identity (`id`, `name`, `description`, `createdAt`) is preserved by
 * `updateTemplateReducer` — this helper only computes the data half.
 */
export function snapshotTemplateUpdate(
  cust: ColumnCustomizationState | undefined,
  tpls: ColumnTemplatesState | undefined,
  colId: string,
  dataType: ColumnDataType | undefined,
): Partial<ColumnTemplate> | undefined {
  if (!colId) return undefined;
  const assignment = cust?.assignments?.[colId];
  if (!assignment) return undefined;
  const templatesState: ColumnTemplatesState = tpls ?? {
    templates: {},
    typeDefaults: {},
  };
  const resolved = resolveTemplates(assignment, templatesState, dataType);
  const fields = pickTemplateFields(resolved as unknown as NarrowedAssignment);
  return Object.keys(fields).length > 0 ? fields : undefined;
}

/**
 * Reducer that overwrites an existing template's data fields with a
 * fresh snapshot, preserving `id` / `name` / `description` /
 * `createdAt` and bumping `updatedAt`.
 *
 * Replace-not-merge: if the column has lost a setting since the
 * template was first saved, that setting is removed from the template.
 * Matches the user's mental model "save the column as it is now"
 * rather than "accumulate every setting I've ever added". Callers who
 * want additive behavior should compose externally (apply + edit +
 * update).
 *
 * Unknown id is a no-op so a stale UI clicking Update on a since-
 * deleted template can't resurrect it.
 *
 * `now` is injected for testability — defaults to wall-clock.
 */
export function updateTemplateReducer(
  templateId: string,
  fields: Partial<ColumnTemplate>,
  deps?: { now?: () => number },
): (prev: ColumnTemplatesState | undefined) => ColumnTemplatesState {
  return (prev) => {
    const base: ColumnTemplatesState = prev ?? {
      templates: {},
      typeDefaults: {},
    };
    const existing = base.templates[templateId];
    if (!existing) return base;

    const now = (deps?.now ?? Date.now)();

    // Strip out identity / audit keys from `fields` if a caller
    // accidentally passed a full ColumnTemplate — this reducer ALWAYS
    // preserves the existing identity.
    const {
      id: _id,
      name: _name,
      description: _description,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...dataFields
    } = fields as ColumnTemplate;

    const next: ColumnTemplate = {
      id: existing.id,
      name: existing.name,
      description: existing.description,
      createdAt: existing.createdAt,
      updatedAt: now,
      ...dataFields,
    };

    return {
      ...base,
      templates: { ...base.templates, [templateId]: next },
    };
  };
}

/**
 * Reducer that renames an existing template. `id`, all data fields,
 * and `createdAt` are preserved; `updatedAt` bumps. Unknown id is a
 * no-op. Empty / whitespace-only names are rejected (no-op) so the
 * UI can't accidentally blank a template's name via an unguarded
 * input.
 */
export function renameTemplateReducer(
  templateId: string,
  name: string,
  deps?: { now?: () => number },
): (prev: ColumnTemplatesState | undefined) => ColumnTemplatesState {
  return (prev) => {
    const base: ColumnTemplatesState = prev ?? {
      templates: {},
      typeDefaults: {},
    };
    const existing = base.templates[templateId];
    if (!existing) return base;
    const trimmed = name.trim();
    if (!trimmed) return base;
    if (trimmed === existing.name) return base;

    const now = (deps?.now ?? Date.now)();
    return {
      ...base,
      templates: {
        ...base.templates,
        [templateId]: { ...existing, name: trimmed, updatedAt: now },
      },
    };
  };
}

/**
 * Delete a template from `state.templates`. Any `typeDefaults[...]`
 * entries pointing at the removed id are also cleared (otherwise the
 * resolver would leave a dangling type-default reference — functionally
 * equivalent to the id being missing thanks to resolveTemplates'
 * silent-skip of unknown ids, but a clean state read is easier to
 * reason about).
 *
 * Column `assignments[*].templateIds[]` are NOT rewritten here — that
 * lives in column-customization. Callers that want full cleanup should
 * dispatch `removeTemplateRefFromAssignmentsReducer(id)` to the
 * column-customization store in the same tick.
 */
export function removeTemplateReducer(
  templateId: string,
): (prev: ColumnTemplatesState | undefined) => ColumnTemplatesState {
  return (prev) => {
    const base: ColumnTemplatesState = prev ?? {
      templates: {},
      typeDefaults: {},
    };
    if (!base.templates[templateId]) return base;

    const { [templateId]: _removed, ...remaining } = base.templates;
    // Clear any type-default that pointed at the removed id.
    const typeDefaults = { ...base.typeDefaults };
    for (const [dataType, id] of Object.entries(typeDefaults)) {
      if (id === templateId) delete typeDefaults[dataType as keyof typeof typeDefaults];
    }
    return { ...base, templates: remaining, typeDefaults };
  };
}
