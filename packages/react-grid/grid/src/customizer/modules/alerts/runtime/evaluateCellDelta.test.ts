import { describe, expect, it, vi } from 'vitest';
import { ExpressionEngine, type AlertRule, type AlertTrigger } from '@wellsfargo-starui/core';
import { collectWatchedColIds, evaluateCellDelta, partitionEnabledRules } from './evaluateCellDelta.js';
import { createPreviousValuesStore } from './previousValues.js';

/**
 * Contract under test: the watched-column set must be derived from what
 * the enabled rules actually reference — the old shape unioned EVERY
 * grid column unconditionally, making `scanNode` do a 52-column walk
 * per delivered row per flush on a one-rule blotter. The all-columns
 * fallback survives only for column-less dataChange rules whose
 * expression has no extractable column references.
 */

const engine = new ExpressionEngine();

function rule(trigger: AlertTrigger, enabled = true): AlertRule {
  return {
    id: `r-${Math.abs(JSON.stringify(trigger).length)}-${trigger.kind}-${enabled}`,
    name: 'test rule',
    enabled,
    priority: 1,
    severity: 'info',
    trigger,
    message: '{value}',
    channels: ['badge'],
  };
}

function fakeApi(colIds: string[]) {
  const getColumns = vi.fn(() => colIds.map((id) => ({ getColId: () => id })));
  return { api: { getColumns }, getColumns };
}

const GRID_COLS = ['price', 'qty', 'side', 'trader', 'desk'];

describe('collectWatchedColIds', () => {
  it('relativeChange rules watch only their trigger column', () => {
    const { api, getColumns } = fakeApi(GRID_COLS);
    const { ids, stable } = collectWatchedColIds(
      api,
      [rule({ kind: 'relativeChange', column: 'price', mode: 'ANY_CHANGE' })],
      engine,
    );
    expect([...ids]).toEqual(['price']);
    expect(stable).toBe(true);
    expect(getColumns).not.toHaveBeenCalled();
  });

  it('column-scoped dataChange rules watch only their scope column', () => {
    const { api } = fakeApi(GRID_COLS);
    const { ids, stable } = collectWatchedColIds(
      api,
      [rule({ kind: 'dataChange', expression: '[price] > 100', column: 'qty' })],
      engine,
    );
    expect([...ids]).toEqual(['qty']);
    expect(stable).toBe(true);
  });

  it('column-less dataChange rules watch the columns their expression references', () => {
    const { api, getColumns } = fakeApi(GRID_COLS);
    const { ids, stable } = collectWatchedColIds(
      api,
      [rule({ kind: 'dataChange', expression: '[price] > 100 AND [qty] > 0' })],
      engine,
    );
    expect([...ids].sort()).toEqual(['price', 'qty']);
    expect(stable).toBe(true);
    expect(getColumns).not.toHaveBeenCalled();
  });

  it('falls back to all grid columns when a column-less expression has no extractable refs', () => {
    const { api } = fakeApi(GRID_COLS);
    // Bare variables resolve dynamically through ctx.data — the
    // dependency set is unknowable, so every column stays watched.
    const { ids, stable } = collectWatchedColIds(
      api,
      [rule({ kind: 'dataChange', expression: 'price > 100' })],
      engine,
    );
    expect([...ids].sort()).toEqual([...GRID_COLS].sort());
    expect(stable).toBe(false);
  });

  it('ignores disabled rules entirely', () => {
    const { api } = fakeApi(GRID_COLS);
    const { ids, stable } = collectWatchedColIds(
      api,
      [
        rule({ kind: 'relativeChange', column: 'price', mode: 'ANY_CHANGE' }, false),
        rule({ kind: 'dataChange', expression: 'side == "BUY"' }, false),
      ],
      engine,
    );
    expect(ids.size).toBe(0);
    expect(stable).toBe(true);
  });

  it('unions across mixed rule kinds', () => {
    const { api } = fakeApi(GRID_COLS);
    const { ids, stable } = collectWatchedColIds(
      api,
      [
        rule({ kind: 'relativeChange', column: 'price', mode: 'ANY_CHANGE' }),
        rule({ kind: 'dataChange', expression: '[desk] == "RATES"', column: 'side' }),
        rule({ kind: 'dataChange', expression: 'data.trader == "ann"' }),
      ],
      engine,
    );
    expect([...ids].sort()).toEqual(['price', 'side', 'trader']);
    expect(stable).toBe(true);
  });
});

describe('partitionEnabledRules', () => {
  it('splits enabled dataChange and relativeChange rules', () => {
    const rules = [
      rule({ kind: 'relativeChange', column: 'price', mode: 'ANY_CHANGE' }),
      rule({ kind: 'dataChange', expression: '[qty] > 0' }),
      rule({ kind: 'rowChange', event: 'ROW_ADDED' }),
      rule({ kind: 'dataChange', expression: 'false' }, false),
    ];
    const partitioned = partitionEnabledRules(rules);
    expect(partitioned.relativeChange).toHaveLength(1);
    expect(partitioned.dataChange).toHaveLength(1);
  });
});

describe('evaluateCellDelta', () => {
  const engine = new ExpressionEngine();

  it('dispatches dataChange hits and updates baseline', () => {
    const prevValues = createPreviousValuesStore();
    prevValues.set('r1', 'price', 50);
    const dispatch = vi.fn();
    evaluateCellDelta({
      rowId: 'r1',
      colId: 'price',
      prev: 50,
      next: 100,
      data: { price: 100 },
      dataChange: [rule({ kind: 'dataChange', expression: '[price] > 75' }) as never],
      relativeChange: [],
      engine,
      dispatcher: { dispatch } as never,
      prevValues,
    });
    expect(dispatch).toHaveBeenCalled();
    expect(prevValues.get('r1', 'price')).toBe(100);
  });

  it('evaluates relativeChange only for matching column', () => {
    const prevValues = createPreviousValuesStore();
    const dispatch = vi.fn();
    evaluateCellDelta({
      rowId: 'r1',
      colId: 'qty',
      prev: 10,
      next: 20,
      data: { qty: 20 },
      dataChange: [],
      relativeChange: [rule({ kind: 'relativeChange', column: 'price', mode: 'ANY_CHANGE' }) as never],
      engine,
      dispatcher: { dispatch } as never,
      prevValues,
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(prevValues.get('r1', 'qty')).toBe(20);
  });
});
