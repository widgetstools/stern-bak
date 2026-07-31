/**
 * Column-customization transforms — isolated from the module entry so the
 * same helpers can be consumed by conditional-styling, calculated-columns,
 * and column-groups when they need to layer the same filter / rowGrouping
 * config onto virtual ColDefs.
 */
import type { ColDef, IAggFuncParams } from 'ag-grid-community';
// Relative on purpose — package self-imports create a barrel cycle.
import type {
  AnyColDef,
  AppDataLookup,
  CssHandle,
  ExpressionEngineLike,
} from '../../../platform/types';
import type { BorderSpec, CellStyleOverrides } from '../../../colDef';
import type {
  ColumnAssignment,
  ColumnCustomizationState,
  ColumnFilterConfig,
  RowGroupingConfig,
} from './state';
import { resolveTemplates } from '../column-templates/resolveTemplates';
import type { ColumnDataType, ColumnTemplatesState } from '../column-templates/state.js';
import {
  valueFormatterFromTemplate,
  excelFormatColorResolver,
  resolveEffectiveStyle,
} from '../../../colDef';
import type { GridThemeMode, ValueFormatterTemplate } from '../../../colDef';

// ─── Runtime value-type dispatcher for the global cell formatters ─────────
//
// Applied to columns that have no per-column `valueFormatterTemplate` and
// no explicit `cellDataType`. Dispatches per render by inspecting the
// raw value: dates / date-strings hit the date formatter; numbers (and
// strings parseable as numbers in number-cell columns) hit the number
// formatter; anything else passes through unchanged so a string column
// like "country = Apple" keeps its text instead of being formatted into
// empty space.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ].*)?$/;

