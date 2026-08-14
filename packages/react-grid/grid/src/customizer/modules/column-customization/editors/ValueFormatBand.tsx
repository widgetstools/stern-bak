import { Band } from '../../../ui/SettingsPanel';
import {
  FormatterPicker,
  inferPickerDataType,
  type FormatterPickerDataType,
} from '../../../ui/FormatterPicker';
import type { ValueFormatterTemplate } from '@wellsfargo-starui/core';

export function ValueFormatBand({
  colId,
  cellDataType,
  value,
  onChange,
}: {
  colId: string;
  cellDataType: string | undefined;
  value: ValueFormatterTemplate | undefined;
  onChange: (next: ValueFormatterTemplate | undefined) => void;
}) {
  return (
    <Band index="06" title="VALUE FORMAT">
      <FormatterPicker
        compact
        dataType={inferPickerDataType(cellDataType) as FormatterPickerDataType}
        value={value}
        onChange={(next) => onChange(next as ValueFormatterTemplate | undefined)}
        data-testid={`cols-${colId}-fmt`}
      />
    </Band>
  );
}
