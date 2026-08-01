import { describe, expect, it } from 'vitest';
import type { ColumnAssignment } from '../../../colDef';
import { resolveTemplates } from './resolveTemplates.js';
import type { ColumnTemplate, ColumnTemplatesState } from './state.js';

function tpl(id: string, overrides: Partial<ColumnTemplate> = {}): ColumnTemplate {
  return {
    id,
    name: id,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('resolveTemplates', () => {
  const templatesState: ColumnTemplatesState = {
    templates: {
      base: tpl('base', { sortable: false, editable: true }),
      accent: tpl('accent', {
        cellStyleOverrides: { dark: { colors: { text: 'red' } } },
        sortable: true,
      }),
    },
    typeDefaults: { numeric: 'base' },
  };

  it('returns the assignment unchanged when no templates apply', () => {
    const assignment: ColumnAssignment = { colId: 'price', sortable: true };
    expect(resolveTemplates(assignment, { templates: {}, typeDefaults: {} }, undefined))
      .toBe(assignment);
  });

  it('applies typeDefaults only when templateIds is undefined', () => {
    const resolved = resolveTemplates(
      { colId: 'price' },
      templatesState,
      'numeric',
    );
    expect(resolved.sortable).toBe(false);
    expect(resolved.editable).toBe(true);
  });

  it('skips typeDefaults when templateIds is explicitly empty', () => {
    const resolved = resolveTemplates(
      { colId: 'price', templateIds: [], sortable: true },
      templatesState,
      'numeric',
    );
    expect(resolved.sortable).toBe(true);
    expect(resolved.editable).toBeUndefined();
  });

  it('folds templateIds in order then assignment wins last', () => {
    const resolved = resolveTemplates(
      {
        colId: 'price',
        templateIds: ['base', 'accent'],
        sortable: undefined,
        editable: false,
      },
      templatesState,
      undefined,
    );
    expect(resolved.sortable).toBe(true);
    expect(resolved.editable).toBe(false);
    expect(resolved.cellStyleOverrides?.dark?.colors?.text).toBe('red');
  });

  it('silently skips unknown template ids', () => {
    const resolved = resolveTemplates(
      { colId: 'x', templateIds: ['missing', 'base'] },
      templatesState,
      undefined,
    );
    expect(resolved.sortable).toBe(false);
  });

  it('replaces filter and rowGrouping wholesale — no deep merge', () => {
    const withFilter = tpl('f', {
      filter: { enabled: true, kind: 'agTextColumnFilter' },
      rowGrouping: { enableRowGroup: true },
    });
    const state: ColumnTemplatesState = {
      templates: { f: withFilter },
      typeDefaults: {},
    };
    const resolved = resolveTemplates(
      {
        colId: 'x',
        templateIds: ['f'],
        filter: { enabled: false },
      },
      state,
      undefined,
    );
    expect(resolved.filter).toEqual({ enabled: false });
    expect(resolved.rowGrouping).toEqual({ enableRowGroup: true });
  });
});
