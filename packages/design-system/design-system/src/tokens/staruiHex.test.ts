import { describe, expect, it } from 'vitest';
import { buildAgGridFromStarui, buildShadcnFromStarui, staruiHex } from './staruiHex';

describe('staruiHex', () => {
  it('exports dark palette', () => {
    expect(staruiHex.dark.bg).toBe('#0b0d10');
    expect(staruiHex.dark.accent).toBe('#22d3ee');
  });

  it('exports lightClinical palette', () => {
    expect(staruiHex.lightClinical.bg).toBe('#f4f6f8');
    expect(staruiHex.lightClinical.accent).toBe('#0891b2');
  });

  it('exports lightPaper palette', () => {
    expect(staruiHex.lightPaper.bg).toBe('#efede9');
    expect(staruiHex.lightPaper.accent).toBe('#0e7490');
  });
});

describe('buildShadcnFromStarui', () => {
  it('builds shadcn palette from each hex pack', () => {
    for (const pack of [staruiHex.dark, staruiHex.lightClinical, staruiHex.lightPaper]) {
      const result = buildShadcnFromStarui(pack);
      expect(result.background).toBeDefined();
      expect(result.primary).toBeDefined();
      expect(result.chart5).toBeDefined();
    }
  });

  it('includes all required shadcn tokens for dark pack', () => {
    const result = buildShadcnFromStarui(staruiHex.dark);
    const requiredTokens = [
      'background', 'foreground', 'card', 'cardForeground', 'popover', 'popoverForeground',
      'primary', 'primaryForeground', 'secondary', 'secondaryForeground', 'muted',
      'mutedForeground', 'accent', 'accentForeground', 'destructive', 'destructiveForeground',
      'border', 'input', 'ring', 'sidebarBackground', 'sidebarForeground', 'sidebarPrimary',
      'sidebarPrimaryForeground', 'sidebarAccent', 'sidebarAccentForeground', 'sidebarBorder',
      'sidebarRing', 'chart1', 'chart2', 'chart3', 'chart4', 'chart5',
    ] as const;
    for (const token of requiredTokens) {
      expect(result[token]).toBeDefined();
    }
  });
});

describe('buildAgGridFromStarui', () => {
  it('uses dark odd-row tint when mode is dark', () => {
    const result = buildAgGridFromStarui(staruiHex.dark, 'dark');
    expect(result.odd).toBe('rgba(255,255,255,0.012)');
    expect(result.bg).toBe(staruiHex.dark.bg1);
    expect(result.fg).toBe(staruiHex.dark.t0);
  });

  it('uses light odd-row tint when mode is light', () => {
    const result = buildAgGridFromStarui(staruiHex.lightClinical, 'light');
    expect(result.odd).toBe('rgba(0,0,0,0.014)');
    expect(result.bg).toBe(staruiHex.lightClinical.bg1);
  });

  it('maps all ag-grid tokens for lightPaper in light mode', () => {
    const result = buildAgGridFromStarui(staruiHex.lightPaper, 'light');
    expect(result.inputBg).toBe(staruiHex.lightPaper.bg);
    expect(result.tooltip).toBe(staruiHex.lightPaper.bg3);
    expect(result.toggleOff).toBe(staruiHex.lightPaper.bg3);
  });

  it('includes all required aggrid tokens', () => {
    const result = buildAgGridFromStarui(staruiHex.dark, 'dark');
    const requiredTokens = [
      'bg', 'fg', 'chrome', 'header', 'headerText', 'odd', 'hover', 'sel', 'border',
      'rowBorder', 'accent', 'accentSoft', 'inputBg', 'inputBorder', 'inputFocus', 'menu',
      'menuText', 'menuBorder', 'tooltip', 'tooltipText', 'toggleOff',
    ] as const;
    for (const token of requiredTokens) {
      expect(result[token]).toBeDefined();
    }
  });
});
