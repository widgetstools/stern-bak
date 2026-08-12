import { describe, expect, it } from 'vitest';
import { SsrmServer } from './index.js';
import type { ICacheIngest } from './index.js';

/** Any transport is just something that calls ICacheIngest. */
function fakeTransport(sink: ICacheIngest) {
  return {
    snapshot: (n: number) =>
      sink.replaceSnapshot(
        Array.from({ length: n }, (_, i) => ({
          id: `P${i}`, book: i % 2 ? 'A' : 'B', px: i,
        })),
      ),
    tick: (id: string, px: number) => sink.upsert([{ id, px }]),
    drop: (id: string) => sink.remove([id]),
  };
}

const BASE = {
  startRow: 0, endRow: 100, filterModel: {}, sortModel: [],
  groupKeys: [], rowGroupCols: [], valueCols: [], pivotCols: [], pivotMode: false,
};

describe('ssrm engine contract (transport-agnostic)', () => {
  it('serves blocks, aggregates, and ticks driven purely through ICacheIngest', () => {
    const engine = new SsrmServer({ keyColumn: 'id' });
    const transport = fakeTransport(engine);
    const ticks: unknown[] = [];
    engine.onTick((e) => ticks.push(e));

    transport.snapshot(500);
    expect(engine.getRows(BASE).rowCount).toBe(500);

    transport.tick('P7', 9_999);
    const sum = engine.getRows({
      ...BASE, valueCols: [{ field: 'px', aggFunc: 'sum' }],
    }).grandTotalData?.px;
    // Recompute-from-state: the aggregate reflects the tick immediately.
    expect(sum).toBe(((499 * 500) / 2) - 7 + 9_999);

    transport.drop('P7');
    expect(engine.getRows(BASE).rowCount).toBe(499);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
  });
});
