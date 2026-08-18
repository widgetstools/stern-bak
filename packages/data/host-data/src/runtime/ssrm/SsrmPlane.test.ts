/**
 * The plane is a façade: the parts worth testing are the ones it does NOT
 * delegate — how it derives a key column from the config, how it turns hub
 * cache entries into store rows, and which of those it drops.
 *
 * Tested against a real {@link SsrmServer}: the delegation is the contract, so
 * a mocked server would only assert that this file's own calls exist.
 */
import { describe, expect, it, vi } from 'vitest';
import type { TransportConfig } from '@wellsfargo-starui/types';
import { SsrmPlane, SSRM_COMPOSITE_KEY_FIELD, resolveSsrmKeyColumn } from './SsrmPlane.js';

const cfg = (over: Record<string, unknown> = {}) =>
  ({ providerType: 'mock-ssrm', ...over }) as unknown as TransportConfig;

/** All rows the plane holds, in store order. */
function allRows(plane: SsrmPlane) {
  return plane.getRows({ startRow: 0, endRow: 1000 } as never).rowData;
}

describe('resolveSsrmKeyColumn', () => {
  it('keeps a named single key column', () => {
    expect(resolveSsrmKeyColumn('positionId')).toBe('positionId');
  });

  it('collapses a composite key to the synthetic field', () => {
    expect(resolveSsrmKeyColumn(['book', 'symbol'])).toBe(SSRM_COMPOSITE_KEY_FIELD);
  });

  it('falls back to id for anything blank or absent', () => {
    expect(resolveSsrmKeyColumn(undefined)).toBe('id');
    expect(resolveSsrmKeyColumn('')).toBe('id');
    expect(resolveSsrmKeyColumn('   ')).toBe('id');
  });
});

describe('SsrmPlane construction', () => {
  it('takes the key column from the config', () => {
    expect(new SsrmPlane(cfg({ keyColumn: 'positionId' })).keyColumn).toBe('positionId');
  });

  it('defaults to id when the config names none', () => {
    expect(new SsrmPlane(cfg()).keyColumn).toBe('id');
  });

  it('uses the synthetic field for a composite key', () => {
    expect(new SsrmPlane(cfg({ keyColumn: ['a', 'b'] })).keyColumn).toBe(
      SSRM_COMPOSITE_KEY_FIELD,
    );
  });

  it('reads the publish window off an SSRM config', () => {
    const setTimer = vi.fn(() => 1);
    const plane = new SsrmPlane(cfg({ keyColumn: 'id', publishWindowMs: 50 }), {
      setTimer,
      clearTimer: vi.fn(),
    });
    plane.onFlush(() => undefined);
    plane.upsertRows([{ id: '1', qty: 1 }]);

    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 50);
  });

  it('ignores publishWindowMs on a config type that cannot declare it', () => {
    // A blind structural read would pick this up from a `rest` config; the
    // union narrowing is what stops it. Window 0 is the passthrough path —
    // one flush per store tick, no timer at all.
    const setTimer = vi.fn(() => 1);
    const plane = new SsrmPlane(
      { providerType: 'rest', keyColumn: 'id', publishWindowMs: 500 } as unknown as TransportConfig,
      { setTimer, clearTimer: vi.fn() },
    );
    const flushes: unknown[] = [];
    plane.onFlush((e) => flushes.push(e));
    plane.upsertRows([{ id: '1' }]);

    expect(setTimer).not.toHaveBeenCalled();
    expect(flushes).toHaveLength(1);
  });

  it('lets an explicit option override the config window', () => {
    const setTimer = vi.fn(() => 1);
    const plane = new SsrmPlane(cfg({ keyColumn: 'id', publishWindowMs: 50 }), {
      publishWindowMs: 200,
      setTimer,
      clearTimer: vi.fn(),
    });
    plane.onFlush(() => undefined);
    plane.upsertRows([{ id: '1' }]);

    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 200);
  });
});

