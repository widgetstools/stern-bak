import { memo } from 'react';
import { ChromeButton } from '../../../ui/ChromeButton';
import { Select } from '../../../ui/NativeOptionsSelect';
import { useGridColumns } from '../../../hooks/useGridColumns';

/**
 * Chip picker for the cell-scope rule's target columns. Renders amber
 * "NO COLUMNS" warning when empty so the user can't ship a cell-scope
 * rule that wouldn't apply to anything.
 */
export const ColumnPickerMulti = memo(function ColumnPickerMulti({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const cols = useGridColumns();
  const remaining = cols.filter((c) => !value.includes(c.colId));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minHeight: 24 }}>
        {value.length === 0 ? (
          <span
            role="alert"
            data-testid="cs-no-columns-warning"
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ds-accent-warning)',
              background: 'var(--ds-overlay-warning-soft)',
              border: '1px solid var(--ds-accent-warning)',
              borderRadius: 2,
              padding: '4px 8px',
              fontFamily: 'var(--ds-font-sans)',
            }}
          >
            NO COLUMNS · RULE WON'T APPLY
          </span>
        ) : (
          value.map((colId) => {
            const col = cols.find((c) => c.colId === colId);
            return (
              <span
                key={colId}
                data-v2-chip=""
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 6px',
                  borderRadius: 2,
                  background: 'var(--ds-surface-secondary)',
                  border: '1px solid var(--ds-border-primary)',
                  fontFamily: 'var(--ds-font-mono)',
                  fontSize: 11,
                  color: 'var(--ds-text-primary)',
                }}
              >
                {col?.headerName ?? colId}
                <ChromeButton
                  type="button"
                  onClick={() => onChange(value.filter((v) => v !== colId))}
                  title="Remove"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--ds-text-muted)',
                    padding: 0,
                    lineHeight: 1,
                    fontSize: 12,
                  }}
                >
                  ×
                </ChromeButton>
              </span>
            );
          })
        )}
      </div>
      {remaining.length > 0 && (
        <Select
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v) onChange([...value, v]);
          }}
        >
          <option value="">ADD COLUMN…</option>
          {remaining.map((c) => (
            <option key={c.colId} value={c.colId}>
              {c.headerName}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
});
