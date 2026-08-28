import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AnalysisPanel, type AnalysisEntry } from './AnalysisPanel';
import { DATA_CELL, type DataCellPayload } from '../dataTools';

// Payloads deliberately carry no `digest`/`table` — chartFor() then never
// resolves a chart shape, so DataResultCell never reaches DataChart/recharts,
// which needs the dual-React mocking DataResultCell.test.tsx documents. What's
// under test here is entry selection, not the cell's own rendering.
function payload(over: Partial<DataCellPayload> = {}): DataCellPayload {
  return { kind: DATA_CELL, gridName: 'TestGrid', source: 'live', provenance: 'live', rowCount: 3, ran: '3 rows', ...over };
}

const ENTRIES: AnalysisEntry[] = [
  { id: 'it-1', payload: payload({ gridName: 'Axe Blotter', ran: 'grouped by sector' }) },
  { id: 'it-2', payload: payload({ gridName: 'Credit Blotter', ran: 'pivoted: rows by desk, columns by ccy' }) },
];

describe('AnalysisPanel — empty state', () => {
  it('invites the user to ask for something rather than showing a blank pane', () => {
    render(<AnalysisPanel entries={[]} activeId={null} onSelect={vi.fn()} />);
    expect(screen.getByText(/Analysis results open here/)).toBeTruthy();
  });
});

describe('AnalysisPanel — one entry', () => {
  it('renders it without a tab strip — nothing to switch between', () => {
    render(<AnalysisPanel entries={ENTRIES.slice(0, 1)} activeId="it-1" onSelect={vi.fn()} />);
    expect(screen.getByText('Axe Blotter')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Axe Blotter' })).toBeNull();
  });
});

describe('AnalysisPanel — several entries', () => {
  it('shows the active entry and a tab per entry', () => {
    render(<AnalysisPanel entries={ENTRIES} activeId="it-1" onSelect={vi.fn()} />);
    expect(screen.getByText('grouped by sector')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Axe Blotter' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Credit Blotter' })).toBeTruthy();
  });

  it('reports the clicked entry id, not its own guess', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AnalysisPanel entries={ENTRIES} activeId="it-1" onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'Credit Blotter' }));

    expect(onSelect).toHaveBeenCalledWith('it-2');
  });

  it('falls back to the newest entry when activeId matches none of them', () => {
    render(<AnalysisPanel entries={ENTRIES} activeId="it-does-not-exist" onSelect={vi.fn()} />);
    expect(screen.getByText('pivoted: rows by desk, columns by ccy')).toBeTruthy();
  });
});
