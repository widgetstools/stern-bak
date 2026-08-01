import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { RegistryEntry } from '@wellsfargo-starui/openfin/config';

/**
 * useRegistryEditor owns the component-catalog reducer plus the save-time id
 * normalisation. Persistence, host-env discovery and OpenFin IAB are
 * boundaries and are mocked; `deriveTemplateConfigId`, `migrateRegistryToV2`,
 * `resolveHostUrl` and `REGISTRY_CONFIG_VERSION` come from the real
 * side-effect-free `/config` subpath so the normalisation under test is the
 * production rule and not a restatement of it.
 *
 * The hook imports the MAIN `@wellsfargo-starui/openfin-platform` barrel,
 * which cannot be evaluated outside OpenFin — hence the whole-barrel mock
 * rather than a partial one. See WORKLOG item 7.
 */

const loadRegistryConfig = vi.fn();
const saveRegistryConfig = vi.fn();
const clearRegistryConfig = vi.fn();
const readHostEnv = vi.fn();

vi.mock('@wellsfargo-starui/openfin', async () => {
  const config = await import('@wellsfargo-starui/openfin/config');
  return {
    ...config,
    loadRegistryConfig: (...a: unknown[]) => loadRegistryConfig(...a),
    saveRegistryConfig: (...a: unknown[]) => saveRegistryConfig(...a),
    clearRegistryConfig: (...a: unknown[]) => clearRegistryConfig(...a),
    readHostEnv: (...a: unknown[]) => readHostEnv(...a),
  };
});

const { useRegistryEditor } = await import('./useRegistryEditor.js');
const { REGISTRY_CONFIG_VERSION } = await import('@wellsfargo-starui/openfin/config');

const hostEnv = { appId: 'star-demo', configServiceUrl: 'https://cfg.example', userId: 'k123' };

function entry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: 'grid-credit',
    hostUrl: '/blotters/marketsgrid',
    iconId: 'mkt:bond',
    componentType: 'GRID',
    componentSubType: 'CREDIT',
    configId: 'grid-credit',
    displayName: 'Credit blotter',
    createdAt: '2026-01-01T00:00:00.000Z',
    type: 'internal',
    usesHostConfig: true,
    appId: 'star-demo',
    configServiceUrl: 'https://cfg.example',
    singleton: false,
    ...overrides,
  } as RegistryEntry;
}

/** Mount and wait for the on-mount load to settle. */
async function mount(opts?: Parameters<typeof useRegistryEditor>[0]) {
  const view = renderHook(() => useRegistryEditor(opts));
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  return view;
}

beforeEach(() => {
  loadRegistryConfig.mockReset().mockResolvedValue({ version: 2, entries: [entry()] });
  saveRegistryConfig.mockReset().mockResolvedValue(undefined);
  clearRegistryConfig.mockReset().mockResolvedValue(undefined);
  readHostEnv.mockReset().mockResolvedValue(hostEnv);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useRegistryEditor — load', () => {
  it('starts loading, then publishes the persisted entries and host env', async () => {
    const { result } = renderHook(() => useRegistryEditor());
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entries.map((e) => e.id)).toEqual(['grid-credit']);
    expect(result.current.hostEnv).toEqual(hostEnv);
    expect(result.current.isDirty).toBe(false);
  });

  it('threads the scope through to storage', async () => {
    const scope = { appId: 'star-demo', userId: 'k123' };
    await mount({ scope });

    expect(loadRegistryConfig).toHaveBeenCalledWith(scope);
  });

  it('migrates a v1 config on the way in', async () => {
    // Migration runs here so no downstream code ever sees a v1 entry.
    loadRegistryConfig.mockResolvedValue({
      version: 1,
      entries: [{ id: 'legacy', url: '/legacy', name: 'Legacy', componentType: 'GRID', componentSubType: 'RATES' }],
    });
    const { result } = await mount();

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].appId).toBe('star-demo');
  });

  it('lands empty rather than stuck when the load fails', async () => {
    loadRegistryConfig.mockRejectedValue(new Error('indexeddb unavailable'));
    const { result } = await mount();

    expect(result.current.entries).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });

  it('starts empty when nothing has been persisted', async () => {
    loadRegistryConfig.mockResolvedValue(null);
    const { result } = await mount();

    expect(result.current.entries).toEqual([]);
  });
});

