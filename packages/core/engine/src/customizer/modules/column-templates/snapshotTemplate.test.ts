/**
 * Unit tests for `snapshotTemplate` + `addTemplateReducer`.
 *
 * Pin down the behaviour the v2/v3 FormattingToolbar shipped as one
 * monolithic `saveCurrentAsTemplate` helper — the pair is about to
 * replace the inline helper, so these tests are the safety net for
 * that swap.
 */
import { describe, expect, it } from 'vitest';
import type {
  ColumnAssignment,
  ColumnCustomizationState,
} from '@wellsfargo-starui/core';
import type {
  ColumnTemplate,
  ColumnTemplatesState,
} from '@wellsfargo-starui/core';
import type { CellStyleOverrides, ThemedCellStyleOverrides } from '@wellsfargo-starui/core';
import {
  addTemplateReducer,
  pickTemplateFields,
  removeTemplateReducer,
  renameTemplateReducer,
  snapshotTemplate,
  snapshotTemplateUpdate,
  updateTemplateReducer,
} from '@wellsfargo-starui/core';

// Per-column overrides are theme-keyed; vitest runs without a `data-theme`
// attribute so `getActiveTheme()` resolves to `'dark'`. Setting both slots
// to the same value mirrors the migration of legacy flat overrides — any
// path that reads the active slot sees the same payload as before themed
// storage existed.
function themed(flat: CellStyleOverrides): ThemedCellStyleOverrides {
  return { dark: flat, light: flat };
}

// Deterministic deps so id + timestamps are pinnable.
const pinnedDeps = (now = 1_700_000_000_000, suffix = 'abcd') => ({
  now: () => now,
  idSuffix: () => suffix,
});

// ─── snapshotTemplate — early-out cases ────────────────────────────────

describe('snapshotTemplate — early outs', () => {
  const cust: ColumnCustomizationState = {
    assignments: {
      price: {
        colId: 'price',
        cellStyleOverrides: themed({ typography: { bold: true } }),
      },
    },
  };
  const tpls: ColumnTemplatesState = { templates: {}, typeDefaults: {} };

  it('returns undefined for empty colId', () => {
    expect(snapshotTemplate(cust, tpls, '', 'Name', undefined, pinnedDeps())).toBeUndefined();
  });

  it('returns undefined for empty / whitespace-only name', () => {
    expect(snapshotTemplate(cust, tpls, 'price', '', undefined, pinnedDeps())).toBeUndefined();
    expect(
      snapshotTemplate(cust, tpls, 'price', '   ', undefined, pinnedDeps()),
    ).toBeUndefined();
  });

  it('returns undefined when the column has no assignment', () => {
    expect(
      snapshotTemplate(cust, tpls, 'unknownCol', 'My template', undefined, pinnedDeps()),
    ).toBeUndefined();
  });

  it('returns undefined when cust is entirely missing', () => {
    expect(
      snapshotTemplate(undefined, tpls, 'price', 'My template', undefined, pinnedDeps()),
    ).toBeUndefined();
  });

  it('returns undefined when the resolved assignment has nothing to save', () => {
    // Column exists but has only a colId — no style, no formatter.
    const empty: ColumnCustomizationState = {
      assignments: { price: { colId: 'price' } },
    };
    expect(
      snapshotTemplate(empty, tpls, 'price', 'My template', undefined, pinnedDeps()),
    ).toBeUndefined();
  });
});

// ─── snapshotTemplate — happy paths ────────────────────────────────────

