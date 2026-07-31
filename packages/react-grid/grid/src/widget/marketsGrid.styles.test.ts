import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('marketsGrid.css', () => {
  const stylesDir = resolve(__dirname, 'styles');
  const css = [
    'marketsGrid.css',
    'marketsGrid-core.css',
    'marketsGrid-chrome.css',
  ].map((f) => readFileSync(resolve(stylesDir, f), 'utf8')).join('\n');

  it('defines center-top grid density pill chrome', () => {
    expect(css).toContain('.ds-density-pill-host');
    expect(css).toContain('.ds-density-pill-chip');
    expect(css).toContain('.ds-density-pill-menu');
  });

  it('keeps AG Grid header and floating-filter controls hidden until interaction', () => {
    expect(css).toContain('[data-grid-id] .ag-header-cell-menu-button');
    expect(css).toContain('[data-grid-id] .ag-header-cell-filter-button');
    expect(css).toContain('[data-grid-id] .ag-floating-filter-button');
    expect(css).toContain('[data-grid-id] .ag-header-cell:hover .ag-header-cell-menu-button');
    expect(css).toContain('[data-grid-id] .ag-header-cell:focus-within .ag-header-cell-filter-button');
    expect(css).toContain("[data-grid-id] .ag-floating-filter-button[aria-expanded='true']");
  });
});
