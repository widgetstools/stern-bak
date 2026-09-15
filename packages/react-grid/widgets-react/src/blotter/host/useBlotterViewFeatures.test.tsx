import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { MarketsGridHandle } from '@wellsfargo-starui/grid';

const mocks = vi.hoisted(() => ({
  hostedView: {
    identity: { instanceId: 'inst-1', configManager: undefined } as Record<string, unknown>,
    ready: true,
    agTheme: { id: 'theme' },
    tabsHidden: false,
    linking: { fdc3: { id: 'linking-fdc3' } },
  },
  tabTitle: { title: '', setTitle: vi.fn() },
  useGridContextLink: vi.fn(),
  useGridLinkNotifications: vi.fn(() => ({ onPublish: vi.fn(), onReceive: vi.fn() })),
  useInteropChannel: vi.fn(() => ({ id: 'interop-fdc3' })),
  isInteropAvailable: vi.fn(() => false),
}));

vi.mock('../../hosted/useHostedView.js', () => ({
  useHostedView: (args: { onWorkspaceSave: () => Promise<void> }) => {
    mocks.hostedView.lastArgs = args;
    return mocks.hostedView;
  },
}));
vi.mock('../../hosted/useViewTabTitle.js', () => ({
  useViewTabTitle: (fallback: string) => {
    mocks.tabTitle.fallback = fallback;
    return mocks.tabTitle;
  },
}));
vi.mock('../../hosted/useGridContextLink.js', () => ({ useGridContextLink: mocks.useGridContextLink }));
vi.mock('../../hosted/useGridLinkNotifications.js', () => ({
  useGridLinkNotifications: mocks.useGridLinkNotifications,
}));
vi.mock('../../hosted/useInteropChannel.js', () => ({
  useInteropChannel: mocks.useInteropChannel,
  isInteropAvailable: mocks.isInteropAvailable,
}));

import { useBlotterViewFeatures, type BlotterViewFeaturesArgs } from './useBlotterViewFeatures.js';

function args(over: Partial<BlotterViewFeaturesArgs> = {}): BlotterViewFeaturesArgs {
  return {
    componentName: 'Blotter',
    defaultInstanceId: 'inst-default',
    withStorage: true,
    theme: 'dark' as never,
    ...over,
  };
}

const lastLinkCall = () => mocks.useGridContextLink.mock.calls.at(-1)![0];

