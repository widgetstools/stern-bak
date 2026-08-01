// ─────────────────────────────────────────────────────────────
//  applyTheme — flip <html data-theme> and <html data-cvd> to
//  match the user's preference and persist to localStorage.
//
//  Apps call applyTheme(getTheme()) once at module scope before
//  ReactDOM.createRoot(...).render(...). This sets the right
//  attribute on <html> BEFORE first paint so there's no FOUC.
//
//  Storage keys (post-theme-reducer):
//    `starui:theme` — the canonical theme storage key shared with
//      `@wellsfargo-starui/runtime-port`'s THEME_STORAGE_KEY constant. Stored
//      as the bare string `'dark'` | `'light'`. The runtime port
//      reads and writes this key on every cross-window broadcast,
//      so the design-system MUST use the same key — otherwise
//      `applyTheme()` on boot and `runtime.setTheme()` at runtime
//      would write divergent values and the next boot would pick
//      whichever ran last.
//    `starui:cvd` — colour-vision-deficiency toggle. Separate key
//      so the theme reducer can store a plain string in
//      `starui:theme` (rather than parse JSON). Stored as the
//      string `'on'` or absent (default off).
//    `starui:variant` — light-only surface variant: `clinical` |
//      `paper`. Default `clinical` when light and absent.
//
//  Backwards compatibility: the legacy `@wellsfargo-starui/theme` JSON blob
//  is read on first boot if the canonical keys are absent, then
//  rewritten to the new shape. After the first migration, future
//  reads only hit the new keys.
// ─────────────────────────────────────────────────────────────

import { THEME_STORAGE_KEY } from '@wellsfargo-starui/types/shared';

export type Mode = 'dark' | 'light';
export type LightVariant = 'clinical' | 'paper';

export interface ThemeOptions {
  theme: Mode;
  cvd?: boolean;
  /** Light-mode surface variant. Ignored when `theme` is `dark`. Default: `clinical`. */
  variant?: LightVariant;
}

const CVD_KEY = 'starui:cvd';
const VARIANT_KEY = 'starui:variant';
const LEGACY_KEY = '@wellsfargo-starui/theme';
const LEGACY_THEME_KEY = 'starui:theme';

function applyVariant(variant: LightVariant | undefined, theme: Mode): void {
  if (theme === 'dark') {
    document.documentElement.removeAttribute('data-variant');
    return;
  }
  document.documentElement.setAttribute(
    'data-variant',
    variant ?? 'clinical',
  );
}

export function applyTheme(opts: ThemeOptions): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', opts.theme);
  // AG Grid v33+ theme modes read `data-ag-theme-mode` (see adapters/agGrid.ts).
  document.documentElement.setAttribute('data-ag-theme-mode', opts.theme);
  applyVariant(opts.variant, opts.theme);
  if (opts.cvd) {
    document.documentElement.setAttribute('data-cvd', 'on');
  } else {
    document.documentElement.removeAttribute('data-cvd');
  }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, opts.theme);
      if (opts.cvd) {
        localStorage.setItem(CVD_KEY, 'on');
      } else {
        localStorage.removeItem(CVD_KEY);
      }
      if (opts.theme === 'light') {
        localStorage.setItem(VARIANT_KEY, opts.variant ?? 'clinical');
      } else {
        localStorage.removeItem(VARIANT_KEY);
      }
      localStorage.removeItem(LEGACY_KEY);
    } catch { /* private mode / quota */ }
  }
}

export function getTheme(): ThemeOptions {
  if (typeof localStorage === 'undefined') return { theme: 'dark' };
  try {
    const theme = localStorage.getItem(THEME_STORAGE_KEY)
      ?? localStorage.getItem(LEGACY_THEME_KEY);
    const cvd = localStorage.getItem(CVD_KEY) === 'on';
    const variantRaw = localStorage.getItem(VARIANT_KEY);
    const variant: LightVariant | undefined =
      variantRaw === 'paper' ? 'paper'
      : variantRaw === 'clinical' ? 'clinical'
      : undefined;

    if (theme === 'dark' || theme === 'light') {
      const base: ThemeOptions = cvd ? { theme, cvd: true } : { theme };
      if (theme === 'light') {
        return { ...base, variant: variant ?? 'clinical' };
      }
      return base;
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Partial<ThemeOptions>;
      if (parsed.theme === 'dark' || parsed.theme === 'light') {
        const out: ThemeOptions = parsed.cvd
          ? { theme: parsed.theme, cvd: true }
          : { theme: parsed.theme };
        if (parsed.theme === 'light') {
          out.variant = parsed.variant ?? 'clinical';
        }
        return out;
      }
    }
    return { theme: 'dark' };
  } catch {
    return { theme: 'dark' };
  }
}
