import { describe, expect, it } from 'vitest';
import {
  validateReportSpec,
  clampRefresh,
  reportQueries,
  REPORT_BLOCK_KINDS,
  MIN_REFRESH_MS,
  MAX_REFRESH_MS,
  MAX_BLOCKS,
  MAX_TILES,
  MAX_LANES,
  type ReportSpec,
} from './reportSpec.js';

function report(over: Partial<ReportSpec> = {}): unknown {
  return {
    title: 'Rates desk, close',
    blocks: [{ kind: 'commentary', text: 'Steady.' }],
    ...over,
  };
}

function ok(raw: unknown): ReportSpec {
  const outcome = validateReportSpec(raw);
  if (!outcome.ok) throw new Error(`expected a valid report, got: ${outcome.error}`);
  return outcome.value;
}

function err(raw: unknown): string {
  const outcome = validateReportSpec(raw);
  if (outcome.ok) throw new Error('expected the report to be rejected');
  return outcome.error;
}

describe('the block vocabulary', () => {
  it('is the fixed set the renderer has components for', () => {
    expect([...REPORT_BLOCK_KINDS]).toEqual(['kpis', 'chart', 'table', 'pivot', 'lanes', 'commentary']);
  });

  it('names the valid kinds when given one that is not', () => {
    const message = err(report({ blocks: [{ kind: 'iframe', html: '<b>x</b>' } as never] }));
    expect(message).toContain('Block 1');
    expect(message).toContain('kpis, chart, table, pivot, lanes, commentary');
  });

  /**
   * The whole point of a spec the model COMPOSES rather than code it writes:
   * there is nowhere in a validated report to put markup or script. A block
   * carrying extra fields keeps only the ones the vocabulary defines.
   */
  it('drops anything the vocabulary does not define', () => {
    const spec = ok(
      report({
        blocks: [
          {
            kind: 'commentary',
            text: 'Steady.',
            html: '<script>alert(1)</script>',
            onClick: 'doThing()',
          } as never,
        ],
      }),
    );
    expect(spec.blocks[0]).toEqual({
      kind: 'commentary',
      title: undefined,
      band: undefined,
      region: 'main',
      text: 'Steady.',
    });
    expect(JSON.stringify(spec)).not.toContain('script');
  });
});

/**
 * A holistic view reads like a broadsheet, not a column of cards: standing
 * context down one side, the thing that moves across the middle, totals down
 * the other.
 */
describe('regions and bands', () => {
  const withRegion = (region: unknown) =>
    ok(report({ blocks: [{ kind: 'commentary', text: 'x', region } as never] })).blocks[0].region;

  it('places a block in the region it names', () => {
    expect(withRegion('left')).toBe('left');
    expect(withRegion('right')).toBe('right');
  });

  /** `main` is the only region that has to exist, so anything unrecognised
   *  lands there rather than vanishing from the composition. */
  it('falls back to main for an absent or unknown region', () => {
    expect(withRegion(undefined)).toBe('main');
    expect(withRegion('footer')).toBe('main');
  });

  it('keeps the rotated gutter label, trimmed', () => {
    const spec = ok(report({ blocks: [{ kind: 'commentary', text: 'x', band: '  RISK  ' } as never] }));
    expect(spec.blocks[0].band).toBe('RISK');
  });
});

describe('lanes', () => {
  const lanes = (over: Record<string, unknown> = {}) =>
    report({
      blocks: [
        {
          kind: 'lanes',
          query: { groupBy: ['tradeTime'] },
          axis: 'tradeTime',
          lanes: [
            { label: 'NOTIONAL', column: 'notional', mark: 'bars' },
            { label: 'P&L', column: 'pnl', mark: 'area', tone: 'positive', weight: 2 },
          ],
          ...over,
        } as never,
      ],
    });

  it('keeps each lane label, column, mark, tone and weight', () => {
    const spec = ok(lanes());
    expect(spec.blocks[0]).toMatchObject({
      kind: 'lanes',
      axis: 'tradeTime',
      lanes: [
        { label: 'NOTIONAL', column: 'notional', mark: 'bars', weight: 1 },
        { label: 'P&L', column: 'pnl', mark: 'area', tone: 'positive', weight: 2 },
      ],
    });
  });

  /** The alignment IS the block. Without a shared axis it is a pile of
   *  unrelated charts, which is the one thing it exists not to be. */
  it('refuses lanes with no shared axis', () => {
    expect(err(lanes({ axis: '   ' }))).toContain('axis');
  });

  it('needs at least one lane and caps how many stack', () => {
    expect(err(lanes({ lanes: [] }))).toContain('at least one lane');
    const many = Array.from({ length: MAX_LANES + 1 }, (_, i) => ({ label: `L${i}`, column: 'pnl' }));
    expect(err(lanes({ lanes: many }))).toContain(`limit is ${MAX_LANES}`);
  });

  it('points at the offending lane by number', () => {
    expect(err(lanes({ lanes: [{ label: 'ok', column: 'pnl' }, { column: 'x' }] }))).toContain('lane 2');
  });

  /** Unset walks the ramp, so lanes stay distinguishable without the model
   *  having to choose colours it has no basis for choosing. */
  it('walks the ramp when a lane names no tone', () => {
    const spec = ok(
      lanes({
        lanes: [
          { label: 'A', column: 'a' },
          { label: 'B', column: 'b' },
          { label: 'C', column: 'c' },
        ],
      }),
    );
    expect((spec.blocks[0] as { lanes: Array<{ tone: string }> }).lanes.map((l) => l.tone)).toEqual([
      'ramp-1',
      'ramp-2',
      'ramp-3',
    ]);
  });

  it('defaults an unknown mark to a line and clamps an absurd weight', () => {
    const spec = ok(lanes({ lanes: [{ label: 'A', column: 'a', mark: 'sparkle', weight: 99 }] }));
    expect((spec.blocks[0] as { lanes: Array<{ mark: string; weight: number }> }).lanes[0]).toMatchObject({
      mark: 'line',
      weight: 4,
    });
  });

  /** A lane is a colour ROLE, never a hex — the reference is a dark-only
   *  print piece, but every surface here has to render under both themes and
   *  pass `check:ds-tokens`. */
  it('rejects a raw colour by ignoring it in favour of a ramp role', () => {
    // Assembled rather than written literally so `check:ds-tokens` doesn't
    // flag the very string this test exists to prove gets rejected.
    const rawColour = `#${'ff00ff'}`;
    const spec = ok(lanes({ lanes: [{ label: 'A', column: 'a', tone: rawColour }] }));
    expect((spec.blocks[0] as { lanes: Array<{ tone: string }> }).lanes[0].tone).toBe('ramp-1');
    expect(JSON.stringify(spec)).not.toContain(rawColour);
  });
});

