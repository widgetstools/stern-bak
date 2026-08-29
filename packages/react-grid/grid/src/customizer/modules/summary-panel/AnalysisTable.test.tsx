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

  it('formats numbers compactly, the same as the stat cards', () => {
    render(<AnalysisTable columns={['sector', 'marketValue']} rows={ROWS} />);
    expect(screen.getByText('12.0K')).toBeTruthy();
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
    const plainCell = screen.getByText('12.0K').closest('td')!;
    expect(plainCell.style.backgroundColor).toBe('');

    rerender(<AnalysisTable columns={['sector', 'marketValue']} rows={ROWS} heatmap />);
    const shadedCell = screen.getByText('12.0K').closest('td')!;
    expect(shadedCell.style.backgroundColor).toContain('oklch');
  });

  it('does not shade a text column even in heatmap mode', () => {
    render(<AnalysisTable columns={['sector', 'marketValue']} rows={ROWS} heatmap />);
    const textCell = screen.getByText('Tech').closest('td')!;
    expect(textCell.style.backgroundColor).toBe('');
  });
});