function buildSafeGlobalFormatter(
  numberTemplate: ValueFormatterTemplate | undefined,
  dateTemplate: ValueFormatterTemplate | undefined,
): (params: { value: unknown; data?: unknown }) => string {
  const numFmt = numberTemplate
    ? valueFormatterFromTemplate(numberTemplate)
    : undefined;
  const dateFmt = dateTemplate
    ? valueFormatterFromTemplate(dateTemplate)
    : undefined;
  return (params) => {
    const v = params.value;
    if (v == null) return '';
    // Native Date — date formatter wins.
    if (v instanceof Date) {
      return dateFmt
        ? dateFmt(params as Parameters<typeof dateFmt>[0])
        : String(v);
    }
    // Numbers → number formatter (or pass through).
    if (typeof v === 'number') {
      return numFmt
        ? numFmt(params as Parameters<typeof numFmt>[0])
        : String(v);
    }
    // Strings — sniff ISO-date prefix before reaching for the date
    // formatter. Avoid running a number formatter on arbitrary text
    // ("Apple" → NaN → empty cell, which was the original bug).
    if (typeof v === 'string') {
      if (dateFmt && ISO_DATE_RE.test(v)) {
        return dateFmt(params as Parameters<typeof dateFmt>[0]);
      }
      return v;
    }
    return String(v);
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function cellDataTypeToDomain(value: unknown): ColumnDataType | undefined {
  if (value === 'numeric' || value === 'date' || value === 'string' || value === 'boolean') {
    return value;
  }
  return undefined;
}

/**
 * Encode a colId so it's safe to use as a CSS class name AND inside a
 * CSS selector without further escaping.
 *
 * The walker derives column identity from `colDef.colId ?? colDef.field`
 * — for nested fields the field is `'a.b.c'` style and AG-Grid uses
 * that as the colId. Without encoding, the cellClass `ds-col-c-a.b.c`
 * becomes the selector `.ds-col-c-a.b.c` which CSS parses as three
 * chained class matches (`.ds-col-c-a` AND `.b` AND `.c`) — so the
 * rule never matches and the formatter has no visible effect.
 *
 * Rule: replace every char outside `[A-Za-z0-9_-]` with `_xx` where
 * `xx` is the two-digit lowercase hex of the char code. Idempotent on
 * already-safe ids; collision-free vs raw ids because raw ids never
 * contain `_<hex>` for the chars we encode.
 *
 * Examples:
 *   'price'              → 'price'              (no change)
 *   'ratings.sp'         → 'ratings_2esp'
 *   'position[0].qty'    → 'position_5b0_5d_2eqty'
 *   'field with spaces'  → 'field_20with_20spaces'
 */
export function cssEscapeColId(colId: string): string {
  return colId.replace(/[^A-Za-z0-9_-]/g, (c) =>
    `_${c.charCodeAt(0).toString(16).padStart(2, '0')}`,
  );
}

// ─── CSS generation ────────────────────────────────────────────────────────

/** Structured CellStyleOverrides → CSS declaration text (no borders). */
function styleOverridesToCSS(o: CellStyleOverrides): string {
  const parts: string[] = [];
  const t = o.typography;
  if (t) {
    if (t.bold) parts.push('font-weight: bold');
    if (t.italic) parts.push('font-style: italic');
    if (t.underline) parts.push('text-decoration: underline');
    if (t.fontSize != null) parts.push(`font-size: ${t.fontSize}px`);
  }
  const c = o.colors;
  if (c) {
    if (c.text !== undefined) parts.push(`color: ${c.text}`);
    if (c.background !== undefined) parts.push(`background-color: ${c.background}`);
  }
  const a = o.alignment;
  if (a) {
    if (a.horizontal !== undefined) parts.push(`text-align: ${a.horizontal}`);
    if (a.vertical !== undefined) parts.push(`vertical-align: ${a.vertical}`);
  }
  return parts.join('; ');
}

/**
 * Build CSS for a `::after` pseudo-element that draws per-side borders
 * using real CSS border properties (honours dashed / dotted — box-shadow
 * silently drops `style`, CSS borders do not).
 *
 * DO NOT emit `position: relative` on the target. AG-Grid cells are
 * already relative and header cells are absolute; emitting relative
 * clobbers the header layout.
 */
function borderOverlayFromOverrides(selector: string, o: CellStyleOverrides): string {
  const b = o.borders;
  if (!b) return '';
  const parts: string[] = [];
  const sideMap: Record<'top' | 'right' | 'bottom' | 'left', (spec: BorderSpec) => string> = {
    top:    (s) => `border-top: ${s.width}px ${s.style} ${s.color}`,
    right:  (s) => `border-right: ${s.width}px ${s.style} ${s.color}`,
    bottom: (s) => `border-bottom: ${s.width}px ${s.style} ${s.color}`,
    left:   (s) => `border-left: ${s.width}px ${s.style} ${s.color}`,
  };
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const spec = b[side];
    if (spec && spec.width > 0) parts.push(sideMap[side](spec));
  }
  if (parts.length === 0) return '';
  return `${selector}::after { content: ''; position: absolute; inset: 0; pointer-events: none; box-sizing: border-box; z-index: 1; ${parts.join('; ')}; }`;
}

/**
 * Header alignment maps to `justify-content` on the label container —
 * AG-Grid header cells use flexbox, so `text-align` doesn't work.
 */
function headerAlignCSS(selector: string, horizontal: string): string {
  const map: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' };
  const jc = map[horizontal] ?? horizontal;
  return `${selector} .ag-header-cell-label { justify-content: ${jc}; }`;
}

/**
 * Re-inject all CSS rules for every assigned column AND the global
 * baselines. Called on every transform pass — the handle is keyed by
 * colId, so re-applying just replaces the old text.
 *
 * Layering order in the stylesheet (later overrides earlier when
 * specificity ties):
 *   1. `globalCellStyle` → `.ag-cell` (broad, all cells)
 *   2. `globalHeaderStyle` → `.ag-header-cell` (broad, all headers)
 *   3. Per-column rules with chained selectors `.ag-cell.ds-col-c-{id}`
 *      and `.ag-header-cell.ds-hdr-c-{id}` — higher specificity than the
 *      global selectors, so per-column always wins for the column it
 *      targets while inheriting unset properties from the global slot.
 */
export function reinjectCSS(
  cells: CssHandle,
  headers: CssHandle,
  state: ColumnCustomizationState,
  templatesState: ColumnTemplatesState,
  defs: AnyColDef[],
): void {
  const assignments = state.assignments;
  cells.clear();
  headers.clear();

  // 1. Global baselines — emit FIRST, broad selector so every cell /
  //    header inherits. Per-column rules below win via more specific
  //    chained-class selectors.
  for (const mode of ['dark', 'light'] as GridThemeMode[]) {
    const themeSel = `html[data-theme="${mode}"]`;
    // Effective slot: dark renders its own; light inherits dark and
    // overrides per-leaf. Storage stays divergence-only — the merge is a
    // read-time fold (see resolveEffectiveStyle).
    const gCell = resolveEffectiveStyle(state.globalCellStyle, mode);
    const gHdr = resolveEffectiveStyle(state.globalHeaderStyle, mode);

    if (gCell) {
      const css = styleOverridesToCSS(gCell);
      if (css) cells.addRule(`cell-all-${mode}`, `${themeSel} .ag-cell { ${css} }`);
      const border = borderOverlayFromOverrides(`${themeSel} .ag-cell`, gCell);
      if (border) cells.addRule(`cell-all-bo-${mode}`, border);
    }
    if (gHdr) {
      const css = styleOverridesToCSS(gHdr);
      if (css) headers.addRule(`hdr-all-${mode}`, `${themeSel} .ag-header-cell { ${css} }`);
      const border = borderOverlayFromOverrides(`${themeSel} .ag-header-cell`, gHdr);
      if (border) headers.addRule(`hdr-all-bo-${mode}`, border);
    }
    const globalHdrAlign =
      gHdr?.alignment?.horizontal ?? gCell?.alignment?.horizontal;
    if (globalHdrAlign) {
      headers.addRule(
        `hdr-all-align-${mode}`,
        headerAlignCSS(`${themeSel} .ag-header-cell`, globalHdrAlign),
      );
    }
  }

  // colId → cellDataType so `resolveTemplates` can pick the right
  // typeDefault. Virtual columns (appended later in the pipeline) are
  // missing from `defs` and get `undefined` — resolveTemplates handles
  // that by skipping the type-default fallback.
  const dataTypeByColId = new Map<string, unknown>();
  const collectDataTypes = (list: AnyColDef[]) => {
    for (const def of list) {
      if ('children' in def && Array.isArray(def.children)) {
        collectDataTypes(def.children);
        continue;
      }
      const colDef = def as ColDef;
      const colId = colDef.colId ?? colDef.field;
      if (colId) dataTypeByColId.set(colId, colDef.cellDataType);
    }
  };
  collectDataTypes(defs);

  // Iterate assignments keyed by colId — not `defs` — so virtual columns
  // still get their cellStyleOverrides injected. Emit rules for BOTH
  // theme slots, scoped by `html[data-theme="…"]`, so flipping the host
  // theme is a pure CSS cascade event — no colDef rebuild needed.
  for (const colId of Object.keys(assignments)) {
    if (!colId) continue; // empty key is meaningless; skip defensively
    const a = assignments[colId];
    if (!a) continue;
    const resolved = resolveTemplates(
      a,
      templatesState,
      cellDataTypeToDomain(dataTypeByColId.get(colId)),
    );
    // Both the class on the DOM and the selector go through the same
    // encoder — they always match regardless of the source colId's
    // shape (dots, brackets, spaces, …).
    const safeId = cssEscapeColId(colId);
    const cellCls = `ds-col-c-${safeId}`;
    const hdrCls = `ds-hdr-c-${safeId}`;

    for (const mode of ['dark', 'light'] as GridThemeMode[]) {
      const themeSel = `html[data-theme="${mode}"]`;
      // Light inherits the dark slot and overrides per-leaf; dark renders
      // its own slot unchanged (resolveEffectiveStyle).
      const cellStyle = resolveEffectiveStyle(resolved?.cellStyleOverrides, mode);
      const headerStyle = resolveEffectiveStyle(resolved?.headerStyleOverrides, mode);

      // Chain AG-Grid's base class so per-column selectors out-specific
      // the global-baseline rules emitted above.
      const cellSel = `${themeSel} .ag-cell.${cellCls}`;
      const hdrSel = `${themeSel} .ag-header-cell.${hdrCls}`;

      if (cellStyle) {
        const css = styleOverridesToCSS(cellStyle);
        if (css) cells.addRule(`cell-${colId}-${mode}`, `${cellSel} { ${css} }`);
        const border = borderOverlayFromOverrides(cellSel, cellStyle);
        if (border) cells.addRule(`cell-bo-${colId}-${mode}`, border);
      }

      if (headerStyle) {
        const css = styleOverridesToCSS(headerStyle);
        if (css) headers.addRule(`hdr-${colId}-${mode}`, `${hdrSel} { ${css} }`);
        const border = borderOverlayFromOverrides(hdrSel, headerStyle);
        if (border) headers.addRule(`hdr-bo-${colId}-${mode}`, border);
      }

      // Header alignment inherits the cell's unless overridden. Without
      // this the header-align class has nothing to target when the user
      // only aligned the cell.
      const effectiveHeaderAlign =
        headerStyle?.alignment?.horizontal ?? cellStyle?.alignment?.horizontal;
      if (effectiveHeaderAlign) {
        headers.addRule(
          `hdr-align-${colId}-${mode}`,
          headerAlignCSS(hdrSel, effectiveHeaderAlign),
        );
      }
    }
  }
}

// ─── Filter config → AG-Grid filter/filterParams/floatingFilter ────────────

/**
 * Compose AG-Grid's `filter`, `filterParams`, `floatingFilter` on `merged`
 * from our `ColumnFilterConfig`. Mutates `merged` in place.
 *
 * Exported — consumed by calculated-columns / column-groups when they
 * need to layer filter config onto their own ColDefs.
 */
export function applyFilterConfigToColDef(merged: ColDef, cfg: ColumnFilterConfig): void {
  if (cfg.enabled === false) {
    merged.filter = false;
    merged.filterParams = undefined;
    if (cfg.floatingFilter !== undefined) merged.floatingFilter = cfg.floatingFilter;
    return;
  }

  // Synthetic 'streamSafeMulti*ColumnFilter' kinds aren't real AG-Grid
  // filter types — they're opt-in markers for `agMultiColumnFilter`
  // with our custom column-level floating filter (streamSafeText for
  // text columns, streamSafeNumber for number columns, streamSafeDate
  // for date columns). Flatten to the real AG-Grid kind for emission;
  // the floating-filter component gets planted further down in the
  // multi-filter branch.
  const isStreamSafeMultiText = cfg.kind === 'streamSafeMultiColumnFilter';
  const isStreamSafeMultiNumber = cfg.kind === 'streamSafeMultiNumberColumnFilter';
  const isStreamSafeMultiDate = cfg.kind === 'streamSafeMultiDateColumnFilter';
  const isStreamSafeMulti = isStreamSafeMultiText || isStreamSafeMultiNumber || isStreamSafeMultiDate;
  if (cfg.kind) merged.filter = isStreamSafeMulti ? 'agMultiColumnFilter' : cfg.kind;
  if (cfg.floatingFilter !== undefined) merged.floatingFilter = cfg.floatingFilter;

  // AG-Grid Enterprise resolves `filter: true` to `agSetColumnFilter`, whose
  // floating filter is read-only by design (it just mirrors the active
  // selection from the popup). When the user opted into a floating filter
  // without picking an explicit kind, that's a usability trap — they
  // expect a typeable input. Coerce the boolean default to a text filter
  // ONLY when floating is on; popup-only set-filter usage is unaffected.
  if (merged.floatingFilter === true && merged.filter === true) {
    merged.filter = 'agTextColumnFilter';
  }

  const params: Record<string, unknown> = {};
  if (cfg.buttons && cfg.buttons.length > 0) params.buttons = cfg.buttons;
  if (cfg.closeOnApply !== undefined) params.closeOnApply = cfg.closeOnApply;
  if (cfg.debounceMs !== undefined) params.debounceMs = cfg.debounceMs;

  if (cfg.kind === 'agSetColumnFilter' && cfg.setFilterOptions) {
    const s = cfg.setFilterOptions;
    if (s.suppressMiniFilter !== undefined) params.suppressMiniFilter = s.suppressMiniFilter;
    if (s.suppressSelectAll !== undefined) params.suppressSelectAll = s.suppressSelectAll;
    if (s.suppressSorting !== undefined) params.suppressSorting = s.suppressSorting;
    if (s.excelMode !== undefined) params.excelMode = s.excelMode;
    if (s.defaultToNothingSelected !== undefined) params.defaultToNothingSelected = s.defaultToNothingSelected;
  }

  const isMultiKind =
    cfg.kind === 'agMultiColumnFilter' ||
    cfg.kind === 'streamSafeMultiColumnFilter' ||
    cfg.kind === 'streamSafeMultiNumberColumnFilter' ||
    cfg.kind === 'streamSafeMultiDateColumnFilter';
  if (isMultiKind && cfg.multiFilters && cfg.multiFilters.length > 0) {
    params.filters = cfg.multiFilters.map((mf) => {
      const entry: Record<string, unknown> = { filter: mf.filter };
      if (mf.display) entry.display = mf.display;
      if (mf.title) entry.title = mf.title;
      // Lift the compound-text condition cap so the streamSafeText
      // fallback path (multi-filter without a set sub-filter) can emit
      // arbitrary token counts. Default is 2 → drops 3rd+ with warn #78.
      if (mf.filter === 'agTextColumnFilter' || mf.filter === 'agNumberColumnFilter') {
        entry.filterParams = {
          ...((entry.filterParams as Record<string, unknown> | undefined) ?? {}),
          maxNumConditions: 100,
        };
      }
      return entry;
    });
  }

  // Register streamSafeText at the COLUMN level only when the user
  // explicitly picked the synthetic 'streamSafeMultiColumnFilter' kind
  // in the column-settings dropdown. Column-level floatingFilterComponent
  // overrides the multi-filter's auto-rotation behaviour: by default
  // the multi-filter shows the floating filter of whichever sub-filter
  // has the active model — so when our code applies a set-filter values
  // list, the multi rotates to the set sub-filter's read-only floating
  // display ((N) val1,val2,...) and replaces our component. With
  // column-level wiring our floating filter stays put and we drive the
  // model through api.setColumnFilterModel regardless of which
  // sub-filter is "active". Plain agMultiColumnFilter keeps AG-Grid's
  // default behaviour — no opinion imposed.
  if (isStreamSafeMulti && cfg.floatingFilter !== false) {
    merged.floatingFilterComponent = (
      isStreamSafeMultiDate
        ? 'streamSafeDate'
        : isStreamSafeMultiNumber
          ? 'streamSafeNumber'
          : 'streamSafeText'
    ) as never;
  }

  if (Object.keys(params).length > 0) {
    merged.filterParams = {
      ...(merged.filterParams as Record<string, unknown> | undefined),
      ...params,
    };
  }
}

// ─── Row-grouping / aggregation / pivot ────────────────────────────────────

/**
 * Compose AG-Grid's row-grouping / aggregation / pivot ColDef fields from
 * our `RowGroupingConfig`. Mutates `merged` in place.
 *
 * Exported — consumed by calculated-columns so virtual columns carry the
 * same rowGrouping semantics.
 */
export function applyRowGroupingConfigToColDef(
  merged: ColDef,
  cfg: RowGroupingConfig,
  engine?: ExpressionEngineLike,
): void {
  if (cfg.enableRowGroup !== undefined) merged.enableRowGroup = cfg.enableRowGroup;
  if (cfg.enableValue !== undefined) merged.enableValue = cfg.enableValue;
  if (cfg.enablePivot !== undefined) merged.enablePivot = cfg.enablePivot;
  if (cfg.rowGroup !== undefined) merged.rowGroup = cfg.rowGroup;
  if (cfg.rowGroupIndex !== undefined) merged.rowGroupIndex = cfg.rowGroupIndex;
  if (cfg.pivot !== undefined) merged.pivot = cfg.pivot;
  if (cfg.pivotIndex !== undefined) merged.pivotIndex = cfg.pivotIndex;
  if (cfg.allowedAggFuncs !== undefined) merged.allowedAggFuncs = cfg.allowedAggFuncs;

  if (cfg.aggFunc === 'custom') {
    if (cfg.customAggExpression && cfg.customAggExpression.trim() && engine) {
      const fn = buildCustomAggFn(engine, cfg.customAggExpression);
      if (fn) merged.aggFunc = fn;
    }
    // Empty expression or no engine: leave aggFunc untouched so the grid
    // doesn't silently drop aggregation while the user is still typing.
  } else if (cfg.aggFunc !== undefined) {
    merged.aggFunc = cfg.aggFunc;
  }
}

/**
 * Compile a custom aggregation formula to an AG-Grid aggFn. Returns `null`
 * on parse failure — the column falls back to no aggregation (safer than
 * crashing the grid).
 */
function buildCustomAggFn(
  engine: ExpressionEngineLike,
  expression: string,
): ((params: IAggFuncParams) => unknown) | null {
  let compiled: unknown;
  try {
    compiled = engine.parse(expression);
  } catch (err) {
    console.warn('[column-customization] custom aggregation parse error:', expression, err);
    return null;
  }
  return (params: IAggFuncParams) => {
    const values = params.values ?? [];
    const allRows = values.map((v: unknown) => ({ value: v }));
    try {
      return engine.evaluate(compiled, {
        x: undefined,
        value: undefined,
        data: {},
        columns: {},
        allRows,
      });
    } catch (err) {
      console.warn('[column-customization] custom aggregation runtime error:', expression, err);
      return null;
    }
  };
}

/**
 * Build a function getter for `agSelectCellEditor` / `agRichSelectCellEditor`'s
 * `cellEditorParams.values` from a `{{providerName.key}}` source string.
 * Resolved at edit time via `AppDataLookup.get(name, key)` so AppData
 * mutations are reflected on the next editor open without re-emitting
 * colDefs.
 *
 * Coercion rules:
 *   - resolved value is an array → returned as-is (caller is trusted to
 *     have stored an array of strings/numbers in AppData)
 *   - resolved value is a string starting with `[` → attempt JSON.parse
 *     first (handles JSON-encoded array strings like
 *     `'["BUY","SELL"]'`); on success, returned as-is
 *   - resolved value is a string → split on `,` (plain CSV is the most
 *     common shape we've seen in AppData providers)
 *   - resolved value is null / undefined → empty array (editor still
 *     opens, just shows no options)
 *   - anything else → empty array (defensive — won't crash the editor)
 *
 * Returns a thunk so callers don't have to special-case the lookup-
 * absent case (function returns `[]`).
 */
function buildValuesGetter(
  source: string,
  appData: AppDataLookup | undefined,
): () => Array<string | number> {
  // Pre-parse the {{name.key}} token once so the per-edit invocation is
  // a synchronous map lookup. The token must match — anything else
  // returns a thunk that always yields [].
  const match = /^\s*\{\{\s*([^.{}]+?)\s*\.\s*([^{}]+?)\s*\}\}\s*$/.exec(source);
  if (!match || !appData) return () => [];
  const providerName = match[1];
  const key = match[2];
  return () => {
    const raw = appData.get(providerName, key);
    if (Array.isArray(raw)) return raw as Array<string | number>;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      // JSON-encoded array — try this first when the string looks like
      // one, so users storing `'["BUY","SELL"]'` don't get split on the
      // inner quotes by the CSV fallback below.
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed.filter(
              (v) => typeof v === 'string' || typeof v === 'number',
            ) as Array<string | number>;
          }
          // Parsed but not an array — fall through to CSV split (the
          // raw string is unusual but we can still try to make sense
          // of it).
        } catch {
          // Not valid JSON — fall through to CSV split.
        }
      }
      return trimmed
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '');
    }
    return [];
  };
}

