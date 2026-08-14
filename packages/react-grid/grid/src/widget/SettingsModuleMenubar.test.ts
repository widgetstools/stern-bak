import { describe, expect, it } from 'vitest';
import type { AnyModule } from '@wellsfargo-starui/core';
import { groupModulesForMenubar } from './SettingsModuleMenubar';

function mod(id: string, category?: string, name = id): AnyModule {
  return { id, name, category } as AnyModule;
}

describe('groupModulesForMenubar', () => {
  it('buckets modules by their category in declared group order', () => {
    const groups = groupModulesForMenubar([
      mod('conditional-styling', 'styling'),
      mod('general-settings', 'options'),
      mod('column-groups', 'columns'),
      mod('column-customization', 'columns'),
      mod('editing', 'editing'),
    ]);

    expect(groups.map((g) => g.id)).toEqual(['options', 'columns', 'styling', 'editing']);
    // Items keep registration order within their group.
    expect(groups[1].modules.map((m) => m.id)).toEqual([
      'column-groups',
      'column-customization',
    ]);
  });

  it('drops empty categories', () => {
    const groups = groupModulesForMenubar([mod('general-settings', 'options')]);
    expect(groups.map((g) => g.id)).toEqual(['options']);
  });

  it('collects category-less and unknown-category modules into a trailing MORE group', () => {
    const groups = groupModulesForMenubar([
      mod('host-custom-b'),
      mod('general-settings', 'options'),
      mod('host-custom-a', 'no-such-category'),
    ]);

    expect(groups.map((g) => g.id)).toEqual(['options', 'more']);
    expect(groups[1].label).toBe('More');
    expect(groups[1].modules.map((m) => m.id)).toEqual(['host-custom-b', 'host-custom-a']);
  });

  it('returns no groups for no modules', () => {
    expect(groupModulesForMenubar([])).toEqual([]);
  });
});
