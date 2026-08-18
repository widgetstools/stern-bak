import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** The declarations of the rule whose selector list ENDS with `selector`. */
function block(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  if (at === -1) throw new Error(`no rule for ${selector}`);
  return css.slice(at, css.indexOf('}', at));
}

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

  /**
   * The pill floats over the toolbar and is as tall as the chip PLUS the menu,
   * and the menu keeps its box while closed. A wrapper that takes pointer
   * events therefore covers whatever sits beneath it — this is what stopped the
   * alerts bell from being clickable in the lab app.
   */
  it('leaves the density pill wrapper out of hit-testing', () => {
    const wrapper = block(css, '.ds-density-pill');
    expect(wrapper).toContain('pointer-events: none');
  });

  it('makes the density chip itself clickable', () => {
    expect(block(css, '.ds-density-pill-chip')).toContain('pointer-events: auto');
  });

  it('keeps the open menu clickable, and bridges the gap below the chip', () => {
    // Without the bridge the pointer crosses dead space between chip and menu
    // and `:hover` drops before it arrives.
    expect(css).toContain('.ds-density-pill-menu::before');
    expect(
      block(css, ".ds-density-pill[data-open='true'] .ds-density-pill-menu"),
    ).toContain('pointer-events: auto');
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
