import { describe, expect, it, vi } from 'vitest';
import {
  applyHistoricalToolbarDateToAppData,
  isHistoricalToolbarDate,
  resolveToolbarDateHistoryEnabled,
} from './applyHistoricalToolbarDateToAppData';
import { INITIAL_TOOLBAR_DATE_SETTINGS } from './state';

describe('toolbar date settings', () => {
  it('detects dates before today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 28, 12, 0, 0));
    expect(isHistoricalToolbarDate('2026-05-27')).toBe(true);
    expect(isHistoricalToolbarDate('2026-05-28')).toBe(false);
    expect(isHistoricalToolbarDate('2026-05-29')).toBe(false);
    vi.useRealTimers();
  });

  it('writes historical dates to configured AppData keys', () => {
    const set = vi.fn();
    applyHistoricalToolbarDateToAppData(
      '2026-05-15',
      {
        ...INITIAL_TOOLBAR_DATE_SETTINGS,
        historicalDateAppDataEnabled: true,
        historicalDateAppDataProvider: 'positions',
        historicalDateAppDataKey: 'asOfDate',
      },
      { get: () => undefined, set },
    );
    expect(set).toHaveBeenCalledWith('positions', 'asOfDate', '2026-05-15');
  });

  it('skips today and when binding is disabled', () => {
    const set = vi.fn();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 28, 12, 0, 0));
    applyHistoricalToolbarDateToAppData(
      '2026-05-28',
      {
        ...INITIAL_TOOLBAR_DATE_SETTINGS,
        historicalDateAppDataEnabled: true,
        historicalDateAppDataProvider: 'positions',
        historicalDateAppDataKey: 'asOfDate',
      },
      { get: () => undefined, set },
    );
    expect(set).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('resolves history enabled from customizer settings when prop omitted', () => {
    expect(resolveToolbarDateHistoryEnabled(undefined, INITIAL_TOOLBAR_DATE_SETTINGS)).toBe(false);
    expect(resolveToolbarDateHistoryEnabled(undefined, {
      ...INITIAL_TOOLBAR_DATE_SETTINGS,
      historicalDateAppDataEnabled: true,
      historicalDateAppDataProvider: 'positions',
      historicalDateAppDataKey: 'asOfDate',
    })).toBe(true);
    expect(resolveToolbarDateHistoryEnabled(false, {
      ...INITIAL_TOOLBAR_DATE_SETTINGS,
      historicalDateAppDataEnabled: true,
      historicalDateAppDataProvider: 'positions',
      historicalDateAppDataKey: 'asOfDate',
    })).toBe(false);
  });
});
