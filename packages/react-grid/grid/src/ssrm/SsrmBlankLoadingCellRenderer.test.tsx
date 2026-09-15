import { render } from '@testing-library/react';
import { SsrmBlankLoadingCellRenderer } from './SsrmBlankLoadingCellRenderer';

/**
 * AG Grid's default loading renderer paints "Loading…" into every cell of an
 * un-fetched block. At the target workload — 20k rows, blocks arriving
 * continuously — that is a visible grey flicker across the viewport on every
 * scroll. The blotters register this instead, so an un-fetched block reads as
 * an empty row rather than a wall of placeholder text.
 */
describe('SsrmBlankLoadingCellRenderer', () => {
  it('renders nothing at all', () => {
    const { container } = render(<SsrmBlankLoadingCellRenderer />);
    expect(container.firstChild).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('returns null when AG Grid calls it as a plain function', () => {
    // AG Grid may invoke a renderer directly rather than mounting it; the
    // contract is a null return either way, not an element with no children.
    expect(SsrmBlankLoadingCellRenderer()).toBeNull();
  });
});
