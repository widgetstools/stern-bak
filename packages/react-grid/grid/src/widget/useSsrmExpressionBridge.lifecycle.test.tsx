/**
 * @vitest-environment jsdom
 *
 * Two failure modes the bridge has to survive:
 *
 * 1. **Peer clobber.** The expression plane is keyed per `providerId`, so two
 *    grids on one provider share it. A grid that mounts with no rules must not
 *    announce an empty rule set — that wipes the other grid's calculated
 *    columns, styling and alerts.
 * 2. **Restart amnesia.** A provider restart disposes the worker plane and its
 *    rules. Nothing in this hook's deps changes across a restart, so without
 *    an explicit status subscription the rules are never re-sent and the
 *    features silently stop working.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const configureExpressions = vi.fn(async () => {});
const statusHandlers: Array<(status: string, error?: string) => void> = [];
const onStatus = vi.fn((handler: (status: string, error?: string) => void) => {
  statusHandlers.push(handler);
  return () => {
    const i = statusHandlers.indexOf(handler);
    if (i >= 0) statusHandlers.splice(i, 1);
  };
});
const provider = { id: 'p1', configureExpressions, onStatus } as never;

const mockModuleState = vi.hoisted(() => ({
  calculated: { virtualColumns: [] as Array<Record<string, unknown>> },
  styling: { rules: [] as Array<Record<string, unknown>> },
  alerts: { rules: [] as unknown[] },
}));

vi.mock('../customizer/hooks/useModuleState.js', () => ({
  useModuleState: (id: string) => {
    if (id === 'calculated-columns') return [mockModuleState.calculated];
    if (id === 'conditional-styling') return [mockModuleState.styling];
    if (id === 'alerts') return [mockModuleState.alerts];
    return [{}];
  },
}));

import { useSsrmExpressionBridge } from './useSsrmExpressionBridge.js';

const withOneRule = () => {
  mockModuleState.calculated = {
    virtualColumns: [{ colId: 'x', headerName: 'X', expression: '1+1' }],
  };
};

beforeEach(() => {
  configureExpressions.mockClear();
  onStatus.mockClear();
  statusHandlers.length = 0;
  mockModuleState.calculated = { virtualColumns: [] };
  mockModuleState.styling = { rules: [] };
  mockModuleState.alerts = { rules: [] };
});

describe('useSsrmExpressionBridge peer safety', () => {
  it('does not announce an empty rule set on mount', async () => {
    renderHook(() => useSsrmExpressionBridge(provider, true));

    // Long enough to clear the debounce window.
    await new Promise((r) => setTimeout(r, 60));
    expect(configureExpressions).not.toHaveBeenCalled();
  });

  it('still clears rules once the user has actually removed them', async () => {
    withOneRule();
    const { rerender } = renderHook(() => useSsrmExpressionBridge(provider, true));
    await waitFor(() => expect(configureExpressions).toHaveBeenCalledTimes(1));

    mockModuleState.calculated = { virtualColumns: [] };
    rerender();

    await waitFor(() => expect(configureExpressions).toHaveBeenCalledTimes(2));
    expect(configureExpressions.mock.calls.at(-1)?.[0]).toEqual([]);
  });
});

describe('useSsrmExpressionBridge restart recovery', () => {
  it('re-pushes rules when the provider comes back ready', async () => {
    withOneRule();
    renderHook(() => useSsrmExpressionBridge(provider, true));
    await waitFor(() => expect(configureExpressions).toHaveBeenCalledTimes(1));

    // Provider restarts: the worker plane (and its rules) were disposed.
    for (const handler of statusHandlers) handler('loading');
    for (const handler of statusHandlers) handler('ready');

    await waitFor(() => expect(configureExpressions).toHaveBeenCalledTimes(2));
    expect(configureExpressions.mock.calls.at(-1)?.[0]).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'x' })]),
    );
  });

  it('unsubscribes from status on unmount', () => {
    withOneRule();
    const { unmount } = renderHook(() => useSsrmExpressionBridge(provider, true));
    expect(statusHandlers.length).toBeGreaterThan(0);

    unmount();
    expect(statusHandlers).toHaveLength(0);
  });
});
