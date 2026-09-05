import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(
  resolve(__dirname, '../../src/styles/ag-grid.css'),
  'utf8',
);

describe('ag-grid.css', () => {
  it('forces mono on header label elements', () => {
    expect(css).toMatch(/\.ag-header-cell-text/);
    expect(css).toMatch(/font-family:\s*var\(--font-mono/);
  });

  it('enables tabular numerics on headers', () => {
    expect(css).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  it('styles floating filter inputs with OKLCH tokens', () => {
    expect(css).toMatch(/\.ag-floating-filter-body \.ag-input-field-input/);
    expect(css).toMatch(/\.ag-floating-filter-body \.ag-text-field-input/);
    expect(css).toMatch(/background-color:\s*oklch\(var\(--card\)\)/);
  });

  it('does not paint the floating filter wrapper', () => {
    // `.ag-floating-filter-input` is the wrapper div AG Grid sizes for
    // height/padding, ~3px taller and wider than the input inside it. Giving
    // it a background draws a square-cornered block around every floating
    // filter that reads as a dark halo. Match on comment-stripped CSS so the
    // rationale comment above the rule can name the class without passing.
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(withoutComments).not.toMatch(/\.ag-floating-filter-input/);
  });
});
