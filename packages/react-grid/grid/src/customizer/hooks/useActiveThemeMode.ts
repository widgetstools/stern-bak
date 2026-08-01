/**
 * `useActiveThemeMode` — reactive subscription to `<html data-theme="…">`.
 *
 * Reads the active host theme (`'dark'` | `'light'`) and re-renders the
 * caller whenever the attribute flips. Editor surfaces that show
 * theme-scoped state (formatter toolbar readout, ColumnSettingsPanel
 * style band) use this so the on/off / colour swatches reflect the
 * theme the user is currently viewing.
 *
 * The transform layer doesn't need this hook — it emits CSS rules for
 * both theme slots scoped by `html[data-theme="…"]`, so theme switches
 * are handled by the browser cascade with no rebuild.
 */
import { useEffect, useState } from 'react';
import { getActiveTheme, type GridThemeMode } from '@wellsfargo-starui/core';

/** Subscribe to `<html data-theme>` changes. SSR-safe — returns a no-op
 *  cleanup when `document` is unavailable. */
export function subscribeActiveThemeMode(setMode: (mode: GridThemeMode) => void): () => void {
  if (typeof document === 'undefined') return () => {};
  setMode(getActiveTheme());
  const html = document.documentElement;
  const observer = new MutationObserver(() => setMode(getActiveTheme()));
  observer.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

export function useActiveThemeMode(): GridThemeMode {
  const [mode, setMode] = useState<GridThemeMode>(getActiveTheme);

  useEffect(() => subscribeActiveThemeMode(setMode), []);

  return mode;
}
