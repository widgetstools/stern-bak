/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const configureExpressions = vi.fn(async () => {});
const provider = { id: 'p1', configureExpressions } as never;

const mockModuleState = vi.hoisted(() => ({
  calculated: {
    virtualColumns: [{ colId: 'x', headerName: 'X', expression: '1+1' }],
  },
  styling: { rules: [] as Array<{ id: string; enabled: boolean; expression: string }> },
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

describe('useSsrmExpressionBridge', () => {
  beforeEach(() => {
    configureExpressions.mockClear();
    mockModuleState.calculated = {
      virtualColumns: [{ colId: 'x', headerName: 'X', expression: '1+1' }],
    };
    mockModuleState.styling = { rules: [] };
    mockModuleState.alerts = { rules: [] };
  });

  it('pushes rules when enabled', async () => {
    renderHook(() => useSsrmExpressionBridge(provider, true));
    await waitFor(() => {
      expect(configureExpressions).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'calculated', field: 'x' }),
        ]),
      );
    });
  });

  it('excludes disabled style rules from worker push', async () => {
    mockModuleState.styling = {
      rules: [
        { id: 'on', enabled: true, expression: '[price] > 0' },
        { id: 'off', enabled: false, expression: '[price] < 0' },
      ],
    };

    renderHook(() => useSsrmExpressionBridge(provider, true));
    await waitFor(() => expect(configureExpressions).toHaveBeenCalled());

    const pushed = configureExpressions.mock.calls.at(-1)?.[0] as Array<{ id: string; kind: string }>;
    expect(pushed).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'on', kind: 'style' })]),
    );
    expect(pushed.some((rule) => rule.id === 'off')).toBe(false);
  });

  it('no-ops when disabled', () => {
    renderHook(() => useSsrmExpressionBridge(provider, false));
    expect(configureExpressions).not.toHaveBeenCalled();
  });
});
