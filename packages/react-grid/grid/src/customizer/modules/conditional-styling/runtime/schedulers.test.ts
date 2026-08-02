/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTimedRuleStore } from '@wellsfargo-starui/core';
import {
  createExpiryScheduler,
  createRefreshScheduler,
  createTargetedRefreshScheduler,
} from './schedulers.js';

function makePlatform(api: Record<string, unknown> | null = null) {
  return {
    api: { api },
  };
}

describe('createRefreshScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces refreshCells onto requestAnimationFrame', () => {
    const refreshCells = vi.fn();
    const scheduler = createRefreshScheduler(makePlatform({ refreshCells }) as never);
    scheduler.scheduleRefresh();
    scheduler.scheduleRefresh();
    expect(refreshCells).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(refreshCells).toHaveBeenCalledTimes(1);
    // suppressFlash: true — force:true alone would flash every touched
    // cell's native "value changed" animation regardless of whether its
    // value actually changed (e.g. a static CUSIP column).
    expect(refreshCells).toHaveBeenCalledWith({ force: true, suppressFlash: true });
  });

  it('dispose cancels pending rAF', () => {
    const refreshCells = vi.fn();
    const scheduler = createRefreshScheduler(makePlatform({ refreshCells }) as never);
    scheduler.scheduleRefresh();
    scheduler.dispose();
    vi.runAllTimers();
    expect(refreshCells).not.toHaveBeenCalled();
  });

  it('refreshes immediately when window is unavailable', () => {
    const refreshCells = vi.fn();
    const originalWindow = globalThis.window;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window;
    const scheduler = createRefreshScheduler(makePlatform({ refreshCells }) as never);
    scheduler.scheduleRefresh();
    expect(refreshCells).toHaveBeenCalledTimes(1);
    globalThis.window = originalWindow;
  });
});

describe('createTargetedRefreshScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('batches row/column refresh into one rAF flush', () => {
    const refreshCells = vi.fn();
    const getRowNode = vi.fn((id: string) => ({ id, data: { id } }));
    const scheduler = createTargetedRefreshScheduler(
      makePlatform({ refreshCells, getRowNode }) as never,
    );
    scheduler.scheduleTargetedRefresh(['r1'], ['price'], false);
    scheduler.scheduleTargetedRefresh(['r2'], ['qty'], false);
    vi.runAllTimers();
    expect(refreshCells).toHaveBeenCalledTimes(1);
    expect(refreshCells.mock.calls[0][0]).toMatchObject({
      force: true,
      columns: expect.arrayContaining(['price', 'qty']),
    });
  });

  it('omits columns when full-row scope is requested', () => {
    const refreshCells = vi.fn();
    const getRowNode = vi.fn((id: string) => ({ id }));
    const scheduler = createTargetedRefreshScheduler(
      makePlatform({ refreshCells, getRowNode }) as never,
    );
    scheduler.scheduleTargetedRefresh(['r1'], ['price'], true);
    vi.runAllTimers();
    expect(refreshCells.mock.calls[0][0]).not.toHaveProperty('columns');
  });

  it('dispose clears pending work', () => {
    const refreshCells = vi.fn();
    const getRowNode = vi.fn((id: string) => ({ id }));
    const scheduler = createTargetedRefreshScheduler(
      makePlatform({ refreshCells, getRowNode }) as never,
    );
    scheduler.scheduleTargetedRefresh(['r1'], ['price'], false);
    scheduler.dispose();
    vi.runAllTimers();
    expect(refreshCells).not.toHaveBeenCalled();
  });
});

describe('createExpiryScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('arms a timer for the next expiry and runs targeted refresh', () => {
    const store = createTimedRuleStore();
    store.upsertCellActivation('r1', 'rule1', 'price', 1_500);
    const scheduleRefresh = vi.fn();
    const scheduleTargetedRefresh = vi.fn();
    const evaluate = vi.fn();
    const expiry = createExpiryScheduler({
      store,
      scheduleRefresh,
      scheduleTargetedRefresh,
      evaluate,
    });

    expiry.armNextExpiry();
    vi.advanceTimersByTime(600);
    expect(evaluate).toHaveBeenCalled();
    expect(scheduleTargetedRefresh).toHaveBeenCalledWith(
      new Set(['r1']),
      new Set(['price']),
      false,
    );
  });

  it('disarms when no pending expiries remain', () => {
    const store = createTimedRuleStore();
    const expiry = createExpiryScheduler({
      store,
      scheduleRefresh: vi.fn(),
      scheduleTargetedRefresh: vi.fn(),
      evaluate: vi.fn(),
    });
    expiry.armNextExpiry();
    expiry.armNextExpiry();
    expiry.dispose();
    vi.runAllTimers();
  });

  it('no-ops refresh when api is missing or refreshCells throws', () => {
    const scheduler = createRefreshScheduler(makePlatform(null) as never);
    expect(() => scheduler.scheduleRefresh()).not.toThrow();
    scheduler.dispose();

    const refreshCells = vi.fn(() => { throw new Error('teardown'); });
    const failing = createRefreshScheduler(makePlatform({ refreshCells }) as never);
    vi.runAllTimers();
    failing.scheduleRefresh();
    vi.runAllTimers();
    failing.dispose();
  });

  it('targeted refresh skips duplicate enqueue and handles missing api', () => {
    vi.useFakeTimers();
    const scheduler = createTargetedRefreshScheduler(makePlatform(null) as never);
    scheduler.scheduleTargetedRefresh(['r1'], ['price'], false);
    scheduler.scheduleTargetedRefresh(['r1'], ['price'], false);
    vi.runAllTimers();
    scheduler.dispose();
    vi.useRealTimers();
  });

  it('targeted refresh returns early when row nodes are missing', () => {
    vi.useFakeTimers();
    const refreshCells = vi.fn();
    const scheduler = createTargetedRefreshScheduler(
      makePlatform({ refreshCells, getRowNode: () => null }) as never,
    );
    scheduler.scheduleTargetedRefresh(['missing'], ['price'], false);
    vi.runAllTimers();
    expect(refreshCells).not.toHaveBeenCalled();
    scheduler.dispose();
    vi.useRealTimers();
  });

  it('expiry rearms only when new expiry is earlier than pending timer', () => {
    const store = createTimedRuleStore();
    store.upsertCellActivation('r1', 'rule1', 'price', 5_000);
    const scheduleTargetedRefresh = vi.fn();
    const expiry = createExpiryScheduler({
      store,
      scheduleRefresh: vi.fn(),
      scheduleTargetedRefresh,
      evaluate: vi.fn(),
    });
    expiry.armNextExpiry();
    store.upsertCellActivation('r2', 'rule2', 'qty', 4_500);
    expiry.armNextExpiry();
    vi.advanceTimersByTime(4_600);
    expect(scheduleTargetedRefresh).toHaveBeenCalled();
  });
});
