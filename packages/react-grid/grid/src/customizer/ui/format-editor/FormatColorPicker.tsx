import { useCallback, useEffect, useRef, useState } from 'react';
import { Pipette, X } from 'lucide-react';
import { controls, radius } from '@wellsfargo-starui/design-system/tokens';
import { Input } from '@wellsfargo-starui/react';
import { ChromeButton } from '../ChromeButton';

/**
 * Unified color picker used across the entire app.
 *
 * Layout (~240px wide, ~250px tall):
 *   ┌─────────────────────────┐
 *   │     SV pad (90px)       │  drag crosshair
 *   ├─────────────────────────┤
 *   │   Hue strip (10px)     │  drag thumb
 *   ├─────────────────────────┤
 *   │ ⬛⬛⬛⬛⬛⬛⬛⬛ (×2)  │  16 preset swatches
 *   ├─────────────────────────┤
 *   │ Recent: ⬛⬛⬛⬛⬛…    │  last 10 (localStorage)
 *   ├─────────────────────────┤
 *   │ [🎨][■] #hex     [×]   │  pipette + chip + hex + clear
 *   └─────────────────────────┘
 *
 * Commits immediately on every interaction (no confirm button).
 * Used by: PropColor, ColorPickerPopover, FormatSwatch, BorderSidesEditor.
 */

// ─── Presets ─────────────────────────────────────────────────────────────────
// Preset swatches are picker AFFORDANCES — the user is choosing an absolute
// color to apply, not consuming a theme token. They look identical in dark
// and light themes by design. Same applies to the hue-strip gradient and the
// SV-pad black/white overlays further below: those are mathematical color
// spaces, not chrome, and live outside the design-system token surface.

const PRESETS = [
  '#0f172a', '#1e293b', '#334155', '#475569',
  '#0d9488', '#0ea5e9', '#6366f1', '#a855f7',
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#94a3b8', '#cbd5e1', '#e2e8f0', '#ffffff',
];

// ─── Recent colors (localStorage) ────────────────────────────────────────────

const LS_KEY = 'ds-recent-colors';
const MAX_RECENT = 10;

function getRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]').slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function addRecent(color: string): void {
  try {
    const list = getRecent().filter((c) => c.toLowerCase() !== color.toLowerCase());
    list.unshift(color);
    localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    /* noop */
  }
}

// ─── HSV math ────────────────────────────────────────────────────────────────

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = v - c;
  let rr = 0,
    gg = 0,
    bb = 0;
  if (h < 60) { rr = c; gg = x; }
  else if (h < 120) { rr = x; gg = c; }
  else if (h < 180) { gg = c; bb = x; }
  else if (h < 240) { gg = x; bb = c; }
  else if (h < 300) { rr = x; bb = c; }
  else { rr = c; bb = x; }
  const toH = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toH(rr)}${toH(gg)}${toH(bb)}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface FormatColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  /** Show a "clear" (×) button that calls onChange with empty string. */
  allowClear?: boolean;
  /** Height of the SV pad. Default 90. */
  svHeight?: number;
  /**
   * Called after a *discrete* color choice — a preset/recent swatch, the
   * native OS picker, or Enter on a valid hex. NOT called during SV-pad /
   * hue drag (continuous tuning), so the popover can stay open while the
   * user dials in a color but dismiss the moment they pick a concrete one.
   * The popover wrapper passes its `close` here.
   */
  onCommit?: () => void;
}