describe('snapshotTemplate — happy paths', () => {
  const tpls: ColumnTemplatesState = { templates: {}, typeDefaults: {} };

  it('captures cell overrides when only cell styling is set', () => {
    const cust: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          cellStyleOverrides: themed({ typography: { bold: true, fontSize: 14 } }),
        },
      },
    };
    const tpl = snapshotTemplate(cust, tpls, 'price', 'Bold 14px', undefined, pinnedDeps());

    expect(tpl).toBeDefined();
    expect(tpl!.id).toBe('tpl_1700000000000_abcd');
    expect(tpl!.name).toBe('Bold 14px');
    expect(tpl!.description).toBe('Saved from price');
    expect(tpl!.createdAt).toBe(1_700_000_000_000);
    expect(tpl!.updatedAt).toBe(1_700_000_000_000);
    expect(tpl!.cellStyleOverrides?.dark?.typography).toEqual({ bold: true, fontSize: 14 });
    expect(tpl!.headerStyleOverrides).toBeUndefined();
    expect(tpl!.valueFormatterTemplate).toBeUndefined();
  });

  it('captures header overrides when only header styling is set', () => {
    const cust: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          headerStyleOverrides: themed({ alignment: { horizontal: 'right' } }),
        },
      },
    };
    const tpl = snapshotTemplate(cust, tpls, 'price', 'Right header', undefined, pinnedDeps());

    expect(tpl).toBeDefined();
    expect(tpl!.cellStyleOverrides).toBeUndefined();
    expect(tpl!.headerStyleOverrides?.dark?.alignment).toEqual({ horizontal: 'right' });
  });

  it('captures valueFormatterTemplate when only a formatter is set', () => {
    const cust: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          valueFormatterTemplate: {
            kind: 'preset',
            preset: 'currency',
            options: { currency: 'USD', decimals: 2 },
          },
        },
      },
    };
    const tpl = snapshotTemplate(cust, tpls, 'price', 'USD2', undefined, pinnedDeps());

    expect(tpl).toBeDefined();
    expect(tpl!.cellStyleOverrides).toBeUndefined();
    expect(tpl!.headerStyleOverrides).toBeUndefined();
    expect(tpl!.valueFormatterTemplate).toEqual({
      kind: 'preset',
      preset: 'currency',
      options: { currency: 'USD', decimals: 2 },
    });
  });

  it('trims whitespace from the name', () => {
    const cust: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          cellStyleOverrides: themed({ typography: { bold: true } }),
        },
      },
    };
    const tpl = snapshotTemplate(
      cust,
      tpls,
      'price',
      '  Trimmed  ',
      undefined,
      pinnedDeps(),
    );
    expect(tpl!.name).toBe('Trimmed');
  });

  it('produces an id of shape tpl_<ts>_<suffix>', () => {
    const cust: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          cellStyleOverrides: themed({ typography: { bold: true } }),
        },
      },
    };
    const tpl = snapshotTemplate(
      cust,
      tpls,
      'price',
      'X',
      undefined,
      { now: () => 42, idSuffix: () => 'zzzz' },
    );
    expect(tpl!.id).toBe('tpl_42_zzzz');
  });

  it('defaults: uses Date.now() and Math.random() when deps omitted', () => {
    const cust: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          cellStyleOverrides: themed({ typography: { bold: true } }),
        },
      },
    };
    const before = Date.now();
    const tpl = snapshotTemplate(cust, tpls, 'price', 'X', undefined);
    const after = Date.now();
    expect(tpl).toBeDefined();
    // id is tpl_<ts>_<4chars>.
    expect(tpl!.id).toMatch(/^tpl_\d+_[a-z0-9]{1,4}$/);
    expect(tpl!.createdAt).toBeGreaterThanOrEqual(before);
    expect(tpl!.createdAt).toBeLessThanOrEqual(after);
    expect(tpl!.updatedAt).toBe(tpl!.createdAt);
  });
});

// ─── snapshotTemplate — template resolution ────────────────────────────

