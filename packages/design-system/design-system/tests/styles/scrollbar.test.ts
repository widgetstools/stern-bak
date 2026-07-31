import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(
  resolve(__dirname, '../../src/styles/scrollbar.css'),
  'utf8',
);

describe('scrollbar.css', () => {
  it('defines exactly one .ds-scrollbar utility (and its pseudo-elements)', () => {
    // Top-level (non-pseudo) class selectors
    const matches = css.match(/^\.ds-scrollbar\s*\{/gm) ?? [];
    expect(matches.length).toBe(1);
  });

  it('uses color-mix against --ds-text-primary for theme-awareness', () => {
    expect(css).toMatch(/color-mix\(in oklch, oklch\(var\(--foreground\)\)/);
  });

  it('does NOT define a hidden-scrollbar utility', () => {
    expect(css).not.toMatch(/scrollbar-width:\s*none/);
  });

  it('uses minimalist 10px width with 2px transparent border for thumb thickness', () => {
    expect(css).toMatch(/width:\s*10px/);
    expect(css).toMatch(/border:\s*2px\s+solid\s+transparent/);
  });

  it('exempts AG Grid from EVERY global rule — grids keep native composited scrollbars', () => {
    // Any ::-webkit-scrollbar rule that MATCHES a scroller forces
    // Chromium onto the main-thread custom-scrollbar path; overriding
    // properties cannot undo the match. Every global selector must
    // therefore carry the .ag-root-wrapper / .ag-popup :not() guards.
    const globalRules = css.match(/^\*[^{]*\{/gm) ?? [];
    expect(globalRules.length).toBeGreaterThan(0);
    for (const rule of globalRules) {
      expect(rule).toContain(':not(.ag-root-wrapper)');
      expect(rule).toContain(':not(.ag-root-wrapper *)');
      expect(rule).toContain(':not(.ag-popup)');
      expect(rule).toContain(':not(.ag-popup *)');
    }
  });

  it('keeps the global baseline at zero specificity via :where()', () => {
    // The exemption guards must not raise specificity above the bare
    // universal selector, or component-local scrollbar styling
    // (.ds-sheet, .fx-body, …) would stop winning.
    const globalRules = css.match(/^\*[^{]*\{/gm) ?? [];
    for (const rule of globalRules) {
      expect(rule).toMatch(/^\*:where\(/);
    }
  });
});
