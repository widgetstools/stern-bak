import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Minus, Pipette } from 'lucide-react';
import { FormatColorPicker } from '../format-editor';
import { Popover, PopoverContent, PopoverTrigger, Input, Slider } from '@wellsfargo-starui/ui';
import { ChromeButton } from '../ChromeButton';

/**
 * Cockpit compact colour field — 28px tall pill with checkerboard preview
 * when empty, monospace hex readout, alpha percentage, and optional
 * visibility toggle + clear. Matches IconInput's height so fields in a
 * PairRow align.
 *
 * Previously this component imported a separate `ColorPickerPopover`
 * file that carried the Figma-style alpha+recents shell. That component
 * had no other consumers, so the shell is inlined here (see
 * `CompactColorFieldPopover` below) and the parallel public export was
 * retired as part of AUDIT M1.
 */

export interface CompactColorFieldProps {
  value?: string;
  alpha?: number;
  onChange: (value: string, alpha?: number) => void;
  onClear?: () => void;
  visible?: boolean;
  onToggleVisible?: (next: boolean) => void;
  recents?: string[];
  disabled?: boolean;
  placeholder?: string;
  'data-testid'?: string;
}

const CHECKERBOARD =
  'conic-gradient(var(--ds-text-faint) 0 25%, var(--ds-border-primary) 0 50%, var(--ds-text-faint) 0 75%, var(--ds-border-primary) 0) 0 0 / 6px 6px';

export function CompactColorField({
  value,
  alpha = 100,
  onChange,
  onClear,
  visible = true,
  onToggleVisible,
  recents,
  disabled,
  placeholder = 'NONE',
  ...rest
}: CompactColorFieldProps) {
  const [open, setOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState(value ?? '');

  if (value !== undefined && value !== hexDraft && !open) {
    queueMicrotask(() => setHexDraft(value));
  }

  const hasValue = Boolean(value);

  // Resolve CSS-var / named / rgba values to a clean 6-char hex for both
  // the swatch paint and the text readout.
  const resolvedHex = useMemo(() => {
    if (!value) return '';
    if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toUpperCase();
    if (typeof document === 'undefined') return value;
    try {
      const probe = document.createElement('span');
      probe.style.color = value;
      probe.style.display = 'none';
      document.body.appendChild(probe);
      const computed = getComputedStyle(probe).color;
      document.body.removeChild(probe);
      const m = computed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m) {
        const toHex = (n: string) => Number(n).toString(16).padStart(2, '0');
        return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`.toUpperCase();
      }
      return value;
    } catch {
      return value;
    }
  }, [value]);

  const displayHex = hasValue ? resolvedHex : '';

  return (
    <div
      data-testid={rest['data-testid']}
      aria-disabled={disabled ? 'true' : 'false'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 28,
        padding: '0 8px',
        borderRadius: 2,
        background: 'var(--ds-surface-ground)',
        border: '1px solid var(--ds-border-primary)',
        transition: 'border-color 120ms',
        cursor: disabled ? 'not-allowed' : 'text',
        opacity: disabled ? 0.55 : 1,
      }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (disabled) return;
        if (
          target.closest('[data-action="toggle-visible"]') ||
          target.closest('[data-action="clear"]')
        )
          return;
        setOpen(true);
      }}
    >
      <CompactColorFieldPopover
        open={open && !disabled}
        onOpenChange={setOpen}
        value={value}
        alpha={alpha}
        onChange={onChange}
        onClear={onClear}
        recents={recents}
        trigger={
          <ChromeButton
            type="button"
            disabled={disabled}
            aria-label="Pick color"
            style={{
              width: 14,
              height: 14,
              minWidth: 14,
              borderRadius: 0,
              padding: 0,
              cursor: disabled ? 'not-allowed' : 'pointer',
              border: '1px solid var(--ds-border-secondary)',
              background: hasValue ? resolvedHex || (value as string) : CHECKERBOARD,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {!hasValue && (
              <Pipette
                size={8}
                color="var(--ds-text-muted)"
                style={{ position: 'absolute', top: 2, left: 2 }}
              />
            )}
          </ChromeButton>
        }
      />

      <Input
        type="text"
        disabled={disabled}
        placeholder={placeholder}
        value={open ? hexDraft : displayHex}
        onChange={(e) => setHexDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setHexDraft(value ?? '');
            e.currentTarget.blur();
          }
        }}
        onBlur={() => {
          const next = hexDraft.trim();
          if (!next) {
            if (hasValue && onClear) onClear();
            return;
          }
          const normalized = next.startsWith('#') ? next : `#${next}`;
          if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
            onChange(normalized.toUpperCase(), alpha);
          } else {
            setHexDraft(value ?? '');
          }
        }}
        className="h-[26px] min-h-[26px] flex-1 min-w-0 border-none bg-transparent px-1 font-[family-name:var(--ds-font-mono)] text-[11px] uppercase tracking-[0.02em] shadow-none focus-visible:ring-0 text-[color:var(--ds-text-primary)] placeholder:text-[color:var(--ds-text-faint)]"
      />

      <span
        style={{
          fontFamily: 'var(--ds-font-mono)',
          fontSize: 11,
          color: 'var(--ds-text-secondary)',
          fontVariantNumeric: 'tabular-nums',
          minWidth: 28,
          textAlign: 'right',
          flexShrink: 0,
        }}
      >
        {hasValue ? `${alpha}%` : ''}
      </span>

      {onToggleVisible && (
        <ChromeButton
          type="button"
          data-action="toggle-visible"
          disabled={disabled}
          onClick={() => onToggleVisible(!visible)}
          title={visible ? 'Hide' : 'Show'}
          style={{
            width: 20,
            height: 20,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
            color: 'var(--ds-text-muted)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            borderRadius: 2,
            flexShrink: 0,
          }}
        >
          {visible ? <Eye size={12} strokeWidth={1.75} /> : <EyeOff size={12} strokeWidth={1.75} />}
        </ChromeButton>
      )}

      {onClear && hasValue && (
        <ChromeButton
          type="button"
          data-action="clear"
          disabled={disabled}
          onClick={onClear}
          title="Clear color"
          style={{
            width: 20,
            height: 20,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
            color: 'var(--ds-text-muted)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            borderRadius: 2,
            flexShrink: 0,
          }}
        >
          <Minus size={12} strokeWidth={2} />
        </ChromeButton>
      )}
    </div>
  );
}