describe('snapshotTemplate — resolved effective appearance', () => {
  it('folds a templateId chain into the snapshot (effective, not just overrides)', () => {
    // Base template paints bold.
    const baseTpl: ColumnTemplate = {
      id: 'base',
      name: 'Base bold',
      cellStyleOverrides: themed({ typography: { bold: true } }),
      createdAt: 0,
      updatedAt: 0,
    };
    const tpls: ColumnTemplatesState = {
      templates: { base: baseTpl },
      typeDefaults: {},
    };
    // Assignment references the template + adds italic via override.
    const cust: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          templateIds: ['base'],
          cellStyleOverrides: themed({ typography: { italic: true } }),
        },
      },
    };
    const tpl = snapshotTemplate(cust, tpls, 'price', 'Merged', undefined, pinnedDeps());

    expect(tpl).toBeDefined();
    // Both the template's bold AND the assignment's italic should be
    // captured — that's the "effective appearance" contract.
    expect(tpl!.cellStyleOverrides?.dark?.typography).toEqual({ bold: true, italic: true });
  });

  it('folds in a typeDefault when templateIds is unset AND dataType is provided', () => {
    const numericDefault: ColumnTemplate = {
      id: 'num-default',
      name: 'Numeric',
      valueFormatterTemplate: {
        kind: 'preset',
        preset: 'number',
        options: { decimals: 2, thousands: true },
      },
      createdAt: 0,
      updatedAt: 0,
    };
    const tpls: ColumnTemplatesState = {
      templates: { 'num-default': numericDefault },
      typeDefaults: { numeric: 'num-default' },
    };
    const cust: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          cellStyleOverrides: themed({ typography: { bold: true } }),
          // NOTE: no templateIds field at all — triggers the typeDefault.
        },
      },
    };
    const tpl = snapshotTemplate(cust, tpls, 'price', 'Combined', 'numeric', pinnedDeps());

    expect(tpl!.cellStyleOverrides?.dark?.typography).toEqual({ bold: true });
    expect(tpl!.valueFormatterTemplate).toEqual({
      kind: 'preset',
      preset: 'number',
      options: { decimals: 2, thousands: true },
    });
  });

  it('does NOT fold in a typeDefault when dataType is undefined', () => {
    const numericDefault: ColumnTemplate = {
      id: 'num-default',
      name: 'Numeric',
      valueFormatterTemplate: {
        kind: 'preset',
        preset: 'number',
        options: { decimals: 2, thousands: true },
      },
      createdAt: 0,
      updatedAt: 0,
    };
    const tpls: ColumnTemplatesState = {
      templates: { 'num-default': numericDefault },
      typeDefaults: { numeric: 'num-default' },
    };
    const cust: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          cellStyleOverrides: themed({ typography: { bold: true } }),
        },
      },
    };
    const tpl = snapshotTemplate(cust, tpls, 'price', 'NoType', undefined, pinnedDeps());

    expect(tpl!.cellStyleOverrides?.dark?.typography).toEqual({ bold: true });
    expect(tpl!.valueFormatterTemplate).toBeUndefined();
  });

  it('tolerates tpls === undefined by treating it as empty', () => {
    const cust: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          cellStyleOverrides: themed({ typography: { bold: true } }),
        },
      },
    };
    const tpl = snapshotTemplate(cust, undefined, 'price', 'X', undefined, pinnedDeps());
    expect(tpl).toBeDefined();
    expect(tpl!.cellStyleOverrides?.dark?.typography).toEqual({ bold: true });
  });
});

// ─── addTemplateReducer ────────────────────────────────────────────────

describe('addTemplateReducer', () => {
  const makeTpl = (id: string): ColumnTemplate => ({
    id,
    name: `Template ${id}`,
    cellStyleOverrides: themed({ typography: { bold: true } }),
    createdAt: 1,
    updatedAt: 1,
  });

  it('inserts into an empty templates map', () => {
    const reducer = addTemplateReducer(makeTpl('a'));
    const next = reducer({ templates: {}, typeDefaults: {} });
    expect(Object.keys(next.templates)).toEqual(['a']);
  });

  it('preserves existing templates', () => {
    const existing = makeTpl('existing');
    const reducer = addTemplateReducer(makeTpl('new'));
    const next = reducer({
      templates: { existing },
      typeDefaults: {},
    });
    expect(Object.keys(next.templates).sort()).toEqual(['existing', 'new']);
    expect(next.templates['existing']).toBe(existing);
  });

  it('preserves typeDefaults', () => {
    const reducer = addTemplateReducer(makeTpl('new'));
    const next = reducer({
      templates: {},
      typeDefaults: { numeric: 'num-default' },
    });
    expect(next.typeDefaults).toEqual({ numeric: 'num-default' });
  });

  it('replaces a template with the same id (last-write-wins)', () => {
    const original = { ...makeTpl('a'), name: 'Original' };
    const replacement = { ...makeTpl('a'), name: 'Replacement' };
    const reducer = addTemplateReducer(replacement);
    const next = reducer({ templates: { a: original }, typeDefaults: {} });
    expect(next.templates['a'].name).toBe('Replacement');
    expect(Object.keys(next.templates)).toEqual(['a']);
  });

  it('tolerates undefined prev (fresh-module first write)', () => {
    const reducer = addTemplateReducer(makeTpl('fresh'));
    const next = reducer(undefined);
    expect(next.templates['fresh']).toBeDefined();
    expect(next.typeDefaults).toEqual({});
  });
});

