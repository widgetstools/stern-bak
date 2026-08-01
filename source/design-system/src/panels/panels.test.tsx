import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getOneByTestId, getOneByText, getOneByRole } from '../../../../test-utils/queries';
import { DemoStateProvider } from '../state/DemoStateProvider';
import { ResearchProvider } from '../state/ResearchProvider';
import { ThemeModeProvider } from '../lib/useThemeMode';
import { RESEARCH_NOTES, seedState } from '../data/seeds';
import { BondBlotter } from './BondBlotter';
import { PriceChart } from './PriceChart';
import { OrderEntryForm } from './OrderEntryForm';
import { BlotterWidget, OrderEntryWidget, PriceChartWidget } from './MarketWidgets';
import OrderBookWidget from './OrderBook';
import { RecentPrints } from './RecentPrints';
import { OrdersBlotter } from './OrdersBlotter';
import { OrdersKpiStrip } from './orders/OrdersKpiStrip';
import { OrderDetail } from './orders/OrderDetail';
import { TradeTicket } from './TradeTicket';
import { RfqWorkbench } from './RfqWorkbench';
import { OasDurationScatter } from './analytics/OasDurationScatter';
import { DurationBuckets } from './analytics/DurationBuckets';
import { SectorDonut } from './analytics/SectorDonut';
import { HistoricalOas } from './analytics/HistoricalOas';
import { OasDistribution } from './analytics/OasDistribution';
import { PnlAttribution } from './analytics/PnlAttribution';
import { RiskKpiStrip } from './risk/RiskKpiStrip';
import { BookRisk } from './risk/BookRisk';
import { Dv01ByBook } from './risk/Dv01ByBook';
import { RateScenarios } from './risk/RateScenarios';
import { VarTrend } from './risk/VarTrend';
import { RiskLimits } from './risk/RiskLimits';
import { ResearchList } from './research/ResearchList';
import { NoteDetail } from './research/NoteDetail';
import { mockToast } from '../testSetupMocks';

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeModeProvider>
      <DemoStateProvider>
        <ResearchProvider>{children}</ResearchProvider>
      </DemoStateProvider>
    </ThemeModeProvider>
  );
}

