import { Band } from '../../../ui/SettingsPanel';
import { StyleEditor, type StyleEditorValue } from '../../../ui/StyleEditor';

export function CellStyleBand({
  colId,
  value,
  onChange,
}: {
  colId: string;
  value: StyleEditorValue;
  onChange: (patch: Partial<StyleEditorValue>) => void;
}) {
  return (
    <Band index="04" title="CELL STYLE">
      <StyleEditor
        value={value}
        onChange={onChange}
        sections={['text', 'color', 'border']}
        data-testid={`cols-${colId}-cell-style`}
      />
    </Band>
  );
}
