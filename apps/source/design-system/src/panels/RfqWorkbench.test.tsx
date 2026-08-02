import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getOneByText } from '../../../../test-utils/queries';
import { DemoStateProvider } from '../state/DemoStateProvider';
import { RfqWorkbench } from './RfqWorkbench';
import { OrderEntryForm } from './OrderEntryForm';
import { seedState } from '../data/seeds';

describe('OrderEntryForm', () => {
  it('submits order values via react-hook-form', async () => {
    const onSubmit = vi.fn();
    const state = seedState(0);
    render(<OrderEntryForm state={state} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Submit order' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        instrumentId: state.instruments[0].id,
        side: 'buy',
        qty: 1_000_000,
        price: 100,
      }),
    );
  });

  it('changes side via toggle group', async () => {
    const onSubmit = vi.fn();
    render(<OrderEntryForm state={seedState(0)} onSubmit={onSubmit} />);
    for (const sellBtn of screen.getAllByRole('button', { name: 'Sell' })) {
      await userEvent.click(sellBtn);
    }
    for (const submitBtn of screen.getAllByRole('button', { name: 'Submit order' })) {
      await userEvent.click(submitBtn);
      if (onSubmit.mock.calls.length > 0) break;
    }
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ side: 'sell' }));
  });
});

describe('RfqWorkbench', () => {
  function renderWorkbench() {
    return render(
      <DemoStateProvider>
        <RfqWorkbench />
      </DemoStateProvider>,
    );
  }

  it('shows empty history and quote ladder placeholder', () => {
    renderWorkbench();
    expect(getOneByText('No active RFQs')).toBeInTheDocument();
    expect(getOneByText('Select an RFQ to view quotes')).toBeInTheDocument();
  });

  it('sends an RFQ and populates history', () => {
    vi.useFakeTimers();
    renderWorkbench();
    for (const btn of screen.getAllByRole('button', { name: /Send RFQ/i })) {
      fireEvent.click(btn);
    }
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(getOneByText(/Active \(1\)/)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('toggles dealers, size presets, and side', () => {
    renderWorkbench();
    fireEvent.click(screen.getAllByRole('button', { name: 'GS' })[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: '10' })[0]!);
    fireEvent.change(screen.getAllByPlaceholderText('Custom MM')[0]!, { target: { value: '12' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'sell' })[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: /Send RFQ/i })[0]!);
  });

  it('runs quote ladder interactions after quotes arrive', () => {
    vi.useFakeTimers();
    renderWorkbench();
    for (const btn of screen.getAllByRole('button', { name: /Send RFQ/i })) {
      fireEvent.click(btn);
    }

    act(() => {
      for (let i = 0; i < 20; i++) vi.advanceTimersByTime(1000);
    });

    const historyItem = screen.getAllByRole('button').find((b) => b.textContent?.includes('MM ·'));
    if (historyItem) fireEvent.click(historyItem);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    const hits = screen.queryAllByRole('button', { name: 'HIT' });
    const lifts = screen.queryAllByRole('button', { name: 'LIFT' });
    if (hits[0]) fireEvent.click(hits[0]);
    if (lifts[0]) fireEvent.click(lifts[0]);

    const cancel = screen.queryAllByRole('button', { name: 'Cancel' })[0];
    if (cancel) fireEvent.click(cancel);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    const clear = screen.queryAllByRole('button', { name: 'Clear' })[0];
    if (clear) fireEvent.click(clear);

    vi.useRealTimers();
  });
});
