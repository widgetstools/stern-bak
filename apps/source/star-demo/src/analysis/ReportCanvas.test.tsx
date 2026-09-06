/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { validateReportSpec, type ReportSpec } from '@wellsfargo-starui/data';

// Counts real calls into the query engine so the memo below is testable.
const runQuerySpy = vi.fn();
vi.mock('@wellsfargo-starui/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wellsfargo-starui/data')>();
  return {
    ...actual,
    runQuery: (...args: Parameters<typeof actual.runQuery>) => {
      runQuerySpy();
      return actual.runQuery(...args);
    },
  };
});

/**
 * The renderers are stubbed on purpose. `DataChart`, `AnalysisTable` and
 * `LaneChart` each have their own tests against the real component; what is
 * under test HERE is the composition — which block goes in which region, what
 * each one is handed, and that a failing block does not take the page down.
 * (The shared setup in `staruiVitestMocks.ts` replaces this module wholesale,
 * so it has to be re-declared here in any case.)
 */
vi.mock('@wellsfargo-starui/grid/customizer', () => ({
  DataChart: ({ spec }: { spec: { kind: string } }) =>
    React.createElement('div', { 'data-testid': 'chart', 'data-kind': spec.kind }),
  AnalysisTable: ({ columns }: { columns: string[] }) =>
    React.createElement('div', { 'data-testid': 'table', 'data-columns': columns.join(',') }),
  LaneChart: ({ axis, lanes }: { axis: string; lanes: Array<{ label: string }> }) =>
    React.createElement('div', {
      'data-testid': 'lanes',
      'data-axis': axis,
      'data-lanes': lanes.map((l) => l.label).join(','),
    }),
}));

import { ReportCanvas } from './ReportCanvas';

const ROWS = [
  { sector: 'Tech', desk: 'Rates', marketValue: 400, pnl: 120, t: '09:00' },
  { sector: 'Tech', desk: 'Credit', marketValue: 300, pnl: -40, t: '10:00' },
  { sector: 'Energy', desk: 'Rates', marketValue: 200, pnl: 60, t: '11:00' },
  { sector: 'Energy', desk: 'Credit', marketValue: 100, pnl: -10, t: '12:00' },
];

function spec(blocks: unknown[], over: Record<string, unknown> = {}): ReportSpec {
  const outcome = validateReportSpec({ title: 'Desk close', blocks, ...over });
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.value;
}

function draw(blocks: unknown[], over: Record<string, unknown> = {}, props: Record<string, unknown> = {}) {
  return render(<ReportCanvas spec={spec(blocks, over)} rows={ROWS} {...props} />);
}

describe('ReportCanvas', () => {
  it('leads with the report title and period', () => {
    draw([{ kind: 'commentary', text: 'Steady.' }], { period: 'as of the close' });
    expect(screen.getByRole('heading', { level: 1, name: 'Desk close' })).toBeTruthy();
    expect(screen.getByText('as of the close')).toBeTruthy();
  });

  /**
   * A re-run is FRESH data, not the snapshot an earlier answer quoted. Saying
   * which and when is the honest half of a live report.
   */
  it('states where the numbers came from and when they ran', () => {
    draw([{ kind: 'commentary', text: 'x' }], {}, {
      provenance: 'Generated sample, 4 rows',
      ranAt: new Date('2026-09-01T10:30:00'),
    });
    expect(screen.getByText(/Generated sample/)).toBeTruthy();
    expect(screen.getByText(/^ran /)).toBeTruthy();
  });

  it('announces its cadence when the report is live', () => {
    draw([{ kind: 'commentary', text: 'x' }], { refreshMs: 30_000 });
    expect(screen.getByText(/every 30s/i)).toBeTruthy();
  });

  it('says nothing about a cadence for a static report', () => {
    draw([{ kind: 'commentary', text: 'x' }]);
    expect(screen.queryByText(/live ·/i)).toBeNull();
  });
});