export function FormatColorPicker({
  value,
  onChange,
  allowClear = false,
  svHeight = 90,
  onCommit,
}: FormatColorPickerProps) {
  const hsv = hexToHsv(value || '#000000');
  const [h, setH] = useState(hsv.h);
  const [s, setS] = useState(hsv.s);
  const [v, setV] = useState(hsv.v);
  const [hex, setHex] = useState(value || '#000000');
  const [recent, setRecent] = useState<string[]>(getRecent);
  const padRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'pad' | 'hue' | null>(null);

  useEffect(() => {
    const val = value || '#000000';
    const next = hexToHsv(val);
    setH(next.h);
    setS(next.s);
    setV(next.v);
    setHex(val);
  }, [value]);

  const emit = useCallback(
    (hh: number, ss: number, vv: number) => {
      const c = hsvToHex(hh, ss, vv);
      setHex(c);
      addRecent(c);
      setRecent(getRecent());
      onChange(c);
    },
    [onChange],
  );

  const handlePad = useCallback(
    (e: PointerEvent | React.PointerEvent) => {
      const rect = padRef.current!.getBoundingClientRect();
      const ns = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const nv = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
      setS(ns);
      setV(nv);
      emit(h, ns, nv);
    },
    [h, emit],
  );

  const handleHue = useCallback(
    (e: PointerEvent | React.PointerEvent) => {
      const rect = hueRef.current!.getBoundingClientRect();
      const nh = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360));
      setH(nh);
      emit(nh, s, v);
    },
    [s, v, emit],
  );

  // Pointer Events (not mouse-only) so the SV pad + hue strip can be dragged
  // by touch and pen as well as mouse. `touch-action: none` on the surfaces
  // (below) stops a touch-drag from scrolling the popover instead of tuning.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      if (dragging.current === 'pad') handlePad(e);
      else if (dragging.current === 'hue') handleHue(e);
    };
    const onUp = () => {
      dragging.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [handlePad, handleHue]);

  const selectPreset = (c: string) => {
    const next = hexToHsv(c);
    setH(next.h);
    setS(next.s);
    setV(next.v);
    setHex(c);
    addRecent(c);
    setRecent(getRecent());
    onChange(c);
    // A swatch / recent / native-picker click is a discrete decision —
    // dismiss the popover so users aren't left clicking outside to close it.
    onCommit?.();
  };

  const handleHexInput = (val: string) => {
    setHex(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      const next = hexToHsv(val);
      setH(next.h);
      setS(next.s);
      setV(next.v);
      addRecent(val);
      setRecent(getRecent());
      onChange(val);
    }
  };

  const swatchStyle = (c: string, selected: boolean): React.CSSProperties => ({
    width: '100%',
    aspectRatio: '1',
    borderRadius: radius.md,
    padding: 0,
    cursor: 'pointer',
    border: selected ? '2px solid var(--ds-accent-positive)' : '1px solid var(--ds-border-primary)',
    background: c,
    boxShadow: selected
      ? '0 0 0 2px var(--ds-state-focus-ring-bg)'
      : c === '#ffffff' || c === '#e2e8f0'
        ? 'inset 0 0 0 1px var(--ds-border-primary)'
        : 'none',
  });

  return (
    <div onClick={(e) => e.stopPropagation()} className="w-full">
      {/* SV Pad */}
      <div
        ref={padRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = 'pad';
          handlePad(e);
        }}
        style={{
          width: '100%',
          height: svHeight,
          borderRadius: radius.xl,
          cursor: 'crosshair',
          position: 'relative',
          overflow: 'hidden',
          marginBottom: 6,
          touchAction: 'none',
          background: `hsl(${h}, 100%, 50%)`,
        }}
      >
        {/* SV pad overlays + crosshair are intentional: white/black gradients
            are the HSV color model; the white-bordered crosshair is a
            deliberate high-contrast cursor designed to remain visible over
            any underlying hue. None are theme tokens. */}
        <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
        <div
          style={{
            position: 'absolute',
            left: `${s * 100}%`,
            top: `${(1 - v) * 100}%`,
            width: 12,
            height: 12,
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.3)',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Hue strip */}
      <div
        ref={hueRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = 'hue';
          handleHue(e);
        }}
        style={{
          width: '100%',
          height: 10,
          borderRadius: radius.xl,
          cursor: 'pointer',
          position: 'relative',
          marginBottom: 8,
          touchAction: 'none',
          // Hue strip = mathematical RGB spectrum, intentionally theme-independent.
          background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: `${(h / 360) * 100}%`,
            top: '50%',
            width: 12,
            height: 12,
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.2), 0 1px 4px rgba(0,0,0,0.3)',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            background: `hsl(${h}, 100%, 50%)`,
          }}
        />
      </div>

      {/* Preset swatches (8×2) */}
      <div className="grid grid-cols-8 gap-1 mb-1.5">
        {PRESETS.map((c) => (
          <ChromeButton key={c} onClick={() => selectPreset(c)} onMouseDown={(e) => e.preventDefault()} style={swatchStyle(c, hex.toLowerCase() === c.toLowerCase())} />
        ))}
      </div>

      {/* Recent colors */}
      {recent.length > 0 && (
        <div className="mb-1.5">
          <div className="text-[10px] font-semibold tracking-[0.06em] uppercase text-muted-foreground mb-1">
            Recent
          </div>
          <div className="flex gap-1">
            {recent.slice(0, 8).map((c) => (
              <ChromeButton
                key={c}
                onClick={() => selectPreset(c)}
                onMouseDown={(e) => e.preventDefault()}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: radius.md,
                  padding: 0,
                  cursor: 'pointer',
                  border: hex.toLowerCase() === c.toLowerCase() ? '2px solid var(--ds-accent-positive)' : '1px solid var(--ds-border-primary)',
                  background: c,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Bottom bar: pipette + chip + hex input + clear */}
      <div className="flex items-center gap-1.5">
        {/* Native color picker (pipette). Native <input type="color"> is
            intentional — it surfaces the OS-native color dialog, which no
            shadcn primitive provides. The visible chip is the <label>; the
            input itself is transparent and absolutely positioned to catch
            clicks. */}
        <label
          style={{
            width: controls.xs.height,
            height: controls.xs.height,
            borderRadius: radius.md,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden',
            background: hex,
            border: '1px solid var(--ds-border-primary)',
            flexShrink: 0,
          }}
          title="Pick any color"
        >
          <Pipette size={10} strokeWidth={1.5} className="text-white opacity-80" />
          <input
            type="color"
            value={hex}
            onChange={(e) => selectPreset(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </label>

        {/* Hex input — shadcn Input wrap. h-auto cancels the shadcn h-7
            default so we can size to the xs control tier (24px). */}
        <Input
          type="text"
          value={hex}
          onChange={(e) => handleHexInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter on a valid hex is an explicit commit — close the popover.
            // Typing alone never closes it, so partial hexes stay editable.
            if (e.key === 'Enter' && /^#[0-9a-fA-F]{6}$/.test(hex)) {
              onCommit?.();
            }
          }}
          className="h-auto flex-1 min-w-0 rounded px-2 font-mono font-medium text-[length:var(--ds-control-sm-font-size)] bg-background"
          style={{ height: controls.xs.height }}
        />

        {/* Clear */}
        {allowClear && (
          <ChromeButton
            onClick={() => {
              setHex('');
              onChange('');
            }}
            onMouseDown={(e) => e.preventDefault()}
            title="Clear color"
            className="rounded flex items-center justify-center cursor-pointer bg-[var(--ds-overlay-negative-soft)] border-none text-[var(--ds-accent-negative)] shrink-0"
            style={{ width: controls.xs.height, height: controls.xs.height }}
          >
            <X size={10} strokeWidth={2} />
          </ChromeButton>
        )}
      </div>
    </div>
  );
}
