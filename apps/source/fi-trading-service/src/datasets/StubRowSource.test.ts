import { describe, expect, it } from 'vitest';
import { StubRowSource } from './StubRowSource.js';

describe('StubRowSource', () => {
  it('defaults to the positions dataset keyed by position id', () => {
    const source = new StubRowSource();
    expect(source.dataset).toBe('positions');
    expect(source.keyColumn).toBe('positionId');
    expect(source.size()).toBe(5);
  });

  it('takes an explicit dataset and key column', () => {
    const source = new StubRowSource({ dataset: 'orders', keyColumn: 'orderId', rowCount: 2 });
    expect(source.dataset).toBe('orders');
    expect(source.keyColumn).toBe('orderId');
  });

  it('batches the snapshot without dropping or duplicating a row', async () => {
    const source = new StubRowSource({ rowCount: 10 });
    const seen: string[] = [];
    for await (const batch of source.snapshot(3)) {
      expect(batch.length).toBeLessThanOrEqual(3);
      for (const row of batch) seen.push(row.positionId);
    }
    expect(seen).toHaveLength(10);
    expect(new Set(seen).size).toBe(10);
  });

  it('walks the book so a tick reaches every row in turn', () => {
    const source = new StubRowSource({ rowCount: 4 });
    source.tick(4);
    expect(new Set(source.drainLive(10).map((row) => row.positionId)).size).toBe(4);
  });

  it('marks rows dirty and hands them out once', () => {
    const source = new StubRowSource({ rowCount: 6 });
    expect(source.tick(3)).toBe(3);
    expect(source.pendingLive()).toBe(3);
    expect(source.drainLive(10)).toHaveLength(3);
    expect(source.pendingLive()).toBe(0);
    expect(source.drainLive(10)).toHaveLength(0);
  });

  it('caps a tick at the number of rows it has', () => {
    const source = new StubRowSource({ rowCount: 2 });
    expect(source.tick(50)).toBe(2);
  });

  it('moves the price it ticks', () => {
    const source = new StubRowSource({ rowCount: 1 });
    const before = (source.allRows()[0] as { midPrice: number }).midPrice;
    source.tick(1);
    expect((source.allRows()[0] as { midPrice: number }).midPrice).toBeGreaterThan(before);
  });

  it('does nothing when empty or given no budget', () => {
    expect(new StubRowSource({ rowCount: 0 }).tick(5)).toBe(0);
    const source = new StubRowSource({ rowCount: 3 });
    source.tick(3);
    expect(source.drainLive(0)).toHaveLength(0);
  });
});
