import { describe, expect, it } from 'vitest';
import type { AnyModule } from '@wellsfargo-starui/engine';
import { groupModulesForMenubar } from './SettingsModuleMenubar';

function mod(id: string, name = id): AnyModule {
  return { id, name } as AnyModule;
}

describe('groupModulesForMenubar', () => {
  it('buckets known modules into declared categories in declaration order', () => {
    const groups = groupModulesForMenubar([
      mod('conditional-styling'),
      mod('general-settings'),
      mod('column-groups'),
      mod('column-customization'),
      mod('smart-edit'),
    ]);

    expect(groups.map((g) => g.id)).toEqual(['options', 'columns', 'styling', 'editing']);
    // Item order follows the category definition, not registration order.
    expect(groups[1].modules.map((m) => m.id)).toEqual([
      'column-customization',
      'column-groups',
    ]);
  });

  it('drops empty categories', () => {
    const groups = groupModulesForMenubar([mod('general-settings')]);
    expect(groups.map((g) => g.id)).toEqual(['options']);
  });

  it('collects unknown module ids into a trailing MORE group in registration order', () => {
    const groups = groupModulesForMenubar([
      mod('host-custom-b'),
      mod('general-settings'),
      mod('host-custom-a'),
    ]);

    expect(groups.map((g) => g.id)).toEqual(['options', 'more']);
    expect(groups[1].label).toBe('More');
    expect(groups[1].modules.map((m) => m.id)).toEqual(['host-custom-b', 'host-custom-a']);
  });

  it('returns no groups for no modules', () => {
    expect(groupModulesForMenubar([])).toEqual([]);
  });
});
