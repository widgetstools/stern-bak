/**
 * T2-5. Four call sites set `quickFilterText`; only the toolbar's debounced
 * push purged, so a RESTORED term (profile load, profile reset, or the replay
 * that runs when the grid api arrives after the user has typed) rendered as a
 * filled-in search box over rows it never filtered.
 */
import { describe, expect, it, vi } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import { applyQuickFilterText } from './applyQuickFilterText';

function makeApi(rowModelType: string, over: Record<string, unknown> = {}) {
  const api = {
    setGridOption: vi.fn(),
    getGridOption: vi.fn((key: string) => (key === 'rowModelType' ? rowModelType : undefined)),
    refreshServerSide: vi.fn(),
    ...over,
  };
  return api as unknown as GridApi & typeof api;
}

describe('applyQuickFilterText', () => {
  it('sets the term and purges under the server-side row model', () => {
    const api = makeApi('serverSide');
    expect(applyQuickFilterText(api, 'acme')).toBe(true);
    expect(api.setGridOption).toHaveBeenCalledWith('quickFilterText', 'acme');
    expect(api.refreshServerSide).toHaveBeenCalledWith({ purge: true });
  });

  // A client-side grid already holds every row, so AG-Grid re-runs its filter
  // pass on the option change alone — a purge would be a wasted rebuild.
  it('sets the term and does NOT purge under the client-side row model', () => {
    const api = makeApi('clientSide');
    expect(applyQuickFilterText(api, 'acme')).toBe(true);
    expect(api.setGridOption).toHaveBeenCalledWith('quickFilterText', 'acme');
    expect(api.refreshServerSide).not.toHaveBeenCalled();
  });

  it('purges when CLEARING the term too, not only when setting one', () => {
    const api = makeApi('serverSide');
    applyQuickFilterText(api, '');
    expect(api.setGridOption).toHaveBeenCalledWith('quickFilterText', '');
    expect(api.refreshServerSide).toHaveBeenCalledWith({ purge: true });
  });

  it('reports false and stays quiet with no api', () => {
    expect(applyQuickFilterText(null, 'x')).toBe(false);
    expect(applyQuickFilterText(undefined, 'x')).toBe(false);
  });

  // Every caller is a restore / replay path, where a grid torn down mid-flight
  // is ordinary rather than exceptional.
  it('never throws when the grid is mid-teardown', () => {
    const dead = makeApi('serverSide', {
      setGridOption: vi.fn(() => { throw new Error('destroyed'); }),
    });
    expect(applyQuickFilterText(dead, 'x')).toBe(false);
    expect(dead.refreshServerSide).not.toHaveBeenCalled();

    // …and a grid that dies BETWEEN the two calls still reports the term as
    // applied, because it was.
    const halfDead = makeApi('serverSide', {
      getGridOption: vi.fn(() => { throw new Error('destroyed'); }),
    });
    expect(applyQuickFilterText(halfDead, 'x')).toBe(true);
  });
});
