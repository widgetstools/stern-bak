/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
 * Placement is react-grid-layout's job now; the region a block names is the
 * AUTHORING vocabulary that decides where it opens. These assert what the
 * reader sees — that regions land in different columns, and that a main-only
 * report is full width rather than a middle third with two empty gutters —
 * without pinning the engine's markup.
 */
describe('the composition', () => {
  /**
   * Pixel positions are the engine's arithmetic against a measured container,
   * and jsdom measures nothing — it falls back to a default width, and not
   * consistently. So WHERE a block lands is asserted against `deriveLayout` in
   * `autoLayout.test.ts`, where it is exact and deterministic. What belongs
   * here is that every block reaches the grid as its own item.
   */
  it('gives every block its own grid item', () => {
    const { container } = draw([
      { kind: 'commentary', region: 'left', text: 'Context here.' },
      { kind: 'commentary', region: 'main', text: 'The main event.' },
      { kind: 'commentary', region: 'right', text: 'Totals.' },
    ]);
    expect(container.querySelectorAll('.react-grid-item')).toHaveLength(3);
    expect(screen.getByText('Context here.')).toBeTruthy();
    expect(screen.getByText('Totals.')).toBeTruthy();
  });

  /**
   * The band used to be a rotated label in the gutter spanning a RUN of
   * consecutive blocks. A run is a property of one ordered column, and blocks
   * placed freely on a grid have none — two in the same band can sit at
   * opposite corners. So the band travels with its block instead.
   */
  it('labels every block with the band it belongs to', () => {
    draw([
      { kind: 'commentary', band: 'RISK', text: 'One.' },
      { kind: 'commentary', band: 'RISK', text: 'Two.' },
      { kind: 'commentary', band: 'FLOW', text: 'Three.' },
    ]);
    expect(screen.getAllByText('RISK')).toHaveLength(2);
    expect(screen.getAllByText('FLOW')).toHaveLength(1);
  });

  it('draws no label for blocks that name no band', () => {
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

/**
 * Legibility, reported from a screenshot: "the legends and texts are barely
 * visible". The worst of it was not faintness but TRUNCATION — a fixed
 * `repeat(4, 1fr)` gave each KPI tile about 45px in the narrow side rails, so
 * the headline figure rendered as "6…" and the tile said nothing at all.
 */
describe('legibility', () => {
  const TILES = [
    {
      kind: 'kpis',
      query: { aggregate: [{ column: 'marketValue', fn: 'sum' }], groupBy: ['sector'] },
      tiles: [
        { label: 'Gross exposure', column: 'marketValue', fn: 'sum' },
        { label: 'Daily P&L', column: 'marketValue', fn: 'sum' },
        { label: 'Total P&L', column: 'marketValue', fn: 'sum' },
        { label: 'DV01', column: 'marketValue', fn: 'sum' },
      ],
    },
  ];

  it('lets KPI tiles wrap instead of forcing four into whatever width there is', () => {
    const { container } = draw(TILES);
    // Several grids render here (the region layout is one), so look across
    // them rather than assuming which comes first.
    const tracks = [...container.querySelectorAll<HTMLElement>('[style*="grid-template-columns"]')]
      .map((el) => el.style.gridTemplateColumns);
    // auto-fit with a floor, so a narrow rail wraps to one or two columns
    // rather than squeezing four unreadable ones.
    expect(tracks.some((t) => t.includes('auto-fit') && t.includes('minmax'))).toBe(true);
    expect(tracks.some((t) => t.includes('repeat(4'))).toBe(false);
  });

  /** A 9px label at 70% opacity on a dark ground is not quiet, it is gone. */
  it('does not render label text below 10px', () => {
    const { container } = draw(TILES);
    expect(container.querySelectorAll('.text-\\[9px\\]')).toHaveLength(0);
  });
});

/**
 * Editing affordances. A dashboard is read far more often than it is
 * rearranged, so nothing appears until it is asked for — and the save/undo
 * pair appears only once there is a change to keep or discard.
 */
describe('layout editing', () => {
  const BLOCKS = [
    { kind: 'commentary', text: 'One', title: 'A' },
    { kind: 'commentary', text: 'Two', title: 'B' },
  ];

  it('renders no handles at all when the report is read-only', () => {
    const { container } = draw(BLOCKS);
    expect(container.querySelector('.rgl-grip')).toBeNull();
    // The engine still emits its handle nodes; not being resizable is the
    // class that hides them.
    expect(container.querySelectorAll('.react-grid-item.react-resizable-hide')).toHaveLength(2);
  });

  it('offers a drag grip and resize handles per block when editable', () => {
    const { container } = draw(BLOCKS, {}, { onSaveLayout: vi.fn() });
    expect(container.querySelectorAll('.rgl-grip')).toHaveLength(2);
    // Corner plus two edges, from the engine, on each block.
    expect(container.querySelectorAll('.react-grid-item .react-resizable-handle-se')).toHaveLength(2);
    expect(container.querySelectorAll('.react-grid-item .react-resizable-handle-e')).toHaveLength(2);
  });

  /**
   * The bug this pins. The grip rendered at ZERO opacity and came up only on
   * hover, so a dashboard showed no pixel anywhere suggesting a block could
   * move — there was nothing to hover towards, and the feature read as
   * missing. Verified in the running app: at rest it computed to
   * `oklch(… / 0)`, on hover to 0.5.
   *
   * jsdom applies no stylesheet, so this pins the CLASS that decides the
   * resting opacity rather than the computed colour. The engine's own resize
   * handles have the same default (`opacity: 0` until `:hover`) and are
   * re-stated in `reportGrid.css`.
   */
  it('renders the grip visibly at rest, not only on hover', () => {
    const { container } = draw(BLOCKS, {}, { onSaveLayout: vi.fn() });
    const glyph = container.querySelector('.rgl-grip [aria-hidden]') as HTMLElement;
    expect(glyph.className).not.toMatch(/text-muted-foreground\/0(?!\.|\d)/);
    // And it still strengthens under the pointer, so resting quiet is a
    // choice rather than the only state.
    expect(glyph.className).toMatch(/group-hover\/blk:/);
  });

  /**
   * A 17px grip in the margin was one small target you had to find first. The
   * whole header — band, title and grip — is the drag surface now, the way a
   * window title bar is, while the body stays free for selecting a number or
   * scrolling a table.
   */
  it('makes the whole block header the drag handle, not just the grip glyph', () => {
    const { container } = draw(
      [{ kind: 'commentary', title: 'Narrative', band: 'RISK', text: 'x' }],
      {},
      { onSaveLayout: vi.fn() },
    );
    const handle = container.querySelector('.rgl-grip') as HTMLElement;
    expect(handle.textContent).toContain('Narrative');
    expect(handle.textContent).toContain('RISK');
    expect(handle.getAttribute('aria-label')).toBe('Drag to move this block');
    // The body is NOT part of it.
    expect(handle.textContent).not.toContain('x');
  });

  /** Dragging must be on the grip, not the card: a block that moves when you
   *  try to select a number in it is worse than one that cannot move. */
  it('makes only the grip a drag surface', () => {
    const { container } = draw(BLOCKS, {}, { onSaveLayout: vi.fn() });
    const grip = container.querySelector('.rgl-grip') as HTMLElement;
    expect(grip.getAttribute('aria-label')).toBe('Drag to move this block');
    // The card itself carries no drag affordance of its own.
    expect(container.querySelector('[draggable="true"]')).toBeNull();
  });

  it('shows nothing to save until something moves', () => {
    draw(BLOCKS, {}, { onSaveLayout: vi.fn() });
    expect(screen.queryByLabelText('Save this layout')).toBeNull();
    expect(screen.queryByLabelText('Discard layout changes')).toBeNull();
  });

  /**
   * The engine fires `onLayoutChange` on mount and on every re-measure. If any
   * of those counted as an edit, the save control would appear on a dashboard
   * nobody touched — and a save prompt that appears on its own teaches people
   * to ignore it.
   */
  it('stays clean through mount and re-render, which the engine reports as changes', () => {
    const { rerender } = draw(BLOCKS, {}, { onSaveLayout: vi.fn() });
    rerender(
      <ReportCanvas spec={spec(BLOCKS)} rows={ROWS} rowsVersion={2} onSaveLayout={vi.fn()} />,
    );
    expect(screen.queryByLabelText('Save this layout')).toBeNull();
  });
});

/**
 * A report that cannot be SAVED can still be rearranged. Hiding the handles
 * read as a missing feature rather than a deliberate limit — and seeing the
 * layout you want is most of the value even when it is not kept.
 */
describe('an ephemeral report', () => {
  const BLOCKS = [
    { kind: 'commentary', text: 'One', title: 'A' },
    { kind: 'commentary', text: 'Two', title: 'B' },
  ];
  const REASON = 'Keep this as a dashboard to save its layout';

  it('still offers drag and resize handles', () => {
    const { container } = draw(BLOCKS, {}, { saveDisabledReason: REASON });
    expect(container.querySelectorAll('.rgl-grip')).toHaveLength(2);
    expect(container.querySelectorAll('.react-grid-item .react-resizable-handle-se')).toHaveLength(2);
  });

  it('leaves a plain read-only render with no handles at all', () => {
    const { container } = draw(BLOCKS);
    expect(container.querySelector('.rgl-grip')).toBeNull();
    expect(container.querySelectorAll('.react-grid-item.react-resizable-hide')).toHaveLength(2);
  });
});
