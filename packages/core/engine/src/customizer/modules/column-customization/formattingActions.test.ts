/**
 * Unit tests for the pure formatting-action reducers.
 *
 * These pin down the exact behaviour shipped by the v2/v3
 * `FormattingToolbar` helpers — before the toolbar gets refactored to
 * use them. Every assertion here should ALSO be true for the toolbar's
 * current inline helpers, so the refactor can compare commit-by-commit.
 */
import { describe, expect, it } from 'vitest';
import type {
  BorderSpec,
  CellStyleOverrides,
  ColumnCustomizationState,
  ValueFormatterTemplate,
} from '@wellsfargo-starui/core';
import type { ThemedCellStyleOverrides } from '@wellsfargo-starui/core';
import {
  applyAlignmentReducer,
  applyBordersReducer,
  applyColorsReducer,
  applyFormatterReducer,
  applyTemplateToColumnsReducer,
  applyTypographyReducer,
  clearAllStylesReducer,
  clearAllStylesInProfileReducer,
  removeTemplateRefFromAssignmentsReducer,
  mergeOverrides,
  overrideKey,
  stripUndefined,
  writeOverridesReducer,
} from '@wellsfargo-starui/core';

const EMPTY: ColumnCustomizationState = { assignments: {} };

// Per-column overrides are theme-keyed; vitest runs without a `data-theme`
// so the active theme resolves to `'dark'`. `themed(flat)` mirrors the
// migration of legacy flat overrides — duplicates the payload into both
// slots so reducers that target the active slot see the same value as
// before themed storage existed.
function themed(flat: CellStyleOverrides): ThemedCellStyleOverrides {
  return { dark: flat, light: flat };
}

// ─── Tiny helpers ──────────────────────────────────────────────────────

describe('overrideKey', () => {
  it('maps "cell" → cellStyleOverrides', () => {
    expect(overrideKey('cell')).toBe('cellStyleOverrides');
  });

  it('maps "header" → headerStyleOverrides', () => {
    expect(overrideKey('header')).toBe('headerStyleOverrides');
  });
});

describe('stripUndefined', () => {
  it('drops undefined-valued keys; keeps nulls, zeros, empty strings', () => {
    const out = stripUndefined({ a: 1, b: undefined, c: null, d: 0, e: '' });
    expect(out).toEqual({ a: 1, c: null, d: 0, e: '' });
  });

  it('does not mutate the input', () => {
    const input = { a: 1, b: undefined };
    stripUndefined(input);
    expect(Object.keys(input)).toEqual(['a', 'b']);
  });
});

describe('mergeOverrides', () => {
  it('returns undefined when base and patch are both empty', () => {
    expect(mergeOverrides(undefined, {})).toBeUndefined();
  });

  it('merges typography deeply; an undefined leaf clears the leaf', () => {
    const base: CellStyleOverrides = { typography: { bold: true, italic: true } };
    const out = mergeOverrides(base, { typography: { italic: undefined, underline: true } });
    expect(out).toEqual({ typography: { bold: true, underline: true } });
  });

  it('merges colors deeply', () => {
    const base: CellStyleOverrides = { colors: { text: '#000' } };
    const out = mergeOverrides(base, { colors: { background: '#fff' } });
    expect(out).toEqual({ colors: { text: '#000', background: '#fff' } });
  });

  it('merges alignment; clearing horizontal drops the whole alignment section', () => {
    const base: CellStyleOverrides = { alignment: { horizontal: 'center' } };
    const out = mergeOverrides(base, { alignment: { horizontal: undefined } });
    expect(out).toBeUndefined();
  });

  it('merges per-side borders', () => {
    const spec: BorderSpec = { width: 1, color: '#000', style: 'solid' };
    const base: CellStyleOverrides = { borders: { top: spec } };
    const out = mergeOverrides(base, { borders: { right: spec } });
    expect(out).toEqual({ borders: { top: spec, right: spec } });
  });

  it('clearing all borders drops the whole borders section', () => {
    const spec: BorderSpec = { width: 1, color: '#000', style: 'solid' };
    const base: CellStyleOverrides = { borders: { top: spec } };
    const out = mergeOverrides(base, { borders: { top: undefined } });
    expect(out).toBeUndefined();
  });

  it('does not mutate its inputs', () => {
    const base: CellStyleOverrides = { typography: { bold: true } };
    const patch = { typography: { italic: true } };
    mergeOverrides(base, patch);
    expect(base).toEqual({ typography: { bold: true } });
    expect(patch).toEqual({ typography: { italic: true } });
  });
});

