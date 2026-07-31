import { describe, expect, it, vi } from 'vitest';
import type { AppConfigRow, CreateConfigInput } from '@wellsfargo-starui/host-config';
import {
  deleteLayout, getLayouts, loadLayout, saveLayout, type LayoutConfigStore,
} from './widgetLayouts.js';

/**
 * Layouts are ordinary configs with componentType 'simple-blotter-layout' and a
 * `{ parentConfigId, state, isDefault }` payload. The behaviour worth pinning is
 * the filtering by parent and the row→LayoutInfo mapping, since a layout leaking
 * across parents would show one blotter's saved views on another.
 *
 * `LayoutConfigStore` is structural precisely so a fake satisfies it.
 */

function row(over: Partial<AppConfigRow> = {}): AppConfigRow {
  return {
    configId: 'layout-1',
    appId: 'app',
    userId: 'u1',
    componentType: 'simple-blotter-layout',
    componentSubType: '',
    isTemplate: false,
    displayText: 'Trader view',
    payload: { parentConfigId: 'parent-1', state: { cols: ['a'] }, isDefault: false },
    createdBy: 'u1',
    updatedBy: 'u1',
    creationTime: '2026-01-01T00:00:00Z',
    updatedTime: '2026-01-02T00:00:00Z',
    ...over,
  } as AppConfigRow;
}

function makeStore(over: Partial<LayoutConfigStore> = {}): LayoutConfigStore {
  return {
    findByComponentType: vi.fn(async () => []),
    createConfig: vi.fn(async (input: CreateConfigInput) => ({ ...row(), ...input }) as AppConfigRow),
    getConfig: vi.fn(async () => undefined),
    deleteConfig: vi.fn(async () => {}),
    ...over,
  };
}

describe('getLayouts', () => {
  it('queries only the layout component type', async () => {
    const store = makeStore();
    await getLayouts(store, 'parent-1');
    expect(store.findByComponentType).toHaveBeenCalledWith('simple-blotter-layout');
  });

  it('returns only layouts belonging to the requested parent', async () => {
    const store = makeStore({
      findByComponentType: vi.fn(async () => [
        row({ configId: 'mine', payload: { parentConfigId: 'parent-1', state: {} } }),
        row({ configId: 'theirs', payload: { parentConfigId: 'parent-2', state: {} } }),
      ]),
    });

    const result = await getLayouts(store, 'parent-1');
    expect(result.map((l) => l.id)).toEqual(['mine']);
  });

  it('skips rows with a null or missing payload rather than throwing', async () => {
    const store = makeStore({
      findByComponentType: vi.fn(async () => [
        row({ configId: 'null-payload', payload: null as never }),
        row({ configId: 'no-payload', payload: undefined as never }),
        row({ configId: 'good' }),
      ]),
    });

    expect((await getLayouts(store, 'parent-1')).map((l) => l.id)).toEqual(['good']);
  });

  it('maps a row onto LayoutInfo, carrying timestamps and the default flag', async () => {
    const store = makeStore({
      findByComponentType: vi.fn(async () => [
        row({
          configId: 'l-9',
          displayText: 'Risk view',
          payload: { parentConfigId: 'parent-1', state: { pinned: true }, isDefault: true },
        }),
      ]),
    });

    expect((await getLayouts(store, 'parent-1'))[0]).toEqual({
      id: 'l-9',
      name: 'Risk view',
      configId: 'parent-1',
      isDefault: true,
      state: { pinned: true },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    });
  });

  it('defaults isDefault to false and state to an empty object when absent', async () => {
    const store = makeStore({
      findByComponentType: vi.fn(async () => [
        row({ payload: { parentConfigId: 'parent-1' } }),
      ]),
    });

    const [layout] = await getLayouts(store, 'parent-1');
    expect(layout.isDefault).toBe(false);
    expect(layout.state).toEqual({});
  });
});

describe('saveLayout', () => {
  it('creates a layout config scoped to the parent and user', async () => {
    const store = makeStore();
    await saveLayout(store, 'parent-1', 'My view', { cols: ['x'] }, 'k123', 'Star-Demo');

    const input = (store.createConfig as ReturnType<typeof vi.fn>).mock.calls[0][0] as CreateConfigInput;
    expect(input).toMatchObject({
      appId: 'Star-Demo',
      userId: 'k123',
      componentType: 'simple-blotter-layout',
      isTemplate: false,
      displayText: 'My view',
      payload: { parentConfigId: 'parent-1', state: { cols: ['x'] }, isDefault: false },
      createdBy: 'k123',
      updatedBy: 'k123',
    });
    expect(input.configId).toEqual(expect.any(String));
  });

  it('gives each saved layout a distinct configId', async () => {
    const store = makeStore();
    await saveLayout(store, 'p', 'a', {}, 'u', 'app');
    await saveLayout(store, 'p', 'b', {}, 'u', 'app');

    const calls = (store.createConfig as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0].configId).not.toBe(calls[1][0].configId);
  });

  it('returns the created layout mapped to LayoutInfo', async () => {
    const store = makeStore({
      createConfig: vi.fn(async (input: CreateConfigInput) => row({
        configId: input.configId,
        displayText: input.displayText,
        payload: input.payload,
      })),
    });

    const saved = await saveLayout(store, 'parent-1', 'Named', { a: 1 }, 'u', 'app');
    expect(saved).toMatchObject({ name: 'Named', configId: 'parent-1', state: { a: 1 }, isDefault: false });
  });
});

describe('loadLayout', () => {
  it('returns the stored state for a known layout', async () => {
    const store = makeStore({
      getConfig: vi.fn(async () => row({ payload: { parentConfigId: 'p', state: { z: 1 } } })),
    });
    expect(await loadLayout(store, 'layout-1')).toEqual({ z: 1 });
  });

  it('returns null when the layout does not exist', async () => {
    expect(await loadLayout(makeStore(), 'missing')).toBeNull();
  });

  it('returns null when the row carries no state', async () => {
    const store = makeStore({
      getConfig: vi.fn(async () => row({ payload: { parentConfigId: 'p' } })),
    });
    expect(await loadLayout(store, 'layout-1')).toBeNull();
  });

  it('returns null when the payload itself is null', async () => {
    const store = makeStore({ getConfig: vi.fn(async () => row({ payload: null as never })) });
    expect(await loadLayout(store, 'layout-1')).toBeNull();
  });
});

describe('deleteLayout', () => {
  it('deletes by config id', async () => {
    const store = makeStore();
    await deleteLayout(store, 'layout-7');
    expect(store.deleteConfig).toHaveBeenCalledWith('layout-7');
  });
});
