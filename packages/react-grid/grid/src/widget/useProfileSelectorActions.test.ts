import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileMeta } from '@wellsfargo-starui/core';
import {
  useProfileImportInputHandler,
  useProfileSelectorActions,
} from './useProfileSelectorActions';

function makeProfiles(overrides: Partial<{
  profiles: ProfileMeta[];
  createProfile: ReturnType<typeof vi.fn>;
  deleteProfile: ReturnType<typeof vi.fn>;
  cloneProfile: ReturnType<typeof vi.fn>;
  renameProfile: ReturnType<typeof vi.fn>;
  exportProfile: ReturnType<typeof vi.fn>;
  importProfile: ReturnType<typeof vi.fn>;
}> = {}) {
  return {
    profiles: overrides.profiles ?? [
      { id: 'a', name: 'Alpha', updatedAt: 1 },
      { id: 'b', name: 'Beta', updatedAt: 2 },
    ],
    createProfile: overrides.createProfile ?? vi.fn(),
    deleteProfile: overrides.deleteProfile ?? vi.fn(),
    loadProfile: vi.fn(),
    cloneProfile: overrides.cloneProfile ?? vi.fn(async () => ({ id: 'c', name: 'Alpha (copy)', updatedAt: 3 })),
    renameProfile: overrides.renameProfile ?? vi.fn(async () => {}),
    exportProfile: overrides.exportProfile ?? vi.fn(async () => ({ profile: { name: 'Alpha Profile!' } })),
    importProfile: overrides.importProfile ?? vi.fn(async () => {}),
    saveActiveProfile: vi.fn(),
    discardActiveProfile: vi.fn(),
    isDirty: false,
    activeProfileId: 'a',
  };
}

describe('useProfileSelectorActions', () => {
  let alertSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('delegates create, load, and delete to profile manager', () => {
    const profiles = makeProfiles();
    const onLoad = vi.fn();
    const { result } = renderHook(() => useProfileSelectorActions(profiles as never, onLoad));

    result.current.onCreate('New');
    expect(profiles.createProfile).toHaveBeenCalledWith('New');

    result.current.onLoad('b');
    expect(onLoad).toHaveBeenCalledWith('b');

    result.current.onDelete('a');
    expect(profiles.deleteProfile).toHaveBeenCalledWith('a');
  });

  it('clones with a unique copy name when duplicates exist', async () => {
    const profiles = makeProfiles({
      profiles: [
        { id: 'a', name: 'Alpha', updatedAt: 1 },
        { id: 'x', name: 'Alpha (copy)', updatedAt: 2 },
        { id: 'y', name: 'Alpha (copy 2)', updatedAt: 3 },
      ],
    });
    const { result } = renderHook(() => useProfileSelectorActions(profiles as never, vi.fn()));

    await act(async () => {
      await result.current.onClone('a');
    });
    expect(profiles.cloneProfile).toHaveBeenCalledWith('a', 'Alpha (copy 3)');
  });

  it('returns early when clone source is missing', async () => {
    const profiles = makeProfiles();
    const { result } = renderHook(() => useProfileSelectorActions(profiles as never, vi.fn()));

    await act(async () => {
      await result.current.onClone('missing');
    });
    expect(profiles.cloneProfile).not.toHaveBeenCalled();
  });

  it('alerts when clone fails', async () => {
    const profiles = makeProfiles({
      cloneProfile: vi.fn(async () => { throw new Error('disk full'); }),
    });
    const { result } = renderHook(() => useProfileSelectorActions(profiles as never, vi.fn()));

    await act(async () => {
      await result.current.onClone('a');
    });
    expect(warnSpy).toHaveBeenCalledWith('[markets-grid] profile clone failed:', expect.any(Error));
    expect(alertSpy).toHaveBeenCalledWith('Could not clone profile: disk full');
  });

  it('alerts when rename fails', async () => {
    const profiles = makeProfiles({
      renameProfile: vi.fn(async () => { throw 'nope'; }),
    });
    const { result } = renderHook(() => useProfileSelectorActions(profiles as never, vi.fn()));

    await act(async () => {
      await result.current.onRename('a', 'Renamed');
    });
    expect(alertSpy).toHaveBeenCalledWith('Could not rename profile: nope');
  });

  it('exports profile as a downloadable JSON blob', async () => {
    const appendChild = vi.spyOn(document.body, 'appendChild');
    const remove = vi.spyOn(HTMLElement.prototype, 'remove');
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.useFakeTimers();

    const profiles = makeProfiles();
    const { result } = renderHook(() => useProfileSelectorActions(profiles as never, vi.fn()));

    await act(async () => {
      await result.current.onExport('a');
    });

    expect(profiles.exportProfile).toHaveBeenCalledWith('a');
    expect(appendChild).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');

    vi.useRealTimers();
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    appendChild.mockRestore();
    remove.mockRestore();
  });

  it('falls back to profile id stem when export name sanitizes to empty', async () => {
    const profiles = makeProfiles({
      exportProfile: vi.fn(async () => ({ profile: { name: '!!!' } })),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { result } = renderHook(() => useProfileSelectorActions(profiles as never, vi.fn()));

    await act(async () => {
      await result.current.onExport('a');
    });
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it('alerts when export fails', async () => {
    const profiles = makeProfiles({
      exportProfile: vi.fn(async () => { throw new Error('export fail'); }),
    });
    const { result } = renderHook(() => useProfileSelectorActions(profiles as never, vi.fn()));

    await act(async () => {
      await result.current.onExport('a');
    });
    expect(alertSpy).toHaveBeenCalledWith('Could not export profile: export fail');
  });

  it('imports profile JSON from file text', async () => {
    const profiles = makeProfiles();
    const { result } = renderHook(() => useProfileSelectorActions(profiles as never, vi.fn()));
    const file = { text: vi.fn(async () => JSON.stringify({ profile: { name: 'Imported' } })) } as unknown as File;

    await act(async () => {
      await result.current.onImport(file);
    });
    expect(profiles.importProfile).toHaveBeenCalledWith({ profile: { name: 'Imported' } });
  });

  it('alerts when import fails', async () => {
    const profiles = makeProfiles();
    const { result } = renderHook(() => useProfileSelectorActions(profiles as never, vi.fn()));
    const file = { text: vi.fn(async () => '{not json') } as unknown as File;

    await act(async () => {
      await result.current.onImport(file);
    });
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Could not import profile'));
  });
});

describe('useProfileImportInputHandler', () => {
  it('imports selected file and clears input value', async () => {
    const onImport = vi.fn(async () => {});
    const { result } = renderHook(() => useProfileImportInputHandler(onImport));
    const file = new File(['{}'], 'profile.json', { type: 'application/json' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file] });

    await act(async () => {
      result.current({ target: input } as never);
    });
    expect(onImport).toHaveBeenCalledWith(file);
    expect(input.value).toBe('');
  });

  it('ignores change events with no file selected', () => {
    const onImport = vi.fn();
    const { result } = renderHook(() => useProfileImportInputHandler(onImport));
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [] });

    result.current({ target: input } as never);
    expect(onImport).not.toHaveBeenCalled();
  });
});
