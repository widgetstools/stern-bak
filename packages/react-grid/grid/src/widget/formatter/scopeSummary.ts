/**
 * Plain-language summary of what the formatter toolbar is currently editing.
 *
 * The scope/target toggles are icon-only; this turns the live `(target, scope,
 * selection)` state into words so the user always knows what an edit will
 * affect — and supplies the empty-state invitation when nothing is selected.
 * Pure + framework-free so it can be unit-tested and reused by both toolbar
 * orientations.
 */

export interface ScopeSummaryInput {
  scope: 'selected' | 'all';
  target: 'cell' | 'header';
  /** Currently-targeted column ids. Empty when nothing is focused. */
  colIds: string[];
  /** Display label of the single targeted column (when exactly one). */
  colLabel: string;
}

export interface ScopeSummary {
  /** Selected scope with no column focused — show the invitation, not a target. */
  empty: boolean;
  /** 'Cells' | 'Headers'. */
  targetLabel: string;
  /** 'all columns' | 'N columns' | the single column's name. */
  scopeLabel: string;
  /** One-line sentence for the visible readout, tooltips, and aria. */
  full: string;
}

/** Invitation shown when there's nothing to format yet. */
export const EMPTY_SCOPE_MESSAGE = 'Select a column to format';

export function scopeSummary({ scope, target, colIds, colLabel }: ScopeSummaryInput): ScopeSummary {
  const targetLabel = target === 'header' ? 'Headers' : 'Cells';

  // 'all' scope always applies (it's the global baseline), so it's never empty.
  if (scope === 'selected' && colIds.length === 0) {
    return { empty: true, targetLabel, scopeLabel: 'no columns', full: EMPTY_SCOPE_MESSAGE };
  }

  const scopeLabel =
    scope === 'all'
      ? 'all columns'
      : colIds.length === 1
        ? colLabel
        : `${colIds.length} columns`;

  return { empty: false, targetLabel, scopeLabel, full: `${targetLabel} · ${scopeLabel}` };
}
