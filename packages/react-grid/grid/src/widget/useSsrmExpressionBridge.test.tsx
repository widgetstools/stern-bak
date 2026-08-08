/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const configureExpressions = vi.fn(async () => {});
const provider = { id: 'p1', configureExpressions } as never;

vi.mock('../customizer/hooks/useModuleState.js', () => ({
  useModuleState: (id: string) => {
    if (id === 'calculated-columns') {
      return [
        {
          virtualColumns: [
            { colId: 'x', headerName: 'X', expression: '1+1' },
          ],
        },
      ];
    }
    if (id === 'conditional-styling') return [{ rules: [] }];
    if (id === 'alerts') return [{ rules: [] }];
    return [{}];
  },
}));

import { useSsrmExpressionBridge } from './useSsrmExpressionBridge.js';

describe('useSsrmExpressionBridge', () => {
  it('pushes rules when enabled', async () => {
    configureExpressions.mockClear();
    renderHook(() => useSsrmExpressionBridge(provider, true));
    await waitFor(() => {
      expect(configureExpressions).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'calculated', field: 'x' }),
        ]),
      );
    });
  });

  it('no-ops when disabled', () => {
    configureExpressions.mockClear();
    renderHook(() => useSsrmExpressionBridge(provider, false));
    expect(configureExpressions).not.toHaveBeenCalled();
  });
});
