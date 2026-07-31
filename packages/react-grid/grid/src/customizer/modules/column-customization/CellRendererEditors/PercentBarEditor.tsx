/**
 * PercentBarEditor — authoring UI for `PercentBarRendererConfig`.
 *
 * `max` may be a literal number or a sibling-field reference.
 */
import { Input, RadioGroup, RadioGroupItem, Label, Switch } from '@wellsfargo-starui/ui';
import type { PercentBarRendererConfig } from '@wellsfargo-starui/design-system';
import { Row } from '../editors/Row';
import { ThemeAwareColorRow } from './themeColorRow';

const DEFAULT_PERCENT_BAR: PercentBarRendererConfig = {
  max: 100,
  barColor: { dark: '#3b82f6', light: '#2563eb' },
};

export function PercentBarEditor({
  value,
  onChange,
  testId,
}: {
  value: PercentBarRendererConfig | undefined;
  onChange: (next: PercentBarRendererConfig) => void;
  testId?: string;
}) {
  const cfg = value ?? DEFAULT_PERCENT_BAR;
  const maxIsField = typeof cfg.max === 'object';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row
        label="MAX SOURCE"
        control={
          <RadioGroup
            value={maxIsField ? 'field' : 'literal'}
            onValueChange={(v) =>
              onChange({
                ...cfg,
                max: v === 'field' ? { fromField: '' } : 100,
              })
            }
            style={{ display: 'flex', gap: 12 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <RadioGroupItem value="literal" id="max-literal" data-testid={testId ? `${testId}-max-literal` : undefined} />
              <Label htmlFor="max-literal" style={{ fontSize: 11 }}>Literal</Label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <RadioGroupItem value="field" id="max-field" data-testid={testId ? `${testId}-max-field` : undefined} />
              <Label htmlFor="max-field" style={{ fontSize: 11 }}>Field</Label>
            </div>
          </RadioGroup>
        }
      />
      <Row
        label={maxIsField ? 'FIELD NAME' : 'MAX VALUE'}
        control={
          maxIsField ? (
            <Input
              value={(cfg.max as { fromField: string }).fromField}
              onChange={(e) => onChange({ ...cfg, max: { fromField: e.target.value } })}
              placeholder="e.g. qty"
              style={{ height: 28, maxWidth: 200 }}
              data-testid={testId ? `${testId}-max-field-name` : undefined}
            />
          ) : (
            <Input
              type="number"
              value={Number(cfg.max)}
              onChange={(e) => onChange({ ...cfg, max: Number(e.target.value) })}
              style={{ height: 28, width: 120 }}
              data-testid={testId ? `${testId}-max-value` : undefined}
            />
          )
        }
      />
      <Row
        label="BAR COLOUR"
        control={
          <ThemeAwareColorRow
            value={cfg.barColor}
            onChange={(v) => onChange({ ...cfg, barColor: v ?? { dark: '#3b82f6' } })}
            testIdPrefix={testId ? `${testId}-bar` : undefined}
          />
        }
      />
      <Row
        label="TRACK COLOUR"
        hint="Optional — default = translucent grey"
        control={
          <ThemeAwareColorRow
            value={cfg.trackColor}
            onChange={(v) => onChange({ ...cfg, trackColor: v })}
            testIdPrefix={testId ? `${testId}-track` : undefined}
          />
        }
      />
      <Row
        label="SHOW PERCENT"
        control={
          <Switch
            checked={cfg.showPercent ?? false}
            onCheckedChange={(on) => onChange({ ...cfg, showPercent: on, showValue: on ? false : cfg.showValue })}
            data-testid={testId ? `${testId}-show-percent` : undefined}
          />
        }
      />
      <Row
        label="SHOW VALUE"
        control={
          <Switch
            checked={cfg.showValue ?? false}
            onCheckedChange={(on) => onChange({ ...cfg, showValue: on, showPercent: on ? false : cfg.showPercent })}
            data-testid={testId ? `${testId}-show-value` : undefined}
          />
        }
      />
    </div>
  );
}
