/**
 * Helpers for the theme-keyed `ThemedCellStyleOverrides` shape. Reducers
 * patch the active slot; transforms resolve the active slot. Migration
 * lifts legacy flat `CellStyleOverrides` into the new shape so saved
 * profiles continue to render unchanged.
 */
import type {
  CellStyleOverrides,
  GridThemeMode,
  ThemedCellStyleOverrides,
} from './types';

/**
 * Returns the active theme by reading `[data-theme]` on `<html>`. Used
 * by reducers / transforms / editor components to pick the right slot
 * inside a `ThemedCellStyleOverrides`. Falls back to `'dark'` in non-
 * browser contexts (SSR, vitest jsdom-less suites).
 */
export function getActiveTheme(): GridThemeMode {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/**
 * Return the variant for `theme` verbatim — the slot's OWN value, with no
 * cross-theme inheritance. This is the write-base read: reducers merge a
 * patch onto the active slot's own value and write it straight back, so
 * the light slot only ever stores what the user explicitly diverged in
 * light. Editor / toolbar readouts use it too, so their on/off state
 * reflects "what have I overridden in this theme", not the inherited
 * baseline. For the rendered result use {@link resolveEffectiveStyle}.
 */
export function resolveActiveStyle(
  themed: ThemedCellStyleOverrides | undefined,
  theme: GridThemeMode,
): CellStyleOverrides | undefined {
  return themed?.[theme];
}

/**
 * Per-leaf merge of two `CellStyleOverrides`, `top` winning over `base`.
 * Each section (typography / colors / alignment) merges per-property so a
 * `top` that sets only `colors.background` keeps `base.colors.text`.
 * Borders merge per-side (a `BorderSpec` is treated as one unit — you
 * rarely want "base's colour + top's width"). Returns `undefined` only
 * when both inputs are absent.
 *
 * Shared by `resolveTemplates` (folding a template chain) and
 * {@link resolveEffectiveStyle} (folding the dark slot under light).
 */
export function mergeCellStyleOverrides(
  base: CellStyleOverrides | undefined,
  top: CellStyleOverrides | undefined,
): CellStyleOverrides | undefined {
  if (!base && !top) return undefined;
  if (!base) return top;
  if (!top) return base;
  return {
    typography: base.typography || top.typography
      ? { ...base.typography, ...top.typography }
      : undefined,
    colors: base.colors || top.colors
      ? { ...base.colors, ...top.colors }
      : undefined,
    alignment: base.alignment || top.alignment
      ? { ...base.alignment, ...top.alignment }
      : undefined,
    borders: base.borders || top.borders
      ? { ...base.borders, ...top.borders }
      : undefined,
  };
}

/**
 * Resolve the style that should actually RENDER for `theme`.
 *
 * Dark is the canonical base: `dark` renders its own slot unchanged.
 * `light` INHERITS the dark slot and overrides it per-leaf with its own
 * slot — so a column styled bold+red in dark, then given a white
 * background in light, renders bold+red+white-bg in light. Properties the
 * user never touched in light fall through to their dark value; setting a
 * property in light overrides just that property.
 *
 * Storage stays divergence-only (reducers keep writing through
 * {@link resolveActiveStyle}); the dark→light inheritance is applied here
 * at read time, so flipping `[data-theme]` is still a pure CSS cascade.
 *
 * Note: because light can only OVERRIDE a dark leaf (not remove it), there
 * is no way to set a property in dark yet clear it back to the grid
 * default in light — that's inherent to "inherit + override" semantics.
 */
export function resolveEffectiveStyle(
  themed: ThemedCellStyleOverrides | undefined,
  theme: GridThemeMode,
): CellStyleOverrides | undefined {
  if (!themed) return undefined;
  if (theme === 'dark') return themed.dark;
  return mergeCellStyleOverrides(themed.dark, themed.light);
}

/**
 * Write `next` into the slot for `theme`. Pass `undefined` for `next`
 * to clear just that theme's slot. Returns `undefined` when both slots
 * end up empty so callers can drop the whole field from an assignment.
 */
export function patchActiveStyle(
  themed: ThemedCellStyleOverrides | undefined,
  theme: GridThemeMode,
  next: CellStyleOverrides | undefined,
): ThemedCellStyleOverrides | undefined {
  const base: ThemedCellStyleOverrides = { ...(themed ?? {}) };
  if (next === undefined) {
    delete base[theme];
  } else {
    base[theme] = next;
  }
  return base.dark === undefined && base.light === undefined ? undefined : base;
}

/**
 * Detect legacy flat `CellStyleOverrides` (the pre-theming shape) and
 * lift to `{ dark, light }` with the same value in both slots. Already-
 * themed values pass through. `undefined` stays `undefined`.
 *
 * The legacy shape's known keys (`typography`, `colors`, `alignment`,
 * `borders`) are disjoint from the themed shape's keys (`dark`, `light`),
 * so the discriminator is unambiguous.
 */
export function migrateThemedStyle(
  value: CellStyleOverrides | ThemedCellStyleOverrides | undefined,
): ThemedCellStyleOverrides | undefined {
  if (!value) return undefined;
  if ('dark' in value || 'light' in value) {
    return value as ThemedCellStyleOverrides;
  }
  const flat = value as CellStyleOverrides;
  return { dark: flat, light: flat };
}

/**
 * Merge two themed overrides slot-by-slot using the supplied per-slot
 * merge function. Used by `resolveTemplates` so a base template's dark
 * slot composes with a higher-precedence template's dark slot, and
 * similarly for light, without one ever leaking across.
 */
export function mergeThemedStyle(
  base: ThemedCellStyleOverrides | undefined,
  top: ThemedCellStyleOverrides | undefined,
  mergeOne: (
    a: CellStyleOverrides | undefined,
    b: CellStyleOverrides | undefined,
  ) => CellStyleOverrides | undefined,
): ThemedCellStyleOverrides | undefined {
  if (!base && !top) return undefined;
  const dark = mergeOne(base?.dark, top?.dark);
  const light = mergeOne(base?.light, top?.light);
  if (dark === undefined && light === undefined) return undefined;
  const out: ThemedCellStyleOverrides = {};
  if (dark !== undefined) out.dark = dark;
  if (light !== undefined) out.light = light;
  return out;
}