beforeEach(() => {
  mocks.tabTitle.title = '';
  mocks.tabTitle.setTitle = vi.fn();
  mocks.hostedView.identity = { instanceId: 'inst-1', configManager: undefined };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('useBlotterViewFeatures — header caption', () => {
  it('prefers the live tab name, then the prop, then the component name', () => {
    mocks.tabTitle.title = 'Renamed Tab';
    const withTab = renderHook(() => useBlotterViewFeatures(args({ caption: 'Prop' })));
    expect(withTab.result.current.headerCaption).toBe('Renamed Tab');
    cleanup();

    mocks.tabTitle.title = '';
    const withProp = renderHook(() => useBlotterViewFeatures(args({ caption: 'Prop' })));
    expect(withProp.result.current.headerCaption).toBe('Prop');
    cleanup();

    const bare = renderHook(() => useBlotterViewFeatures(args()));
    expect(bare.result.current.headerCaption).toBe('Blotter');
  });

  it('seeds the tab title from the caption prop, falling back to the component name', () => {
    renderHook(() => useBlotterViewFeatures(args({ caption: 'Prop' })));
    expect(mocks.tabTitle.fallback).toBe('Prop');
    cleanup();
    renderHook(() => useBlotterViewFeatures(args()));
    expect(mocks.tabTitle.fallback).toBe('Blotter');
  });

  it('writes an edit into the tab name before telling the consumer', () => {
    const onCaptionChange = vi.fn();
    const { result } = renderHook(() => useBlotterViewFeatures(args({ onCaptionChange })));

    act(() => { result.current.handleCaptionChange('Rates'); });

    expect(mocks.tabTitle.setTitle).toHaveBeenCalledWith('Rates');
    expect(onCaptionChange).toHaveBeenCalledWith('Rates');
  });
});

/**
 * Context linking is opt-in and off by default. The `linkActive` flag gates
 * three separate things — capturing the grid API, the key-column callback and
 * the notification subscription — and they have to agree: a grid API captured
 * with linking off keeps a destroyed grid reachable, while a missing
 * `onRowIdFieldChange` with linking ON publishes rows keyed by the wrong column.
 */
describe('useBlotterViewFeatures — context linking', () => {
  it('stays inert when no contextLink config is passed', () => {
    const onReady = vi.fn();
    const { result } = renderHook(() => useBlotterViewFeatures(args({ onReady })));
    expect(result.current.onRowIdFieldChange).toBeUndefined();

    const handle = { gridApi: { id: 'api' } } as unknown as MarketsGridHandle;
    act(() => { result.current.handleReady(handle); });

    expect(onReady).toHaveBeenCalledWith(handle);
    expect(lastLinkCall().gridApi).toBeNull();
    expect(lastLinkCall().config).toBeUndefined();
    expect(mocks.useGridLinkNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it('stays inert for a config with enabled left off', () => {
    const contextLink = { enabled: false, rowIdField: 'cusip' };
    const { result } = renderHook(() => useBlotterViewFeatures(args({ contextLink })));
    expect(result.current.onRowIdFieldChange).toBeUndefined();
    // The config still reaches the link hook, which is what turns it off.
    expect(lastLinkCall().config).toEqual(contextLink);
  });

  it('captures the grid API and exposes the key-column callback when enabled', () => {
    const { result } = renderHook(() =>
      useBlotterViewFeatures(args({ contextLink: { enabled: true } })));

    act(() => {
      result.current.handleReady({ gridApi: { id: 'api' } } as unknown as MarketsGridHandle);
    });

    expect(lastLinkCall().gridApi).toEqual({ id: 'api' });
    expect(result.current.onRowIdFieldChange).toBeTypeOf('function');
  });

  it('lets the resolved key columns override the configured rowIdField', () => {
    const { result } = renderHook(() =>
      useBlotterViewFeatures(args({ contextLink: { enabled: true, rowIdField: 'configured' } })));
    expect(lastLinkCall().config).toMatchObject({ rowIdField: 'configured' });

    act(() => { result.current.onRowIdFieldChange!(['cusip', 'ccy']); });
    expect(lastLinkCall().config).toMatchObject({ rowIdField: ['cusip', 'ccy'] });
  });

  it('leaves the config untouched when neither side names a key column', () => {
    const contextLink = { enabled: true };
    const { result } = renderHook(() => useBlotterViewFeatures(args({ contextLink })));
    expect(lastLinkCall().config).toBe(contextLink);

    // A null from the grid means "not resolved yet", not "no key column".
    act(() => { result.current.onRowIdFieldChange!(null); });
    expect(lastLinkCall().config).toBe(contextLink);
  });

  it('enables notifications only when the config asks for them', () => {
    renderHook(() => useBlotterViewFeatures(args({ contextLink: { enabled: true, notify: true } })));
    expect(mocks.useGridLinkNotifications).toHaveBeenCalledWith({
      instanceId: 'inst-1', enabled: true,
    });
  });

  it('falls back to the default instance id before identity resolves', () => {
    mocks.hostedView.identity = { instanceId: undefined, configManager: undefined };
    renderHook(() => useBlotterViewFeatures(args({ contextLink: { enabled: true } })));
    expect(lastLinkCall().instanceId).toBe('inst-default');
  });

  it('prefers the OpenFin interop channel over the linking fdc3 when one exists', () => {
    mocks.isInteropAvailable.mockReturnValue(false);
    renderHook(() => useBlotterViewFeatures(args({ contextLink: { enabled: true } })));
    expect(lastLinkCall().fdc3).toEqual({ id: 'linking-fdc3' });
    cleanup();

    mocks.isInteropAvailable.mockReturnValue(true);
    renderHook(() => useBlotterViewFeatures(args({ contextLink: { enabled: true, debug: true } })));
    expect(lastLinkCall().fdc3).toEqual({ id: 'interop-fdc3' });
    expect(mocks.useInteropChannel).toHaveBeenLastCalledWith({ debug: true });
  });
});

/**
 * Workspace drag/move tears a view down WITHOUT firing `workspace-saving`, so
 * the flush on unmount is the only thing standing between a moved blotter and
 * a lost layout.
 */
describe('useBlotterViewFeatures — workspace save', () => {
  const saveFlush = () => mocks.hostedView.lastArgs.onWorkspaceSave as () => Promise<void>;

  it('saves everything through the grid handle', async () => {
    const saveAll = vi.fn(async () => {});
    const saveActiveProfile = vi.fn(async () => {});
    const { result } = renderHook(() => useBlotterViewFeatures(args()));
    act(() => {
      result.current.handleReady({ saveAll, profiles: { saveActiveProfile } } as unknown as MarketsGridHandle);
    });

    await saveFlush()();

    expect(saveAll).toHaveBeenCalledTimes(1);
    expect(saveActiveProfile).not.toHaveBeenCalled();
  });

  it('falls back to the active profile on a handle with no saveAll', async () => {
    const saveActiveProfile = vi.fn(async () => {});
    const { result } = renderHook(() => useBlotterViewFeatures(args()));
    act(() => {
      result.current.handleReady({ profiles: { saveActiveProfile } } as unknown as MarketsGridHandle);
    });

    await saveFlush()();

    expect(saveActiveProfile).toHaveBeenCalledTimes(1);
  });

  it('does nothing before a grid is ready', async () => {
    renderHook(() => useBlotterViewFeatures(args()));
    await expect(saveFlush()()).resolves.toBeUndefined();
  });

  it('flushes on page teardown and again on unmount', async () => {
    const saveAll = vi.fn(async () => {});
    const { result, unmount } = renderHook(() => useBlotterViewFeatures(args()));
    act(() => { result.current.handleReady({ saveAll } as unknown as MarketsGridHandle); });

    window.dispatchEvent(new Event('beforeunload'));
    window.dispatchEvent(new Event('pagehide'));
    expect(saveAll).toHaveBeenCalledTimes(2);

    unmount();
    expect(saveAll).toHaveBeenCalledTimes(3);
    // …and the listeners are gone, so a later event does not resurrect it.
    window.dispatchEvent(new Event('beforeunload'));
    expect(saveAll).toHaveBeenCalledTimes(3);
  });

  it('also flushes when an OpenFin view is destroyed, and detaches on unmount', () => {
    const handlers: Record<string, () => void> = {};
    const view = {
      on: vi.fn((event: string, cb: () => void) => { handlers[event] = cb; }),
      removeListener: vi.fn(),
    };
    vi.stubGlobal('fin', { View: { getCurrentSync: () => view } });
    const saveAll = vi.fn(async () => {});

    const { result, unmount } = renderHook(() => useBlotterViewFeatures(args()));
    act(() => { result.current.handleReady({ saveAll } as unknown as MarketsGridHandle); });

    handlers.destroyed();
    expect(saveAll).toHaveBeenCalledTimes(1);

    unmount();
    expect(view.removeListener).toHaveBeenCalledWith('destroyed', expect.any(Function));
    vi.unstubAllGlobals();
  });

  it('survives an OpenFin view lookup that throws', () => {
    vi.stubGlobal('fin', { View: { getCurrentSync: () => { throw new Error('no view'); } } });
    expect(() => renderHook(() => useBlotterViewFeatures(args()))).not.toThrow();
    vi.unstubAllGlobals();
  });
});

describe('useBlotterViewFeatures — document title', () => {
  it('sets the explicit title, and restores the previous one on unmount', () => {
    document.title = 'before';
    const { unmount } = renderHook(() =>
      useBlotterViewFeatures(args({ documentTitle: 'Rates Blotter' })));
    expect(document.title).toBe('Rates Blotter');
    unmount();
    expect(document.title).toBe('before');
  });

  it('falls back to the component name', () => {
    renderHook(() => useBlotterViewFeatures(args()));
    expect(document.title).toBe('Blotter');
  });
});

/**
 * The legacy `marketsgrid-view-state::*` rows are dead config from before the
 * profile store. The sentinel is what keeps this a ONE-SHOT: without it every
 * blotter mount in every view issues a delete for a row that is already gone.
 */
describe('useBlotterViewFeatures — legacy cleanup', () => {
  const configManager = () => ({ deleteConfig: vi.fn(async () => {}) });

  it('deletes the legacy row once, then records the sentinel', async () => {
    const cm = configManager();
    mocks.hostedView.identity = { instanceId: 'inst-1', configManager: cm };

    const first = renderHook(() => useBlotterViewFeatures(args()));
    await act(async () => {});
    expect(cm.deleteConfig).toHaveBeenCalledWith('marketsgrid-view-state::inst-1');
    expect(window.localStorage.getItem('hosted-mg.legacy-cleanup')).toBe('1');
    first.unmount();

    cm.deleteConfig.mockClear();
    renderHook(() => useBlotterViewFeatures(args()));
    await act(async () => {});
    expect(cm.deleteConfig).not.toHaveBeenCalled();
  });

  it('records the sentinel even when there was no row to delete', async () => {
    const cm = { deleteConfig: vi.fn(async () => { throw new Error('404'); }) };
    mocks.hostedView.identity = { instanceId: 'inst-1', configManager: cm };
    renderHook(() => useBlotterViewFeatures(args()));
    await act(async () => {});
    expect(window.localStorage.getItem('hosted-mg.legacy-cleanup')).toBe('1');
  });

  it('skips cleanup with no config manager or no resolved instance', async () => {
    const cm = configManager();
    mocks.hostedView.identity = { instanceId: 'inst-1', configManager: undefined };
    renderHook(() => useBlotterViewFeatures(args()));
    await act(async () => {});

    cleanup();
    mocks.hostedView.identity = { instanceId: undefined, configManager: cm };
    renderHook(() => useBlotterViewFeatures(args()));
    await act(async () => {});
    expect(cm.deleteConfig).not.toHaveBeenCalled();
  });

  it('skips cleanup entirely when localStorage is unreadable', async () => {
    const cm = configManager();
    mocks.hostedView.identity = { instanceId: 'inst-1', configManager: cm };
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    renderHook(() => useBlotterViewFeatures(args()));
    await act(async () => {});

    // Without a readable sentinel the delete would run on every single mount.
    expect(cm.deleteConfig).not.toHaveBeenCalled();
    getItem.mockRestore();
  });
});

describe('useBlotterViewFeatures — hosted view pass-through', () => {
  it('forwards identity, readiness, theme and tab visibility', () => {
    mocks.hostedView.ready = false;
    mocks.hostedView.tabsHidden = true;
    const { result } = renderHook(() => useBlotterViewFeatures(args()));
    expect(result.current.ready).toBe(false);
    expect(result.current.tabsHidden).toBe(true);
    expect(result.current.agTheme).toEqual({ id: 'theme' });
    expect(result.current.identity).toBe(mocks.hostedView.identity);
    mocks.hostedView.ready = true;
    mocks.hostedView.tabsHidden = false;
  });
});
