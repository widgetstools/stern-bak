import { widgetProps } from '../testSetupMocks';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getOneByTestId } from '../../../../test-utils/queries';
import * as demoState from '../state/DemoStateProvider';
import * as researchState from '../state/ResearchProvider';
import { OrderEntryForm } from './OrderEntryForm';
import { SectorDonut } from './analytics/SectorDonut';
import { OasDistribution } from './analytics/OasDistribution';
import { NoteDetail } from './research/NoteDetail';
import { OrderDetail } from './orders/OrderDetail';
import { OrdersKpiStrip } from './orders/OrdersKpiStrip';
import OrderBookWidget from './OrderBook';
import { RESEARCH_NOTES, seedState } from '../data/seeds';
import type { Order } from '../data/types';

const baseState = seedState(0);

function mockDemo(overrides: {
  state?: Partial<typeof baseState>;
  selectedId?: string;
  selectedOrderId?: string | null;
} = {}) {
  const state = { ...baseState, ...overrides.state };
  vi.spyOn(demoState, 'useDemoState').mockReturnValue({
    store: { state, live: false, setLive: vi.fn(), intervalMs: 1200, setIntervalMs: vi.fn() },
    selectedId: overrides.selectedId ?? state.instruments[0]?.id ?? '',
    setSelectedId: vi.fn(),
    clickedPrice: null,
    setClickedPrice: vi.fn(),
    selectedOrderId: overrides.selectedOrderId ?? state.orders[0]?.id ?? null,
    setSelectedOrderId: vi.fn(),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('panel branch coverage', () => {
  it('OrderEntryForm submits without handler and handles invalid numeric input', async () => {
    render(<OrderEntryForm state={baseState} />);
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: 'bad', valueAsNumber: NaN } });
    fireEvent.change(inputs[1], { target: { value: '', valueAsNumber: NaN } });
    await userEvent.click(screen.getByRole('button', { name: 'Submit order' }));
  });

  it('SectorDonut falls back when there are no positions', () => {
    mockDemo({ state: { positions: [] } });
    render(<SectorDonut {...widgetProps()} />);
    expect(getOneByTestId('panel-sectorDonut')).toBeInTheDocument();
  });

  it('SectorDonut buckets unknown instruments as Other', () => {
    mockDemo({
      state: {
        positions: [{
          instrumentId: 'missing',
          ticker: 'X',
          qty: 1,
          avgCost: 100,
          marketValue: 1_000_000,
          unrealizedPnl: 0,
          dv01: 1,
        }],
      },
    });
    render(<SectorDonut {...widgetProps()} />);
    expect(getOneByTestId('panel-sectorDonut')).toBeInTheDocument();
  });

  it('OasDistribution uses quote OAS when available', () => {
    const inst = baseState.instruments[0];
    mockDemo({
      state: {
        instruments: [inst],
        quotes: { [inst.id]: { ...baseState.quotes[inst.id], oas: 99 } },
      },
    });
    render(<OasDistribution {...widgetProps()} />);
    expect(getOneByTestId('panel-oasDistribution')).toBeInTheDocument();
  });

  it('NoteDetail shows null OAS target and empty state', () => {
    const nullTarget = RESEARCH_NOTES.find((n) => n.oasTarget === null)!;
    vi.spyOn(researchState, 'useResearchSelection').mockReturnValue({
      selectedNoteId: nullTarget.id,
      setSelectedNoteId: vi.fn(),
    });
    const { unmount } = render(<NoteDetail {...widgetProps()} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    unmount();

    vi.spyOn(researchState, 'useResearchSelection').mockReturnValue({
      selectedNoteId: 'missing-note',
      setSelectedNoteId: vi.fn(),
    });
    render(<NoteDetail {...widgetProps()} />);
    expect(screen.getByText(/Select a note from the list/)).toBeInTheDocument();
  });

  it('OrderDetail covers sell, limit, pending, and empty selection', () => {
    const sellRfq = baseState.orders.find((o) => o.side === 'sell' && o.kind === 'RFQ')!;
    mockDemo({ selectedOrderId: sellRfq.id });
    const { unmount: u1 } = render(<OrderDetail {...widgetProps()} />);
    expect(screen.getByText('T+1')).toBeInTheDocument();
    expect(screen.getByText('SELL')).toBeInTheDocument();
    u1();

    const limit = baseState.orders.find((o) => o.kind === 'Limit')!;
    mockDemo({ selectedOrderId: limit.id });
    const { unmount: u2 } = render(<OrderDetail {...widgetProps()} />);
    expect(screen.getByText('T+2')).toBeInTheDocument();
    u2();

    const pending = baseState.orders.find((o) => o.filled === 0)!;
    mockDemo({ selectedOrderId: pending.id });
    const { unmount: u3 } = render(<OrderDetail {...widgetProps()} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    u3();

    mockDemo({ selectedOrderId: 'missing-order' });
    render(<OrderDetail {...widgetProps()} />);
    expect(screen.getByText(/Select an order to view detail/)).toBeInTheDocument();
  });

  it('OrdersKpiStrip handles empty order book', () => {
    mockDemo({ state: { orders: [] as Order[] } });
    render(<OrdersKpiStrip {...widgetProps()} />);
    expect(getOneByTestId('orders-kpi')).toBeInTheDocument();
  });

  it('OrderBook shows fallback when quote data is missing', () => {
    mockDemo({ state: { quotes: {} }, selectedId: 'missing' });
    render(<OrderBookWidget {...widgetProps()} />);
    expect(screen.getByText(/No instrument selected/)).toBeInTheDocument();
  });
});
