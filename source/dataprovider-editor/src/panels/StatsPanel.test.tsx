import '../testSetupMocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { StatsPanel } from './StatsPanel';

describe('StatsPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows placeholder values when no picker state is persisted', () => {
    render(<StatsPanel />);

    expect(screen.getByText('Grid A')).toBeInTheDocument();
    expect(screen.getByText('Grid B')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(4);
    expect(screen.getByText('marketsui-config / appConfig')).toBeInTheDocument();
  });

  it('reads persisted picker state from localStorage', () => {
    localStorage.setItem(
      'markets-grid-bundle:dataprovider-editor-demo-a',
      JSON.stringify({
        gridLevelData: {
          liveProviderId: 'live-a',
          historicalProviderId: 'hist-a',
          mode: 'historical',
        },
      }),
    );
    localStorage.setItem(
      'markets-grid-bundle:dataprovider-editor-demo-b',
      JSON.stringify({
        gridLevelData: {
          liveProviderId: 'live-b',
        },
      }),
    );

    render(<StatsPanel />);

    expect(screen.getByText('live-a')).toBeInTheDocument();
    expect(screen.getByText('hist-a')).toBeInTheDocument();
    expect(screen.getByText('historical')).toBeInTheDocument();
    expect(screen.getByText('live-b')).toBeInTheDocument();
  });

  it('ignores invalid localStorage payloads', () => {
    localStorage.setItem('markets-grid-bundle:dataprovider-editor-demo-a', '{bad json');
    render(<StatsPanel />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('re-renders on the polling interval', () => {
    render(<StatsPanel />);

    localStorage.setItem(
      'markets-grid-bundle:dataprovider-editor-demo-a',
      JSON.stringify({ gridLevelData: { liveProviderId: 'updated-live' } }),
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('updated-live')).toBeInTheDocument();
  });
});
