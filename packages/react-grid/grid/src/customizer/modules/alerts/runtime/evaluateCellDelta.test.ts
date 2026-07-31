import { describe, expect, it, vi } from 'vitest';
import { ExpressionEngine, type AlertRule, type AlertTrigger } from '@wellsfargo-starui/engine';
import { collectWatchedColIds } from './evaluateCellDelta.js';

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