// ─── removeTemplateReducer ────────────────────────────────────────────

describe('removeTemplateReducer', () => {
  const makeTpl = (id: string): ColumnTemplate => ({
    id,
    name: `Template ${id}`,
    cellStyleOverrides: themed({ typography: { bold: true } }),
    createdAt: 1,
    updatedAt: 1,
  });

  it('removes the named template', () => {
    const reducer = removeTemplateReducer('a');
    const next = reducer({
      templates: { a: makeTpl('a'), b: makeTpl('b') },
      typeDefaults: {},
    });
    expect(Object.keys(next.templates)).toEqual(['b']);
  });

  it('also clears typeDefaults entries that pointed at the removed id', () => {
    const reducer = removeTemplateReducer('a');
    const next = reducer({
      templates: { a: makeTpl('a'), b: makeTpl('b') },
      typeDefaults: { numeric: 'a', date: 'b' },
    });
    // `numeric` pointed at the removed id → cleared.
    // `date` pointed at a still-present id → preserved.
    expect(next.typeDefaults).toEqual({ date: 'b' });
  });

  it('returns the same reference when the id is not present (no-op)', () => {
    const state = { templates: { a: makeTpl('a') }, typeDefaults: {} };
    const next = removeTemplateReducer('missing')(state);
    expect(next).toBe(state);
  });

  it('tolerates undefined prev', () => {
    const next = removeTemplateReducer('a')(undefined);
    expect(next.templates).toEqual({});
    expect(next.typeDefaults).toEqual({});
  });
});

// ─── Expanded snapshot scope ───────────────────────────────────────────

describe('pickTemplateFields — expanded capture set', () => {
  it('captures behavior flags (sortable / filterable / resizable / editable)', () => {
    const fields = pickTemplateFields({
      colId: 'x',
      sortable: false,
      filterable: true,
      resizable: false,
      editable: true,
    });
    expect(fields).toEqual({
      sortable: false,
      filterable: true,
      resizable: false,
      editable: true,
    });
  });

  it('captures editor + renderer registry keys', () => {
    const fields = pickTemplateFields({
      colId: 'x',
      cellEditorName: 'agNumberCellEditor',
      cellEditorParams: { precision: 2 },
      cellRendererName: 'priceRenderer',
    });
    expect(fields).toEqual({
      cellEditorName: 'agNumberCellEditor',
      cellEditorParams: { precision: 2 },
      cellRendererName: 'priceRenderer',
    });
  });

  it('skips empty cellEditorParams to avoid persisting `{}` noise', () => {
    const fields = pickTemplateFields({ colId: 'x', cellEditorParams: {} });
    expect(fields.cellEditorParams).toBeUndefined();
  });

  it('captures the full filter blob including floating-filter settings', () => {
    const filter = {
      enabled: true,
      kind: 'agNumberColumnFilter' as const,
      floatingFilter: true,
      debounceMs: 200,
      closeOnApply: true,
      buttons: ['apply', 'reset'] as Array<'apply' | 'reset'>,
    };
    const fields = pickTemplateFields({ colId: 'x', filter });
    expect(fields.filter).toEqual(filter);
  });

  it('skips empty filter object', () => {
    const fields = pickTemplateFields({ colId: 'x', filter: {} });
    expect(fields.filter).toBeUndefined();
  });

  it('captures rowGrouping capabilities but DROPS live-state fields', () => {
    const fields = pickTemplateFields({
      colId: 'x',
      rowGrouping: {
        enableRowGroup: true,
        enableValue: true,
        enablePivot: false,
        aggFunc: 'sum',
        allowedAggFuncs: ['sum', 'avg'],
        // Live state — must be stripped.
        rowGroup: true,
        rowGroupIndex: 2,
        pivot: false,
        pivotIndex: undefined,
      },
    });
    expect(fields.rowGrouping).toEqual({
      enableRowGroup: true,
      enableValue: true,
      enablePivot: false,
      aggFunc: 'sum',
      allowedAggFuncs: ['sum', 'avg'],
    });
    // Explicit assertion: none of the live-state keys leaked.
    expect((fields.rowGrouping as Record<string, unknown>).rowGroup).toBeUndefined();
    expect((fields.rowGrouping as Record<string, unknown>).rowGroupIndex).toBeUndefined();
    expect((fields.rowGrouping as Record<string, unknown>).pivot).toBeUndefined();
    expect((fields.rowGrouping as Record<string, unknown>).pivotIndex).toBeUndefined();
  });

  it('returns an empty rowGrouping as undefined when only live-state was set', () => {
    const fields = pickTemplateFields({
      colId: 'x',
      rowGrouping: { rowGroup: true, rowGroupIndex: 1 },
    });
    expect(fields.rowGrouping).toBeUndefined();
  });

  it('skips identity / per-column layout fields entirely', () => {
    const fields = pickTemplateFields({
      colId: 'x',
      headerName: 'X Label',
      headerTooltip: 'tip',
      initialWidth: 200,
      initialHide: true,
      initialPinned: 'left',
      templateIds: ['t1'],
    });
    expect(fields).toEqual({});
  });
});

