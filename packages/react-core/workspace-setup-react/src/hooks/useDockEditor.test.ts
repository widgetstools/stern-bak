import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

/**
 * useDockEditor owns the dock-editor's reducer state. Persistence and OpenFin
 * IAB are boundaries, so they are mocked; what is exercised here is the state
 * machine — initial load, the dirty flag, and reload discarding edits without
 * touching storage.
 *
 * The mock must be declared before the hook is imported, hence the dynamic
 * import inside the tests.
 */

const loadDockConfig = vi.fn();
const saveDockConfig = vi.fn();
const clearDockConfig = vi.fn();
const loadRegistryConfig = vi.fn();

vi.mock('@wellsfargo-starui/openfin/config', () => ({
  loadDockConfig: (...a: unknown[]) => loadDockConfig(...a),
  saveDockConfig: (...a: unknown[]) => saveDockConfig(...a),
  clearDockConfig: (...a: unknown[]) => clearDockConfig(...a),
  loadRegistryConfig: (...a: unknown[]) => loadRegistryConfig(...a),
  IAB_DOCK_CONFIG_UPDATE: 'dock-config-update',
  IAB_REGISTRY_CONFIG_UPDATE: 'registry-config-update',
}));

const button = (id: string) => ({ id, tooltip: id, type: 'DockButton' as const });

/** A top-level DropdownButton with the given menu tree. */
const dropdown = (id: string, options: unknown[] = []) =>
  ({ id, tooltip: id, type: 'DropdownButton' as const, options }) as never;

const menuItem = (id: string, options?: unknown[]) =>
  ({ id, tooltip: id, ...(options ? { options } : {}) }) as never;

async function importHook() {
  return (await import('./useDockEditor.js')).useDockEditor;
}

/** Mount and wait for the initial load to settle. */
async function mount(opts?: Record<string, unknown>) {
  const useDockEditor = await importHook();
  const view = renderHook(() => useDockEditor(opts as never));
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  return view;
}

beforeEach(() => {
  vi.resetModules();
  loadDockConfig.mockReset().mockResolvedValue({ version: 1, buttons: [button('a')] });
  saveDockConfig.mockReset().mockResolvedValue(undefined);
  clearDockConfig.mockReset().mockResolvedValue(undefined);
  loadRegistryConfig.mockReset().mockResolvedValue({ entries: [] });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useDockEditor', () => {
  it('starts loading and clears the flag once config arrives', async () => {
    const useDockEditor = await importHook();
    const { result } = renderHook(() => useDockEditor());

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('loads persisted buttons on mount', async () => {
    const useDockEditor = await importHook();
    const { result } = renderHook(() => useDockEditor());

    await waitFor(() => expect(result.current.buttons.map((b) => b.id)).toEqual(['a']));
    expect(result.current.isDirty).toBe(false);
  });

  it('threads the scope through to storage', async () => {
    const useDockEditor = await importHook();
    const scope = { appId: 'Star-Demo', userId: 'k123' };
    renderHook(() => useDockEditor({ scope }));

    await waitFor(() => expect(loadDockConfig).toHaveBeenCalledWith(scope));
  });

  it('starts with no buttons when nothing is persisted', async () => {
    loadDockConfig.mockResolvedValue(null);
    const useDockEditor = await importHook();
    const { result } = renderHook(() => useDockEditor());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.buttons).toEqual([]);
  });

  it('survives a failing load rather than leaving the editor stuck', async () => {
    loadDockConfig.mockRejectedValue(new Error('indexeddb unavailable'));
    const useDockEditor = await importHook();
    const { result } = renderHook(() => useDockEditor());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('exposes registry entries loaded on mount', async () => {
    loadRegistryConfig.mockResolvedValue({ entries: [{ id: 'blotter', name: 'Blotter' }] });
    const useDockEditor = await importHook();
    const { result } = renderHook(() => useDockEditor());

    await waitFor(() => expect(result.current.registryEntries).toHaveLength(1));
  });

  it('tolerates a failing registry load', async () => {
    loadRegistryConfig.mockRejectedValue(new Error('nope'));
    const useDockEditor = await importHook();
    const { result } = renderHook(() => useDockEditor());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.registryEntries).toEqual([]);
  });

  it('persists on save', async () => {
    const useDockEditor = await importHook();
    const { result } = renderHook(() => useDockEditor());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => { await result.current.save(); });
    expect(saveDockConfig).toHaveBeenCalledTimes(1);
  });

  it('reload re-reads storage and does not write to it', async () => {
    const useDockEditor = await importHook();
    const { result } = renderHook(() => useDockEditor());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    loadDockConfig.mockResolvedValue({ version: 1, buttons: [button('fresh')] });
    await act(async () => { await result.current.reload(); });

    await waitFor(() => expect(result.current.buttons.map((b) => b.id)).toEqual(['fresh']));
    expect(result.current.isDirty).toBe(false);
    // reload() is the "discard changes" path — it must never persist.
    expect(saveDockConfig).not.toHaveBeenCalled();
    expect(clearDockConfig).not.toHaveBeenCalled();
  });

  it('reset clears persisted config — the destructive path', async () => {
    const useDockEditor = await importHook();
    const { result } = renderHook(() => useDockEditor());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => { await result.current.reset(); });
    expect(clearDockConfig).toHaveBeenCalledTimes(1);
  });

  it('preview does not persist', async () => {
    const useDockEditor = await importHook();
    const { result } = renderHook(() => useDockEditor());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => { await result.current.preview(); });
    expect(saveDockConfig).not.toHaveBeenCalled();
  });
});

