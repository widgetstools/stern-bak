import { createContext, createElement, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { applyTheme, getTheme } from '@wellsfargo-starui/design-system';

type ThemeMode = 'dark' | 'light';

interface ThemeModeValue {
  mode: ThemeMode;
  toggle: () => void;
}

const ThemeModeContext = createContext<ThemeModeValue | null>(null);

/**
 * Single shared theme-mode source. Must wrap any tree that both reads `mode`
 * (e.g. to drive the dock's `theme` prop) and toggles it (the ThemeToggle).
 * Without a shared provider each `useThemeMode()` call owns separate state, so
 * a toggle in one component never reaches the dock — leaving panel chrome
 * stuck on the old theme while tokens flip.
 */
export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => getTheme().theme as ThemeMode);
  const toggle = useCallback(() => {
    setMode((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      applyTheme({ ...getTheme(), theme: next }); // spread keeps cvd/variant
      return next;
    });
  }, []);
  const value = useMemo(() => ({ mode, toggle }), [mode, toggle]);
  return createElement(ThemeModeContext.Provider, { value }, children);
}

/** Reads the shared theme mode + toggle. Requires a {@link ThemeModeProvider} ancestor. */
export function useThemeMode(): ThemeModeValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used within a ThemeModeProvider');
  return ctx;
}
