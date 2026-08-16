import type {
  CellClassParams,
  CellStyle,
  EditableCallbackParams,
  RowClassParams,
} from 'ag-grid-community';
import type { EnrichedRow } from '@wellsfargo-starui/data/runtime';

/** AG Grid `getChildCount` — reads `__ssrmChildCount` from group rows. */
export function ssrmGetChildCount(data: EnrichedRow | undefined): number {
  const n = data?.__ssrmChildCount;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/** AG Grid `cellStyle` — applies worker `__ssrmStyle` enrichment. */
export function ssrmCellStyle(
  params: CellClassParams,
): CellStyle | null | undefined {
  const style = (params.data as EnrichedRow | undefined)?.__ssrmStyle;
  return (style as CellStyle | undefined) ?? null;
}

/** AG Grid `getRowClass` — `alert-row` when `__ssrmAlert` is truthy. */
export function ssrmAlertRowClass(
  params: RowClassParams,
): string | string[] | undefined {
  const alert = (params.data as EnrichedRow | undefined)?.__ssrmAlert;
  return alert ? 'alert-row' : undefined;
}

/**
 * AG Grid `editable` callback for a field gated by `__ssrmEditable`.
 *
 * An `editable` expression rule GATES editing; it does not grant it. So the
 * absence of an opinion is `true`, not `false` — the column's own `editable`
 * still decides, and {@link withSsrmExpressionBindings} ANDs the two. The
 * previous shape returned `false` whenever the row carried no verdict, which
 * is every row of every grid that has never pushed an `editable` rule: wiring
 * it would have made the whole grid read-only. That is why it had no caller.
 *
 * A row with no data at all is a loading stub — nothing to edit there yet.
 */
export function ssrmEditable(
  field: string,
): (params: EditableCallbackParams) => boolean {
  return (params) => {
    const data = params.data as EnrichedRow | undefined;
    if (!data) return false;
    const ed = data.__ssrmEditable;
    if (typeof ed === 'boolean') return ed;
    if (ed && typeof ed === 'object') {
      const own = ed[field];
      return typeof own === 'boolean' ? own : true;
    }
    return true;
  };
}

// ─── Column-def wiring ──────────────────────────────────────────────────────

export interface SsrmBindableColDef {
  colId?: string;
  field?: string;
  cellStyle?: unknown;
  editable?: unknown;
  children?: SsrmBindableColDef[];
  [key: string]: unknown;
}

/**
 * Wrap one column def's `cellStyle` / `editable` so the worker's per-CELL
 * enrichment reaches them.
 *
 * `getChildCount` and `getRowClass` are grid options and the surface binds
 * them directly; `cellStyle` and `editable` are per-COLUMN, so this is the
 * only place they can be reached. Both wrappers COMPOSE rather than replace,
 * which is the whole difficulty of wiring them:
 *
 *  - `cellStyle` — the column's own style is computed first and the worker's
 *    properties merged over it, so a calculated column's Excel colour tag and
 *    column-customization's overrides survive. Replacing would have made
 *    wiring this a regression rather than a fix.
 *  - `editable` — ANDed with the column's own verdict. A rule can lock a cell
 *    the column allows; it can never unlock one the column forbids.
 *
 * `alwaysWrap` is what makes the pair correct against AG Grid's own merge
 * order. A property declared on a column def SHADOWS `defaultColDef`
 * entirely, so wrapping every column unconditionally would replace a
 * `defaultColDef.editable: true` with a wrapper whose base is `undefined` —
 * i.e. would silently make every grid whose editability comes from the
 * defaults read-only. So: columns are wrapped only where they DECLARE the
 * property, and `defaultColDef` is wrapped always, which between them covers
 * both branches of the merge and neither shadows the other.
 */
function bindDef<T extends SsrmBindableColDef>(def: T, alwaysWrap: boolean): T {
  const field = def.field ?? def.colId;
  const out = { ...def } as SsrmBindableColDef;

  if (alwaysWrap || 'cellStyle' in def) {
    const base = def.cellStyle;
    out.cellStyle = (params: CellClassParams) => {
      const own = typeof base === 'function'
        ? (base as (p: CellClassParams) => CellStyle | null | undefined)(params)
        : (base as CellStyle | undefined);
      const enriched = ssrmCellStyle(params);
      if (!enriched) return own ?? null;
      return { ...(own ?? {}), ...enriched };
    };
  }

  if (field && (alwaysWrap || 'editable' in def)) {
    const base = def.editable;
    const gate = ssrmEditable(field);
    out.editable = (params: EditableCallbackParams) => {
      const own = typeof base === 'function'
        ? Boolean((base as (p: EditableCallbackParams) => unknown)(params))
        : Boolean(base);
      return own && gate(params);
    };
  }

  return out as T;
}

/** Bind the worker's cell enrichment across a column-def tree. Leaves keep
 *  whatever they do not declare, so `defaultColDef` still decides it — see
 *  {@link withSsrmDefaultColDef}, which the surface applies alongside. */
export function withSsrmExpressionBindings<T extends SsrmBindableColDef>(
  defs: readonly T[],
): T[] {
  const decorate = (def: SsrmBindableColDef): SsrmBindableColDef =>
    Array.isArray(def.children)
      ? { ...def, children: def.children.map(decorate) }
      : bindDef(def, false);
  return defs.map((d) => decorate(d) as T);
}

/**
 * Bind the worker's cell enrichment on the grid's `defaultColDef` — the
 * branch AG Grid takes for every column that declares neither property, which
 * on this repo's grids is most of them (`general-settings` writes editability
 * to `defaultColDef.editable`, never per column).
 *
 * `defaultColDef` has no `field`, so the editable gate is keyed per cell from
 * the column AG Grid is asking about.
 */
export function withSsrmDefaultColDef(
  defaultColDef: SsrmBindableColDef | undefined,
): SsrmBindableColDef {
  const base = defaultColDef?.editable;
  const out = bindDef({ ...(defaultColDef ?? {}) }, true);
  out.editable = (params: EditableCallbackParams) => {
    const own = typeof base === 'function'
      ? Boolean((base as (p: EditableCallbackParams) => unknown)(params))
      : Boolean(base);
    const colId = params.column?.getColId?.();
    return own && (colId ? ssrmEditable(colId)(params) : true);
  };
  return out;
}
