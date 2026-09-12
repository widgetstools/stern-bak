import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ParityMatrixTab } from './ParityMatrixTab';
import { SsrmParityBadge } from './SsrmParityBadge';
import { PARITY, parityFor } from './parityNotes';

describe('ParityMatrixTab', () => {
  it('renders one row per feature and navigates on click', () => {
    const onNavigate = vi.fn();
    render(<ParityMatrixTab onNavigate={onNavigate} />);
    for (const entry of PARITY) {
      expect(screen.getByTestId(`parity-row-${entry.tabId}`)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByTestId('parity-row-bulk-update'));
    expect(onNavigate).toHaveBeenCalledWith('bulk-update');
  });
});

describe('SsrmParityBadge', () => {
  it('shows the verdict collapsed and the mechanisms when expanded', () => {
    const entry = parityFor('calc')!;
    render(<SsrmParityBadge entry={entry} />);
    expect(screen.getByText(entry.summary)).toBeInTheDocument();
    expect(screen.queryByText(entry.notes[0])).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(entry.notes[0])).toBeInTheDocument();
  });
});
