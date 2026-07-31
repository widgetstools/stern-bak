import { controls, radius, spacing } from '@wellsfargo-starui/design-system/tokens';
import type { FlashColor } from '@wellsfargo-starui/engine';
import { ChromeButton } from '../../ui/ChromeButton';
import { FLASH_PALETTE } from '../conditional-styling/transforms';

const FLASH_COLOR_ORDER: ReadonlyArray<FlashColor> = [
  'amber',
  'emerald',
  'rose',
  'sky',
  'violet',
  'teal',
  'orange',
  'slate',
];

const SWATCH_SIZE = controls.xs.height;

export function CellChangeFlashColorSwatches({
  value,
  onChange,
}: {
  value: FlashColor;
  onChange: (color: FlashColor) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Cell change flash colour"
      style={{ display: 'inline-flex', gap: spacing[1.5], alignItems: 'center' }}
    >
      {FLASH_COLOR_ORDER.map((name) => {
        const isActive = value === name;
        return (
          <ChromeButton
            key={name}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(name)}
            title={name.charAt(0).toUpperCase() + name.slice(1)}
            aria-label={`Flash colour ${name}`}
            data-testid={`go-cell-change-flash-color-${name}`}
            style={{
              width: SWATCH_SIZE,
              height: SWATCH_SIZE,
              borderRadius: radius.xl,
              padding: 0,
              background: FLASH_PALETTE[name].swatch,
              border: '1px solid var(--ds-border-secondary)',
              boxShadow: isActive
                ? '0 0 0 2px var(--ds-surface-primary), 0 0 0 4px var(--ds-accent-positive)'
                : 'inset 0 0 0 1px var(--ds-border-primary)',
              cursor: 'pointer',
              outline: 'none',
              transition: 'transform 100ms ease-out, box-shadow 100ms ease-out',
              transform: isActive ? 'scale(1.06)' : 'scale(1)',
            }}
            onFocus={(e) => {
              if (!isActive) {
                e.currentTarget.style.boxShadow =
                  'inset 0 0 0 1px var(--ds-border-primary), 0 0 0 2px var(--ds-accent-positive)';
              }
            }}
            onBlur={(e) => {
              if (!isActive) {
                e.currentTarget.style.boxShadow =
                  'inset 0 0 0 1px var(--ds-border-primary)';
              }
            }}
          />
        );
      })}
    </div>
  );
}