// ─── snapshotTemplate (full pipeline) — new fields ─────────────────────

describe('snapshotTemplate — full capture pipeline', () => {
  it('mints a template carrying every eligible field together', () => {
    const cust: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          cellStyleOverrides: themed({ typography: { bold: true } }),
          headerStyleOverrides: themed({ colors: { background: '#000' } }),
          valueFormatterTemplate: {
            kind: 'preset',
            preset: 'currency',
            options: { decimals: 2 },
          },
          editable: true,
          sortable: false,
          filterable: true,
          resizable: false,
          cellEditorName: 'agNumberCellEditor',
          cellEditorParams: { precision: 4 },
          cellRendererName: 'priceRenderer',
          filter: {
            enabled: true,
            kind: 'agNumberColumnFilter',
            floatingFilter: true,
            debounceMs: 250,
          },
          rowGrouping: {
            enableValue: true,
            aggFunc: 'sum',
            // live-state to be dropped
            rowGroup: true,
            rowGroupIndex: 0,
          },
        },
      },
    };
    const tpls: ColumnTemplatesState = { templates: {}, typeDefaults: {} };

    const tpl = snapshotTemplate(cust, tpls, 'price', 'Full price', undefined, pinnedDeps());
    expect(tpl).toBeDefined();
    expect(tpl!.cellStyleOverrides?.dark?.typography).toEqual({ bold: true });
    expect(tpl!.headerStyleOverrides?.dark?.colors).toEqual({ background: '#000' });
    expect(tpl!.valueFormatterTemplate?.kind).toBe('preset');
    expect(tpl!.editable).toBe(true);
    expect(tpl!.sortable).toBe(false);
    expect(tpl!.filterable).toBe(true);
    expect(tpl!.resizable).toBe(false);
    expect(tpl!.cellEditorName).toBe('agNumberCellEditor');
    expect(tpl!.cellEditorParams).toEqual({ precision: 4 });
    expect(tpl!.cellRendererName).toBe('priceRenderer');
    expect(tpl!.filter?.floatingFilter).toBe(true);
    expect(tpl!.rowGrouping).toEqual({ enableValue: true, aggFunc: 'sum' });
  });

  it('captures a behavior-only column (no styles, no formatter)', () => {
    const cust: ColumnCustomizationState = {
      assignments: { x: { colId: 'x', sortable: false } },
    };
    const tpls: ColumnTemplatesState = { templates: {}, typeDefaults: {} };
    const tpl = snapshotTemplate(cust, tpls, 'x', 'sort-off', undefined, pinnedDeps());
    expect(tpl).toBeDefined();
    expect(tpl!.sortable).toBe(false);
    // Nothing else captured.
    expect(tpl!.cellStyleOverrides).toBeUndefined();
    expect(tpl!.valueFormatterTemplate).toBeUndefined();
  });
});

// ─── snapshotTemplateUpdate ────────────────────────────────────────────

describe('snapshotTemplateUpdate', () => {
  it('returns the picked field set for the live column', () => {
    const cust: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          editable: true,
          filter: { enabled: true, kind: 'agNumberColumnFilter' },
        },
      },
    };
    const tpls: ColumnTemplatesState = { templates: {}, typeDefaults: {} };
    const fields = snapshotTemplateUpdate(cust, tpls, 'price', undefined);
    expect(fields).toEqual({
      editable: true,
      filter: { enabled: true, kind: 'agNumberColumnFilter' },
    });
  });

  it('returns undefined when the column has nothing template-eligible', () => {
    const cust: ColumnCustomizationState = {
      assignments: { x: { colId: 'x', headerName: 'X', initialWidth: 200 } },
    };
    const fields = snapshotTemplateUpdate(cust, undefined, 'x', undefined);
    expect(fields).toBeUndefined();
  });

  it('returns undefined for missing colId / assignment', () => {
    expect(snapshotTemplateUpdate(undefined, undefined, '', undefined)).toBeUndefined();
    expect(
      snapshotTemplateUpdate({ assignments: {} }, undefined, 'missing', undefined),
    ).toBeUndefined();
  });
});

