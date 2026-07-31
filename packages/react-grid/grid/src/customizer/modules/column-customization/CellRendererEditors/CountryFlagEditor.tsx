/**
 * CountryFlagEditor — authoring UI for `CountryFlagRendererConfig`.
 */
import { Input, Switch } from '@wellsfargo-starui/ui';
import type { CountryFlagRendererConfig } from '@wellsfargo-starui/design-system';
import { Row } from '../editors/Row';

const DEFAULT_FLAG: CountryFlagRendererConfig = {};

export function CountryFlagEditor({
  value,
  onChange,
  testId,
}: {
  value: CountryFlagRendererConfig | undefined;
  onChange: (next: CountryFlagRendererConfig) => void;
  testId?: string;
}) {
  const cfg = value ?? DEFAULT_FLAG;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row
        label="CODE FIELD"
        hint="Field that supplies the 2-letter ISO code — leave blank to use the cell value"
        control={
          <Input
            value={cfg.codeField ?? ''}
            onChange={(e) => onChange({ ...cfg, codeField: e.target.value || undefined })}
            placeholder="(cell value)"
            style={{ height: 28, maxWidth: 220 }}
            data-testid={testId ? `${testId}-code-field` : undefined}
          />
        }
      />
      <Row
        label="SHOW LABEL"
        control={
          <Switch
            checked={cfg.showLabel !== false}
            onCheckedChange={(on) => onChange({ ...cfg, showLabel: on })}
            data-testid={testId ? `${testId}-show-label` : undefined}
          />
        }
      />
      <Row
        label="LABEL FIELD"
        hint="Field for the label text — leave blank to reuse the cell value"
        control={
          <Input
            value={cfg.labelField ?? ''}
            onChange={(e) => onChange({ ...cfg, labelField: e.target.value || undefined })}
            placeholder="(cell value)"
            style={{ height: 28, maxWidth: 220 }}
            data-testid={testId ? `${testId}-label-field` : undefined}
          />
        }
      />
    </div>
  );
}