describe('useRegistryEditor — reducer', () => {
  it('adding an entry marks the editor dirty', async () => {
    const { result } = await mount();

    act(() => { result.current.dispatch({ type: 'ADD_ENTRY', entry: entry({ id: 'draft-1' }) }); });

    expect(result.current.entries.map((e) => e.id)).toEqual(['grid-credit', 'draft-1']);
    expect(result.current.isDirty).toBe(true);
  });

  it('updating an entry replaces only the matching row', async () => {
    loadRegistryConfig.mockResolvedValue({
      version: 2,
      entries: [entry(), entry({ id: 'grid-rates', componentSubType: 'RATES', configId: 'grid-rates' })],
    });
    const { result } = await mount();

    act(() => {
      result.current.dispatch({
        type: 'UPDATE_ENTRY',
        id: 'grid-rates',
        entry: entry({ id: 'grid-rates', componentSubType: 'RATES', displayName: 'Rates blotter' }),
      });
    });

    expect(result.current.entries[0].displayName).toBe('Credit blotter');
    expect(result.current.entries[1].displayName).toBe('Rates blotter');
    expect(result.current.isDirty).toBe(true);
  });

  it('removing an entry drops it and marks the editor dirty', async () => {
    const { result } = await mount();

    act(() => { result.current.dispatch({ type: 'REMOVE_ENTRY', id: 'grid-credit' }); });

    expect(result.current.entries).toEqual([]);
    expect(result.current.isDirty).toBe(true);
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
    const before = result.current.entries;

    act(() => {
      result.current.dispatch({ type: 'NOT_A_REAL_ACTION' } as unknown as Parameters<typeof result.current.dispatch>[0]);
    });

    expect(result.current.entries).toBe(before);
  });
});

