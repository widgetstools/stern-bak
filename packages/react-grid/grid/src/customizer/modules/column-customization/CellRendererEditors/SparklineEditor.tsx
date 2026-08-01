/**
 * SparklineEditor — authoring UI for `SparklineRendererConfig`.
 */
import { ToggleGroup, ToggleGroupItem, Slider } from '@wellsfargo-starui/react';
import type { SparklineRendererConfig } from '@wellsfargo-starui/design-system';
import { Row } from '../editors/Row';
import { ThemeAwareColorRow } from './themeColorRow';

const DEFAULT_SPARKLINE: SparklineRendererConfig = {
  variant: 'line',
  lineColor: { dark: '#22c55e', light: '#15803d' },
  height: 18,
};

export function SparklineEditor({
  value,
  onChange,
  testId,
}: {
  value: SparklineRendererConfig | undefined;
  onChange: (next: SparklineRendererConfig) => void;
  testId?: string;
}) {
  const cfg = value ?? DEFAULT_SPARKLINE;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row
        label="VARIANT"
        control={
          <ToggleGroup
            type="single"
            value={cfg.variant}
            onValueChange={(v) => v && onChange({ ...cfg, variant: v as SparklineRendererConfig['variant'] })}
            data-testid={testId ? `${testId}-variant` : undefined}
          >
            <ToggleGroupItem value="line">Line</ToggleGroupItem>
            <ToggleGroupItem value="area">Area</ToggleGroupItem>
            <ToggleGroupItem value="bar">Bar</ToggleGroupItem>
          </ToggleGroup>
        }
      />
      <Row label="LINE / BAR COLOUR" control={<ThemeAwareColorRow value={cfg.lineColor} onChange={(v) => onChange({ ...cfg, lineColor: v ?? { dark: '#22c55e' } })} testIdPrefix={testId ? `${testId}-line` : undefined} />} />
      <Row label="FILL COLOUR" hint="Used by area variant — optional" control={<ThemeAwareColorRow value={cfg.fillColor} onChange={(v) => onChange({ ...cfg, fillColor: v })} testIdPrefix={testId ? `${testId}-fill` : undefined} />} />
      <Row
        label="HEIGHT"
        hint={`${cfg.height ?? 18}px`}
        control={
          <Slider
            min={8}
            max={48}
            step={1}
            value={[cfg.height ?? 18]}
            onValueChange={(v) => onChange({ ...cfg, height: v[0] })}
            style={{ maxWidth: 220 }}
            data-testid={testId ? `${testId}-height` : undefined}
          />
        }
      />
    </div>
  );
}
