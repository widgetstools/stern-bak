import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AnalysisTable } from './AnalysisTable.js';

const ROWS = [
  { sector: 'Tech', marketValue: 300 },
  { sector: 'Financials', marketValue: 12_000 },
  { sector: 'Energy', marketValue: 500 },
];

function bodyRows() {
  const table = screen.getByRole('table');
  const rows = within(table).getAllByRole('row');
  return rows.slice(1); // drop the header row
}

describe('AnalysisTable', () => {
  it('renders every column as a header and every row as a body row', () => {
    render(<AnalysisTable columns={['sector', 'marketValue']} rows={ROWS} />);
    expect(screen.getByRole('columnheader', { name: 'sector' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'marketValue' })).toBeTruthy();
    expect(bodyRows()).toHaveLength(3);
  });

  /**
   * Cells format with the COLUMN's own format now, not a blanket compact
   * magnitude. `marketValue` scales to millions, but 12,000 would become
   * "0.01M" — scaled below one whole unit and harder to read than the number
   * it replaced — so the guard falls back to a separated integer.
   */
  it('formats numbers with the column\'s own format', () => {
    render(<AnalysisTable columns={['sector', 'marketValue']} rows={ROWS} />);
    expect(screen.getByText('12,000')).toBeTruthy();
  });

  it('shows the empty-result message rather than a bare table', () => {
    render(<AnalysisTable columns={['sector']} rows={[]} />);
    expect(screen.getByText('No rows matched.')).toBeTruthy();
  });

  it('right-aligns a numeric column, left-aligns a text one', () => {
    render(<AnalysisTable columns={['sector', 'marketValue']} rows={ROWS} />);
    expect(screen.getByRole('columnheader', { name: 'marketValue' }).className).toContain('text-right');
    expect(screen.getByRole('columnheader', { name: 'sector' }).className).not.toContain('text-right');
  });

  it('sorts descending on first click, ascending on second, and clears on a third', async () => {
    const user = userEvent.setup();
    render(<AnalysisTable columns={['sector', 'marketValue']} rows={ROWS} />);
    const header = screen.getByRole('columnheader', { name: /marketValue/ });

    await user.click(header);
    expect(bodyRows()[0].textContent).toContain('Financials'); // 12,000 — largest first

    await user.click(header);
    expect(bodyRows()[0].textContent).toContain('Tech'); // 300 — smallest first

    await user.click(header);
    expect(bodyRows()[0].textContent).toContain('Tech'); // back to the input's own order
  });

  it('freezes the leading columns in place for pivot row labels', () => {
    render(<AnalysisTable columns={['sector', 'marketValue']} rows={ROWS} stickyLeadingCols={1} />);
    const [sectorHeader, valueHeader] = screen.getAllByRole('columnheader');
    expect(sectorHeader.style.position).toBe('sticky');
    expect(sectorHeader.style.left).toBe('0px');
    // The header row is always sticky-top; only the frozen column also gets
    // a sticky LEFT — the un-frozen column must not.
    expect(valueHeader.style.left).toBe('');
  });

  it('shades numeric cells by magnitude when heatmap is on, and leaves them plain otherwise', () => {
    const { rerender } = render(<AnalysisTable columns={['sector', 'marketValue']} rows={ROWS} />);
    const plainCell = screen.getByText('12,000').closest('td')!;
    expect(plainCell.style.backgroundColor).toBe('');

    rerender(<AnalysisTable columns={['sector', 'marketValue']} rows={ROWS} heatmap />);
    const shadedCell = screen.getByText('12,000').closest('td')!;
    expect(shadedCell.style.backgroundColor).toContain('oklch');
  });

  it('does not shade a text column even in heatmap mode', () => {
    render(<AnalysisTable columns={['sector', 'marketValue']} rows={ROWS} heatmap />);
    const textCell = screen.getByText('Tech').closest('td')!;
    expect(textCell.style.backgroundColor).toBe('');
  });
});

/**
 * A 500-row result — the query engine's hard cap — is 4,000 cells, and React
 * re-renders every one on each live tick, not only on a scroll. Measured at 6x
 * CPU throttle, one full re-render of 500x8 took 841ms.
 *
 * Windowing was chosen over a canvas grid deliberately: a canvas renderer
 * earns its keep in the tens of thousands of rows, and would have cost text
 * selection, find-in-page, the sticky header and the frozen columns to save a
 * table that can never exceed 500.
 */
describe('long results are windowed', () => {
  const columns = ['desk', 'pnl'];
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ desk: `D${i}`, pnl: i }));

  /** jsdom lays nothing out, so the scroll box measures 0 high and the window
   *  is whatever fits in nothing, plus the overscan. What matters here is that
   *  it is far short of the row count. */
  it('renders a fraction of a long result, not all of it', () => {
    const { container } = render(<AnalysisTable columns={columns} rows={many(500)} className="h-40" />);
    const rendered = container.querySelectorAll('tbody tr[class]').length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(100);
  });

  /** Every row not rendered is still accounted for, so the scrollbar and each
   *  row's position are exactly where they would be if all were drawn. */
  it('stands the rows it skipped up as spacers', () => {
    const { container } = render(<AnalysisTable columns={columns} rows={many(500)} className="h-40" />);
    const spacers = [...container.querySelectorAll('tbody tr[aria-hidden]')];
    expect(spacers.length).toBeGreaterThan(0);
    const padded = spacers.reduce((sum, el) => sum + parseFloat((el as HTMLElement).style.height || '0'), 0);
    expect(padded).toBeGreaterThan(0);
  });

  /** Short results are the common case — the engine's default limit is 50 —
   *  and must not pay for a mechanism they do not need. */
  it('renders a short result whole, with no spacers at all', () => {
    const { container } = render(<AnalysisTable columns={columns} rows={many(20)} />);
    expect(container.querySelectorAll('tbody tr[class]')).toHaveLength(20);
    expect(container.querySelectorAll('tbody tr[aria-hidden]')).toHaveLength(0);
  });

  /** Sorting reorders the whole result, not just the rows on screen. */
  it('sorts across every row, not only the window', async () => {
    const user = userEvent.setup();
    const { container } = render(<AnalysisTable columns={columns} rows={many(500)} className="h-40" />);
    await user.click(container.querySelectorAll('thead th')[1]);
    // Descending by pnl puts the LAST generated row first.
    expect(container.querySelector('tbody tr[class] td')?.textContent).toBe('D499');
  });
});
