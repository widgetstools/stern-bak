import '../testSetupMocks';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, renderHook, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getOneByLabelText, getOneByTestId, getOneByText } from '../../../../test-utils/queries';
import { LabDemoProvider, useLabDemoRegistry } from './LabDemoContext';
import { LabScenarioRail } from './LabScenarioRail';
import { useLabRows } from './useLabRows';
import { getScenarioById, scenariosForTab } from './scenarios';
import { mockMarketsGridHandle, mockStreamControls } from '../testSetupMocks';
import type { LabRow } from '../data/types';

const sampleRows: LabRow[] = [
  { id: '1', bidPrice: 100, midPrice: 100.5, askPrice: 101, dailyPnL: 1000 } as LabRow,
  { id: '2', bidPrice: 99, midPrice: 99.5, askPrice: 100, dailyPnL: -500 } as LabRow,
];

function RegistryProbe() {
  const { register } = useLabDemoRegistry();
  return (
    <button
      type="button"
      data-testid="register-handle"
      onClick={() =>
        register({
          tabId: 'overview',
          getRowCount: () => 2,
          snapshotRowCount: 2,
          paused: false,
          setPaused: vi.fn(),
          tickMs: 500,
          setTickMs: vi.fn(),
          activeScenarioId: null,
          applyScenario: vi.fn(),
          clearScenario: vi.fn(),
        })
      }
    >
      Register
    </button>
  );
}

describe('LabDemoContext', () => {
  it('registers and exposes stream handles', async () => {
    render(
      <LabDemoProvider>
        <RegistryProbe />
      </LabDemoProvider>,
    );

    await userEvent.click(getOneByTestId('register-handle'));
    expect(getOneByTestId('register-handle')).toBeInTheDocument();
  });

  it('throws outside provider', () => {
    expect(() => renderHook(() => useLabDemoRegistry())).toThrow(/LabDemoProvider/);
  });
});

describe('scenarios', () => {
  it('filters scenarios by tab id', () => {
    const overview = scenariosForTab('overview');
    expect(overview.length).toBeGreaterThan(0);
    expect(overview.every((s) => s.tabs.includes('overview'))).toBe(true);
  });

  it('finds scenarios by id and applies a sample transform', () => {
    const scenario = getScenarioById('bid-spike');
    expect(scenario).toBeDefined();
    const next = scenario!.apply(sampleRows);
    expect(Number(next[0].bidPrice)).toBe(112.5);
  });
});

describe('useLabRows', () => {
  beforeEach(() => {
    mockStreamControls.reset();
  });

  it('registers with demo context and exposes row data', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LabDemoProvider>{children}</LabDemoProvider>
    );

    const { result } = renderHook(
      () => useLabRows('overview', 'mock-positions-overview', { rowCount: 2 }),
      { wrapper },
    );

    act(() => mockStreamControls.emitDelta(sampleRows, true));
    await waitFor(() => expect(result.current.rowData.length).toBe(2));

    act(() => {
      result.current.onReady(mockMarketsGridHandle as never);
    });

    expect(result.current.tickMs).toBe(500);
  });

  it('applies and clears scenarios when grid is ready', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LabDemoProvider>{children}</LabDemoProvider>
    );

    const { result } = renderHook(
      () => useLabRows('alerts', 'mock-positions-alerts', { rowCount: 2 }),
      { wrapper },
    );

    act(() => mockStreamControls.emitDelta(sampleRows, true));
    await waitFor(() => expect(result.current.rowData.length).toBe(2));

    act(() => {
      result.current.onReady(mockMarketsGridHandle as never);
    });

    act(() => result.current.applyScenario('bid-spike'));
    expect(result.current.scenarioId).toBe('bid-spike');

    act(() => result.current.clearScenario());
    expect(result.current.scenarioId).toBeNull();
  });

  it('ignores invalid scenario ids and no-ops clear when idle', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LabDemoProvider>{children}</LabDemoProvider>
    );

    const { result } = renderHook(
      () => useLabRows('overview', 'mock-positions-overview', { rowCount: 2 }),
      { wrapper },
    );

    act(() => mockStreamControls.emitDelta(sampleRows, true));
    await waitFor(() => expect(result.current.rowData.length).toBe(2));

    act(() => result.current.applyScenario('not-a-scenario'));
    expect(result.current.scenarioId).toBe('not-a-scenario');

    act(() => result.current.clearScenario());
    expect(result.current.scenarioId).toBeNull();
    act(() => result.current.clearScenario());
  });

  it('pauses stream updates and sets dev grid handle when ready', async () => {
    const onGridMount = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LabDemoProvider>{children}</LabDemoProvider>
    );

    const { result } = renderHook(
      () =>
        useLabRows(
          'live',
          'mock-positions-live',
          { rowCount: 2, enableUpdates: true },
          onGridMount,
        ),
      { wrapper },
    );

    act(() => mockStreamControls.emitDelta(sampleRows, true));
    await waitFor(() => expect(result.current.rowData.length).toBe(2));

    act(() => {
      result.current.onReady(mockMarketsGridHandle as never);
    });
    expect(onGridMount).toHaveBeenCalled();

    act(() => result.current.setPaused(true));
    expect(result.current.paused).toBe(true);

    act(() => result.current.applyScenario('bid-spike'));
    act(() => result.current.setTickMs(250));
    expect(result.current.tickMs).toBe(250);
  });
});

describe('LabScenarioRail', () => {
  it('shows placeholder when no handle is registered', () => {
    render(
      <LabDemoProvider>
        <LabScenarioRail activeTab="overview" />
      </LabDemoProvider>,
    );
    expect(getOneByTestId('lab-demo-console')).toBeInTheDocument();
    expect(getOneByText(/Open a feature tab/)).toBeInTheDocument();
  });

  it('collapses and expands', async () => {
    render(
      <LabDemoProvider>
        <LabScenarioRail activeTab="home" />
      </LabDemoProvider>,
    );

    await userEvent.click(getOneByLabelText('Collapse demo console'));
    expect(getOneByLabelText('Expand demo console')).toBeInTheDocument();
    await userEvent.click(getOneByLabelText('Expand demo console'));
    expect(getOneByTestId('lab-demo-console')).toBeInTheDocument();
  });

  it('controls stream when handle is registered', async () => {
    const setPaused = vi.fn();
    const setTickMs = vi.fn();
    const applyScenario = vi.fn();
    const clearScenario = vi.fn();

    function Harness() {
      const { register } = useLabDemoRegistry();
      return (
        <>
          <button
            type="button"
            onClick={() =>
              register({
                tabId: 'overview',
                getRowCount: () => 500,
                snapshotRowCount: 500,
                paused: false,
                setPaused,
                tickMs: 500,
                setTickMs,
                activeScenarioId: 'bid-spike',
                applyScenario,
                clearScenario,
              })
            }
          >
            bind
          </button>
          <LabScenarioRail activeTab="overview" />
        </>
      );
    }

    render(
      <LabDemoProvider>
        <Harness />
      </LabDemoProvider>,
    );

    await userEvent.click(getOneByText('bind'));
    expect(getOneByTestId('lab-stream-pause')).toBeInTheDocument();

    await userEvent.click(getOneByTestId('lab-stream-pause'));
    expect(setPaused).toHaveBeenCalled();

    await userEvent.click(getOneByTestId('lab-scenario-bid-spike'));
    expect(applyScenario).toHaveBeenCalledWith('bid-spike');

    await userEvent.click(getOneByTestId('lab-scenario-clear'));
    expect(clearScenario).toHaveBeenCalled();
  });
});
