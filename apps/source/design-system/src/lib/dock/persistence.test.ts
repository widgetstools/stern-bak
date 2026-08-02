import { describe, expect, it, vi } from 'vitest';
import { deserialize, serialize } from '@widgetstools/dock-manager-core';
import { loadLayout, resetLayout, saveLayout } from './persistence';
import { TAB_LAYOUTS } from './layouts';

describe('dock persistence', () => {
  it('saves and loads layout from localStorage', () => {
    const state = TAB_LAYOUTS.market();
    saveLayout('market', state);
    expect(serialize).toHaveBeenCalledWith(state);
    expect(localStorage.getItem('ds-dock-market')).toBeTruthy();

    vi.mocked(deserialize).mockReturnValueOnce({ state } as never);
    expect(loadLayout('market')).toBe(state);
  });

  it('returns null when nothing stored or parse fails', () => {
    expect(loadLayout('missing')).toBeNull();
    localStorage.setItem('ds-dock-bad', '{bad');
    expect(loadLayout('bad')).toBeNull();
  });

  it('resetLayout removes the saved key', () => {
    saveLayout('orders', TAB_LAYOUTS.orders());
    resetLayout('orders');
    expect(localStorage.getItem('ds-dock-orders')).toBeNull();
  });

  it('no-ops when window is undefined', () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error simulate SSR
    delete globalThis.window;
    expect(() => saveLayout('x', TAB_LAYOUTS.market())).not.toThrow();
    expect(loadLayout('x')).toBeNull();
    expect(() => resetLayout('x')).not.toThrow();
    globalThis.window = originalWindow;
  });

  it('swallows localStorage quota errors', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => saveLayout('quota', TAB_LAYOUTS.market())).not.toThrow();
    setItem.mockRestore();
  });

  it('swallows removeItem errors on reset', () => {
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => resetLayout('blocked')).not.toThrow();
    removeItem.mockRestore();
  });
});
