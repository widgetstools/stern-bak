import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import { captureGrid, restore, pushEntry, describeUndo, isMutatingTool, IRREVERSIBLE_TOOLS } from './undo';

const GRID_ENTRY = {
  id: 'grid-test', configId: 'grid-test', componentType: 'grid', componentSubType: 'test',
  displayName: 'TestGrid', hostUrl: '/#/blotters/marketsgrid', iconId: '', createdAt: '',
  type: 'internal' as const, usesHostConfig: true, appId: 'Star-Demo', configServiceUrl: '',
  singleton: false, asWindow: true,
};

const mockLoadRegistryConfig = vi.fn();
vi.mock('@wellsfargo-starui/openfin/config', () => ({
  loadRegistryConfig: (...args: unknown[]) => mockLoadRegistryConfig(...args),
}));

function fakeManager(rows: Record<string, Array<Record<string, unknown>>>, instances: string[] = []) {
  const list = vi.fn(async ({ instanceId }: { instanceId: string }) => rows[instanceId] ?? []);
  const save = vi.fn().mockResolvedValue(undefined);
  const del = vi.fn().mockResolvedValue(undefined);
  const findByComponentType = vi.fn().mockResolvedValue(
    instances.map((configId) => ({ configId, componentType: 'grid', componentSubType: 'test', isTemplate: false })),
  );
  const configManager = {
    profiles: { list, save, delete: del, loadGridLevelData: vi.fn(), saveGridLevelData: vi.fn() },
    findByComponentType,
  } as unknown as ConfigManager;
  return { configManager, list, save, del };
}

beforeEach(() => {
  mockLoadRegistryConfig.mockReset().mockResolvedValue({ version: 2, entries: [GRID_ENTRY] });
});

describe('isMutatingTool', () => {
  it('treats read-only tools as not worth snapshotting', () => {
    for (const name of ['list_grids', 'get_module_settings', 'describe_data_fields', 'diagnose_grid']) {
      expect(isMutatingTool(name)).toBe(false);
    }
  });

  it('treats writes as mutating', () => {
    for (const name of ['set_column_layout', 'add_conditional_styling_rule', 'create_profile']) {
      expect(isMutatingTool(name)).toBe(true);
    }
  });
});

describe('captureGrid', () => {
  /** A snapshot of the template alone would not restore an open window. */
  it('captures every write target, template and instances', async () => {
    const { configManager } = fakeManager(
      { 'grid-test': [{ id: '__default__' }], 'inst-1': [{ id: '__default__' }] },
      ['inst-1'],
    );

    const backups = await captureGrid(configManager, 'grid-test');

    expect(backups.map((b) => b.instanceId)).toEqual(['grid-test', 'inst-1']);
  });

  it('returns nothing for an unknown grid rather than throwing mid-turn', async () => {
    mockLoadRegistryConfig.mockResolvedValue({ version: 2, entries: [] });
    const { configManager } = fakeManager({});
    expect(await captureGrid(configManager, 'nope')).toEqual([]);
  });
});

describe('restore', () => {
  it('writes the captured profiles back', async () => {
    const { configManager, save } = fakeManager({ 'grid-test': [] });

    await restore(configManager, [
      { instanceId: 'grid-test', snapshots: [{ id: '__default__', gridId: 'grid-test', name: 'Default', state: {}, createdAt: 1, updatedAt: 1 }] },
    ]);

    expect(save).toHaveBeenCalledTimes(1);
    const [scope, snapshot] = save.mock.calls[0] as [{ instanceId: string }, { id: string }];
    expect(scope.instanceId).toBe('grid-test');
    expect(snapshot.id).toBe('__default__');
  });

  /** Otherwise "create a profile" would be un-undoable. */
  it('deletes profiles that exist now but were not in the backup', async () => {
    const { configManager, del } = fakeManager({
      'grid-test': [{ id: '__default__' }, { id: 'ai-new-profile' }],
    });

    await restore(configManager, [
      { instanceId: 'grid-test', snapshots: [{ id: '__default__', gridId: 'grid-test', name: 'Default', state: {}, createdAt: 1, updatedAt: 1 }] },
    ]);

    expect(del).toHaveBeenCalledTimes(1);
    expect(del.mock.calls[0][1]).toBe('ai-new-profile');
  });
});

describe('stack behaviour', () => {
  it('keeps the stack bounded', () => {
    let stack: ReturnType<typeof pushEntry> = [];
    for (let i = 0; i < 15; i++) {
      stack = pushEntry(stack, { label: `turn ${i}`, backups: [], irreversible: [], at: i });
    }
    expect(stack).toHaveLength(10);
    expect(stack[0].label).toBe('turn 5');
    expect(stack.at(-1)?.label).toBe('turn 14');
  });
});

describe('describeUndo', () => {
  it('says plainly when part of a turn could not be reversed', () => {
    const summary = describeUndo({
      label: 'delete the blotter and hide a column',
      backups: [{ instanceId: 'grid-test', snapshots: [] }],
      irreversible: ['delete_blotter'],
      at: 1,
    });
    expect(summary).toContain("can't be undone automatically");
    expect(summary).toContain('delete_blotter');
  });

  it('stays quiet when everything reversed', () => {
    const summary = describeUndo({ label: 'hide a column', backups: [{ instanceId: 'g', snapshots: [] }], irreversible: [], at: 1 });
    expect(summary).not.toContain("can't be undone");
  });

  it('lists the tools a profile snapshot cannot cover', () => {
    expect(IRREVERSIBLE_TOOLS.has('create_blotter')).toBe(true);
    expect(IRREVERSIBLE_TOOLS.has('delete_data_provider')).toBe(true);
    expect(IRREVERSIBLE_TOOLS.has('set_column_layout')).toBe(false);
  });
});