// ─── Reducer ─────────────────────────────────────────────────────────
//
// Every editing affordance in the DockPane and InspectorPane goes through
// one of these actions, so each is exercised for both its effect on the
// button tree and the dirty flag the Save button reads.

describe('useDockEditor — top-level buttons', () => {
  it('adding a button appends it and marks the editor dirty', async () => {
    const { result } = await mount();

    act(() => { result.current.dispatch({ type: 'ADD_BUTTON', button: button('b') }); });

    expect(result.current.buttons.map((b) => b.id)).toEqual(['a', 'b']);
    expect(result.current.isDirty).toBe(true);
  });

  it('updating a button replaces only the matching row', async () => {
    loadDockConfig.mockResolvedValue({ version: 1, buttons: [button('a'), button('b')] });
    const { result } = await mount();

    act(() => {
      result.current.dispatch({ type: 'UPDATE_BUTTON', id: 'b', button: { ...button('b'), tooltip: 'Renamed' } });
    });

    expect(result.current.buttons[0].tooltip).toBe('a');
    expect(result.current.buttons[1].tooltip).toBe('Renamed');
    expect(result.current.isDirty).toBe(true);
  });

  it('removing a button drops it', async () => {
    loadDockConfig.mockResolvedValue({ version: 1, buttons: [button('a'), button('b')] });
    const { result } = await mount();

    act(() => { result.current.dispatch({ type: 'REMOVE_BUTTON', id: 'a' }); });

    expect(result.current.buttons.map((b) => b.id)).toEqual(['b']);
    expect(result.current.isDirty).toBe(true);
  });

  it('reordering moves the button to the target index', async () => {
    loadDockConfig.mockResolvedValue({ version: 1, buttons: [button('a'), button('b'), button('c')] });
    const { result } = await mount();

    act(() => { result.current.dispatch({ type: 'REORDER_BUTTONS', fromIndex: 2, toIndex: 0 }); });

    expect(result.current.buttons.map((b) => b.id)).toEqual(['c', 'a', 'b']);
  });

  it('the dirty and loading flags can be set directly', async () => {
    const { result } = await mount();

    act(() => { result.current.dispatch({ type: 'SET_DIRTY', dirty: true }); });
    expect(result.current.isDirty).toBe(true);

    act(() => { result.current.dispatch({ type: 'SET_LOADING', loading: true }); });
    expect(result.current.isLoading).toBe(true);
  });

  it('ignores an action it does not recognise', async () => {
    const { result } = await mount();
    const before = result.current.buttons;

    act(() => {
      result.current.dispatch({ type: 'NOPE' } as unknown as Parameters<typeof result.current.dispatch>[0]);
    });

    expect(result.current.buttons).toBe(before);
  });
});