// ─── writeOverridesReducer ─────────────────────────────────────────────

describe('writeOverridesReducer', () => {
  it('is a no-op for empty colIds (same state reference)', () => {
    const reducer = writeOverridesReducer([], 'cell', { typography: { bold: true } });
    expect(reducer(EMPTY)).toBe(EMPTY);
  });

  it('seeds a fresh assignment when the column has none — writes go to the active theme slot only', () => {
    const reducer = writeOverridesReducer(['price'], 'cell', {
      typography: { bold: true },
    });
    const next = reducer(EMPTY);
    // jsdom has no `[data-theme]` so the active theme resolves to `'dark'`;
    // the inactive `light` slot stays absent — per-theme persistence is
    // the contract.
    expect(next.assignments).toEqual({
      price: {
        colId: 'price',
        cellStyleOverrides: { dark: { typography: { bold: true } } },
      },
    });
  });

  it('writes to cellStyleOverrides vs headerStyleOverrides based on target', () => {
    const cellReducer = writeOverridesReducer(['price'], 'cell', {
      colors: { text: '#ff0000' },
    });
    const headerReducer = writeOverridesReducer(['price'], 'header', {
      colors: { text: '#00ff00' },
    });
    const afterCell = cellReducer(EMPTY);
    const afterHeader = headerReducer(afterCell);

    expect(afterHeader.assignments['price']).toEqual({
      colId: 'price',
      cellStyleOverrides: { dark: { colors: { text: '#ff0000' } } },
      headerStyleOverrides: { dark: { colors: { text: '#00ff00' } } },
    });
  });

  it('merges into existing overrides without clobbering other sections', () => {
    const seed: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          cellStyleOverrides: themed({
            typography: { bold: true },
            colors: { text: '#000' },
          }),
        },
      },
    };
    const next = writeOverridesReducer(['price'], 'cell', {
      colors: { background: '#fff' },
    })(seed);

    // Seed populated BOTH theme slots, but the write only updates the
    // active (`dark`) slot — `light` is preserved exactly as seeded.
    expect(next.assignments['price'].cellStyleOverrides).toEqual({
      dark: {
        typography: { bold: true },
        colors: { text: '#000', background: '#fff' },
      },
      light: {
        typography: { bold: true },
        colors: { text: '#000' },
      },
    });
  });

  it('clearing the last leaf in the active theme drops only that slot — the inactive slot survives', () => {
    const seed: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          cellStyleOverrides: themed({ typography: { bold: true } }),
        },
      },
    };
    const next = writeOverridesReducer(['price'], 'cell', {
      typography: { bold: undefined },
    })(seed);

    // `dark` is now empty so its slot drops; `light` still holds the seed.
    expect(next.assignments['price']).toEqual({
      colId: 'price',
      cellStyleOverrides: { light: { typography: { bold: true } } },
    });
  });

  it('applies the same patch to every listed column', () => {
    const next = writeOverridesReducer(['price', 'quantity'], 'cell', {
      typography: { bold: true },
    })(EMPTY);

    expect(next.assignments['price'].cellStyleOverrides?.dark?.typography).toEqual({ bold: true });
    expect(next.assignments['quantity'].cellStyleOverrides?.dark?.typography).toEqual({ bold: true });
  });

  it('leaves OTHER columns in the assignments map untouched', () => {
    const seed: ColumnCustomizationState = {
      assignments: {
        untouched: { colId: 'untouched', headerName: 'Untouched' },
        price: { colId: 'price' },
      },
    };
    const next = writeOverridesReducer(['price'], 'cell', {
      typography: { bold: true },
    })(seed);

    expect(next.assignments['untouched']).toBe(seed.assignments['untouched']);
  });

  it('handles undefined prev (fresh-module first write)', () => {
    const next = writeOverridesReducer(['price'], 'cell', {
      typography: { bold: true },
    })(undefined);
    expect(next.assignments['price'].cellStyleOverrides?.dark?.typography).toEqual({ bold: true });
  });

  it('preserves unrelated state keys on the root (filter / rowGrouping ambient)', () => {
    const seed = {
      assignments: {},
      // Shape includes arbitrary extra data; the reducer must not drop it.
      someFutureField: { hello: 'world' },
    } as unknown as ColumnCustomizationState;
    const next = writeOverridesReducer(['price'], 'cell', {
      typography: { bold: true },
    })(seed);
    expect((next as unknown as { someFutureField: unknown }).someFutureField).toEqual({
      hello: 'world',
    });
  });
});

