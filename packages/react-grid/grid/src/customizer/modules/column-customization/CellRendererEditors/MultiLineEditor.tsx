/**
 * MultiLineEditor — authoring UI for `MultiLineRendererConfig`.
 */
import { Input, Slider } from '@wellsfargo-starui/ui';
import type { MultiLineRendererConfig } from '@wellsfargo-starui/design-system';
import { Row } from '../editors/Row';
import { ThemeAwareColorRow } from './themeColorRow';

const DEFAULT_MULTILINE: MultiLineRendererConfig = {
  secondaryField: '',
  secondarySize: 10,
};

export function MultiLineEditor({
  value,
  onChange,
  testId,
}: {
  value: MultiLineRendererConfig | undefined;
  onChange: (next: MultiLineRendererConfig) => void;
  testId?: string;
}) {
  const cfg = value ?? DEFAULT_MULTILINE;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row
        label="SECONDARY FIELD"
        hint="Field on the row that supplies the second-line text"
        control={
          <Input
            value={cfg.secondaryField}
            onChange={(e) => onChange({ ...cfg, secondaryField: e.target.value })}
            placeholder="e.g. ticker"
            style={{ height: 28, maxWidth: 220 }}
            data-testid={testId ? `${testId}-secondary-field` : undefined}
          />
        }
      />
      <Row label="SECONDARY COLOUR" hint="Optional" control={<ThemeAwareColorRow value={cfg.secondaryColor} onChange={(v) => onChange({ ...cfg, secondaryColor: v })} testIdPrefix={testId ? `${testId}-secondary-color` : undefined} />} />
      <Row
        label="SECONDARY SIZE"
        hint={`${cfg.secondarySize ?? 10}px`}
        control={
          <Slider
            min={8}
            max={16}
            step={1}
            value={[cfg.secondarySize ?? 10]}
            onValueChange={(v) => onChange({ ...cfg, secondarySize: v[0] })}
            style={{ maxWidth: 220 }}
            data-testid={testId ? `${testId}-secondary-size` : undefined}
          />
        }
      />
    </div>
  );
}
