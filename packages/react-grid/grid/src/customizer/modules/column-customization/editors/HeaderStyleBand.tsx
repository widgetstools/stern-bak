import { Band, Caps } from '../../../ui/SettingsPanel';
import { StyleEditor, type StyleEditorValue } from '../../../ui/StyleEditor';

export function HeaderStyleBand({
  colId,
  value,
  onChange,
}: {
  colId: string;
  value: StyleEditorValue;
  onChange: (patch: Partial<StyleEditorValue>) => void;
}) {
  return (
    <Band index="05" title="HEADER STYLE">
      <Caps size="xs" color="var(--ds-text-faint)" style={{ marginBottom: 6, display: 'block' }}>
        Blank alignment = follow the cell. Explicit value overrides.
      </Caps>
      <StyleEditor
        value={value}
        onChange={onChange}
        sections={['text', 'color', 'border']}
        data-testid={`cols-${colId}-header-style`}
      />
    </Band>
  );
}
