/**
 * Compact two-slot colour control (dark / light) shared by every
 * configurable cell-renderer editor.
 *
 * Authors a `ThemeAwareColor` ({ dark?, light? }) by surfacing two
 * `CompactColorField` inputs side-by-side. Either slot can be left
 * empty — the renderer falls back to whichever slot is present.
 */
import type { ThemeAwareColor } from '@wellsfargo-starui/design-system';
import { CompactColorField } from '../../../ui/ColorPicker';

export interface ThemeAwareColorRowProps {
  value: ThemeAwareColor | undefined;
  onChange: (next: ThemeAwareColor | undefined) => void;
  testIdPrefix?: string;
}

export function ThemeAwareColorRow({
  value,
  onChange,
  testIdPrefix,
}: ThemeAwareColorRowProps) {
  const set = (slot: 'dark' | 'light', hex: string | undefined) => {
    const next: ThemeAwareColor = { ...value, [slot]: hex };
    if (!next.dark && !next.light) return onChange(undefined);
    if (next.dark === undefined) delete next.dark;
    if (next.light === undefined) delete next.light;
    onChange(next);
  };
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 10, opacity: 0.7, minWidth: 30, fontFamily: 'monospace' }}>DARK</span>
        <CompactColorField
          value={value?.dark}
          onChange={(v) => set('dark', v || undefined)}
          onClear={() => set('dark', undefined)}
          data-testid={testIdPrefix ? `${testIdPrefix}-dark` : undefined}
        />
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 10, opacity: 0.7, minWidth: 30, fontFamily: 'monospace' }}>LIGHT</span>
        <CompactColorField
          value={value?.light}
          onChange={(v) => set('light', v || undefined)}
          onClear={() => set('light', undefined)}
          data-testid={testIdPrefix ? `${testIdPrefix}-light` : undefined}
        />
      </div>
    </div>
  );
}
