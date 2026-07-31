import { Band } from '../../SettingsPanel';
import { BorderStyleEditor } from '../BorderStyleEditor';
import type { StyleEditorValue } from '../types';

/**
 * BORDER band — thin wrapper around the shared `<BorderStyleEditor />`.
 *
 * All visual + interaction logic lives in `BorderStyleEditor`, which is
 * also mounted inside the FormattingToolbar's border popover. Keeping
 * this band shell here solely so the Styling Rules editor's numbered
 * band headers (`04 BORDER ────`) render the same way as the other
 * sections.
 */

export interface BorderSectionProps {
  value: StyleEditorValue;
  onChange: (patch: Partial<StyleEditorValue>) => void;
  inlineBody?: boolean;
  index?: string;
}

export function BorderSection({ value, onChange, inlineBody, index = '04' }: BorderSectionProps) {
  const body = (
    <BorderStyleEditor
      value={value.borders ?? {}}
      onChange={(next) => {
        const anyPresent = Object.values(next).some((v) => v !== undefined);
        onChange({ borders: anyPresent ? next : undefined });
      }}
    />
  );

  if (inlineBody) return body;
  return (
    <Band index={index} title="BORDER">
      {body}
    </Band>
  );
}
