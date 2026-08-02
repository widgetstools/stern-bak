import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getOneByTestId } from '../../../../test-utils/queries';
import { widgetProps } from '../testSetupMocks';

describe('DemoStateProvider empty seed branches', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('../data/useTickingStore');
    vi.resetModules();
  });

  it('defaults selection when store has no instruments or orders', async () => {
    vi.doMock('../data/useTickingStore', () => ({
      useTickingStore: () => ({
        state: {
          instruments: [],
          quotes: {},
          orders: [],
          positions: [],
          curve: [],
          history: {},
        },
      }),
    }));

    const { DemoStateProvider, useDemoState } = await import('./DemoStateProvider');

    function Probe() {
      const { selectedId, selectedOrderId } = useDemoState();
      return (
        <div>
          <span data-testid="selected">{selectedId || 'empty'}</span>
          <span data-testid="order">{selectedOrderId ?? 'none'}</span>
        </div>
      );
    }

    render(
      <DemoStateProvider>
        <Probe />
      </DemoStateProvider>,
    );
    expect(screen.getByTestId('selected')).toHaveTextContent('empty');
    expect(screen.getByTestId('order')).toHaveTextContent('none');
  });
});

describe('RiskKpiStrip negative spread P&L branch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('../data/seeds');
    vi.resetModules();
  });

  it('builds KPI strip with negative total P&L color', async () => {
    vi.doMock('../data/seeds', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../data/seeds')>();
      return {
        ...actual,
        BOOK_RISK: actual.BOOK_RISK.map((row) => ({ ...row, pnl: -100_000 })),
      };
    });

    const { RiskKpiStrip } = await import('../panels/risk/RiskKpiStrip');
    render(<RiskKpiStrip {...widgetProps()} />);
    expect(getOneByTestId('panel-riskKpi')).toBeInTheDocument();
  });

  it('handles missing credit books when computing credit delta', async () => {
    vi.doMock('../data/seeds', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../data/seeds')>();
      return {
        ...actual,
        BOOK_RISK: actual.BOOK_RISK.filter(
          (row) => row.book !== 'CREDIT-IG' && row.book !== 'CREDIT-HY',
        ),
      };
    });

    const { RiskKpiStrip } = await import('../panels/risk/RiskKpiStrip');
    render(<RiskKpiStrip {...widgetProps()} />);
    expect(getOneByTestId('panel-riskKpi')).toBeInTheDocument();
  });
});