describe('loading rows', () => {
  it('replaces the plane from a hub cache map', () => {
    const plane = new SsrmPlane(cfg({ keyColumn: 'id' }));
    plane.syncFromCache(new Map([['1', { id: '1', qty: 5 }], ['2', { id: '2', qty: 6 }]]));

    expect(allRows(plane)).toHaveLength(2);
  });

  it('drops cache entries that are not objects', () => {
    const plane = new SsrmPlane(cfg({ keyColumn: 'id' }));
    plane.syncFromCache(
      new Map<string, unknown>([['1', { id: '1' }], ['2', null], ['3', 'not-a-row']]),
    );

    expect(allRows(plane)).toHaveLength(1);
  });

  it('stamps the composite key onto rows synced from cache', () => {
    const plane = new SsrmPlane(cfg({ keyColumn: ['book', 'symbol'] }));
    plane.syncFromCache(new Map([['rates|AAPL', { book: 'rates', symbol: 'AAPL' }]]));

    expect(allRows(plane)[0]).toMatchObject({ [SSRM_COMPOSITE_KEY_FIELD]: 'rates|AAPL' });
  });

  it('leaves a single-key row untouched', () => {
    const plane = new SsrmPlane(cfg({ keyColumn: 'id' }));
    plane.syncFromCache(new Map([['1', { id: '1' }]]));

    expect(allRows(plane)[0]).not.toHaveProperty(SSRM_COMPOSITE_KEY_FIELD);
  });

  it('upserts keyed hub entries, skipping non-objects', () => {
    const plane = new SsrmPlane(cfg({ keyColumn: 'id' }));
    plane.upsertKeyed([['1', { id: '1' }], ['2', undefined], ['3', { id: '3' }]]);

    expect(allRows(plane)).toHaveLength(2);
  });

  it('does not disturb the store for an all-empty keyed batch', () => {
    const plane = new SsrmPlane(cfg({ keyColumn: 'id' }));
    plane.upsertKeyed([['1', { id: '1' }]]);
    plane.upsertKeyed([['2', null]]);

    expect(allRows(plane)).toHaveLength(1);
  });

  it('derives keys itself when upserting plain rows', () => {
    const plane = new SsrmPlane(cfg({ keyColumn: 'id' }));
    plane.upsertRows([{ id: '1', qty: 1 }, { id: '1', qty: 2 }]);

    // Same key twice is one row, not two.
    expect(allRows(plane)).toHaveLength(1);
    expect(allRows(plane)[0]).toMatchObject({ qty: 2 });
  });

  it('drops plain rows with no derivable key', () => {
    const plane = new SsrmPlane(cfg({ keyColumn: 'id' }));
    plane.upsertRows([{ id: '1' }, { noId: true }, null, 42]);

    expect(allRows(plane)).toHaveLength(1);
  });

  it('composes a key from every column of a composite key', () => {
    const plane = new SsrmPlane(cfg({ keyColumn: ['book', 'symbol'] }));
    plane.upsertRows([
      { book: 'rates', symbol: 'AAPL' },
      { book: 'rates', symbol: 'MSFT' },
      { book: 'rates' },
    ]);

    // The third row cannot be keyed, so it is not stored.
    expect(allRows(plane)).toHaveLength(2);
    expect(allRows(plane)[0]).toHaveProperty(SSRM_COMPOSITE_KEY_FIELD);
  });

  it('replaces the whole snapshot from plain rows', () => {
    const plane = new SsrmPlane(cfg({ keyColumn: 'id' }));
    plane.upsertRows([{ id: '1' }, { id: '2' }]);
    plane.replaceSnapshot([{ id: '9' }, { noKey: 1 }, 'junk']);

    expect(allRows(plane).map((r) => (r as { id?: string }).id)).toEqual(['9']);
  });

  it('empties the plane when the snapshot is empty', () => {
    const plane = new SsrmPlane(cfg({ keyColumn: 'id' }));
    plane.upsertRows([{ id: '1' }]);
    plane.replaceSnapshot([]);

    expect(allRows(plane)).toHaveLength(0);
  });
});

