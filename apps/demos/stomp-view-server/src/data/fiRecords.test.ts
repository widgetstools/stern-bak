import { describe, expect, it } from 'vitest';
import { buildSnapshot, slimRecord } from './fiRecords.js';
import { sparseErraticTickPosition, sparseErraticTickTrade } from './sparseTick.js';
import type { PositionRecord, TradeRecord } from './fiRecords.js';

describe('slim row profile', () => {
  it('slimRecord keeps top-level primitives and drops nested objects/arrays', () => {
    const slim = slimRecord({
      id: 'x',
      price: 101.5,
      active: true,
      note: null,
      nested: { a: 1 },
      list: [1, 2],
    });
    expect(slim).toEqual({ id: 'x', price: 101.5, active: true, note: null });
  });

  it('buildSnapshot slim rows keep keys and headline fields, lose nesting', () => {
    const [wide] = buildSnapshot('positions', 1, 7, 'wide') as PositionRecord[];
    const [slim] = buildSnapshot('positions', 1, 7, 'slim') as PositionRecord[];
    expect(slim!.positionId).toBe(wide!.positionId);
    expect(slim!.cusip).toBe(wide!.cusip);
    expect(typeof slim!.currentPrice).toBe('number');
    expect(Object.values(slim!).every((v) => v === null || typeof v !== 'object')).toBe(true);
    expect(JSON.stringify(slim).length).toBeLessThan(JSON.stringify(wide).length / 4);
  });

  it('hot-field ticks work on slim rows (in place, headline fields move)', () => {
    const [pos] = buildSnapshot('positions', 1, 7, 'slim') as PositionRecord[];
    const posBefore = JSON.stringify(pos);
    let posDelta = null;
    for (let i = 0; i < 10 && posDelta === null; i++) {
      posDelta = sparseErraticTickPosition(pos!);
    }
    expect(posDelta).not.toBeNull();
    expect(JSON.stringify(pos)).not.toBe(posBefore);

    const [trd] = buildSnapshot('trades', 1, 7, 'slim') as TradeRecord[];
    const trdBefore = JSON.stringify(trd);
    let trdDelta = null;
    for (let i = 0; i < 10 && trdDelta === null; i++) {
      trdDelta = sparseErraticTickTrade(trd!);
    }
    expect(trdDelta).not.toBeNull();
    expect(JSON.stringify(trd)).not.toBe(trdBefore);
  });
});
