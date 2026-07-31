/**
 * AllocationBarEditor — authoring UI for `AllocationBarRendererConfig`.
 *
 * The user adds one row per segment key, each with a theme-aware
 * colour. Cell values whose keys are missing from the map fall back
 * to a translucent grey at render time.
 */
import { useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, Switch } from '@wellsfargo-starui/ui';
import type { AllocationBarRendererConfig, ThemeAwareColor } from '@wellsfargo-starui/design-system';
import { Row } from '../editors/Row';
import { ThemeAwareColorRow } from './themeColorRow';

const DEFAULT_ALLOCATION_BAR: AllocationBarRendererConfig = {
  segmentColorMap: {},
  legend: true,
};

export function AllocationBarEditor({
  value,
  onChange,
  testId,
}: {
  value: AllocationBarRendererConfig | undefined;
  onChange: (next: AllocationBarRendererConfig) => void;
  testId?: string;
}) {
  const cfg = value ?? DEFAULT_ALLOCATION_BAR;
  const entries = Object.entries(cfg.segmentColorMap);

  const renameKey = useCallback(
    (oldKey: string, newKey: string) => {
      const next: Record<string, ThemeAwareColor> = {};
      for (const [k, v] of Object.entries(cfg.segmentColorMap)) {
        next[k === oldKey ? newKey : k] = v;
      }
      onChange({ ...cfg, segmentColorMap: next });
    },
    [cfg, onChange],
  );
  const setColor = useCallback(
    (key: string, color: ThemeAwareColor | undefined) => {
      const next = { ...cfg.segmentColorMap };
      if (color) next[key] = color;
      else delete next[key];
      onChange({ ...cfg, segmentColorMap: next });
    },
    [cfg, onChange],
  );
  const removeKey = useCallback(
    (key: string) => {
      const next = { ...cfg.segmentColorMap };
      delete next[key];
      onChange({ ...cfg, segmentColorMap: next });
    },
    [cfg, onChange],
  );
  const addKey = useCallback(() => {
    let n = 1;
    let candidate = `segment-${n}`;
    while (candidate in cfg.segmentColorMap) {
      n += 1;
      candidate = `segment-${n}`;
    }
    onChange({
      ...cfg,
      segmentColorMap: { ...cfg.segmentColorMap, [candidate]: { dark: '#3b82f6', light: '#2563eb' } },
    });
  }, [cfg, onChange]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row
        label="LEGEND"
        control={
          <Switch
            checked={cfg.legend !== false}
            onCheckedChange={(on) => onChange({ ...cfg, legend: on })}
            data-testid={testId ? `${testId}-legend` : undefined}
          />
        }
      />
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', opacity: 0.7 }}>SEGMENT COLOURS</span>
          <Button size="sm" variant="outline" onClick={addKey} data-testid={testId ? `${testId}-add-segment` : undefined}>
            <Plus size={12} /> Add segment
          </Button>
        </div>
        {entries.length === 0 && (
          <div style={{ fontSize: 11, opacity: 0.6, padding: 6, border: '1px dashed var(--ds-border-primary)', borderRadius: 2 }}>
            No segment colours. Click <strong>Add segment</strong> to define one.
          </div>
        )}
        {entries.map(([key, color], idx) => (
          <div
            key={`${key}-${idx}`}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(100px, 160px) 1fr auto',
              gap: 8,
              alignItems: 'center',
              padding: '4px 0',
              borderBottom: '1px dashed var(--ds-border-primary)',
            }}
          >
            <Input
              value={key}
              onChange={(e) => renameKey(key, e.target.value)}
              placeholder="segment key"
              style={{ height: 28, fontFamily: 'monospace', fontSize: 12 }}
              data-testid={testId ? `${testId}-segment-${idx}-key` : undefined}
            />
            <ThemeAwareColorRow
              value={color}
              onChange={(v) => setColor(key, v)}
              testIdPrefix={testId ? `${testId}-segment-${idx}-color` : undefined}
            />
            <Button size="sm" variant="ghost" aria-label="Remove" onClick={() => removeKey(key)} data-testid={testId ? `${testId}-segment-${idx}-remove` : undefined}>
              <Trash2 size={12} />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