// ─── Walker: merge assignments into ColDefs ────────────────────────────────

/**
 * Per-column memo of the last emitted ColDef. Keyed by the *source*
 * colDef reference + the inputs that materially affect the output, so
 * a re-run with identical inputs reuses the previous output reference.
 *
 * Why this matters: when the walker emits a fresh `{...colDef}` (or
 * fresh `filterParams`) on each transform pass — even when the result
 * is structurally equal — AG-Grid's `colDefChanged → filterParamsChanged`
 * pipeline fires and the SetFilterHandler re-runs `validateModel`
 * against the current applied filter. In AG-Grid 35.1 that path crashes
 * on a transient `model.values is not iterable` from internal multi-
 * filter state. Returning the same reference when nothing actually
 * changed sidesteps the whole re-validation.
 *
 * The cache lives outside the function so it persists across calls
 * within a grid; the input WeakMap keys ensure entries are GC'd when
 * the source colDef is dropped.
 */
const COL_DEF_MEMO: WeakMap<
  AnyColDef,
  { signature: string; output: AnyColDef }
> = new WeakMap();

export function applyAssignments(
  defs: AnyColDef[],
  state: ColumnCustomizationState,
  templatesState: ColumnTemplatesState,
  engine: ExpressionEngineLike,
  appData?: AppDataLookup,
): AnyColDef[] {
  const assignments = state.assignments;
  const globalNumberFormatter = state.globalCellNumberFormatter;
  const globalDateFormatter = state.globalCellDateFormatter;
  const hasGlobalCellStyle = state.globalCellStyle !== undefined;
  const hasGlobalHeaderStyle = state.globalHeaderStyle !== undefined;

  // Hoisted ONCE per pass: the templates state + global style flags are
  // identical for every column, and the old per-column signature
  // re-stringified the WHOLE templates state once per column per
  // transform pass (52× the same JSON on the reference blotter).
  const sharedSignature = JSON.stringify({
    t: templatesState,
    s: hasGlobalCellStyle,
    h: hasGlobalHeaderStyle,
  });

  return defs.map((def) => {
    if ('children' in def && Array.isArray(def.children)) {
      const next = applyAssignments(def.children, state, templatesState, engine, appData);
      const unchanged =
        next.length === def.children.length && next.every((c, i) => c === def.children[i]);
      return unchanged ? def : { ...def, children: next };
    }

    const colDef = def as ColDef;
    const colId = colDef.colId ?? colDef.field;
    if (!colId) return def;
    const a = assignments[colId];

    // Type-coherent global formatter dispatch:
    //   - Explicit `cellDataType === 'number'` → number slot only.
    //   - Explicit `cellDataType === 'date' | 'dateString'` → date slot
    //     only.
    //   - Explicit `'text' | 'string' | 'boolean'` → no global formatter
    //     (strings can't be coerced to numbers without producing empty
    //     output; booleans aren't formattable either way).
    //   - No explicit cellDataType → install a runtime dispatcher that
    //     inspects the value type at render time and picks the right
    //     formatter (number for numbers, date for Date instances and
    //     ISO-date strings, passthrough otherwise). This is what makes
    //     the global formatters apply to demo/data grids that haven't
    //     hand-set cellDataType on every column.
    //   Per-column `valueFormatterTemplate` still wins when set.
    const cdt = colDef.cellDataType;
    const isNumberCol = cdt === 'number';
    const isDateCol = cdt === 'date' || cdt === 'dateString';
    const isUntypedCol = cdt === undefined;
    const hasAnyGlobal =
      globalNumberFormatter !== undefined || globalDateFormatter !== undefined;

    const effectiveGlobalFormatter: ValueFormatterTemplate | undefined =
      a?.valueFormatterTemplate === undefined
        ? isNumberCol
          ? globalNumberFormatter
          : isDateCol
            ? globalDateFormatter
            : undefined
        : undefined;

    const effectiveGlobalRuntimeFmt: ((p: { value: unknown }) => string) | undefined =
      a?.valueFormatterTemplate === undefined && isUntypedCol && hasAnyGlobal
        ? buildSafeGlobalFormatter(globalNumberFormatter, globalDateFormatter)
        : undefined;

    // Fast-path: no per-column assignment AND no global signal that
    // changes THIS column's ColDef → return the original reference.
    //
    // Global styles (`globalCellStyle` / `globalHeaderStyle`) apply via
    // CSS (broad selectors emitted by `reinjectCSS` above), NOT via
    // per-column colDef mutation, so they don't need to flow through
    // the walker for every column. Emitting fresh colDef objects when
    // nothing actually changes triggers AG-Grid's `colDefChanged` →
    // `filterParamsChanged` path on every transform pass and can blow
    // up existing set-filter models that AG-Grid re-validates.
    if (
      !a &&
      effectiveGlobalFormatter === undefined &&
      effectiveGlobalRuntimeFmt === undefined
    ) {
      return def;
    }
    // Per-column memo — recompute only when the inputs that affect the
    // emitted colDef change. Signature = the pass-level shared part
    // (templates state + global style flags, stringified once above)
    // plus this column's slice (assignment, effective global formatter,
    // cellDataType). JSON-stringify is fine because the inputs are
    // plain JSON.
    const signature = `${sharedSignature}|${JSON.stringify({
      a,
      g: effectiveGlobalFormatter,
      c: colDef.cellDataType,
    })}`;
    const cached = COL_DEF_MEMO.get(colDef);
    if (cached && cached.signature === signature) {
      return cached.output;
    }

    const sourceAssignment: ColumnAssignment = a ?? { colId };
    const output = applyAssignmentToColDef(
      colDef,
      sourceAssignment,
      templatesState,
      engine,
      appData,
      effectiveGlobalFormatter,
      effectiveGlobalRuntimeFmt,
      hasGlobalCellStyle,
      hasGlobalHeaderStyle,
    );
    COL_DEF_MEMO.set(colDef, { signature, output });
    return output;
  });
}

