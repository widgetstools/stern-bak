/**
 * TimeSinceEditor — authoring UI for `TimeSinceRendererConfig`.
 */
import { Slider } from '@wellsfargo-starui/react';
import type { TimeSinceRendererConfig } from '@wellsfargo-starui/design-system';
import { Row } from '../editors/Row';
import { ThemeAwareColorRow } from './themeColorRow';

const DEFAULT_TIME_SINCE: TimeSinceRendererConfig = { refreshSec: 60 };

export function TimeSinceEditor({
  value,
  onChange,
  testId,
}: {
  value: TimeSinceRendererConfig | undefined;
  onChange: (next: TimeSinceRendererConfig) => void;
  testId?: string;
}) {
  const cfg = value ?? DEFAULT_TIME_SINCE;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row
        label="REFRESH"
        hint={`${cfg.refreshSec ?? 60}s tick`}
        control={
          <Slider
            min={1}
            max={300}
            step={1}
            value={[cfg.refreshSec ?? 60]}
            onValueChange={(v) => onChange({ ...cfg, refreshSec: v[0] })}
            style={{ maxWidth: 220 }}
            data-testid={testId ? `${testId}-refresh` : undefined}
          />
        }
      />
      <Row
        label="FUTURE COLOUR"
        hint="Used when the timestamp is ahead of `now`"
        control={
          <ThemeAwareColorRow
            value={cfg.futureColor}
            onChange={(v) => onChange({ ...cfg, futureColor: v })}
            testIdPrefix={testId ? `${testId}-future-color` : undefined}
          />
        }
      />
    </div>
  );
}
