/**
 * Transform-layer tests for column-customization.
 *
 * Focus: the `cellStyle` emission that drives Excel-format color tags
 * (`[Red]` / `[Green]`). The transition case — switching from a colored
 * format to a plain one — was broken because the transform used to only
 * assign `cellStyle` when the NEW format had color tags, leaving any
 * previous formatter's inline `color` stuck on already-rendered cells
 * until full reload. The fix: always emit `cellStyle` whenever a
 * formatter is active (either a color-resolving fn OR a constant
 * `{ color: '' }` clearer).
 */
import { describe, it, expect } from 'vitest';
import type { ColDef } from 'ag-grid-community';
import { applyAssignments } from './transforms';
import type { ColumnCustomizationState } from './state';
import type { ColumnTemplatesState } from '../column-templates';

/** Stub — transforms only touch engine in custom aggFunc path, which
 *  these tests don't exercise. We implement the full
 *  `ExpressionEngineLike` surface so the arg typechecks; every method
 *  is a no-op that returns a placeholder. */
const NOOP_ENGINE = {
  parse: () => ({}),
  evaluate: () => 0,
  parseAndEvaluate: () => 0,
  compile: () => () => 0,
  validate: () => ({ valid: true, errors: [] }),
};

const EMPTY_TEMPLATES: ColumnTemplatesState = { templates: {}, typeDefaults: {} };

function makeState(template: { kind: 'excelFormat'; format: string } | undefined): ColumnCustomizationState {
  return {
    assignments: {
      price: {
        colId: 'price',
        valueFormatterTemplate: template,
      },
    },
  };
}

function applyAndGetCellStyle(state: ColumnCustomizationState, sourceColDef: ColDef = { colId: 'price' }): ColDef['cellStyle'] {
  const [out] = applyAssignments([sourceColDef], state, EMPTY_TEMPLATES, NOOP_ENGINE);
  return (out as ColDef).cellStyle;
}

describe('applyAssignments — cellStyle emission for Excel format color tags', () => {
  it('emits a color-resolving cellStyle fn when format has [Green]/[Red]', () => {
    const state = makeState({ kind: 'excelFormat', format: '[Green]#,##0.00;[Red]#,##0.00' });
    const cellStyle = applyAndGetCellStyle(state);

    expect(typeof cellStyle).toBe('function');
    const posResult = (cellStyle as Function)({ value: 42 });
    expect(posResult).toHaveProperty('color');
    expect((posResult as { color: string }).color).toBeTruthy();
    const negResult = (cellStyle as Function)({ value: -42 });
    expect(negResult).toHaveProperty('color');
    expect((negResult as { color: string }).color).toBeTruthy();
  });

  it('emits a clearing cellStyle fn when format has NO color tags (regression: red stuck until reload)', () => {
    const state = makeState({ kind: 'excelFormat', format: '#,##0.00' });
    const cellStyle = applyAndGetCellStyle(state);

    // Must be a function so AG-Grid overrides the previous formatter's
    // inline color. Returning `{ color: '' }` resets `cell.style.color`.
    expect(typeof cellStyle).toBe('function');
    const result = (cellStyle as Function)({ value: 42 });
    expect(result).toEqual({ color: '' });
  });

  it('within a colored format, non-colored sections return `{ color: \'\' }` (not `null`)', () => {
    // `[Red]0.00;0.00` — section 1 red for positives, section 2 plain
    // for negatives. The negative section must clear any prior red on
    // re-render, not skip the update (that's what allowed the color to
    // stick across value changes before the fix).
    const state = makeState({ kind: 'excelFormat', format: '[Red]0.00;0.00' });
    const cellStyle = applyAndGetCellStyle(state);

    expect(typeof cellStyle).toBe('function');
    const negResult = (cellStyle as Function)({ value: -42 });
    expect(negResult).toEqual({ color: '' });
    // Positive side still paints red via the color resolver.
    const posResult = (cellStyle as Function)({ value: 42 });
    expect(posResult).toHaveProperty('color');
    expect((posResult as { color: string }).color).toBeTruthy();
    expect((posResult as { color: string }).color).not.toBe('');
  });

  it('leaves the source colDef.cellStyle alone when no formatter is active AND colDef has its own cellStyle', () => {
    // User-provided cellStyle must not be clobbered by the transform
    // when the column has no formatter assignment.
    const userCellStyle = () => ({ background: 'pink' });
    const source: ColDef = { colId: 'price', cellStyle: userCellStyle };
    const state: ColumnCustomizationState = { assignments: {} };

    const [out] = applyAssignments([source], state, EMPTY_TEMPLATES, NOOP_ENGINE);
    // No assignment → transform returns the input def unchanged (same reference).
    expect(out).toBe(source);
  });

  it('does NOT overwrite user-provided cellStyle when formatter has no color AND user set a cellStyle', () => {
    // Edge case: user already wired a cellStyle on the source colDef,
    // then adds a plain formatter. We must not stomp on their handler.
    const userCellStyle = () => ({ background: 'pink' });
    const source: ColDef = { colId: 'price', cellStyle: userCellStyle };
    const state = makeState({ kind: 'excelFormat', format: '#,##0.00' });

    const [out] = applyAssignments([source], state, EMPTY_TEMPLATES, NOOP_ENGINE);
    expect((out as ColDef).cellStyle).toBe(userCellStyle);
  });
});