/**
 * Per-column walker body. Pulled out so global-only paths (no per-column
 * assignment but a global signal applies) can run the same merge logic
 * with a synthetic `{ colId }` assignment.
 */
function applyAssignmentToColDef(
  colDef: ColDef,
  a: ColumnAssignment,
  templatesState: ColumnTemplatesState,
  engine: ExpressionEngineLike,
  appData?: AppDataLookup,
  globalFormatter?: import('./state').ValueFormatterTemplate,
  globalRuntimeFormatter?: (p: { value: unknown }) => string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _hasGlobalCellStyle?: boolean,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _hasGlobalHeaderStyle?: boolean,
): ColDef {
    const colId = a.colId;

    const resolved = resolveTemplates(
      a,
      templatesState,
      cellDataTypeToDomain(colDef.cellDataType),
    );

    const merged: ColDef = { ...colDef };

    // Structural overrides (non-styling — kept on the ColDef).
    if (resolved.headerName !== undefined) merged.headerName = resolved.headerName;
    if (resolved.headerTooltip !== undefined) merged.headerTooltip = resolved.headerTooltip;
    if (resolved.initialWidth !== undefined) merged.initialWidth = resolved.initialWidth;
    if (resolved.initialHide !== undefined) merged.initialHide = resolved.initialHide;
    if (resolved.initialPinned !== undefined) merged.initialPinned = resolved.initialPinned;
    if (resolved.sortable !== undefined) merged.sortable = resolved.sortable;
    if (resolved.filterable !== undefined) merged.filter = resolved.filterable;
    if (resolved.resizable !== undefined) merged.resizable = resolved.resizable;
    if (resolved.editable !== undefined) merged.editable = resolved.editable;

    // Rich filter config — takes precedence over `filterable`.
    if (resolved.filter !== undefined) {
      applyFilterConfigToColDef(merged, resolved.filter as ColumnFilterConfig);
    }

    // Row-grouping / aggregation / pivot.
    if (resolved.rowGrouping !== undefined) {
      applyRowGroupingConfigToColDef(merged, resolved.rowGrouping as RowGroupingConfig, engine);
    }

    // Value formatter — per-column takes precedence; falls back to the
    // already-resolved global formatter (number or date, picked by the
    // caller based on this column's `cellDataType`). If the column is
    // untyped, the caller supplies a runtime dispatcher that picks
    // number vs. date by inspecting the value at render time.
    const effectiveFormatter =
      resolved.valueFormatterTemplate ?? globalFormatter;
    if (effectiveFormatter !== undefined) {
      merged.valueFormatter = valueFormatterFromTemplate(effectiveFormatter);

      // Excel color tags — `[Red]`, `[Green]` etc. in the format string —
      // only affect text semantics in SSF. Emit a `cellStyle` fn that
      // paints the computed color for the matched section.
      //
      // IMPORTANT: we always assign `merged.cellStyle` whenever a
      // formatter is active, even when the new format has no color
      // tags. Returning `null` from a cellStyle fn tells AG-Grid "don't
      // override" — it does NOT clear the inline `color` property that
      // a previous formatter's cellStyle put on the cell. So when the
      // user switches from a `[Red]`-colored format to a plain one, the
      // red color would stick until a full reload. Emitting
      // `{ color: '' }` explicitly resets `cell.style.color` so AG-Grid
      // clears the inline color. Does NOT interfere with class-based
      // colors from `colors.text` overrides — those come from the
      // injected `.ds-col-c-{colId}` rule, which an empty inline color
      // cascades through.
      const colorResolver =
        effectiveFormatter.kind === 'excelFormat'
          ? excelFormatColorResolver(effectiveFormatter.format)
          : undefined;
      if (colorResolver) {
        merged.cellStyle = (params) => {
          const color = colorResolver(params.value);
          return color ? { color } : { color: '' };
        };
      } else if (colDef.cellStyle === undefined) {
        // No color resolver AND the user's source colDef has no
        // cellStyle of its own — safe to plant our "clear" fn. If the
        // user DID set a cellStyle, we leave it alone (their handler
        // should own color lifecycle).
        merged.cellStyle = () => ({ color: '' });
      }
    } else if (globalRuntimeFormatter !== undefined) {
      // No template-based formatter applies, but a global value-type
      // dispatcher was supplied for this untyped column. Plant it as
      // the valueFormatter — it'll pick number vs. date per cell at
      // render time, falling back to passthrough for unrecognised
      // value types.
      merged.valueFormatter = globalRuntimeFormatter as ColDef['valueFormatter'];
    }

    if (resolved.cellEditorName !== undefined) merged.cellEditor = resolved.cellEditorName;
    if (resolved.cellEditorParams !== undefined) merged.cellEditorParams = resolved.cellEditorParams;
    if (resolved.cellRendererName !== undefined) merged.cellRenderer = resolved.cellRendererName;

    // Registry-driven renderer (precedence: cellRendererId > cellRendererName).
    // `cellRendererConfig` is a `{ kind, config }` envelope so it self-discriminates
    // — we forward `.config` verbatim as `cellRendererParams`. The MarketsGrid
    // surface spreads `cellRendererComponents` into AgGridReact's `components`
    // map so AG Grid can resolve the id string to the class at render time.
    if (resolved.cellRendererId !== undefined) {
      merged.cellRenderer = resolved.cellRendererId;
      const envelope = resolved.cellRendererConfig as
        | { kind?: string; config?: unknown }
        | undefined;
      if (envelope && envelope.config !== undefined) {
        merged.cellRendererParams = envelope.config as Record<string, unknown>;
      }
    }

    // Structured cell-editor config — read from the resolved chain
    // (template + assignment folded together) so a `cellEditor`
    // carried by a column template propagates to every column that
    // applies that template. Resolver precedence already gives
    // assignment-direct values priority over template values, so a
    // column that explicitly authors its own editor still wins.
    // For select-style editors with a `valuesSource` ({{name.key}}),
    // plant a function getter on `cellEditorParams.values` that
    // resolves through the platform's AppData lookup at edit time.
    // resolveTemplates returns the base assignment shape; the narrowed
    // `cellEditor` field rides through unchanged so we cast at the
    // boundary rather than threading the narrow type through the
    // resolver signature.
    const cellEditor = (resolved as ColumnAssignment).cellEditor;
    if (cellEditor && cellEditor.kind) {
      merged.cellEditor = cellEditor.kind;
      const ep: Record<string, unknown> = {
        ...((merged.cellEditorParams as Record<string, unknown> | undefined) ?? {}),
        ...(cellEditor.params ?? {}),
      };
      const isSelectKind =
        cellEditor.kind === 'agSelectCellEditor' ||
        cellEditor.kind === 'agRichSelectCellEditor';
      if (isSelectKind) {
        if (cellEditor.valuesSource && cellEditor.valuesSource.trim()) {
          // agSelectCellEditor's `initialiseEditor` calls
          // `values.forEach(...)` synchronously and crashes on a
          // function getter — only agRichSelectCellEditor accepts the
          // function/promise form. So for agSelectCellEditor, resolve
          // the binding eagerly to an array; AppData mutations will
          // propagate the next time colDefs re-emit (good enough for
          // the simple-select editor's static-list semantics).
          if (cellEditor.kind === 'agSelectCellEditor') {
            const getter = buildValuesGetter(cellEditor.valuesSource, appData);
            ep.values = getter();
          } else {
            ep.values = buildValuesGetter(cellEditor.valuesSource, appData);
          }
        } else if (Array.isArray(cellEditor.values)) {
          ep.values = cellEditor.values;
        }
      }
      merged.cellEditorParams = ep;
    }

    // Styling via CSS class injection (NOT cellStyle/headerStyle — we save
    // those for color-resolver above, which is a per-row compute). The
    // class string written to the DOM is encoded with the SAME helper
    // `reinjectCSS` uses to build its selectors, so dotted/bracketed
    // colIds work correctly.
    const safeId = cssEscapeColId(colId);
    if (resolved?.cellStyleOverrides !== undefined) {
      const cls = `ds-col-c-${safeId}`;
      const existing = colDef.cellClass;
      merged.cellClass = Array.isArray(existing)
        ? [...existing, cls]
        : typeof existing === 'string'
          ? [existing, cls]
          : cls;
    }

    // Header class: emit whenever we'll inject a header rule — either the
    // header has overrides in EITHER theme slot, OR the cell has alignment
    // in EITHER theme slot (which the header inherits by default). Without
    // this the header-align rule has no target on the DOM. Emit eagerly
    // (covering both themes) so a `data-theme` flip doesn't require
    // re-emitting the colDef just to attach the class.
    const cellAlignmentAny =
      resolved?.cellStyleOverrides?.dark?.alignment?.horizontal !== undefined ||
      resolved?.cellStyleOverrides?.light?.alignment?.horizontal !== undefined;
    const needsHeaderClass =
      resolved?.headerStyleOverrides !== undefined || cellAlignmentAny;
    if (needsHeaderClass) {
      const cls = `ds-hdr-c-${safeId}`;
      const existing = colDef.headerClass;
      merged.headerClass = Array.isArray(existing)
        ? [...existing, cls]
        : typeof existing === 'string'
          ? [existing, cls]
          : cls;
    }

    return merged;
}
