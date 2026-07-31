import { memo } from 'react';
import { Band, Caps } from '../../../ui/SettingsPanel';
import {
  FormatterPicker,
  inferPickerDataType,
  type FormatterPickerDataType,
} from '../../../ui/FormatterPicker';
import type { ConditionalRule } from '../state';

export const ValueFormatterBand = memo(function ValueFormatterBand({
  ruleId,
  scope,
  valueFormatter,
  cellDataTypeForColumn,
  setDraft,
}: {
  ruleId: string;
  scope: ConditionalRule['scope'];
  valueFormatter: ConditionalRule['valueFormatter'];
  cellDataTypeForColumn: (colId: string) => string | undefined;
  setDraft: (patch: Partial<ConditionalRule>) => void;
}) {
  if (scope.type !== 'cell') return null;
  if (scope.columns.length === 1) {
    return (
      <Band index="09" title="VALUE FORMATTER">
        <FormatterPicker
          compact
          dataType={
            inferPickerDataType(cellDataTypeForColumn(scope.columns[0])) as FormatterPickerDataType
          }
          value={valueFormatter}
          onChange={(next) => setDraft({ valueFormatter: next })}
          data-testid={`cs-rule-value-formatter-${ruleId}`}
        />
        <div style={{ marginTop: 8 }}>
          <Caps size="2xs" color="var(--ds-text-faint)">
            Applied to cells where this rule matches — overrides the column's own formatter.
          </Caps>
        </div>
      </Band>
    );
  }
  return (
    <Band index="09" title="VALUE FORMATTER">
      <Caps size="xs" color="var(--ds-text-muted)">
        Select exactly ONE target column above to set a per-rule value formatter.
      </Caps>
    </Band>
  );
});
