/**
 * HeatmapEditor — authoring UI for `HeatmapRendererConfig`.
 *
 * Two-stop (min/max) or three-stop (min/mid/max) gradient with an
 * optional explicit domain. When the domain is omitted the
 * renderer falls back to [0, 100].
 */
import { useCallback } from 'react';
import { Input, Switch } from '@wellsfargo-starui/ui';
import type { HeatmapRendererConfig } from '@wellsfargo-starui/design-system';
import { Row } from '../editors/Row';
import { ThemeAwareColorRow } from './themeColorRow';

export interface HeatmapEditorProps {
  value: HeatmapRendererConfig | undefined;
  onChange: (next: HeatmapRendererConfig) => void;
  testId?: string;
}

const DEFAULT_HEATMAP: HeatmapRendererConfig = {
  colorScale: {
    min: { dark: '#1e3a8a', light: '#dbeafe' },
    max: { dark: '#7f1d1d', light: '#fee2e2' },
  },
};

export function HeatmapEditor({ value, onChange, testId }: HeatmapEditorProps) {
  const cfg = value ?? DEFAULT_HEATMAP;
  const hasMid = cfg.colorScale.mid !== undefined;
  const hasDomain = cfg.domain !== undefined;

  const toggleMid = useCallback(
    (on: boolean) => {
      if (on) {
        onChange({
          ...cfg,
          colorScale: { ...cfg.colorScale, mid: { dark: '#facc15', light: '#fef9c3' } },
        });
      } else {
        const { mid: _omit, ...rest } = cfg.colorScale;
        void _omit;
        onChange({ ...cfg, colorScale: rest });
      }
    },
    [cfg, onChange],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row
        label="DOMAIN"
        hint="Min / max numeric range — leave off for auto [0, 100]"
        control={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Switch
              checked={hasDomain}
              onCheckedChange={(on) =>
                onChange({ ...cfg, domain: on ? { min: 0, max: 100 } : undefined })
              }
              data-testid={testId ? `${testId}-domain-toggle` : undefined}
            />
            {hasDomain && (
              <>
                <Input
                  type="number"
                  value={cfg.domain!.min}
                  onChange={(e) =>
                    onChange({
                      ...cfg,
                      domain: { min: Number(e.target.value), max: cfg.domain!.max },
                    })
                  }
                  style={{ width: 80, height: 28 }}
                  data-testid={testId ? `${testId}-domain-min` : undefined}
                />
                <span style={{ opacity: 0.4 }}>→</span>
                <Input
                  type="number"
                  value={cfg.domain!.max}
                  onChange={(e) =>
                    onChange({
                      ...cfg,
                      domain: { min: cfg.domain!.min, max: Number(e.target.value) },
                    })
                  }
                  style={{ width: 80, height: 28 }}
                  data-testid={testId ? `${testId}-domain-max` : undefined}
                />
              </>
            )}
          </div>
        }
      />
      <Row
        label="MIN COLOUR"
        control={
          <ThemeAwareColorRow
            value={cfg.colorScale.min}
            onChange={(v) =>
              onChange({ ...cfg, colorScale: { ...cfg.colorScale, min: v ?? { dark: '#1e3a8a' } } })
            }
            testIdPrefix={testId ? `${testId}-min` : undefined}
          />
        }
      />
      <Row
        label="MID COLOUR"
        hint="Optional — enables a three-stop gradient"
        control={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Switch checked={hasMid} onCheckedChange={toggleMid} data-testid={testId ? `${testId}-mid-toggle` : undefined} />
            {hasMid && (
              <ThemeAwareColorRow
                value={cfg.colorScale.mid}
                onChange={(v) => onChange({ ...cfg, colorScale: { ...cfg.colorScale, mid: v } })}
                testIdPrefix={testId ? `${testId}-mid` : undefined}
              />
            )}
          </div>
        }
      />
      <Row
        label="MAX COLOUR"
        control={
          <ThemeAwareColorRow
            value={cfg.colorScale.max}
            onChange={(v) =>
              onChange({ ...cfg, colorScale: { ...cfg.colorScale, max: v ?? { dark: '#7f1d1d' } } })
            }
            testIdPrefix={testId ? `${testId}-max` : undefined}
          />
        }
      />
      <Row
        label="TEXT COLOUR"
        hint="Optional override"
        control={
          <ThemeAwareColorRow
            value={cfg.textColor}
            onChange={(v) => onChange({ ...cfg, textColor: v })}
            testIdPrefix={testId ? `${testId}-text` : undefined}
          />
        }
      />
    </div>
  );
}
