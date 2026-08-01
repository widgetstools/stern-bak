/**
 * Tests for the dark→light inheritance fold. Dark is the canonical base;
 * light renders the dark slot with its own leaves overriding. Storage
 * stays divergence-only (reducers write through `resolveActiveStyle`), so
 * these tests pin the read-time `resolveEffectiveStyle` behaviour that the
 * render transform relies on.
 */
import { describe, expect, it } from 'vitest';
import type { CellStyleOverrides, ThemedCellStyleOverrides } from './types';
import {
  getActiveTheme,
  mergeCellStyleOverrides,
  mergeThemedStyle,
  migrateThemedStyle,
  patchActiveStyle,
  resolveActiveStyle,
  resolveEffectiveStyle,
} from './themedStyle';

describe('resolveEffectiveStyle', () => {
  it('returns the dark slot verbatim for the dark theme', () => {
    const dark: CellStyleOverrides = {
      typography: { bold: true },
      colors: { text: '#ff0000' },
    };
    const themed: ThemedCellStyleOverrides = { dark };
    expect(resolveEffectiveStyle(themed, 'dark')).toBe(dark);
  });

  it('light inherits dark and overrides only its own leaves', () => {
    // Authored bold + red in dark, then only a white background in light.
    const themed: ThemedCellStyleOverrides = {
      dark: { typography: { bold: true }, colors: { text: '#ff0000' } },
      light: { colors: { background: '#ffffff' } },
    };
    expect(resolveEffectiveStyle(themed, 'light')).toEqual({
      typography: { bold: true },
      // text inherited from dark, background overridden in light
      colors: { text: '#ff0000', background: '#ffffff' },
      alignment: undefined,
      borders: undefined,
    });
  });

  it("light's leaf wins over dark's same leaf", () => {
    const themed: ThemedCellStyleOverrides = {
      dark: { colors: { text: '#ff0000' } },
      light: { colors: { text: '#0000ff' } },
    };
    expect(resolveEffectiveStyle(themed, 'light')?.colors).toEqual({
      text: '#0000ff',
    });
  });

  it('light still renders standalone when dark slot is empty', () => {
    const themed: ThemedCellStyleOverrides = {
      light: { typography: { italic: true } },
    };
    expect(resolveEffectiveStyle(themed, 'light')).toEqual({
      typography: { italic: true },
    });
  });

  it('returns undefined when nothing is set', () => {
    expect(resolveEffectiveStyle(undefined, 'light')).toBeUndefined();
    expect(resolveEffectiveStyle({}, 'dark')).toBeUndefined();
  });

  it('does not mutate the stored slots (divergence preserved)', () => {
    const themed: ThemedCellStyleOverrides = {
      dark: { typography: { bold: true } },
      light: { colors: { background: '#fff' } },
    };
    resolveEffectiveStyle(themed, 'light');
    // The own-slot reads (what reducers and editors use) are untouched.
    expect(resolveActiveStyle(themed, 'dark')).toEqual({
      typography: { bold: true },
    });
    expect(resolveActiveStyle(themed, 'light')).toEqual({
      colors: { background: '#fff' },
    });
  });
});

describe('getActiveTheme', () => {
  it('reads data-theme from document and falls back to dark', () => {
    document.documentElement.dataset.theme = 'light';
    expect(getActiveTheme()).toBe('light');
    delete document.documentElement.dataset.theme;
    expect(getActiveTheme()).toBe('dark');
  });
});

describe('patchActiveStyle and migrateThemedStyle', () => {
  it('patches and clears individual theme slots', () => {
    const themed = patchActiveStyle(undefined, 'dark', { colors: { text: '#000' } });
    expect(resolveActiveStyle(themed, 'dark')?.colors?.text).toBe('#000');
    expect(patchActiveStyle(themed, 'dark', undefined)).toBeUndefined();
  });

  it('lifts legacy flat overrides into both theme slots', () => {
    const flat = { typography: { bold: true } };
    expect(migrateThemedStyle(flat)).toEqual({ dark: flat, light: flat });
    expect(migrateThemedStyle({ dark: flat })).toEqual({ dark: flat });
  });
});

describe('mergeThemedStyle', () => {
  it('merges slots independently via the supplied merge function', () => {
    const merged = mergeThemedStyle(
      { dark: { colors: { text: '#000' } } },
      { light: { colors: { background: '#fff' } } },
      mergeCellStyleOverrides,
    );
    expect(merged).toEqual({
      dark: { colors: { text: '#000' } },
      light: { colors: { background: '#fff' } },
    });
  });
});

describe('mergeCellStyleOverrides', () => {
  it('borders merge per-side, not per-property within a side', () => {
    const base: CellStyleOverrides = {
      borders: { top: { width: 1, color: '#000', style: 'solid' } },
    };
    const top: CellStyleOverrides = {
      borders: { bottom: { width: 2, color: '#fff', style: 'dashed' } },
    };
    expect(mergeCellStyleOverrides(base, top)?.borders).toEqual({
      top: { width: 1, color: '#000', style: 'solid' },
      bottom: { width: 2, color: '#fff', style: 'dashed' },
    });
  });

  it('returns the lone side when only one input is present', () => {
    const only: CellStyleOverrides = { colors: { text: '#abc' } };
    expect(mergeCellStyleOverrides(undefined, only)).toBe(only);
    expect(mergeCellStyleOverrides(only, undefined)).toBe(only);
    expect(mergeCellStyleOverrides(undefined, undefined)).toBeUndefined();
  });
});