describe('reads and session state pass through to the server', () => {
  function seeded() {
    const plane = new SsrmPlane(cfg({ keyColumn: 'id' }));
    plane.replaceSnapshot([
      { id: '1', region: 'EMEA', qty: 10 },
      { id: '2', region: 'APAC', qty: 20 },
    ]);
    return plane;
  }

  it('answers a windowed getRows', () => {
    expect(seeded().getRows({ startRow: 0, endRow: 1 } as never).rowData).toHaveLength(1);
  });

  it('answers set-filter values for a column', () => {
    expect(seeded().getSetFilterValues({ column: 'region' }).sort()).toEqual([
      'APAC',
      'EMEA',
    ]);
  });

  it('answers a status bar with no request at all', () => {
    expect(seeded().getStatusBar()).toMatchObject({ totalRows: 2 });
  });

  it('answers a status bar for a filtered request', () => {
    const summary = seeded().getStatusBar({
      filterModel: { region: { filterType: 'text', type: 'equals', filter: 'EMEA' } },
    } as never);
    expect(summary.filteredRows).toBe(1);
  });

  it("reports what a session's calculated rules add", () => {
    const plane = seeded();
    plane.configureExpressions(
      [{ id: 'r1', kind: 'calculated', enabled: true, field: 'double', expression: 'qty * 2' } as never],
      'sess',
    );

    expect(plane.calculatedFields('sess')).toContain('double');
  });

  it('enriches rows for a session', () => {
    const plane = seeded();
    plane.configureExpressions(
      [{ id: 'r1', kind: 'calculated', enabled: true, field: 'double', expression: 'qty * 2' } as never],
      'sess',
    );

    expect(plane.enrichRows([{ id: '1', qty: 10 }], 'sess')[0]).toMatchObject({ double: 20 });
  });

  it('reports no alert hits when no rule is watching', () => {
    expect(seeded().alertHits(['1', '2'], 'sess')).toEqual([]);
  });

  it('keeps a session patch visible to that session', () => {
    const plane = seeded();
    plane.setSessionPatches('sess', [{ key: '1', fields: { qty: 999 } }]);

    const patched = plane.getRows({ startRow: 0, endRow: 10 } as never, 'sess').rowData;
    expect(patched.find((r) => (r as { id: string }).id === '1')).toMatchObject({ qty: 999 });
  });

  it('hides a session-excluded row from that session only', () => {
    const plane = seeded();
    plane.setSessionExclude('sess', 'region == "APAC"');

    expect(plane.getRows({ startRow: 0, endRow: 10 } as never, 'sess').rowData).toHaveLength(1);
    expect(plane.getRows({ startRow: 0, endRow: 10 } as never).rowData).toHaveLength(2);
  });

  it('lifts a session exclusion when it is cleared', () => {
    const plane = seeded();
    plane.setSessionExclude('sess', 'region == "APAC"');
    plane.setSessionExclude('sess', null);

    expect(plane.getRows({ startRow: 0, endRow: 10 } as never, 'sess').rowData).toHaveLength(2);
  });
});

describe('viewport interest and ticks', () => {
  function plane() {
    const p = new SsrmPlane(cfg({ keyColumn: 'id' }));
    p.replaceSnapshot([{ id: '1' }, { id: '2' }, { id: '3' }]);
    return p;
  }

  it('narrows changed keys to the ones a session is looking at', () => {
    const p = plane();
    p.setViewportInterest('sess', ['1', '2'], { blockKey: 'b0', queryId: 'q1' } as never);

    expect(p.interestedKeys('sess', ['1', '3'])).toEqual(['1']);
  });

  it("forgets a session's interest when it is cleared", () => {
    const p = plane();
    p.setViewportInterest('sess', ['1'], { blockKey: 'b0', queryId: 'q1' } as never);
    p.clearViewportInterest('sess');

    // Back to the no-interest default: a session that has declared nothing is
    // interested in everything, which is what a grid looks like before its
    // first block loads.
    expect(p.interestedKeys('sess', ['1', '2'])).toEqual(['1', '2']);
  });

  it('reports whether a session still wants rows outside its blocks', () => {
    const p = plane();
    expect(typeof p.wantsUnmatchedRows('sess')).toBe('boolean');
  });

  it('delivers ticks to a listener until it unsubscribes', () => {
    const p = plane();
    const seen: unknown[] = [];
    const off = p.onTick((e) => seen.push(e));
    p.upsertRows([{ id: '1', qty: 5 }]);
    off();
    p.upsertRows([{ id: '2', qty: 6 }]);

    expect(seen).toHaveLength(1);
  });

  it('reads fresh rows for the keys a flush accumulated', () => {
    const p = plane();
    expect(p.rowsForKeys(['1', '3'])).toHaveLength(2);
  });

  it('drops keys deleted since the flush accumulated them', () => {
    const p = plane();
    expect(p.rowsForKeys(['1', 'gone'])).toHaveLength(1);
  });

  it('reports store stats', () => {
    expect(plane().getStats()).toMatchObject({ rowCount: 3 });
  });

  it('clears its pending flush timer on dispose', () => {
    const clearTimer = vi.fn();
    const p = new SsrmPlane(cfg({ keyColumn: 'id', publishWindowMs: 50 }), {
      setTimer: vi.fn(() => 7),
      clearTimer,
    });
    p.onFlush(() => undefined);
    p.upsertRows([{ id: '1' }]);
    p.dispose();

    expect(clearTimer).toHaveBeenCalledWith(7);
  });
});