// ─── Shortcut reducers ─────────────────────────────────────────────────

describe('applyTypographyReducer', () => {
  it('writes typography into the targeted section', () => {
    const next = applyTypographyReducer(['price'], 'cell', { bold: true, fontSize: 14 })(
      EMPTY,
    );
    expect(next.assignments['price'].cellStyleOverrides?.dark?.typography).toEqual({
      bold: true,
      fontSize: 14,
    });
  });

  it('undefined flags clear the flag rather than storing undefined', () => {
    const seed = applyTypographyReducer(['price'], 'cell', { bold: true })(EMPTY);
    const next = applyTypographyReducer(['price'], 'cell', { bold: undefined })(seed);
    expect(next.assignments['price']).toEqual({ colId: 'price' });
  });

  it('writes to header when target is "header"', () => {
    const next = applyTypographyReducer(['price'], 'header', { italic: true })(EMPTY);
    expect(next.assignments['price'].headerStyleOverrides?.dark?.typography).toEqual({ italic: true });
    expect(next.assignments['price'].cellStyleOverrides).toBeUndefined();
  });
});

describe('applyColorsReducer', () => {
  it('merges text + background independently', () => {
    const seed = applyColorsReducer(['price'], 'cell', { text: '#ff0000' })(EMPTY);
    const next = applyColorsReducer(['price'], 'cell', { background: '#eeeeee' })(seed);
    expect(next.assignments['price'].cellStyleOverrides?.dark?.colors).toEqual({
      text: '#ff0000',
      background: '#eeeeee',
    });
  });

  it('undefined clears a color leaf', () => {
    const seed = applyColorsReducer(['price'], 'cell', {
      text: '#ff0000',
      background: '#eeeeee',
    })(EMPTY);
    const next = applyColorsReducer(['price'], 'cell', { text: undefined })(seed);
    expect(next.assignments['price'].cellStyleOverrides?.dark?.colors).toEqual({
      background: '#eeeeee',
    });
  });
});

describe('applyAlignmentReducer', () => {
  it('sets horizontal alignment', () => {
    const next = applyAlignmentReducer(['price'], 'cell', { horizontal: 'right' })(EMPTY);
    expect(next.assignments['price'].cellStyleOverrides?.dark?.alignment?.horizontal).toBe('right');
  });

  it('undefined clears the alignment entirely', () => {
    const seed = applyAlignmentReducer(['price'], 'cell', { horizontal: 'right' })(EMPTY);
    const next = applyAlignmentReducer(['price'], 'cell', { horizontal: undefined })(seed);
    expect(next.assignments['price']).toEqual({ colId: 'price' });
  });
});

// ─── Border reducers ────────────────────────────────────────────────────

describe('applyBordersReducer', () => {
  const spec: BorderSpec = { width: 2, color: '#333', style: 'solid' };

  it('sets one side', () => {
    const next = applyBordersReducer(['price'], 'cell', ['top'], spec)(EMPTY);
    expect(next.assignments['price'].cellStyleOverrides?.dark?.borders?.top).toEqual(spec);
    expect(next.assignments['price'].cellStyleOverrides?.dark?.borders?.right).toBeUndefined();
  });

  it('sets multiple sides in one call', () => {
    const next = applyBordersReducer(['price'], 'cell', ['top', 'bottom'], spec)(EMPTY);
    expect(next.assignments['price'].cellStyleOverrides?.dark?.borders?.top).toEqual(spec);
    expect(next.assignments['price'].cellStyleOverrides?.dark?.borders?.bottom).toEqual(spec);
  });

  it('clears a single side when spec is undefined', () => {
    const seed = applyBordersReducer(['price'], 'cell', ['top', 'bottom'], spec)(EMPTY);
    const next = applyBordersReducer(['price'], 'cell', ['top'], undefined)(seed);
    expect(next.assignments['price'].cellStyleOverrides?.dark?.borders).toEqual({ bottom: spec });
  });
});

// ─── Formatter reducer ─────────────────────────────────────────────────

