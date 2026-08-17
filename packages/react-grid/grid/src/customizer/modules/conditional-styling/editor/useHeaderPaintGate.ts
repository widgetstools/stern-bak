/**
 * Whether this grid can light a COLUMN HEADER from a conditional-styling rule.
 *
 * The header painter answers "does any row match this rule" with
 * `api.forEachNodeAfterFilter`, which AG-Grid implements as
 * `_getClientSideRowModel(beans)?.forEachNodeAfterFilter(callback)` — under
 * the server-side row model that optional chain short-circuits, the callback
 * never runs, and the painter concludes "no row matches" for every rule. Not
 * an error, not a warning: the HEADERS and BOTH targets simply never lit, and
 * the user was left toggling a control that had never once done anything.
 *
 * `canAddressUnloadedRows` is the question underneath — "is the set of rows
 * this grid holds the same set as the dataset" — and it is the same reading
 * the alerts module already takes for its row-membership diff. A header lit
 * from the loaded block window would be worse than one that stays dark: it
 * would switch on and off as the user scrolled, describing the viewport while
 * looking like it described the data.
 *
 * CELLS is unaffected and stays available: `cellClassRules` evaluate per row
 * against the row in hand, which is correct under either row model.
 */
import { useCapabilityGate } from '../../../hooks/useCapability';

export interface HeaderPaintGate {
  readonly disabled: boolean;
  readonly reason: string;
}

export function useHeaderPaintGate(): HeaderPaintGate {
  return useCapabilityGate('canAddressUnloadedRows', {
    reason:
      'Header highlighting needs to check every row in the dataset, and this '
      + 'grid loads rows from the server as you scroll. Cell highlighting works '
      + 'as usual — use CELLS instead.',
  });
}

/** True for the two targets that paint a header. */
export function paintsHeaders(target: string): boolean {
  return target === 'headers' || target === 'cells+headers';
}
