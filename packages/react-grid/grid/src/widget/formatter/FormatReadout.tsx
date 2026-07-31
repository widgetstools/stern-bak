/**
 * Format readout — the toolbar's plain-language status line.
 *
 * Answers the question the icon-only scope/target toggles can't on their own:
 * "what will my edit affect?" (target + scope, in words). When nothing is
 * selected it becomes the empty-state invitation. Lives in `ModuleContext`, so
 * it renders in both the horizontal toolbar and the popped-out vertical panel.
 */
import { EMPTY_SCOPE_MESSAGE, scopeSummary } from './scopeSummary';
import type { FormatterState } from './state';

export function FormatReadout({ state }: { state: FormatterState }) {
  const summary = scopeSummary({
    scope: state.scope,
    target: state.target,
    colIds: state.colIds,
    colLabel: state.colLabel,
  });

  return (
    <div
      className="fx-readout"
      data-testid="formatting-readout"
      data-empty={summary.empty || undefined}
      title={summary.full}
    >
      {summary.empty ? (
        <span
          style={{
            fontSize: 11,
            color: 'var(--ds-text-faint)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {EMPTY_SCOPE_MESSAGE}
        </span>
      ) : (
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--ds-text-muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}
        >
          {summary.targetLabel}
          <span style={{ color: 'var(--ds-text-faint)' }}> · {summary.scopeLabel}</span>
        </span>
      )}
    </div>
  );
}