describe('applyFormatterReducer', () => {
  const tpl: ValueFormatterTemplate = {
    kind: 'preset',
    preset: 'currency',
    options: { currency: 'USD', decimals: 2 },
  };

  it('writes valueFormatterTemplate on every listed column', () => {
    const next = applyFormatterReducer(['price', 'quantity'], tpl)(EMPTY);
    expect(next.assignments['price'].valueFormatterTemplate).toEqual(tpl);
    expect(next.assignments['quantity'].valueFormatterTemplate).toEqual(tpl);
  });

  it('undefined removes the template from each column', () => {
    const seed = applyFormatterReducer(['price'], tpl)(EMPTY);
    const next = applyFormatterReducer(['price'], undefined)(seed);
    expect(next.assignments['price']).toEqual({ colId: 'price' });
  });

  it('does not affect overrides / templateIds', () => {
    let state = applyTypographyReducer(['price'], 'cell', { bold: true })(EMPTY);
    state = applyTemplateToColumnsReducer(['price'], 'tpl-abc')(state);
    const next = applyFormatterReducer(['price'], tpl)(state);
    expect(next.assignments['price'].cellStyleOverrides?.dark?.typography).toEqual({ bold: true });
    expect(next.assignments['price'].templateIds).toEqual(['tpl-abc']);
    expect(next.assignments['price'].valueFormatterTemplate).toEqual(tpl);
  });

  it('clears an existing cell renderer so the manual format wins', () => {
    // Simulates a column auto-formatted with a semantic renderer (P&L,
    // side, etc.). Picking a format preset must drop the renderer or the
    // renderer keeps painting and the format never shows.
    const seed: ColumnCustomizationState = {
      assignments: {
        pnl: {
          colId: 'pnl',
          cellRendererId: 'pnl-value',
          cellRendererConfig: { kind: 'pnl-value', config: { mode: 'signed' } },
        },
      },
    };
    const next = applyFormatterReducer(['pnl'], tpl)(seed);
    expect(next.assignments['pnl'].valueFormatterTemplate).toEqual(tpl);
    expect(next.assignments['pnl'].cellRendererId).toBeUndefined();
    expect(next.assignments['pnl'].cellRendererConfig).toBeUndefined();
  });

  it('leaves the renderer untouched when clearing the template', () => {
    const seed: ColumnCustomizationState = {
      assignments: { pnl: { colId: 'pnl', cellRendererId: 'pnl-value' } },
    };
    const next = applyFormatterReducer(['pnl'], undefined)(seed);
    expect(next.assignments['pnl'].cellRendererId).toBe('pnl-value');
    expect(next.assignments['pnl'].valueFormatterTemplate).toBeUndefined();
  });

  it('is a no-op for empty colIds', () => {
    const reducer = applyFormatterReducer([], tpl);
    expect(reducer(EMPTY)).toBe(EMPTY);
  });
});

// ─── Template-chain reducer ────────────────────────────────────────────

describe('applyTemplateToColumnsReducer', () => {
  it('sets templateIds to exactly [templateId]', () => {
    const next = applyTemplateToColumnsReducer(['price'], 'tpl-red')(EMPTY);
    expect(next.assignments['price'].templateIds).toEqual(['tpl-red']);
  });

  it('replaces any existing templateIds chain (not layered)', () => {
    const seed = applyTemplateToColumnsReducer(['price'], 'tpl-old')(EMPTY);
    const next = applyTemplateToColumnsReducer(['price'], 'tpl-new')(seed);
    expect(next.assignments['price'].templateIds).toEqual(['tpl-new']);
  });

  it('is a no-op for empty colIds OR empty templateId', () => {
    const r1 = applyTemplateToColumnsReducer([], 'tpl-x');
    const r2 = applyTemplateToColumnsReducer(['price'], '');
    expect(r1(EMPTY)).toBe(EMPTY);
    expect(r2(EMPTY)).toBe(EMPTY);
  });

  it('preserves overrides when setting a template', () => {
    const seed = applyTypographyReducer(['price'], 'cell', { bold: true })(EMPTY);
    const next = applyTemplateToColumnsReducer(['price'], 'tpl-x')(seed);
    expect(next.assignments['price'].cellStyleOverrides?.dark?.typography).toEqual({ bold: true });
    expect(next.assignments['price'].templateIds).toEqual(['tpl-x']);
  });
});

// ─── Clear-all reducer ─────────────────────────────────────────────────