describe('useDockEditor — menu items', () => {
  beforeEach(() => {
    loadDockConfig.mockResolvedValue({
      version: 1,
      buttons: [
        button('plain'),
        dropdown('reports', [menuItem('risk'), menuItem('pnl', [menuItem('pnl-eod')])]),
      ],
    });
  });

  const options = (result: { current: { buttons: Array<{ id: string; options?: Array<{ id: string; options?: unknown[] }> }> } }) =>
    result.current.buttons.find((b) => b.id === 'reports')!.options!;

  it('adds a menu item to the dropdown root', async () => {
    const { result } = await mount();

    act(() => {
      result.current.dispatch({ type: 'ADD_MENU_ITEM', buttonId: 'reports', item: menuItem('new-item') });
    });

    expect(options(result).map((i) => i.id)).toEqual(['risk', 'pnl', 'new-item']);
    expect(result.current.isDirty).toBe(true);
  });

  it('adds a menu item into a nested sub-menu', async () => {
    const { result } = await mount();

    act(() => {
      result.current.dispatch({
        type: 'ADD_MENU_ITEM',
        buttonId: 'reports',
        parentItemId: 'pnl',
        item: menuItem('pnl-intraday'),
      });
    });

    const pnl = options(result).find((i) => i.id === 'pnl')!;
    expect((pnl.options as Array<{ id: string }>).map((i) => i.id)).toEqual(['pnl-eod', 'pnl-intraday']);
    // The sibling branch must be untouched.
    expect(options(result).map((i) => i.id)).toEqual(['risk', 'pnl']);
  });

  it('updates a menu item at the root', async () => {
    const { result } = await mount();

    act(() => {
      result.current.dispatch({
        type: 'UPDATE_MENU_ITEM',
        buttonId: 'reports',
        itemId: 'risk',
        item: { ...(menuItem('risk') as unknown as Record<string, unknown>), tooltip: 'Risk dashboard' } as never,
      });
    });

    expect((options(result)[0] as unknown as { tooltip: string }).tooltip).toBe('Risk dashboard');
  });

  it('updates a nested menu item', async () => {
    const { result } = await mount();

    act(() => {
      result.current.dispatch({
        type: 'UPDATE_MENU_ITEM',
        buttonId: 'reports',
        itemId: 'pnl-eod',
        parentItemId: 'pnl',
        item: { ...(menuItem('pnl-eod') as unknown as Record<string, unknown>), tooltip: 'End of day' } as never,
      });
    });

    const pnl = options(result).find((i) => i.id === 'pnl')!;
    expect((pnl.options as Array<{ tooltip: string }>)[0].tooltip).toBe('End of day');
  });

  it('removes a menu item at the root', async () => {
    const { result } = await mount();

    act(() => { result.current.dispatch({ type: 'REMOVE_MENU_ITEM', buttonId: 'reports', itemId: 'risk' }); });

    expect(options(result).map((i) => i.id)).toEqual(['pnl']);
  });

  it('removes a nested menu item', async () => {
    const { result } = await mount();

    act(() => {
      result.current.dispatch({
        type: 'REMOVE_MENU_ITEM', buttonId: 'reports', itemId: 'pnl-eod', parentItemId: 'pnl',
      });
    });

    const pnl = options(result).find((i) => i.id === 'pnl')!;
    expect(pnl.options).toEqual([]);
  });

  it('reorders menu items at the root and inside a sub-menu', async () => {
    const { result } = await mount();

    act(() => {
      result.current.dispatch({ type: 'REORDER_MENU_ITEMS', buttonId: 'reports', fromIndex: 1, toIndex: 0 });
    });
    expect(options(result).map((i) => i.id)).toEqual(['pnl', 'risk']);

    act(() => {
      result.current.dispatch({
        type: 'ADD_MENU_ITEM', buttonId: 'reports', parentItemId: 'pnl', item: menuItem('pnl-intraday'),
      });
    });
    act(() => {
      result.current.dispatch({
        type: 'REORDER_MENU_ITEMS', buttonId: 'reports', parentItemId: 'pnl', fromIndex: 1, toIndex: 0,
      });
    });

    const pnl = options(result).find((i) => i.id === 'pnl')!;
    expect((pnl.options as Array<{ id: string }>).map((i) => i.id)).toEqual(['pnl-intraday', 'pnl-eod']);
  });

  it('leaves a non-dropdown button alone', async () => {
    const { result } = await mount();

    act(() => { result.current.dispatch({ type: 'ADD_MENU_ITEM', buttonId: 'plain', item: menuItem('x') }); });

    // An ActionButton has no options array; writing one would produce a
    // dock config the runtime cannot render.
    expect(result.current.buttons.find((b) => b.id === 'plain')).not.toHaveProperty('options');
  });
});

