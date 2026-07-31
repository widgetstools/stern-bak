import { describe, expect, it } from 'vitest';
import { buildCellChangeFlashCss } from './cellChangeFlashCss';

describe('buildCellChangeFlashCss', () => {
  it('scopes the AG-Grid flash variable to the grid wrapper per theme', () => {
    const css = buildCellChangeFlashCss('blotter-1', 'emerald');
    expect(css).toContain('[data-grid-id="blotter-1"] .ag-root-wrapper');
    expect(css).toContain('--ag-value-change-value-highlight-background-color: rgba(16, 185, 129, 0.38)');
    expect(css).toContain('--ag-value-change-value-highlight-background-color: rgba(16, 185, 129, 0.32)');
  });

  it('escapes double quotes in grid ids', () => {
    const css = buildCellChangeFlashCss('grid"bad', 'amber');
    expect(css).toContain('[data-grid-id="grid\\"bad"]');
  });
});
