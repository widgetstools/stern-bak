import { describe, expect, it, vi } from 'vitest';
import { applyGridDensityLive } from './applyGridDensityLive';

describe('applyGridDensityLive', () => {
  it('persists density and pushes row heights without row animation', () => {
    const setModuleState = vi.fn();
    const setGridOption = vi.fn();
    const getGridOption = vi.fn(() => true);

    const platform = {
      store: { setModuleState },
      api: {
        api: { setGridOption, getGridOption, isDestroyed: () => false },
      },
    };

    applyGridDensityLive(platform as never, 'ultra');

    expect(setModuleState).toHaveBeenCalledWith('general-settings', expect.any(Function));
    const next = setModuleState.mock.calls[0][1]({ gridDensity: 'compact', rowHeight: 30, headerHeight: 32 });
    expect(next.gridDensity).toBe('ultra');
    expect(next.rowHeight).toBe(22);
    expect(next.headerHeight).toBe(26);

    expect(setGridOption).toHaveBeenCalledWith('animateRows', false);
    expect(setGridOption).toHaveBeenCalledWith('rowHeight', 22);
    expect(setGridOption).toHaveBeenCalledWith('headerHeight', 26);
  });
});