describe('clearAllStylesReducer', () => {
  it('resets each listed column to { colId } only', () => {
    let state = applyTypographyReducer(['price'], 'cell', { bold: true })(EMPTY);
    state = applyColorsReducer(['price'], 'cell', { text: '#f00' })(state);
    state = applyFormatterReducer(['price'], {
      kind: 'preset',
      preset: 'number',
      options: { decimals: 2, thousands: true },
    })(state);
    state = applyTemplateToColumnsReducer(['price'], 'tpl-x')(state);

    const next = clearAllStylesReducer(['price'])(state);
    expect(next.assignments['price']).toEqual({ colId: 'price' });
  });

  it('leaves other columns untouched', () => {
    let state = applyTypographyReducer(['price'], 'cell', { bold: true })(EMPTY);
    state = applyTypographyReducer(['quantity'], 'cell', { italic: true })(state);

    const next = clearAllStylesReducer(['price'])(state);
    expect(next.assignments['price']).toEqual({ colId: 'price' });
    expect(next.assignments['quantity'].cellStyleOverrides?.dark?.typography).toEqual({
      italic: true,
    });
  });

  it('is a no-op for empty colIds', () => {
    expect(clearAllStylesReducer([])(EMPTY)).toBe(EMPTY);
  });
});

// ─── Profile-wide clear ────────────────────────────────────────────────

describe('clearAllStylesInProfileReducer', () => {
  it('wipes every column assignment', () => {
    let state = applyTypographyReducer(['price'], 'cell', { bold: true })(EMPTY);
    state = applyColorsReducer(['quantity'], 'cell', { text: '#f00' })(state);
    state = applyTemplateToColumnsReducer(['spread'], 'tpl-x')(state);
    expect(Object.keys(state.assignments).sort()).toEqual(['price', 'quantity', 'spread']);

    const next = clearAllStylesInProfileReducer()(state);
    expect(next.assignments).toEqual({});
  });

  it('returns the same reference when assignments is already empty', () => {
    const next = clearAllStylesInProfileReducer()(EMPTY);
    expect(next).toBe(EMPTY);
  });

  it('tolerates undefined prev', () => {
    const next = clearAllStylesInProfileReducer()(undefined);
    expect(next.assignments).toEqual({});
  });
});

// ─── Template-ref cleanup after template deletion ──────────────────────

describe('removeTemplateRefFromAssignmentsReducer', () => {
  it('strips the id from every column that references it', () => {
    let state = applyTemplateToColumnsReducer(['price'], 'tpl-x')(EMPTY);
    state = applyTemplateToColumnsReducer(['quantity'], 'tpl-x')(state);
    state = applyTemplateToColumnsReducer(['spread'], 'tpl-y')(state);

    const next = removeTemplateRefFromAssignmentsReducer('tpl-x')(state);
    expect(next.assignments['price'].templateIds).toBeUndefined();
    expect(next.assignments['quantity'].templateIds).toBeUndefined();
    // `spread` referenced a different template — untouched.
    expect(next.assignments['spread'].templateIds).toEqual(['tpl-y']);
  });

  it('preserves other template ids in a multi-template chain', () => {
    const state: typeof EMPTY = {
      ...EMPTY,
      assignments: {
        price: { colId: 'price', templateIds: ['tpl-a', 'tpl-b', 'tpl-c'] },
      },
    };
    const next = removeTemplateRefFromAssignmentsReducer('tpl-b')(state);
    expect(next.assignments['price'].templateIds).toEqual(['tpl-a', 'tpl-c']);
  });

  it('returns the same reference when nothing references the id', () => {
    const state = applyTemplateToColumnsReducer(['price'], 'tpl-x')(EMPTY);
    const next = removeTemplateRefFromAssignmentsReducer('tpl-missing')(state);
    expect(next).toBe(state);
  });

  it('is a no-op for empty templateId', () => {
    const state = applyTemplateToColumnsReducer(['price'], 'tpl-x')(EMPTY);
    const next = removeTemplateRefFromAssignmentsReducer('')(state);
    expect(next).toBe(state);
  });

  it('preserves overrides on the column (only templateIds is touched)', () => {
    let state = applyTypographyReducer(['price'], 'cell', { bold: true })(EMPTY);
    state = applyTemplateToColumnsReducer(['price'], 'tpl-x')(state);

    const next = removeTemplateRefFromAssignmentsReducer('tpl-x')(state);
    expect(next.assignments['price'].cellStyleOverrides?.dark?.typography?.bold).toBe(true);
    expect(next.assignments['price'].templateIds).toBeUndefined();
  });
});
