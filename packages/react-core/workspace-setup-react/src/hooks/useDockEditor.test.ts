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

vi.mock('@wellsfargo-starui/openfin-platform/config', () => ({
  loadDockConfig: (...a: unknown[]) => loadDockConfig(...a),
  saveDockConfig: (...a: unknown[]) => saveDockConfig(...a),
  clearDockConfig: (...a: unknown[]) => clearDockConfig(...a),
  loadRegistryConfig: (...a: unknown[]) => loadRegistryConfig(...a),
  IAB_DOCK_CONFIG_UPDATE: 'dock-config-update',
  IAB_REGISTRY_CONFIG_UPDATE: 'registry-config-update',
}));

const button = (id: string) => ({ id, tooltip: id, type: 'DockButton' as const });

async function importHook() {
  return (await import('./useDockEditor.js')).useDockEditor;
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
