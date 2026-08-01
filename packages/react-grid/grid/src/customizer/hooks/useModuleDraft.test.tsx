import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { GridPlatform, type Module } from '@wellsfargo-starui/core';
import { GridProvider } from './GridProvider';
import { useModuleDraft } from './useModuleDraft';

interface Rule { id: string; name: string; enabled: boolean; }
interface RulesState { rules: Rule[]; }

const rulesModule: Module<RulesState> = {
  id: 'rules',
  name: 'Rules',
  schemaVersion: 1,
  priority: 0,
  getInitialState: () => ({
    rules: [
      { id: 'r1', name: 'Rule One', enabled: true },
      { id: 'r2', name: 'Rule Two', enabled: false },
    ],
  }),
  serialize: (s) => s,
  deserialize: (raw) => raw as RulesState,
};

function makePlatform(): GridPlatform {
  return new GridPlatform({ gridId: 'test', modules: [rulesModule] });
}

function wrap(platform: GridPlatform) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <GridProvider platform={platform}>{children}</GridProvider>;
  };
}

function useR1Draft(platform: GridPlatform) {
  return useModuleDraft<RulesState, Rule>({
    moduleId: 'rules',
    itemId: 'r1',
    selectItem: (s) => s.rules.find((r) => r.id === 'r1'),
    commitItem: (next) => (s) => ({
      ...s,
      rules: s.rules.map((r) => (r.id === next.id ? next : r)),
    }),
  });
}

describe('useModuleDraft', () => {
  let platform: GridPlatform;
  beforeEach(() => { platform = makePlatform(); });

  it('seeds draft from committed state', () => {
    const { result } = renderHook(() => useR1Draft(platform), { wrapper: wrap(platform) });
    expect(result.current.draft.name).toBe('Rule One');
    expect(result.current.dirty).toBe(false);
    expect(result.current.missing).toBe(false);
  });

  it('setDraft (object patch) makes it dirty without touching module state', () => {
    const { result } = renderHook(() => useR1Draft(platform), { wrapper: wrap(platform) });

    act(() => result.current.setDraft({ name: 'New Name' }));

    expect(result.current.draft.name).toBe('New Name');
    expect(result.current.dirty).toBe(true);
    // Module state still original.
    expect(platform.store.getModuleState<RulesState>('rules').rules[0].name).toBe('Rule One');
  });

  it('save() commits draft into module state and clears dirty', () => {
    const { result } = renderHook(() => useR1Draft(platform), { wrapper: wrap(platform) });

    act(() => result.current.setDraft({ name: 'Committed' }));
    act(() => result.current.save());

    expect(platform.store.getModuleState<RulesState>('rules').rules[0].name).toBe('Committed');
    expect(result.current.dirty).toBe(false);
  });

  it('discard() reverts to committed', () => {
    const { result } = renderHook(() => useR1Draft(platform), { wrapper: wrap(platform) });

    act(() => result.current.setDraft({ name: 'Typo' }));
    expect(result.current.draft.name).toBe('Typo');

    act(() => result.current.discard());
    expect(result.current.draft.name).toBe('Rule One');
    expect(result.current.dirty).toBe(false);
  });

  it('external rename re-seeds draft ONLY when clean', () => {
    const { result } = renderHook(() => useR1Draft(platform), { wrapper: wrap(platform) });

    // Case A: clean — external edit wins.
    act(() =>
      platform.store.setModuleState<RulesState>('rules', (s) => ({
        ...s,
        rules: s.rules.map((r) => (r.id === 'r1' ? { ...r, name: 'Renamed Externally' } : r)),
      })),
    );
    expect(result.current.draft.name).toBe('Renamed Externally');
    expect(result.current.dirty).toBe(false);

    // Case B: dirty — external edit MUST NOT stomp unsaved work.
    act(() => result.current.setDraft({ name: 'My Unsaved Draft' }));
    act(() =>
      platform.store.setModuleState<RulesState>('rules', (s) => ({
        ...s,
        rules: s.rules.map((r) => (r.id === 'r1' ? { ...r, name: 'Renamed Again' } : r)),
      })),
    );
    expect(result.current.draft.name).toBe('My Unsaved Draft');
    expect(result.current.dirty).toBe(true);
  });

  it('tracks dirty key on the per-platform DirtyBus', () => {
    const { result } = renderHook(() => useR1Draft(platform), { wrapper: wrap(platform) });

    expect(platform.resources.dirty().isDirty('rules:r1')).toBe(false);

    act(() => result.current.setDraft({ name: 'X' }));
    expect(platform.resources.dirty().isDirty('rules:r1')).toBe(true);

    act(() => result.current.discard());
    expect(platform.resources.dirty().isDirty('rules:r1')).toBe(false);
  });

  it('clears the dirty bus key on unmount', () => {
    const { result, unmount } = renderHook(() => useR1Draft(platform), { wrapper: wrap(platform) });

    act(() => result.current.setDraft({ name: 'X' }));
    expect(platform.resources.dirty().isDirty('rules:r1')).toBe(true);

    unmount();
    expect(platform.resources.dirty().isDirty('rules:r1')).toBe(false);
  });

  it('surfaces missing=true when the item disappears upstream', () => {
    const { result } = renderHook(() => useR1Draft(platform), { wrapper: wrap(platform) });
    expect(result.current.missing).toBe(false);

    // Someone else deletes r1.
    act(() =>
      platform.store.setModuleState<RulesState>('rules', (s) => ({
        ...s,
        rules: s.rules.filter((r) => r.id !== 'r1'),
      })),
    );
    expect(result.current.missing).toBe(true);
  });
});
