import { describe, expect, it } from 'vitest';
import { GridPlatform } from '../platform/GridPlatform';
import { MemoryAdapter } from '../persistence/MemoryAdapter';
import type { Module } from '../platform/types';
import { ProfileManager } from './ProfileManager';
import { RESERVED_DEFAULT_PROFILE_ID } from '../persistence/StorageAdapter';

/**
 * Template profiles: Workspace Setup's "Configure Component" launch runs the
 * manager in template-authoring mode and marks every profile it saves;
 * launched instances share the same row, see those profiles, and a save on
 * one lands on "<name> (copy)" instead of the template.
 */

interface StyleState {
  rules: string[];
}

function makeStyleModule(): Module<StyleState> {
  return {
    id: 'style',
    name: 'Style Rules',
    schemaVersion: 1,
    priority: 10,
    getInitialState: () => ({ rules: [] }),
    serialize: (s) => s,
    deserialize: (raw) =>
      raw && typeof raw === 'object' && Array.isArray((raw as { rules?: unknown }).rules)
        ? { rules: (raw as { rules: string[] }).rules }
        : { rules: [] },
  };
}

function makePlatform(gridId = 'grid-A'): GridPlatform {
  return new GridPlatform({ gridId, modules: [makeStyleModule()] });
}

async function bootManager(adapter: MemoryAdapter, templateAuthoring: boolean): Promise<{ manager: ProfileManager; platform: GridPlatform }> {
  const platform = makePlatform();
  const manager = new ProfileManager({ platform, adapter, disableAutoSave: true, templateAuthoring });
  await manager.boot();
  return { manager, platform };
}

function setRules(platform: GridPlatform, rules: string[]): void {
  platform.store.setModuleState<StyleState>('style', () => ({ rules }));
}

function rulesOf(snap: { state: Record<string, { data?: unknown }> } | null | undefined): string[] | undefined {
  return (snap?.state.style?.data as StyleState | undefined)?.rules;
}

describe('ProfileManager — template authoring (Workspace Setup)', () => {
  it('marks Default, saved, created, cloned and imported profiles as templates', async () => {
    const adapter = new MemoryAdapter();
    const { manager, platform } = await bootManager(adapter, true);

    // Default was auto-created by boot — as a template.
    expect((await adapter.loadProfile('grid-A', RESERVED_DEFAULT_PROFILE_ID))?.isTemplate).toBe(true);

    setRules(platform, ['a']);
    await manager.save();
    expect((await adapter.loadProfile('grid-A', RESERVED_DEFAULT_PROFILE_ID))?.isTemplate).toBe(true);

    await manager.create('Trader');
    expect((await adapter.loadProfile('grid-A', 'trader'))?.isTemplate).toBe(true);

    await manager.clone('trader', 'Trader wide');
    expect((await adapter.loadProfile('grid-A', 'trader-wide'))?.isTemplate).toBe(true);

    await manager.import({
      kind: 'gc-profile', schemaVersion: 1, exportedAt: 'x',
      profile: { name: 'Imported', gridId: 'grid-A', state: {} },
    });
    expect((await adapter.loadProfile('grid-A', 'imported'))?.isTemplate).toBe(true);

    // Meta carries the flag for the picker.
    expect(manager.getState().profiles.every((p) => p.isTemplate)).toBe(true);
  });

  it('lets authoring rename and delete template profiles', async () => {
    const adapter = new MemoryAdapter();
    const { manager } = await bootManager(adapter, true);
    await manager.create('Trader');
    await manager.rename('trader', 'Trader desk');
    expect((await adapter.loadProfile('grid-A', 'trader'))?.name).toBe('Trader desk');
    await manager.remove('trader');
    expect(await adapter.loadProfile('grid-A', 'trader')).toBeNull();
  });
});