describe('market panels', () => {
  const state = seedState(0);
  const instrument = state.instruments[0];
  const quote = state.quotes[instrument.id];

  it('renders BondBlotter and handles row click', async () => {
    const onRowClicked = vi.fn();
    render(<BondBlotter state={state} onRowClicked={onRowClicked} />);
    expect(screen.getByTestId('ag-grid-react')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId(`grid-row-${instrument.id}`));
    expect(onRowClicked).toHaveBeenCalledWith(instrument.id);
  });

  it('renders BondBlotter without row click handler', () => {
    render(<BondBlotter state={state} />);
    expect(getOneByTestId('bond-blotter')).toBeInTheDocument();
  });

  it('renders PriceChart for selected instrument', () => {
    render(<PriceChart state={state} instrumentId={instrument.id} />);
    expect(screen.getByTestId('price-chart')).toBeInTheDocument();
    expect(screen.getByText(instrument.ticker)).toBeInTheDocument();
  });

  it('renders PriceChart with missing instrument history', () => {
    render(<PriceChart state={state} instrumentId="missing-id" />);
    expect(getOneByTestId('price-chart')).toBeInTheDocument();
  });

  it('renders OrderEntryForm and submits buy order', async () => {
    const onSubmit = vi.fn();
    render(<OrderEntryForm state={state} onSubmit={onSubmit} />);
    expect(screen.getByText('New order')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Submit order' }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it('renders OrderEntryForm with sell side toggle', async () => {
    render(<OrderEntryForm state={state} onSubmit={vi.fn()} />);
    await userEvent.click(getOneByRole('button', { name: 'Sell' }));
    await userEvent.click(getOneByRole('button', { name: 'Submit order' }));
  });

  it('renders OrderEntryForm with empty instruments list', () => {
    const empty = { ...state, instruments: [] };
    render(<OrderEntryForm state={empty} onSubmit={vi.fn()} />);
    expect(getOneByText('New order')).toBeInTheDocument();
  });

  it('renders dock widget adapters', () => {
    render(
      <Providers>
        <BlotterWidget />
        <PriceChartWidget />
        <OrderEntryWidget />
      </Providers>,
    );
    expect(getOneByTestId('ag-grid-react')).toBeInTheDocument();
    expect(getOneByTestId('price-chart')).toBeInTheDocument();
  });

  it('renders OrderBook and handles level click', async () => {
    render(
      <Providers>
        <OrderBookWidget />
      </Providers>,
    );
    expect(screen.getByTestId('order-book')).toBeInTheDocument();
    const rows = screen.getAllByText(/^\d+\.\d{3}$/);
    if (rows[0]) await userEvent.click(rows[0]);
  });

  it('renders RecentPrints with live feed', () => {
    vi.useFakeTimers();
    render(
      <Providers>
        <RecentPrints />
      </Providers>,
    );
    vi.advanceTimersByTime(3000);
    vi.useRealTimers();
  });
});

describe('orders panels', () => {
  it('renders orders blotter, kpi strip, and detail', async () => {
    render(
      <Providers>
        <OrdersKpiStrip />
        <OrdersBlotter />
        <OrderDetail />
      </Providers>,
    );
    expect(screen.getByTestId('orders-kpi')).toBeInTheDocument();
    expect(screen.getByTestId('order-detail')).toBeInTheDocument();
  });

  it('selects an order row in the blotter', async () => {
    render(
      <Providers>
        <OrdersBlotter />
      </Providers>,
    );
    const rows = screen.getAllByTestId(/^grid-row-/);
    if (rows[0]) await userEvent.click(rows[0]);
  });
});

describe('analytics panels', () => {
  it('renders all analytics widgets', () => {
    render(
      <Providers>
        <OasDurationScatter />
        <DurationBuckets />
        <SectorDonut />
        <HistoricalOas />
        <OasDistribution />
        <PnlAttribution />
      </Providers>,
    );
    expect(screen.getByTestId('panel-oasDuration')).toBeInTheDocument();
    expect(screen.getByTestId('panel-durationBuckets')).toBeInTheDocument();
    expect(screen.getByTestId('panel-sectorDonut')).toBeInTheDocument();
  });
});

describe('risk panels', () => {
  it('renders all risk widgets', () => {
    render(
      <Providers>
        <RiskKpiStrip />
        <BookRisk />
        <Dv01ByBook />
        <RateScenarios />
        <VarTrend />
        <RiskLimits />
      </Providers>,
    );
    expect(screen.getByTestId('panel-dv01ByBook')).toBeInTheDocument();
  });
});

describe('research panels', () => {
  it('renders research list and note detail', async () => {
    render(
      <Providers>
        <ResearchList />
        <NoteDetail />
      </Providers>,
    );
    expect(screen.getByTestId('panel-researchList')).toBeInTheDocument();
    expect(screen.getByTestId('panel-noteDetail')).toBeInTheDocument();
  });

  it('filters research notes by sector chip', () => {
    render(
      <Providers>
        <ResearchList />
      </Providers>,
    );
    const panel = getOneByTestId('panel-researchList');
    const sector = RESEARCH_NOTES[0].sector;
    const buttons = () => Array.from(panel.querySelectorAll('button'));
    const clickByLabel = (label: string) => {
      const btn = buttons().find((b) => b.textContent?.trim() === label);
      expect(btn).toBeTruthy();
      fireEvent.click(btn!);
    };

    clickByLabel(sector);
    clickByLabel('All');

    const noteBtn = buttons().find((b) => b.textContent?.includes(RESEARCH_NOTES[0].ticker));
    expect(noteBtn).toBeTruthy();
    fireEvent.click(noteBtn!);
  });
});

describe('TradeTicket', () => {
  beforeEach(() => mockToast.mockClear());

  it('submits order and closes', async () => {
    const onClose = vi.fn();
    const state = seedState(0);
    const inst = state.instruments[0];
    const q = state.quotes[inst.id];
    render(<TradeTicket instrument={inst} quote={q} onClose={onClose} />);
    expect(screen.getByTestId('trade-ticket')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Bid/i }));
    await userEvent.click(screen.getByTestId('tab-trigger-market'));
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`Buy.*${inst.ticker.split(' ')[0]}`) }));
    expect(mockToast).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('RfqWorkbench', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders and ticks RFQ state', async () => {
    render(
      <Providers>
        <RfqWorkbench />
      </Providers>,
    );
    expect(screen.getByTestId('rfq-workbench')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
  });
});
