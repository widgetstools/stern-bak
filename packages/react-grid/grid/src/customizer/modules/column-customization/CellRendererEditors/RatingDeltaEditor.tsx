/**
 * RatingDeltaEditor — authoring UI for `RatingDeltaRendererConfig`.
 */
import { useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Input } from '@wellsfargo-starui/react';
import type { RatingDeltaRendererConfig } from '@wellsfargo-starui/design-system';
import { Row } from '../editors/Row';
import { ThemeAwareColorRow } from './themeColorRow';

const SP_SCALE = [
  'AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-',
  'BBB+', 'BBB', 'BBB-', 'BB+', 'BB', 'BB-',
  'B+', 'B', 'B-', 'CCC+', 'CCC', 'CCC-', 'CC', 'C', 'D',
];

const DEFAULT_RATING_DELTA: RatingDeltaRendererConfig = {
  scale: SP_SCALE,
  previousField: 'prevRating',
  upColor: { dark: '#22c55e', light: '#15803d' },
  downColor: { dark: '#ef4444', light: '#b91c1c' },
};

export function RatingDeltaEditor({
  value,
  onChange,
  testId,
}: {
  value: RatingDeltaRendererConfig | undefined;
  onChange: (next: RatingDeltaRendererConfig) => void;
  testId?: string;
}) {
  // Same guard as PillEditor: a stored config missing `scale` must not
  // crash the drawer — it should open with an empty list to fill in.
  const cfg = value ? { ...DEFAULT_RATING_DELTA, ...value, scale: value.scale ?? [] } : DEFAULT_RATING_DELTA;

  const setRating = useCallback(
    (idx: number, v: string) => {
      const next = cfg.scale.slice();
      next[idx] = v;
      onChange({ ...cfg, scale: next });
    },
    [cfg, onChange],
  );
  const removeRating = useCallback(
    (idx: number) => {
      const next = cfg.scale.slice();
      next.splice(idx, 1);
      onChange({ ...cfg, scale: next });
    },
    [cfg, onChange],
  );
  const addRating = useCallback(
    () => onChange({ ...cfg, scale: [...cfg.scale, ''] }),
    [cfg, onChange],
  );
  const resetToSP = useCallback(() => onChange({ ...cfg, scale: SP_SCALE }), [cfg, onChange]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row
        label="PREVIOUS-RATING FIELD"
        hint="Sibling field that holds the prior rating"
        control={
          <Input
            value={cfg.previousField}
            onChange={(e) => onChange({ ...cfg, previousField: e.target.value })}
            placeholder="e.g. prevRating"
            style={{ height: 28, maxWidth: 220 }}
            data-testid={testId ? `${testId}-previous-field` : undefined}
          />
        }
      />
      <Row label="UP COLOUR" control={<ThemeAwareColorRow value={cfg.upColor} onChange={(v) => onChange({ ...cfg, upColor: v ?? { dark: '#22c55e' } })} testIdPrefix={testId ? `${testId}-up` : undefined} />} />
      <Row label="DOWN COLOUR" control={<ThemeAwareColorRow value={cfg.downColor} onChange={(v) => onChange({ ...cfg, downColor: v ?? { dark: '#ef4444' } })} testIdPrefix={testId ? `${testId}-down` : undefined} />} />
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', opacity: 0.7 }}>SCALE (HIGH → LOW)</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <Button size="sm" variant="ghost" onClick={resetToSP} data-testid={testId ? `${testId}-reset-sp` : undefined}>
              Reset to S&amp;P
            </Button>
            <Button size="sm" variant="outline" onClick={addRating} data-testid={testId ? `${testId}-add-rating` : undefined}>
              <Plus size={12} /> Add
            </Button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 4, maxHeight: 220, overflow: 'auto' }}>
          {cfg.scale.map((r, idx) => (
            <div key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <Input
                value={r}
                onChange={(e) => setRating(idx, e.target.value)}
                style={{ height: 24, fontSize: 11, fontFamily: 'monospace' }}
                data-testid={testId ? `${testId}-rating-${idx}` : undefined}
              />
              <Button size="sm" variant="ghost" aria-label="Remove" onClick={() => removeRating(idx)} data-testid={testId ? `${testId}-rating-${idx}-remove` : undefined}>
                <Trash2 size={10} />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