describe('ProfileManager — a launched instance on a row with template profiles', () => {
  async function seedTemplates(): Promise<MemoryAdapter> {
    const adapter = new MemoryAdapter();
    const { manager, platform } = await bootManager(adapter, true);
    setRules(platform, ['template-rule']);
    await manager.save();
    await manager.create('Trader');
    manager.dispose();
    // The authoring session left its active pointer ("trader") in
    // localStorage; a fresh instance must boot on Default like a new view.
    localStorage.clear();
    return adapter;
  }

  it('saves a template profile as "<name> (copy)" and switches to the copy', async () => {
    const adapter = await seedTemplates();
    const { manager, platform } = await bootManager(adapter, false);
    expect(manager.getState().activeId).toBe(RESERVED_DEFAULT_PROFILE_ID);

    setRules(platform, ['mine']);
    await manager.save();

    // The template is untouched…
    const template = await adapter.loadProfile('grid-A', RESERVED_DEFAULT_PROFILE_ID);
    expect(template?.isTemplate).toBe(true);
    expect(rulesOf(template)).toEqual(['template-rule']);
    // …the copy holds the save and is not a template…
    const copy = await adapter.loadProfile('grid-A', 'default-copy');
    expect(copy?.name).toBe('Default (copy)');
    expect(copy?.isTemplate).toBe(false);
    expect(rulesOf(copy)).toEqual(['mine']);
    // …and it is now the active profile, with the live state kept.
    expect(manager.getState().activeId).toBe('default-copy');
    expect(manager.getState().isDirty).toBe(false);
    expect(platform.store.getModuleState<StyleState>('style').rules).toEqual(['mine']);
  });

  it('writes to the existing copy on later saves from the template, and in place once the copy is active', async () => {
    const adapter = await seedTemplates();
    const { manager, platform } = await bootManager(adapter, false);

    setRules(platform, ['one']);
    await manager.save();
    setRules(platform, ['two']);
    await manager.save(); // active is the copy now — saved in place
    expect(rulesOf(await adapter.loadProfile('grid-A', 'default-copy'))).toEqual(['two']);

    // Back on the template: the same copy is overwritten, no "(copy 2)".
    await manager.load(RESERVED_DEFAULT_PROFILE_ID);
    setRules(platform, ['three']);
    await manager.save();
    expect(rulesOf(await adapter.loadProfile('grid-A', 'default-copy'))).toEqual(['three']);
    expect((await adapter.listProfiles('grid-A')).map((p) => p.id).sort()).toEqual([RESERVED_DEFAULT_PROFILE_ID, 'default-copy', 'trader']);
    expect(manager.getState().activeId).toBe('default-copy');
  });

  it('creates plain profiles and refuses to rename or delete a template', async () => {
    const adapter = await seedTemplates();
    const { manager } = await bootManager(adapter, false);

    await manager.create('Mine');
    expect((await adapter.loadProfile('grid-A', 'mine'))?.isTemplate).toBeUndefined();
    const meta = manager.getState().profiles.find((p) => p.id === 'mine');
    expect(meta?.isTemplate).toBe(false);

    await expect(manager.rename('trader', 'Renamed')).rejects.toThrow(/template layout/);
    await expect(manager.remove('trader')).rejects.toThrow(/template layout/);
    expect((await adapter.loadProfile('grid-A', 'trader'))?.name).toBe('Trader');
  });

  it('clones a template into a plain profile', async () => {
    const adapter = await seedTemplates();
    const { manager } = await bootManager(adapter, false);
    await manager.clone('trader', 'Trader (copy)');
    expect((await adapter.loadProfile('grid-A', 'trader-copy'))?.isTemplate).toBeUndefined();
  });

  it('saves a plain profile in place — the copy rule applies to templates only', async () => {
    const adapter = new MemoryAdapter();
    const { manager, platform } = await bootManager(adapter, false);
    setRules(platform, ['plain']);
    await manager.save();
    expect(rulesOf(await adapter.loadProfile('grid-A', RESERVED_DEFAULT_PROFILE_ID))).toEqual(['plain']);
    expect(await adapter.listProfiles('grid-A')).toHaveLength(1);
  });
});
