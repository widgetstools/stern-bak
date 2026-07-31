import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyTheme, getTheme } from '../src/applyTheme';

describe('applyTheme', () => {
  beforeEach(() => {
    // jsdom-less environment: stub document
    (globalThis as any).document = { documentElement: { setAttribute: vi.fn(), removeAttribute: vi.fn() } };
    (globalThis as any).localStorage = (() => {
      const store = new Map<string, string>();
      return {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      };
    })();
  });

  it('sets data-theme="dark" on <html>', () => {
    applyTheme({ theme: 'dark' });
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
  });

  it('sets data-theme="light" on <html>', () => {
    applyTheme({ theme: 'light' });
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
  });

  it('sets data-cvd="on" when cvd: true', () => {
    applyTheme({ theme: 'dark', cvd: true });
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-cvd', 'on');
  });

  it('removes data-cvd when cvd: false', () => {
    applyTheme({ theme: 'dark', cvd: false });
    expect(document.documentElement.removeAttribute).toHaveBeenCalledWith('data-cvd');
  });

  it('persists theme under the canonical "starui:theme" key as a bare string', () => {
    applyTheme({ theme: 'light', cvd: true });
    // Theme reducer expects the canonical key to hold just 'dark' | 'light'
    // — same value the RuntimePort reads/writes on every cross-window
    // broadcast. CVD goes under a separate key so the theme key stays
    // a plain string.
    expect(localStorage.getItem('starui:theme')).toBe('light');
    expect(localStorage.getItem('starui:cvd')).toBe('on');
  });

  it('clears "starui:cvd" when cvd is false', () => {
    applyTheme({ theme: 'light', cvd: true });
    applyTheme({ theme: 'light', cvd: false });
    expect(localStorage.getItem('starui:cvd')).toBeNull();
  });

  it('getTheme reads back theme + cvd from canonical keys', () => {
    applyTheme({ theme: 'light', cvd: true });
    expect(getTheme()).toEqual({ theme: 'light', cvd: true, variant: 'clinical' });
  });

  it('getTheme omits cvd when not persisted', () => {
    applyTheme({ theme: 'light', cvd: false });
    expect(getTheme()).toEqual({ theme: 'light', variant: 'clinical' });
  });

  it('sets data-variant="clinical" on light by default', () => {
    applyTheme({ theme: 'light' });
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-variant', 'clinical');
  });

  it('sets data-variant="paper" when variant: paper', () => {
    applyTheme({ theme: 'light', variant: 'paper' });
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-variant', 'paper');
  });

  it('removes data-variant on dark theme', () => {
    applyTheme({ theme: 'dark' });
    expect(document.documentElement.removeAttribute).toHaveBeenCalledWith('data-variant');
  });

  it('persists variant under starui:variant for light', () => {
    applyTheme({ theme: 'light', variant: 'paper' });
    expect(localStorage.getItem('starui:variant')).toBe('paper');
  });

  it('getTheme reads back variant for light', () => {
    applyTheme({ theme: 'light', variant: 'paper' });
    expect(getTheme()).toEqual({ theme: 'light', variant: 'paper' });
  });

  it('getTheme returns dark default when nothing persisted', () => {
    localStorage.removeItem('starui:theme');
    localStorage.removeItem('starui:cvd');
    expect(getTheme()).toEqual({ theme: 'dark' });
  });

  it('migrates from the legacy "@wellsfargo-starui/theme" JSON blob on first read', () => {
    // Pre-existing user with the old JSON-blob storage layout.
    localStorage.setItem('@wellsfargo-starui/theme', JSON.stringify({ theme: 'light', cvd: true }));
    expect(getTheme()).toEqual({ theme: 'light', cvd: true, variant: 'clinical' });
    // The next applyTheme() rewrites under the canonical keys and clears
    // the legacy blob so we don't keep reading it.
    applyTheme({ theme: 'light', cvd: true });
    expect(localStorage.getItem('starui:theme')).toBe('light');
    expect(localStorage.getItem('starui:cvd')).toBe('on');
    expect(localStorage.getItem('@wellsfargo-starui/theme')).toBeNull();
  });
});
