import { spacing } from '@wellsfargo-starui/design-system/tokens';
import { Band, SubLabel } from '../../SettingsPanel';
import { CompactColorField } from '../../ColorPicker';
import type { StyleEditorValue } from '../types';

/**
 * COLOUR band — TEXT + FILL fields rendered side-by-side in a 2-column
 * grid at popout width, so the editor stays dense. Each field is a
 * CompactColorField with swatch + hex + alpha + clear.
 */

export interface ColorSectionProps {
  value: StyleEditorValue;
  onChange: (patch: Partial<StyleEditorValue>) => void;
  inlineBody?: boolean;
  index?: string;
}

export function ColorSection({ value, onChange, inlineBody, index = '03' }: ColorSectionProps) {
  const body = (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing[2.5] }}>
      <div>
        <SubLabel>Text</SubLabel>
        <CompactColorField
          value={value.color}
          alpha={100}
          onChange={(next) => onChange({ color: next })}
          onClear={() => onChange({ color: undefined })}
          placeholder="DEFAULT"
          data-testid="style-editor-text-color"
        />
      </div>
      <div>
        <SubLabel>Fill</SubLabel>
        <CompactColorField
          value={value.backgroundColor}
          alpha={value.backgroundAlpha ?? 100}
          onChange={(next, alpha) => onChange({ backgroundColor: next, backgroundAlpha: alpha })}
          onClear={() => onChange({ backgroundColor: undefined, backgroundAlpha: undefined })}
          placeholder="NONE"
          data-testid="style-editor-bg-color"
        />
      </div>
    </div>
  );

  if (inlineBody) return body;
  return (
    <Band index={index} title="COLOUR">
      {body}
    </Band>
  );
}