describe('applyAssignments — cellRendererId / cellRendererConfig emission', () => {
  it('emits cellRenderer = id and cellRendererParams = envelope.config', () => {
    const state: ColumnCustomizationState = {
      assignments: {
        status: {
          colId: 'status',
          cellRendererId: 'pill',
          cellRendererConfig: {
            kind: 'pill',
            config: {
              rules: [{ value: 'Filled', bg: { dark: '#22c55e' } }],
              shape: 'pill',
            },
          },
        },
      },
    };
    const [out] = applyAssignments(
      [{ colId: 'status' } as ColDef],
      state,
      EMPTY_TEMPLATES,
      NOOP_ENGINE,
    );
    const colDef = out as ColDef;
    expect(colDef.cellRenderer).toBe('pill');
    expect(colDef.cellRendererParams).toEqual({
      rules: [{ value: 'Filled', bg: { dark: '#22c55e' } }],
      shape: 'pill',
    });
  });

  it('cellRendererId takes precedence over cellRendererName', () => {
    const state: ColumnCustomizationState = {
      assignments: {
        status: {
          colId: 'status',
          cellRendererName: 'legacy',
          cellRendererId: 'heatmap',
          cellRendererConfig: {
            kind: 'heatmap',
            config: {
              colorScale: {
                min: { dark: '#000000' },
                max: { dark: '#ffffff' },
              },
            },
          },
        },
      },
    };
    const [out] = applyAssignments(
      [{ colId: 'status' } as ColDef],
      state,
      EMPTY_TEMPLATES,
      NOOP_ENGINE,
    );
    expect((out as ColDef).cellRenderer).toBe('heatmap');
  });

  it('omits cellRendererParams when the envelope has no config field', () => {
    const state: ColumnCustomizationState = {
      assignments: {
        status: {
          colId: 'status',
          cellRendererId: 'side',
          // Existing zero-config renderer — no envelope.
        },
      },
    };
    const [out] = applyAssignments(
      [{ colId: 'status' } as ColDef],
      state,
      EMPTY_TEMPLATES,
      NOOP_ENGINE,
    );
    expect((out as ColDef).cellRenderer).toBe('side');
    expect((out as ColDef).cellRendererParams).toBeUndefined();
  });

  it('falls back to cellRendererName when cellRendererId is not set', () => {
    const state: ColumnCustomizationState = {
      assignments: {
        status: {
          colId: 'status',
          cellRendererName: 'legacyRenderer',
        },
      },
    };
    const [out] = applyAssignments(
      [{ colId: 'status' } as ColDef],
      state,
      EMPTY_TEMPLATES,
      NOOP_ENGINE,
    );
    expect((out as ColDef).cellRenderer).toBe('legacyRenderer');
  });
});