describe('blocks', () => {
  /** A KPI is never a number the model typed — it is one the engine produced
   *  from the block's own query. */
  it('computes a kpi tile from the query rather than trusting a supplied value', () => {
    draw([
      {
        kind: 'kpis',
        query: { groupBy: ['sector'], aggregate: [{ column: 'marketValue', fn: 'sum' }], sortBy: { column: 'marketValue' } },
        tiles: [{ label: 'Top sector MV', column: 'marketValue' }],
      },
    ]);
    expect(screen.getByText('Top sector MV')).toBeTruthy();
    // Tech sums to 700 and sorts first.
    expect(screen.getByText('700')).toBeTruthy();
  });

  /**
   * Aggregating RENAMES the column to `sum_marketValue`, while a tile names
   * the column the user knows — and the tool resolver maps it to that base
   * colId. Without the fallback the obvious spec renders an em-dash.
   */
  it('finds a tile value the aggregate renamed', () => {
    draw([
      {
        kind: 'kpis',
        query: { groupBy: ['sector'], aggregate: [{ column: 'marketValue', fn: 'sum' }] },
        tiles: [{ label: 'MV', column: 'marketValue', fn: 'sum' }],
      },
    ]);
    expect(screen.queryByText('—')).toBeNull();
  });

  it('shows an em-dash rather than a wrong number when the column is simply absent', () => {
    draw([{ kind: 'kpis', query: { limit: 1 }, tiles: [{ label: 'Nope', column: 'notThere' }] }]);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('renders commentary as text, never as markup', () => {
    const { container } = draw([{ kind: 'commentary', text: '<b>bold</b> & <script>x</script>' }]);
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText(/<b>bold<\/b>/)).toBeTruthy();
  });

  it('hands a table block the columns its query produced', () => {
    draw([{ kind: 'table', query: { columns: ['sector', 'marketValue'], limit: 4 } }]);
    expect(screen.getByTestId('table').dataset.columns).toBe('sector,marketValue');
  });

  it('hands a chart block the kind it asked for', () => {
    draw([{ kind: 'chart', chart: 'treemap', query: { groupBy: ['sector'], aggregate: [{ column: 'marketValue', fn: 'sum' }] } }]);
    expect(screen.getByTestId('chart').dataset.kind).toBe('treemap');
  });

  it('hands a lanes block its shared axis and every lane', () => {
    draw([
      {
        kind: 'lanes',
        query: { columns: ['t', 'pnl', 'marketValue'], limit: 4 },
        axis: 't',
        lanes: [
          { label: 'PNL', column: 'pnl', mark: 'line' },
          { label: 'MV', column: 'marketValue', mark: 'bars' },
        ],
      },
    ]);
    const lanes = screen.getByTestId('lanes');
    expect(lanes.dataset.axis).toBe('t');
    expect(lanes.dataset.lanes).toBe('PNL,MV');
  });

  it('shows a block heading when one is given', () => {
    draw([{ kind: 'commentary', title: 'Narrative', text: 'x' }]);
    expect(screen.getByRole('heading', { level: 3, name: 'Narrative' })).toBeTruthy();
  });

  /** One bad block must not take the report down with it. */
  it('reports a failing block in place and still draws the rest', () => {
    draw([
      { kind: 'table', query: { groupBy: ['sector'], aggregate: [{ column: 'nope', fn: 'sum' }] } },
      { kind: 'commentary', text: 'Still here.' },
    ]);
    expect(screen.getByText('Still here.')).toBeTruthy();
  });
});

/**
 * A holistic view reads like a broadsheet, not a column of cards: standing
 * context down one side, the thing that moves across the middle, totals down
 * the other.
 */
describe('the composition', () => {
  it('places blocks in the regions they name', () => {
    const { container } = draw([
      { kind: 'commentary', region: 'left', text: 'Context here.' },
      { kind: 'commentary', region: 'main', text: 'The main event.' },
      { kind: 'commentary', region: 'right', text: 'Totals.' },
    ]);
    const grid = container.querySelector('[style*="grid-template-columns"]') as HTMLElement;
    // Three populated regions means three tracks.
    expect(grid.style.gridTemplateColumns.split(' ').length).toBeGreaterThanOrEqual(3);
  });

  /** A main-only report must not be three columns with two of them empty. */
  it('gives the rails no width when nothing is in them', () => {
    const { container } = draw([{ kind: 'commentary', text: 'Only this.' }]);
    const grid = container.querySelector('[style*="grid-template-columns"]') as HTMLElement;
    expect(grid.style.gridTemplateColumns.trim()).toBe('minmax(0, 1fr)');
  });

  it('sets a band label once for a run of blocks that share it', () => {
    draw([
      { kind: 'commentary', band: 'RISK', text: 'One.' },
      { kind: 'commentary', band: 'RISK', text: 'Two.' },
      { kind: 'commentary', band: 'FLOW', text: 'Three.' },
    ]);
    expect(screen.getAllByText('RISK')).toHaveLength(1);
    expect(screen.getAllByText('FLOW')).toHaveLength(1);
  });

  it('draws no gutter label for blocks that name no band', () => {
    draw([{ kind: 'commentary', text: 'Plain.' }]);
    expect(screen.queryByText('RISK')).toBeNull();
  });
});

/**
 * The report window used to POLL: `setInterval` → `fetchGridRows` → re-run
 * every block. It now subscribes to the provider and is driven by a version
 * counter, because a live source mutates ONE array in place — so an
 * identity-keyed memo would never invalidate and the report would freeze at
 * its first render.
 *
 * These count real calls into the query engine, so they fail if the memo key
 * is widened back to `rows` or dropped.
 */
describe('live rows', () => {
  const ROWS = [
    { sector: 'Tech', marketValue: 100 },
    { sector: 'Energy', marketValue: 50 },
  ];
  const SPEC = {
    title: 'R',
    blocks: [
      { kind: 'table', region: 'main', query: { columns: ['sector', 'marketValue'] } },
      { kind: 'table', region: 'main', query: { groupBy: ['sector'], aggregate: [{ column: 'marketValue', fn: 'sum', as: 't' }] } },
    ],
  } as unknown as Parameters<typeof ReportCanvas>[0]['spec'];

  beforeEach(() => runQuerySpy.mockClear());

  it('re-runs every block when the version moves, though the array is the same object', () => {
    const { rerender } = render(<ReportCanvas spec={SPEC} rows={ROWS} rowsVersion={1} />);
    expect(runQuerySpy).toHaveBeenCalledTimes(2); // one per block
    rerender(<ReportCanvas spec={SPEC} rows={ROWS} rowsVersion={2} />);
    expect(runQuerySpy).toHaveBeenCalledTimes(4);
  });

  it('does no work on a re-render that is not about data', () => {
    const { rerender } = render(<ReportCanvas spec={SPEC} rows={ROWS} rowsVersion={1} />);
    expect(runQuerySpy).toHaveBeenCalledTimes(2);
    rerender(<ReportCanvas spec={SPEC} rows={ROWS} rowsVersion={1} />);
    rerender(<ReportCanvas spec={SPEC} rows={ROWS} rowsVersion={1} />);
    expect(runQuerySpy).toHaveBeenCalledTimes(2);
  });
});

/**
 * The badge has to describe how the numbers actually arrive. It used to key
 * off `spec.refreshMs`, which stopped meaning anything once the window
 * subscribed to the provider: a genuinely live report showed NO indicator (it
 * has no refreshMs), and a polled one claimed a cadence whether or not that
 * was what was happening.
 */
describe('liveness badge', () => {
  const SPEC = { title: 'R', blocks: [] } as unknown as Parameters<typeof ReportCanvas>[0]['spec'];
  const POLLED = { title: 'R', refreshMs: 5000, blocks: [] } as unknown as Parameters<typeof ReportCanvas>[0]['spec'];

  it('says streaming when rows are pushed', () => {
    render(<ReportCanvas spec={SPEC} rows={[]} liveness="streaming" />);
    expect(screen.getByText(/live · streaming/i)).toBeInTheDocument();
  });

  it('says the cadence when it really is polling', () => {
    render(<ReportCanvas spec={POLLED} rows={[]} liveness="polled" />);
    expect(screen.getByText(/live · every 5s/i)).toBeInTheDocument();
  });

  it('claims nothing when the report is static', () => {
    render(<ReportCanvas spec={SPEC} rows={[]} liveness="static" />);
    expect(screen.queryByText(/live ·/i)).not.toBeInTheDocument();
  });

  /** A streaming report has no refreshMs, and must not fall back to silence. */
  it('does not need refreshMs to show that it is live', () => {
    render(<ReportCanvas spec={SPEC} rows={[]} liveness="streaming" />);
    expect(screen.queryByText(/every/i)).not.toBeInTheDocument();
    expect(screen.getByText(/streaming/i)).toBeInTheDocument();
  });
});
