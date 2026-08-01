import { describe, expect, it } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DemoStateProvider, useDemoState } from './DemoStateProvider';
import { ResearchProvider, useResearchSelection } from './ResearchProvider';
import { RESEARCH_NOTES } from '../data/seeds';

function DemoProbe() {
  const { selectedId, setSelectedId, clickedPrice, setClickedPrice, selectedOrderId, setSelectedOrderId } =
    useDemoState();
  return (
    <div>
      <span data-testid="selected">{selectedId}</span>
      <span data-testid="clicked">{clickedPrice ?? 'none'}</span>
      <span data-testid="order">{selectedOrderId ?? 'none'}</span>
      <button type="button" onClick={() => setSelectedId('i02')}>select</button>
      <button type="button" onClick={() => setClickedPrice(99.5)}>click</button>
      <button type="button" onClick={() => setSelectedOrderId('o2')}>order</button>
    </div>
  );
}

function ResearchProbe() {
  const { selectedNoteId, setSelectedNoteId } = useResearchSelection();
  return (
    <div>
      <span data-testid="note">{selectedNoteId}</span>
      <button type="button" onClick={() => setSelectedNoteId('rn02')}>note</button>
    </div>
  );
}

describe('DemoStateProvider', () => {
  it('provides ticking store and selection state', async () => {
    render(
      <DemoStateProvider>
        <DemoProbe />
      </DemoStateProvider>,
    );
    expect(screen.getByTestId('selected').textContent).toBeTruthy();
    await userEvent.click(screen.getByText('select'));
    expect(screen.getByTestId('selected')).toHaveTextContent('i02');
    await userEvent.click(screen.getByText('click'));
    expect(screen.getByTestId('clicked')).toHaveTextContent('99.5');
    await userEvent.click(screen.getByText('order'));
    expect(screen.getByTestId('order')).toHaveTextContent('o2');
  });

  it('clears clicked price when set to null', async () => {
    function ClearProbe() {
      const { setClickedPrice } = useDemoState();
      return (
        <button type="button" onClick={() => setClickedPrice(null)}>
          clear
        </button>
      );
    }
    render(
      <DemoStateProvider>
        <ClearProbe />
      </DemoStateProvider>,
    );
    await userEvent.click(screen.getByText('clear'));
  });

  it('throws outside provider', () => {
    expect(() => render(<DemoProbe />)).toThrow(/DemoStateProvider/);
  });
});

describe('ResearchProvider', () => {
  it('tracks selected research note', async () => {
    render(
      <ResearchProvider>
        <ResearchProbe />
      </ResearchProvider>,
    );
    expect(screen.getByTestId('note')).toHaveTextContent(RESEARCH_NOTES[0].id);
    await userEvent.click(screen.getByText('note'));
    expect(screen.getByTestId('note')).toHaveTextContent('rn02');
  });

  it('throws outside provider', () => {
    expect(() => render(<ResearchProbe />)).toThrow(/ResearchProvider/);
  });
});

describe('useThemeMode', () => {
  it('throws outside ThemeModeProvider', async () => {
    const { useThemeMode } = await import('../lib/useThemeMode');
    function Bad() {
      useThemeMode();
      return null;
    }
    expect(() => render(<Bad />)).toThrow(/ThemeModeProvider/);
  });
});