// ─── Internal popover shell ───────────────────────────────────────────────
// Was `ui/ColorPicker/ColorPickerPopover.tsx` with a public export. The
// alpha slider + recents strip live here now; no other file consumes this
// shell so it's intentionally not exported from the package barrel.

interface CompactColorFieldPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  value?: string;
  alpha?: number;
  onChange: (value: string, alpha?: number) => void;
  onClear?: () => void;
  recents?: string[];
}

function CompactColorFieldPopover({
  open,
  onOpenChange,
  trigger,
  value,
  alpha = 100,
  onChange,
  onClear,
  recents,
}: CompactColorFieldPopoverProps) {
  const [localAlpha, setLocalAlpha] = useState(alpha);

  useEffect(() => {
    setLocalAlpha(alpha);
  }, [alpha]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-[228px] p-3">
        <FormatColorPicker
          value={value || '#000000'}
          onChange={(hex) => {
            if (!hex) onClear?.();
            else onChange(hex, localAlpha);
          }}
          allowClear={Boolean(onClear)}
          svHeight={100}
        />

        {/* Alpha slider */}
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--ds-text-muted)',
              }}
            >
              Alpha
            </span>
            <span
              style={{
                fontSize: 11,
                fontFamily: 'var(--ds-font-mono)',
                color: 'var(--ds-text-secondary)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {localAlpha}%
            </span>
          </div>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[localAlpha]}
            onValueChange={(v) => {
              const next = v[0] ?? 0;
              setLocalAlpha(next);
              if (value) onChange(value, next);
            }}
            style={{ width: '100%', cursor: 'pointer' }}
          />
        </div>

        {/* Optional recents strip */}
        {recents && recents.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--ds-text-muted)',
                marginBottom: 4,
              }}
            >
              From this panel
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {recents.slice(0, 10).map((c) => (
                <ChromeButton
                  key={c}
                  type="button"
                  onClick={() => onChange(c, localAlpha)}
                  title={c}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 2,
                    padding: 0,
                    cursor: 'pointer',
                    border:
                      value?.toLowerCase() === c.toLowerCase()
                        ? '2px solid var(--ds-accent-positive)'
                        : '1px solid var(--ds-border-primary)',
                    background: c,
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