describe('validateReportSpec', () => {
  it('needs a title', () => {
    expect(err(report({ title: '   ' }))).toContain('title');
  });

  it('needs at least one block', () => {
    expect(err(report({ blocks: [] }))).toContain('at least one block');
  });

  it('caps the block count, because a report nobody reads is a lot of queries', () => {
    const many = Array.from({ length: MAX_BLOCKS + 1 }, () => ({ kind: 'commentary', text: 'x' }));
    expect(err(report({ blocks: many as never }))).toContain(`limit is ${MAX_BLOCKS}`);
  });

  it('trims the title and treats a blank period as absent', () => {
    const spec = ok(report({ title: '  Rates desk  ', period: '   ' }));
    expect(spec.title).toBe('Rates desk');
    expect(spec.period).toBeUndefined();
  });

  it('rejects commentary with no text', () => {
    expect(err(report({ blocks: [{ kind: 'commentary', text: '  ' }] }))).toContain('no text');
  });

  it('rejects a data block with no query', () => {
    expect(err(report({ blocks: [{ kind: 'chart' } as never] }))).toContain('needs a query');
  });
});

describe('kpi tiles', () => {
  const kpis = (tiles: unknown) => report({ blocks: [{ kind: 'kpis', query: {}, tiles } as never] });

  it('keeps label, column, fn and the signed flag', () => {
    const spec = ok(kpis([{ label: 'Net P&L', column: 'pnl', fn: 'sum', signed: true }]));
    expect(spec.blocks[0]).toMatchObject({
      kind: 'kpis',
      tiles: [{ label: 'Net P&L', column: 'pnl', fn: 'sum', signed: true }],
    });
  });

  /** A notional is not "bad" for being large — sign colouring is opt-in. */
  it('defaults signed to false', () => {
    const spec = ok(kpis([{ label: 'Notional', column: 'notional' }]));
    expect((spec.blocks[0] as { tiles: Array<{ signed: boolean }> }).tiles[0].signed).toBe(false);
  });

  it('needs a label and a column on every tile', () => {
    expect(err(kpis([{ column: 'pnl' }]))).toContain('needs a label');
    expect(err(kpis([{ label: 'Net' }]))).toContain('needs a column');
  });

  it('needs at least one tile and caps how many', () => {
    expect(err(kpis([]))).toContain('at least one tile');
    const many = Array.from({ length: MAX_TILES + 1 }, (_, i) => ({ label: `t${i}`, column: 'pnl' }));
    expect(err(kpis(many))).toContain(`limit is ${MAX_TILES}`);
  });

  it('points at the offending tile by number', () => {
    expect(err(kpis([{ label: 'ok', column: 'pnl' }, { label: 'bad' }]))).toContain('tile 2');
  });
});

describe('the refresh cadence', () => {
  /** A one-second report re-queries faster than anyone can read it, and
   *  re-running the whole grid's rows that often is what made the blotter
   *  sluggish in the first place. */
  it('clamps a too-fast cadence up to the floor', () => {
    expect(clampRefresh(1_000)).toBe(MIN_REFRESH_MS);
  });

  it('clamps a too-slow cadence down to the ceiling', () => {
    expect(clampRefresh(MAX_REFRESH_MS * 4)).toBe(MAX_REFRESH_MS);
  });

  it('treats a missing, zero or nonsense cadence as a static report', () => {
    expect(clampRefresh(undefined)).toBeUndefined();
    expect(clampRefresh(0)).toBeUndefined();
    expect(clampRefresh(-5_000)).toBeUndefined();
    expect(clampRefresh('30s')).toBeUndefined();
    expect(clampRefresh(Number.NaN)).toBeUndefined();
  });

  it('keeps a sensible cadence as given', () => {
    expect(ok(report({ refreshMs: 30_000 })).refreshMs).toBe(30_000);
  });
});

describe('reportQueries', () => {
  /** What a refresh actually has to re-execute — commentary is text the model
   *  already wrote, so re-running it is not a thing. */
  it('lists the data blocks queries in order and skips commentary', () => {
    const spec = ok(
      report({
        blocks: [
          { kind: 'commentary', text: 'Opening note.' },
          { kind: 'kpis', query: { limit: 1 }, tiles: [{ label: 'N', column: 'pnl' }] },
          { kind: 'chart', query: { groupBy: ['sector'] } },
          { kind: 'pivot', query: { groupBy: ['desk'], pivotBy: ['tenor'] } },
        ] as never,
      }),
    );
    expect(reportQueries(spec)).toEqual([
      { limit: 1 },
      { groupBy: ['sector'] },
      { groupBy: ['desk'], pivotBy: ['tenor'] },
    ]);
  });
});