describe('useDockEditor — OpenFin integration', () => {
  it('publishes the saved config over the IAB', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fin', { InterApplicationBus: { publish } });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { result } = await mount();

    await act(async () => { await result.current.save(); });

    expect(publish).toHaveBeenCalledWith(
      'dock-config-update',
      expect.objectContaining({ version: 1, buttons: [expect.objectContaining({ id: 'a' })] }),
    );
  });

  it('preview publishes for live feedback without persisting', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fin', { InterApplicationBus: { publish } });
    const { result } = await mount();

    await act(async () => { await result.current.preview(); });

    expect(publish).toHaveBeenCalledWith('dock-config-update', expect.any(Object));
    expect(saveDockConfig).not.toHaveBeenCalled();
  });

  it('reset tells the live dock to fall back to its defaults', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fin', { InterApplicationBus: { publish } });
    const { result } = await mount();

    await act(async () => { await result.current.reset(); });

    expect(publish).toHaveBeenCalledWith('dock-config-reset', {});
  });

  it('a failing publish does not fail the save', async () => {
    vi.stubGlobal('fin', {
      InterApplicationBus: { publish: vi.fn().mockRejectedValue(new Error('bus down')) },
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { result } = await mount();

    await act(async () => { await result.current.save(); });

    // The row already hit storage; a dropped broadcast is not a failed save.
    expect(saveDockConfig).toHaveBeenCalledTimes(1);
  });

  it('a failing publish does not fail the reset either', async () => {
    vi.stubGlobal('fin', {
      InterApplicationBus: { publish: vi.fn().mockRejectedValue(new Error('bus down')) },
    });
    const { result } = await mount();

    await act(async () => { await result.current.reset(); });

    expect(clearDockConfig).toHaveBeenCalledTimes(1);
  });

  it('subscribes to registry updates and applies them live', async () => {
    let handler!: (msg: { entries: Array<{ id: string }> }) => void;
    const subscribe = vi.fn((_id, _topic, cb) => { handler = cb; });
    const unsubscribe = vi.fn();
    vi.stubGlobal('fin', { InterApplicationBus: { subscribe, unsubscribe, publish: vi.fn() } });

    const { result, unmount } = await mount();
    expect(subscribe).toHaveBeenCalledWith({ uuid: '*' }, 'registry-config-update', expect.any(Function));

    act(() => { handler({ entries: [{ id: 'blotter' }] }); });
    // The menu-item form's component dropdown reads this list; without the
    // IAB it would go stale the moment the registry editor saved.
    await waitFor(() => expect(result.current.registryEntries.map((e) => e.id)).toEqual(['blotter']));

    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('treats an empty registry broadcast as no entries', async () => {
    let handler!: (msg: unknown) => void;
    vi.stubGlobal('fin', {
      InterApplicationBus: { subscribe: vi.fn((_i, _t, cb) => { handler = cb; }), unsubscribe: vi.fn(), publish: vi.fn() },
    });
    const { result } = await mount();

    act(() => { handler(null); });
    expect(result.current.registryEntries).toEqual([]);
  });

  it('survives an IAB unsubscribe that throws on teardown', async () => {
    vi.stubGlobal('fin', {
      InterApplicationBus: {
        subscribe: vi.fn(),
        unsubscribe: vi.fn(() => { throw new Error('already gone'); }),
        publish: vi.fn(),
      },
    });
    const { unmount } = await mount();

    expect(() => unmount()).not.toThrow();
  });

  it('warns and carries on when the IAB subscribe throws', async () => {
    vi.stubGlobal('fin', {
      InterApplicationBus: {
        subscribe: vi.fn(() => { throw new Error('bus unavailable'); }),
        unsubscribe: vi.fn(),
        publish: vi.fn(),
      },
    });
    const { result } = await mount();

    // The editor still works without live registry updates.
    expect(result.current.buttons.map((b) => b.id)).toEqual(['a']);
    expect(console.warn).toHaveBeenCalled();
  });
});