// ─── updateTemplateReducer ─────────────────────────────────────────────

describe('updateTemplateReducer', () => {
  const t1Base: ColumnTemplate = {
    id: 't1',
    name: 'Bold',
    description: 'Saved from price',
    cellStyleOverrides: themed({ typography: { bold: true } }),
    createdAt: 1000,
    updatedAt: 1000,
  };

  it('overwrites data fields, preserves identity + createdAt, bumps updatedAt', () => {
    const state: ColumnTemplatesState = { templates: { t1: t1Base }, typeDefaults: {} };
    const next = updateTemplateReducer(
      't1',
      { editable: true, filter: { enabled: true, kind: 'agSetColumnFilter' } },
      { now: () => 2000 },
    )(state);
    const updated = next.templates.t1;
    expect(updated.id).toBe('t1');
    expect(updated.name).toBe('Bold');
    expect(updated.description).toBe('Saved from price');
    expect(updated.createdAt).toBe(1000);
    expect(updated.updatedAt).toBe(2000);
    // New fields applied; OLD fields wiped (replace-not-merge).
    expect(updated.editable).toBe(true);
    expect(updated.filter?.kind).toBe('agSetColumnFilter');
    expect(updated.cellStyleOverrides).toBeUndefined();
  });

  it('strips identity / audit keys if a caller passes a full template', () => {
    const state: ColumnTemplatesState = { templates: { t1: t1Base }, typeDefaults: {} };
    const next = updateTemplateReducer(
      't1',
      {
        id: 'CHEATING_ID',
        name: 'CHEATING_NAME',
        createdAt: 0,
        updatedAt: 0,
        editable: true,
      } as ColumnTemplate,
      { now: () => 2000 },
    )(state);
    expect(next.templates.t1.id).toBe('t1');
    expect(next.templates.t1.name).toBe('Bold');
    expect(next.templates.t1.createdAt).toBe(1000);
  });

  it('is a no-op for unknown id', () => {
    const state: ColumnTemplatesState = { templates: { t1: t1Base }, typeDefaults: {} };
    const next = updateTemplateReducer('missing', { editable: true })(state);
    expect(next).toBe(state);
  });
});

// ─── renameTemplateReducer ─────────────────────────────────────────────

describe('renameTemplateReducer', () => {
  const t1: ColumnTemplate = {
    id: 't1',
    name: 'Old',
    cellStyleOverrides: themed({ typography: { bold: true } }),
    createdAt: 1000,
    updatedAt: 1000,
  };

  it('renames + bumps updatedAt; data preserved', () => {
    const state: ColumnTemplatesState = { templates: { t1 }, typeDefaults: {} };
    const next = renameTemplateReducer('t1', '  New name  ', { now: () => 2000 })(state);
    expect(next.templates.t1.name).toBe('New name');
    expect(next.templates.t1.updatedAt).toBe(2000);
    expect(next.templates.t1.cellStyleOverrides?.dark?.typography).toEqual({ bold: true });
  });

  it('rejects empty / whitespace-only name (no-op)', () => {
    const state: ColumnTemplatesState = { templates: { t1 }, typeDefaults: {} };
    expect(renameTemplateReducer('t1', '')(state)).toBe(state);
    expect(renameTemplateReducer('t1', '   ')(state)).toBe(state);
  });

  it('no-ops when the new name is identical (skip the updatedAt bump)', () => {
    const state: ColumnTemplatesState = { templates: { t1 }, typeDefaults: {} };
    expect(renameTemplateReducer('t1', 'Old')(state)).toBe(state);
  });

  it('is a no-op for unknown id', () => {
    const state: ColumnTemplatesState = { templates: { t1 }, typeDefaults: {} };
    expect(renameTemplateReducer('missing', 'New')(state)).toBe(state);
  });
});