describe('useRegistryEditor — save', () => {
  it('rewrites a draft id to the canonical type-subtype pair', async () => {
    const { result } = await mount();
    act(() => {
      result.current.dispatch({
        type: 'ADD_ENTRY',
        entry: entry({ id: 'draft-abc', configId: '', componentType: 'GRID', componentSubType: 'RATES' }),
      });
    });

    await act(async () => { await result.current.save(); });

    const [config] = saveRegistryConfig.mock.calls[0];
    expect(config.version).toBe(REGISTRY_CONFIG_VERSION);
    // A UUID must never reach disk — dock buttons reference entries by id.
    expect(config.entries.map((e: RegistryEntry) => e.id)).toEqual(['grid-credit', 'grid-rates']);
    expect(config.entries[1].configId).toBe('grid-rates');
  });

  it('reflects the rewritten ids back into the editor state', async () => {
    const { result } = await mount();
    act(() => {
      result.current.dispatch({
        type: 'ADD_ENTRY',
        entry: entry({ id: 'draft-abc', configId: '', componentSubType: 'RATES' }),
      });
    });

    await act(async () => { await result.current.save(); });

    // Selection-by-id and the dock's references would otherwise stay pinned
    // to the temp id the user can no longer see.
    expect(result.current.entries.map((e) => e.id)).toEqual(['grid-credit', 'grid-rates']);
    expect(result.current.isDirty).toBe(false);
  });

  it('leaves a genuinely incomplete draft untouched', async () => {
    loadRegistryConfig.mockResolvedValue({
      version: 2,
      entries: [entry({ id: 'draft-x', componentType: '', componentSubType: '', configId: '' })],
    });
    const { result } = await mount();

    await act(async () => { await result.current.save(); });

    const [config] = saveRegistryConfig.mock.calls[0];
    expect(config.entries[0].id).toBe('draft-x');
  });

  it('threads the scope through to the write', async () => {
    const scope = { appId: 'star-demo', userId: 'k123' };
    const { result } = await mount({ scope });

    await act(async () => { await result.current.save(); });

    expect(saveRegistryConfig).toHaveBeenCalledWith(expect.any(Object), scope);
  });

  it('publishes the saved config over the IAB when running inside OpenFin', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fin', { InterApplicationBus: { publish } });
    const { result } = await mount();

    await act(async () => { await result.current.save(); });

    expect(publish).toHaveBeenCalledWith('registry-config-update', expect.objectContaining({ version: REGISTRY_CONFIG_VERSION }));
  });

  it('still completes the save when the IAB publish throws', async () => {
    vi.stubGlobal('fin', {
      InterApplicationBus: { publish: vi.fn().mockRejectedValue(new Error('bus down')) },
    });
    const { result } = await mount();

    await act(async () => { await result.current.save(); });

    // The write already landed; a failed broadcast must not surface as a
    // failed save.
    expect(saveRegistryConfig).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('useRegistryEditor — reload and reset', () => {
  it('reload re-reads storage and never writes to it', async () => {
    const { result } = await mount();
    act(() => { result.current.dispatch({ type: 'ADD_ENTRY', entry: entry({ id: 'draft-1' }) }); });

    loadRegistryConfig.mockResolvedValue({ version: 2, entries: [entry({ id: 'grid-rates', componentSubType: 'RATES' })] });
    await act(async () => { await result.current.reload(); });

    expect(result.current.entries.map((e) => e.id)).toEqual(['grid-rates']);
    expect(result.current.isDirty).toBe(false);
    // reload() backs the "Discard changes" button — it must never destroy data.
    expect(saveRegistryConfig).not.toHaveBeenCalled();
    expect(clearRegistryConfig).not.toHaveBeenCalled();
  });

  it('reload falls back to empty when storage throws', async () => {
    const { result } = await mount();

    loadRegistryConfig.mockRejectedValue(new Error('gone'));
    await act(async () => { await result.current.reload(); });

    expect(result.current.entries).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });

  it('reset clears the persisted registry — the destructive path', async () => {
    const scope = { appId: 'star-demo', userId: 'k123' };
    const { result } = await mount({ scope });

    await act(async () => { await result.current.reset(); });

    expect(clearRegistryConfig).toHaveBeenCalledWith(scope);
    expect(result.current.entries).toEqual([]);
  });
});

describe('useRegistryEditor — test launch', () => {
  it('opens a browser tab at the resolved URL outside OpenFin', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    const { result } = await mount();

    await act(async () => { await result.current.testComponent(entry()); });

    // Host-relative paths are normalised against the editor's own origin.
    expect(open).toHaveBeenCalledWith(`${window.location.origin}/blotters/marketsgrid`, '_blank');
  });

  it('creates a view targeting the template row inside OpenFin', async () => {
    const createView = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fin', {
      Platform: { getCurrentSync: () => ({ createView }) },
      InterApplicationBus: { publish: vi.fn() },
    });
    const { result } = await mount();

    await act(async () => { await result.current.testComponent(entry({ singleton: true })); });

    const [{ customData }] = createView.mock.calls[0];
    // A test launch writes straight onto the template row, so instanceId and
    // templateId are deliberately the same canonical id.
    expect(customData.instanceId).toBe('grid-credit');
    expect(customData.templateId).toBe('grid-credit');
    expect(customData.isTemplate).toBe(true);
    expect(customData.singleton).toBe(true);
    expect(customData.appId).toBe('star-demo');
  });

  it('derives the template id when the entry has no configId yet', async () => {
    const createView = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fin', {
      Platform: { getCurrentSync: () => ({ createView }) },
      InterApplicationBus: { publish: vi.fn() },
    });
    const { result } = await mount();

    await act(async () => { await result.current.testComponent(entry({ configId: '' })); });

    expect(createView.mock.calls[0][0].customData.templateId).toBe('grid-credit');
  });

  it('sends no userId, because the callback never sees the loaded host env', async () => {
    const createView = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fin', {
      Platform: { getCurrentSync: () => ({ createView }) },
      InterApplicationBus: { publish: vi.fn() },
    });
    const { result } = await mount();

    await act(async () => { await result.current.testComponent(entry()); });

    // Pinning real behaviour, not endorsing it: `testComponent` is memoised
    // with an empty dependency list, so it closes over the INITIAL hostEnv
    // and `customData.userId` is always undefined even after readHostEnv
    // resolved with 'k123'. Recorded as WORKLOG item 7.
    expect(result.current.hostEnv.userId).toBe('k123');
    expect(createView.mock.calls[0][0].customData.userId).toBeUndefined();
  });

  it('swallows a failed launch rather than breaking the editor', async () => {
    vi.stubGlobal('fin', {
      Platform: { getCurrentSync: () => ({ createView: vi.fn().mockRejectedValue(new Error('no platform')) }) },
      InterApplicationBus: { publish: vi.fn() },
    });
    const { result } = await mount();

    await act(async () => { await result.current.testComponent(entry()); });

    expect(console.warn).toHaveBeenCalled();
  });
});
