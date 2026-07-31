import { describe, expect, it } from 'vitest';
import type { ColumnCustomizationState } from '../column-customization/state.js';
import {
  addTemplateReducer,
  pickTemplateFields,
  removeTemplateReducer,
  renameTemplateReducer,
  snapshotTemplate,
  snapshotTemplateUpdate,
  updateTemplateReducer,
} from './snapshotTemplate.js';
import type { ColumnTemplate, ColumnTemplatesState } from './state.js';

const cust: ColumnCustomizationState = {
  assignments: {
    price: {
      colId: 'price',
      valueFormatterTemplate: { kind: 'preset', preset: 'currency' },
      sortable: false,
    },
  },
};

const tpls: ColumnTemplatesState = {
  templates: {
    existing: {
      id: 'existing',
      name: 'Old name',
      description: 'desc',
      createdAt: 100,
      updatedAt: 100,
      sortable: true,
    },
  },
  typeDefaults: { numeric: 'existing' },
};

describe('snapshotTemplate', () => {
  it('returns undefined when name or assignment is missing', () => {
    expect(snapshotTemplate(cust, tpls, '', 'Name', 'numeric')).toBeUndefined();
    expect(snapshotTemplate(cust, tpls, 'ghost', 'Name', 'numeric')).toBeUndefined();
    expect(snapshotTemplate(cust, tpls, 'price', '   ', 'numeric')).toBeUndefined();
  });

  it('returns undefined when resolved assignment has nothing template-eligible', () => {
    expect(snapshotTemplate(
      { assignments: { empty: { colId: 'empty', sortable: undefined } } },
      tpls,
      'empty',
      'Blank',
      undefined,
    )).toBeUndefined();
  });

  it('mints a template with deterministic deps', () => {
    const tpl = snapshotTemplate(cust, tpls, 'price', 'Currency', 'numeric', {
      now: () => 1234,
      idSuffix: () => 'abcd',
    });
    expect(tpl).toMatchObject({
      id: 'tpl_1234_abcd',
      name: 'Currency',
      description: 'Saved from price',
      createdAt: 1234,
      valueFormatterTemplate: { kind: 'preset', preset: 'currency' },
      sortable: false,
    });
  });
});

describe('pickTemplateFields', () => {
  it('captures only meaningful assignment fields', () => {
    const fields = pickTemplateFields({
      colId: 'x',
      cellStyleOverrides: { dark: { colors: { text: 'red' } } },
      filter: {},
      rowGrouping: { rowGroup: true, enableValue: true },
      cellEditor: { kind: 'agTextCellEditor', values: ['a'] },
    });
    expect(fields.cellStyleOverrides).toBeDefined();
    expect(fields.filter).toBeUndefined();
    expect(fields.rowGrouping).toEqual({ enableValue: true });
    expect(fields.cellEditor?.kind).toBe('agTextCellEditor');
  });
});

describe('template reducers', () => {
  const newTpl: ColumnTemplate = {
    id: 'tpl_new',
    name: 'New',
    createdAt: 1,
    updatedAt: 1,
    sortable: false,
  };

  it('addTemplateReducer inserts by id', () => {
    const next = addTemplateReducer(newTpl)(tpls);
    expect(next.templates.tpl_new).toEqual(newTpl);
    expect(next.typeDefaults).toEqual(tpls.typeDefaults);
  });

  it('updateTemplateReducer replaces data fields and preserves identity', () => {
    const reducer = updateTemplateReducer('existing', { sortable: false }, { now: () => 200 });
    const next = reducer(tpls);
    expect(next.templates.existing).toMatchObject({
      id: 'existing',
      name: 'Old name',
      createdAt: 100,
      updatedAt: 200,
      sortable: false,
    });
  });

  it('updateTemplateReducer is a no-op for unknown ids', () => {
    expect(updateTemplateReducer('missing', { sortable: false })(tpls)).toBe(tpls);
  });

  it('renameTemplateReducer rejects blank names and no-ops unchanged', () => {
    expect(renameTemplateReducer('existing', '   ')(tpls)).toBe(tpls);
    expect(renameTemplateReducer('existing', 'Old name')(tpls)).toBe(tpls);
    const next = renameTemplateReducer('existing', 'Renamed', { now: () => 300 })(tpls);
    expect(next.templates.existing?.name).toBe('Renamed');
    expect(next.templates.existing?.updatedAt).toBe(300);
  });

  it('removeTemplateReducer clears dangling typeDefaults', () => {
    const next = removeTemplateReducer('existing')(tpls);
    expect(next.templates.existing).toBeUndefined();
    expect(next.typeDefaults.numeric).toBeUndefined();
  });

  it('snapshotTemplateUpdate returns undefined when nothing to capture', () => {
    expect(snapshotTemplateUpdate(
      { assignments: { x: { colId: 'x' } } },
      tpls,
      'x',
      undefined,
    )).toBeUndefined();
  });
});
