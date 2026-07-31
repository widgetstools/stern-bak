import { memo } from 'react';
import { Band } from '../../../ui/SettingsPanel';
import { ColumnPickerMulti } from './ColumnPickerMulti';

export const TargetColumnsBand = memo(function TargetColumnsBand({
  columns,
  onColumnsChange,
}: {
  columns: string[];
  onColumnsChange: (cols: string[]) => void;
}) {
  return (
    <Band index="02" title="TARGET COLUMNS">
      <ColumnPickerMulti value={columns} onChange={onColumnsChange} />
    </Band>
  );
});
