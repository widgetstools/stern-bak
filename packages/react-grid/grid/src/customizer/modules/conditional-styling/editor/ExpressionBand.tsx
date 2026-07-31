import { memo } from 'react';
import { ExpressionEditor } from '../../../ui/ExpressionEditor';
import { Band } from '../../../ui/SettingsPanel';

export const ExpressionBand = memo(function ExpressionBand({
  ruleId,
  expression,
  validation,
  columnsProvider,
  onExpressionChange,
  expressionTestId,
}: {
  ruleId: string;
  expression: string;
  validation: { valid: boolean; errors: ReadonlyArray<{ message: string }> };
  columnsProvider: () => Array<{ colId: string; headerName: string }>;
  onExpressionChange: (next: string) => void;
  /** Override Monaco editor test id (default `cs-rule-expression-{ruleId}`). */
  expressionTestId?: string;
}) {
  return (
    <Band index="01" title="EXPRESSION">
      <div
        style={{
          border: `1px solid var(${!validation.valid ? '--ds-accent-negative' : '--ds-border-primary'})`,
          borderRadius: 2,
          background: 'var(--ds-surface-ground)',
          overflow: 'hidden',
        }}
      >
        <ExpressionEditor
          value={expression}
          onChange={onExpressionChange}
          onCommit={onExpressionChange}
          multiline
          lines={3}
          fontSize={12}
          placeholder="[price] > 110"
          columnsProvider={columnsProvider}
          data-testid={expressionTestId ?? `cs-rule-expression-${ruleId}`}
        />
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 10,
          color: 'var(--ds-text-faint)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        TYPE{' '}
        <code className="font-mono normal-case text-[color:var(--ds-text-secondary)]">
          [
        </code>{' '}
        FOR COLUMNS ·{' '}
        <code className="font-mono normal-case text-[color:var(--ds-text-secondary)]">
          ⌘↵
        </code>{' '}
        TO SAVE · USE{' '}
        <code className="font-mono normal-case text-[color:var(--ds-text-secondary)]">
          data.field
        </code>{' '}
        FOR RAW
      </div>
      {!validation.valid && validation.errors[0]?.message && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: 'var(--ds-accent-negative)',
            background: 'var(--ds-overlay-negative-soft)',
            border: '1px solid var(--ds-accent-negative)',
            borderRadius: 2,
            padding: '6px 8px',
            fontFamily: 'var(--ds-font-mono)',
          }}
        >
          {validation.errors[0].message}
        </div>
      )}
    </Band>
  );
});
