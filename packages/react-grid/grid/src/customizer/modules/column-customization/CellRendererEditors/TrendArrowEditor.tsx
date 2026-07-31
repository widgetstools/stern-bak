/**
 * TrendArrowEditor — authoring UI for `TrendArrowRendererConfig`.
 */
import { Input, Switch } from '@wellsfargo-starui/ui';
import type { TrendArrowRendererConfig } from '@wellsfargo-starui/design-system';
import { Row } from '../editors/Row';
import { ThemeAwareColorRow } from './themeColorRow';

const DEFAULT_TREND: TrendArrowRendererConfig = {
  upColor: { dark: '#22c55e', light: '#15803d' },
  downColor: { dark: '#ef4444', light: '#b91c1c' },
};

export function TrendArrowEditor({
  value,
  onChange,
  testId,
}: {
  value: TrendArrowRendererConfig | undefined;
  onChange: (next: TrendArrowRendererConfig) => void;
  testId?: string;
}) {
  const cfg = value ?? DEFAULT_TREND;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row
        label="THRESHOLD"
        hint="Neutral dead-band around zero"
        control={
          <Input
            type="number"
            value={cfg.threshold ?? 0}
            step="0.01"
            onChange={(e) => onChange({ ...cfg, threshold: Number(e.target.value) || 0 })}
            style={{ height: 28, width: 120 }}
            data-testid={testId ? `${testId}-threshold` : undefined}
          />
        }
      />
      <Row label="UP COLOUR" control={<ThemeAwareColorRow value={cfg.upColor} onChange={(v) => onChange({ ...cfg, upColor: v ?? { dark: '#22c55e' } })} testIdPrefix={testId ? `${testId}-up` : undefined} />} />
      <Row label="DOWN COLOUR" control={<ThemeAwareColorRow value={cfg.downColor} onChange={(v) => onChange({ ...cfg, downColor: v ?? { dark: '#ef4444' } })} testIdPrefix={testId ? `${testId}-down` : undefined} />} />
      <Row label="NEUTRAL COLOUR" hint="Optional" control={<ThemeAwareColorRow value={cfg.neutralColor} onChange={(v) => onChange({ ...cfg, neutralColor: v })} testIdPrefix={testId ? `${testId}-neutral` : undefined} />} />
      <Row
        label="DECIMALS"
        control={
          <Input
            type="number"
            min="0"
            max="6"
            value={cfg.decimals ?? 2}
            onChange={(e) => onChange({ ...cfg, decimals: Math.max(0, Number(e.target.value) || 0) })}
            style={{ height: 28, width: 80 }}
            data-testid={testId ? `${testId}-decimals` : undefined}
          />
        }
      />
      <Row
        label="SHOW DELTA"
        control={
          <Switch
            checked={cfg.showDelta !== false}
            onCheckedChange={(on) => onChange({ ...cfg, showDelta: on })}
            data-testid={testId ? `${testId}-show-delta` : undefined}
          />
        }
      />
    </div>
  );
}
