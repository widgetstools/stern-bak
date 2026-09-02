import { describe, expect, it } from 'vitest';
import { validateReportSpec, type ReportBlock, type ReportSpec } from './reportSpec.js';

/**
 * `validateReportSpec` REBUILDS each block from a whitelist rather than
 * spreading it. That is deliberate — it is what guarantees no markup, script or
 * drawing instruction can reach a renderer, and `reportSpec.test.ts` asserts
 * exactly that.
 *
 * The cost of a whitelist is that a field added to the TYPE but forgotten in
 * the validator is dropped silently: the model writes it, validation accepts
 * the block, and the renderer never sees it. That failure mode is invisible —
 * no error, no warning, just a setting that does nothing.
 *
 * So every field the vocabulary defines is exercised here with a distinctive
 * value and asserted to survive the round trip. Adding a field to a block
 * without teaching the validator about it fails this file.
 *
 * The rule of thumb when this test fails: if the new field is legitimate
 * vocabulary, add it to `validateBlock`. If it is not, it SHOULD be dropped —
 * and it belongs in `reportSpec.test.ts`'s "drops anything the vocabulary does
 * not define" case instead.
 */

/** Every block kind, populated to its last field. */
const FULLY_POPULATED: Record<string, Record<string, unknown>> = {
  kpis: {
    kind: 'kpis',
    title: 'Headlines',
    region: 'left',
    band: 'RISK',
    query: { groupBy: ['sector'], limit: 5 },
    tiles: [{ label: 'Net P&L', column: 'pnl', fn: 'sum', signed: true }],
  },
  chart: {
    kind: 'chart',
    title: 'By channel',
    region: 'main',
    band: 'FLOW',
    query: { groupBy: ['day'], pivotBy: ['channel'], aggregate: [{ column: 'sales', fn: 'sum' }] },
    chart: 'stackedBar',
    style: { labelContrast: 'high', showGrid: false, showLegend: true, palette: 'categorical' },
    normalize: true,
  },
  table: {
    kind: 'table',
    title: 'Rows',
    region: 'right',
    band: 'DETAIL',
    query: { columns: ['sector'], limit: 10 },
    heatmap: true,
  },
  pivot: {
    kind: 'pivot',
    title: 'Cross-tab',
    region: 'main',
    band: 'DETAIL',
    query: { groupBy: ['desk'], pivotBy: ['tenor'], aggregate: [{ column: 'dv01', fn: 'sum' }] },
    heatmap: true,
  },
  lanes: {
    kind: 'lanes',
    title: 'Through the day',
    region: 'main',
    band: 'FLOW',
    query: { columns: ['t', 'pnl'], limit: 50 },
    axis: 'tradeTime',
    lanes: [{ label: 'P&L', column: 'pnl', mark: 'area', tone: 'positive', weight: 3 }],
  },
  commentary: {
    kind: 'commentary',
    title: 'Note',
    region: 'left',
    band: 'RISK',
    text: 'Concentrated in Tech.',
  },
};

function validated(block: Record<string, unknown>): ReportBlock {
  const outcome = validateReportSpec({ title: 'T', blocks: [block] });
  if (!outcome.ok) throw new Error(`block "${block.kind}" was rejected: ${outcome.error}`);
  return outcome.value.blocks[0];
}

/** Field paths that legitimately change shape or value in validation. */
const NORMALISED = new Set(['band']);

describe('no declared field is silently dropped', () => {
  for (const [kind, block] of Object.entries(FULLY_POPULATED)) {
    it(`preserves every field of a "${kind}" block`, () => {
      const out = validated(block) as unknown as Record<string, unknown>;
      const missing = Object.keys(block).filter(
        (key) => !NORMALISED.has(key) && out[key] === undefined,
      );
      expect(missing, `"${kind}" lost: ${missing.join(', ')}`).toEqual([]);
    });
  }

  /** Nested objects are the easiest thing to lose — a tile or lane is rebuilt
   *  field by field, so a new one there vanishes just as quietly. */
  it('preserves every field of a kpi tile', () => {
    const out = validated(FULLY_POPULATED.kpis) as { tiles: Array<Record<string, unknown>> };
    expect(out.tiles[0]).toEqual({ label: 'Net P&L', column: 'pnl', fn: 'sum', signed: true });
  });

  it('preserves every field of a lane', () => {
    const out = validated(FULLY_POPULATED.lanes) as { lanes: Array<Record<string, unknown>> };
    expect(out.lanes[0]).toEqual({ label: 'P&L', column: 'pnl', mark: 'area', tone: 'positive', weight: 3 });
  });

  /** `query` and `style` are passed through whole rather than rebuilt, so their
   *  nested contents must survive intact — including keys this module has no
   *  knowledge of, which is the point of delegating them. */
  it('passes a query through with every clause intact', () => {
    const out = validated(FULLY_POPULATED.chart) as { query: Record<string, unknown> };
    expect(out.query).toEqual(FULLY_POPULATED.chart.query);
  });

  it('passes a chart style through with every option intact', () => {
    const out = validated(FULLY_POPULATED.chart) as { style: Record<string, unknown> };
    expect(out.style).toEqual(FULLY_POPULATED.chart.style);
  });

  it('keeps the whole report round-trippable', () => {
    const blocks = Object.values(FULLY_POPULATED);
    const outcome = validateReportSpec({ title: 'Desk', period: 'close', refreshMs: 30_000, blocks });
    expect(outcome.ok).toBe(true);
    const spec = (outcome as { value: ReportSpec }).value;
    expect(spec.blocks).toHaveLength(blocks.length);
    // Validating an already-validated spec must be a no-op, or the refresh
    // path (which revalidates what storage handed back) would erode it.
    const again = validateReportSpec(spec);
    expect(again.ok).toBe(true);
    expect((again as { value: ReportSpec }).value).toEqual(spec);
  });
});
