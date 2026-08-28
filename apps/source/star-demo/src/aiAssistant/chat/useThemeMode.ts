/**
 * The resolved light/dark theme, reactively — for the rare component (the
 * heatmap shading) that has to pick a genuinely different value per theme
 * rather than letting a CSS variable resolve it.
 *
 * Three states, same as the rest of the app: an explicit `data-theme` on
 * `<html>` wins; absent that, `prefers-color-scheme` decides. A
 * `MutationObserver` keeps it live across a theme toggle — reading the
 * attribute once on mount would leave the heatmap on the wrong palette until
 * the panel remounts.
 */
import { useEffect, useState } from 'react';

function resolveTheme(): 'light' | 'dark' {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit === 'light' || explicit === 'dark') return explicit;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useThemeMode(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => resolveTheme());

  useEffect(() => {
    const update = () => setTheme(resolveTheme());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener('change', update);
    return () => {
      observer.disconnect();
      media?.removeEventListener('change', update);
    };
  }, []);

  return theme;
}
