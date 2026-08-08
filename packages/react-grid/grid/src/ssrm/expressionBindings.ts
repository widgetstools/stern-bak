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
 */
export function ssrmEditable(
  field: string,
): (params: EditableCallbackParams) => boolean {
  return (params) => {
    const data = params.data as EnrichedRow | undefined;
    if (!data) return false;
    const ed = data.__ssrmEditable;
    if (typeof ed === 'boolean') return ed;
    if (ed && typeof ed === 'object') return Boolean(ed[field]);
    return false;
  };
}
