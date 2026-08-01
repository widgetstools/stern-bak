/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { GridPlatform, MemoryAdapter } from '@wellsfargo-starui/core';
import { GridProvider } from './GridProvider.js';
import { useProfileManager } from './useProfileManager.js';

function wrap(platform: GridPlatform) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <GridProvider platform={platform}>{children}</GridProvider>;
  };
}

describe('useProfileManager', () => {
  let platform: GridPlatform;
  let adapter: MemoryAdapter;

  beforeEach(() => {
    adapter = new MemoryAdapter();
    platform = new GridPlatform({ gridId: 'profile-hook-grid', modules: [] });
  });

  it('boots manager and exposes profile state', async () => {
    const { result } = renderHook(
      () => useProfileManager({ adapter, disableAutoSave: true }),
      { wrapper: wrap(platform) },
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.activeProfileId).toBeTruthy();
    expect(result.current.isLoading).toBe(false);
  });

  it('selector sub-hooks return defaults before manager init', () => {
    const { result: dirty } = renderHook(() => useProfileManager.useIsDirty(), {
      wrapper: wrap(platform),
    });
    expect(dirty.current).toBe(false);
  });

  it('reuses singleton manager across hook instances', async () => {
    const hookA = renderHook(
      () => useProfileManager({ adapter, disableAutoSave: true }),
      { wrapper: wrap(platform) },
    );
    const hookB = renderHook(
      () => useProfileManager({ adapter, disableAutoSave: true }),
      { wrapper: wrap(platform) },
    );
    await act(async () => {
      await hookA.result.current.createProfile('Clone me');
    });
    expect(hookB.result.current.profiles.some((p) => p.name === 'Clone me')).toBe(true);
  });

  it('exposes selector sub-hooks after manager boots', async () => {
    renderHook(() => useProfileManager({ adapter, disableAutoSave: true }), {
      wrapper: wrap(platform),
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const { result: activeId } = renderHook(() => useProfileManager.useActiveId(), {
      wrapper: wrap(platform),
    });
    const { result: profiles } = renderHook(() => useProfileManager.useProfiles(), {
      wrapper: wrap(platform),
    });
    const { result: loading } = renderHook(() => useProfileManager.useIsLoading(), {
      wrapper: wrap(platform),
    });

    expect(activeId.current).toBeTruthy();
    expect(profiles.current.length).toBeGreaterThan(0);
    expect(loading.current).toBe(false);
  });

  it('supports load, save, discard, clone, delete, rename, export, import', async () => {
    const { result } = renderHook(
      () => useProfileManager({ adapter, disableAutoSave: true }),
      { wrapper: wrap(platform) },
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    let createdId = '';
    await act(async () => {
      const created = await result.current.createProfile('Alpha');
      createdId = created.id;
    });

    await act(async () => {
      await result.current.loadProfile(createdId);
    });
    await act(async () => {
      await result.current.saveActiveProfile();
    });
    await act(async () => {
      await result.current.discardActiveProfile();
    });

    await act(async () => {
      await result.current.cloneProfile(createdId, 'Alpha copy');
    });
    await act(async () => {
      await result.current.renameProfile(createdId, 'Alpha renamed');
    });

    let exported: unknown;
    await act(async () => {
      exported = await result.current.exportProfile(createdId);
    });
    expect(exported).toBeTruthy();

    await act(async () => {
      await result.current.importProfile(exported, { name: 'Imported', activate: true });
    });

    await act(async () => {
      await result.current.deleteProfile(createdId);
    });
    expect(result.current.profiles.some((p) => p.id === createdId)).toBe(false);
  });

  it('disposes manager when platform emits grid:destroyed', async () => {
    renderHook(() => useProfileManager({ adapter, disableAutoSave: true }), {
      wrapper: wrap(platform),
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    act(() => {
      platform.events.emit('grid:destroyed', { gridId: platform.gridId });
    });
    const { result: loading } = renderHook(() => useProfileManager.useIsLoading(), {
      wrapper: wrap(platform),
    });
    expect(loading.current).toBe(true);
  });
});
