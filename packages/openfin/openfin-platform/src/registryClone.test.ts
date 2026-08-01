/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AppConfigRow, ConfigManager } from '@wellsfargo-starui/host-config';

class InMemoryConfigManager {
  configs = new Map<string, AppConfigRow>();

  async getConfig(id: string) {
    return this.configs.get(id.toLowerCase());
  }

  async saveConfig(row: AppConfigRow) {
    this.configs.set(row.configId.toLowerCase(), { ...row, payload: structuredClone(row.payload) });
  }
}

const cm = new InMemoryConfigManager();

vi.mock('./db', () => ({
  getConfigManager: async () => cm as unknown as ConfigManager,
}));

const { cloneRegistryTemplateConfig } = await import('./registryClone');

function templateRow(over: Partial<AppConfigRow> = {}): AppConfigRow {
  return {
    configId: 'grid-test',
    appId: 'TestApp',
    userId: 'dev1',
    displayText: 'TestGrid',
    componentType: 'grid',
    componentSubType: 'test',
    isTemplate: true,
    singleton: false,
    isPublic: true,
    payload: {
      profiles: [{ id: 'p1', name: 'Default', state: { rowHeight: 42 } }],
      gridLevelData: { liveProviderId: 'dp-1' },
    },
    createdBy: 'dev1',
    updatedBy: 'dev1',
    creationTime: '2025-01-01T00:00:00Z',
    updatedTime: '2025-01-01T00:00:00Z',
    ...over,
  } as AppConfigRow;
}

beforeEach(() => {
  cm.configs.clear();
});

describe('cloneRegistryTemplateConfig', () => {
  it('deep-clones payload onto the target template id', async () => {
    cm.configs.set('grid-test', templateRow());

    const ok = await cloneRegistryTemplateConfig({
      sourceTemplateId: 'grid-test',
      targetComponentType: 'grid',
      targetComponentSubType: 'test-copy',
      displayText: 'TestGrid (copy)',
      singleton: false,
    });

    expect(ok).toBe(true);
    const target = cm.configs.get('grid-test-copy');
    expect(target).toBeDefined();
    expect(target?.isTemplate).toBe(true);
    expect(target?.componentType).toBe('grid');
    expect(target?.componentSubType).toBe('test-copy');
    expect(target?.displayText).toBe('TestGrid (copy)');

    const srcPayload = cm.configs.get('grid-test')!.payload as any;
    const dstPayload = target!.payload as any;
    expect(dstPayload.profiles[0].state.rowHeight).toBe(42);
    expect(dstPayload.gridLevelData.liveProviderId).toBe('dp-1');
    dstPayload.profiles[0].state.rowHeight = 99;
    expect(srcPayload.profiles[0].state.rowHeight).toBe(42);
  });

  it('returns false when the source template row is missing', async () => {
    const ok = await cloneRegistryTemplateConfig({
      sourceTemplateId: 'grid-missing',
      targetComponentType: 'grid',
      targetComponentSubType: 'test-copy',
      displayText: 'Copy',
    });
    expect(ok).toBe(false);
    expect(cm.configs.has('grid-test-copy')).toBe(false);
  });

  it('returns false when source and target template ids match', async () => {
    cm.configs.set('grid-test', templateRow());

    const ok = await cloneRegistryTemplateConfig({
      sourceTemplateId: 'grid-test',
      targetComponentType: 'grid',
      targetComponentSubType: 'test',
      displayText: 'Same id',
    });

    expect(ok).toBe(false);
  });

  it('returns false when saveConfig throws', async () => {
    cm.configs.set('grid-test', templateRow());
    const original = cm.saveConfig.bind(cm);
    cm.saveConfig = async () => { throw new Error('disk full'); };

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ok = await cloneRegistryTemplateConfig({
      sourceTemplateId: 'grid-test',
      targetComponentType: 'grid',
      targetComponentSubType: 'fail-copy',
      displayText: 'Copy',
    });

    expect(ok).toBe(false);
    expect(warn).toHaveBeenCalled();
    cm.saveConfig = original;
    warn.mockRestore();
  });

  it('is idempotent when the target template already exists', async () => {
    cm.configs.set('grid-test', templateRow());
    cm.configs.set(
      'grid-test-copy',
      templateRow({
        configId: 'grid-test-copy',
        componentSubType: 'test-copy',
        displayText: 'Existing copy',
        payload: { profiles: [], gridLevelData: {} },
      }),
    );

    const ok = await cloneRegistryTemplateConfig({
      sourceTemplateId: 'grid-test',
      targetComponentType: 'grid',
      targetComponentSubType: 'test-copy',
      displayText: 'Should not overwrite',
    });

    expect(ok).toBe(true);
    expect((cm.configs.get('grid-test-copy')!.payload as any).profiles).toEqual([]);
  });
});
