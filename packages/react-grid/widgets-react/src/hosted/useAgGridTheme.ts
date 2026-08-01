/**
 * Theme helper for hosted blotters — single source of AG-Grid styling.
 *
 * Composes `themeQuartz.withParams(...)` against the design-system's
 * `agGridBlotter{Light,Dark}Params` preset. No local color, font, or
 * spacing constants live here: updating the design-system preset
 * re-themes every blotter that uses this hook at once.
 *
 * The mode argument has three forms:
 *   - `'light'` / `'dark'` — explicit, no DOM observation.
 *   - `'auto'` (default) — follow the host app's `[data-theme]`
 *     attribute on `<html>`. A MutationObserver keeps the resolved
 *     theme reactive to runtime theme switches.
 *
 * The hook is intentionally provider-agnostic. Different hosts use
 * different theme contexts (next-themes, the reference app's local
 * `ThemeContext`, OpenFin's IAB broadcast); they all converge on
 * `[data-theme]` on `<html>`, which is what this hook reads.
 */

import { useEffect, useMemo, useState } from 'react';
import { themeQuartz, type Theme } from 'ag-grid-community';
import {
  agGridBlotterDarkParams,
  agGridBlotterLightParams,
} from '@wellsfargo-starui/design-system';

export type AgGridThemeMode = 'auto' | 'dark' | 'light';

function readDocumentTheme(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/**
 * Returns the AG-Grid `Theme` object for a hosted blotter, reactive to
 * the host's theme attribute when `mode` is `'auto'`.
 */
export function useAgGridTheme(mode: AgGridThemeMode = 'auto'): Theme {
  const [resolved, setResolved] = useState<'dark' | 'light'>(() =>
    mode === 'auto' ? readDocumentTheme() : mode,
  );

  useEffect(() => {
    if (mode !== 'auto') {
      setResolved(mode);
      return;
    }
    if (typeof document === 'undefined') return;

    setResolved(readDocumentTheme());
    const html = document.documentElement;
    const observer = new MutationObserver(() => {
      setResolved(readDocumentTheme());
    });
    observer.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [mode]);

  const isDark = resolved === 'dark';
  return useMemo(
    () => themeQuartz.withParams(isDark ? agGridBlotterDarkParams : agGridBlotterLightParams),
    [isDark],
  );
}
