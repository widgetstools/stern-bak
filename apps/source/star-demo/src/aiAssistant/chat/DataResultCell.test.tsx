import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * recharts is stubbed here, matching what the design-system app does in its own
 * setup (`apps/source/design-system/src/testSetupMocks.ts`).
 *
 * It isn't about speed. `apps/` is a separate install root from the repo root,
 * so both carry a copy of React; recharts is reached via
 * `@wellsfargo-starui/react/chart` under the repo root and therefore binds the
 * ROOT React, while react-dom binds the `apps/` one. Two Reacts means a null
 * hook dispatcher and every context-using component throws. The app is fine —
 * `staruiConsumerViteConfig` aliases and dedupes React for dev and build, and
 * `vite build` succeeds — but vitest externalizes node_modules to Node's
 * resolver, which never consults those aliases.
 *
 * What's under test here is the cell: provenance, statistics, the table. The
 * chart's own rendering belongs to recharts.
 */
// `ChartContainer` imports recharts itself, from the repo root — a different
// resolved path than this file's `recharts`, and vitest keys mocks by resolved
// path, so stubbing `recharts` alone never intercepts it. Stub the wrapper too.
vi.mock('@wellsfargo-starui/react/chart', () => ({
  ChartContainer: ({ children }: React.PropsWithChildren) =>
    React.createElement('div', { 'data-testid': 'ChartContainer' }, children),
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
  ChartLegend: () => null,
  ChartLegendContent: () => null,
}));

vi.mock('recharts', () => {
  // Declared inside the factory: `vi.mock` is hoisted above every top-level
  // binding in this file, so a shared helper up there is not yet initialised.
  const chartEl =
    (tag: string) =>
    ({ children }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('div', { 'data-testid': tag }, children);
  return {
    ResponsiveContainer: chartEl('ResponsiveContainer'),
    BarChart: chartEl('BarChart'),
    Bar: chartEl('Bar'),
    LineChart: chartEl('LineChart'),
    Line: chartEl('Line'),
    AreaChart: chartEl('AreaChart'),
    Area: chartEl('Area'),
    PieChart: chartEl('PieChart'),
    Pie: chartEl('Pie'),
    ScatterChart: chartEl('ScatterChart'),
    Scatter: chartEl('Scatter'),
    Cell: chartEl('Cell'),
    ZAxis: chartEl('ZAxis'),
    XAxis: chartEl('XAxis'),
    YAxis: chartEl('YAxis'),
    CartesianGrid: chartEl('CartesianGrid'),
    Tooltip: chartEl('Tooltip'),
    Legend: chartEl('Legend'),
  };
});

import { DataResultCell } from './DataResultCell';
import { ToolCallCard, type ToolActivity } from './ToolCallCard';
import { DATA_CELL, type DataCellPayload } from '../dataTools';
import { summariseRows } from '../dataDigest';

const ROWS = [
  { ticker: 'AAPL', sector: 'Tech', marketValue: 100 },
  { ticker: 'MSFT', sector: 'Tech', marketValue: 200 },
  { ticker: 'JPM', sector: 'Financials', marketValue: 700 },
];

function payload(over: Partial<DataCellPayload> = {}): DataCellPayload {
  return {
    kind: DATA_CELL,
    gridName: 'TestGrid',
    source: 'live',
    provenance: 'live from "Positions Feed" — the rows currently on screen',
    rowCount: 3,
    digest: summariseRows(ROWS, { columns: ['ticker', 'sector', 'marketValue'], groupBy: 'sector' }),
    ran: 'summary of 3 rows, grouped by sector',
    ...over,
  };
}

describe('DataResultCell', () => {
  it('leads with the grid, what ran, and the row count', () => {
    render(<DataResultCell payload={payload()} />);
    expect(screen.getByText('TestGrid')).toBeTruthy();
    expect(screen.getByText('summary of 3 rows, grouped by sector')).toBeTruthy();
    expect(screen.getByText('3 rows')).toBeTruthy();
  });

  it('states the provenance of live rows', () => {
    render(<DataResultCell payload={payload()} />);
    expect(screen.getByText(/rows currently on screen/)).toBeTruthy();
    expect(screen.queryByText(/Generated sample/i)).toBeNull();
  });

  /** A generated sample must be unmissable — its numbers are ones the user has
   *  never seen, so the cell says so before showing any of them. */
  it('marks a generated sample prominently', () => {
    render(<DataResultCell payload={payload({ source: 'sample', provenance: 'a freshly GENERATED sample of 200 mock rows' })} />);
    // The banner label plus the provenance sentence itself.
    expect(screen.getAllByText(/Generated sample/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/200 mock rows/)).toBeTruthy();
  });

  it('shows the computed totals rather than making the reader open anything', () => {
    render(<DataResultCell payload={payload()} />);
    // The column appears as a stat-card label and again in a highlight line.
    expect(screen.getAllByText('marketValue').length).toBeGreaterThan(0);
    expect(screen.getByText('1000')).toBeTruthy();
  });

  it('lists the highlights', () => {
    render(<DataResultCell payload={payload()} />);
    expect(screen.getByText(/marketValue: total 1000/)).toBeTruthy();
  });

  it('renders a query result as a table', () => {
    render(
      <DataResultCell
        payload={payload({
          digest: undefined,
          ran: '3 rows',
          table: { columns: ['ticker', 'marketValue'], rows: ROWS.map((r) => ({ ticker: r.ticker, marketValue: r.marketValue })), matched: 3, scanned: 3, truncated: false, grouped: false },
        })}
      />,
    );
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'ticker' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'AAPL' })).toBeTruthy();
  });

  it('says how much of a truncated result it showed', () => {
    render(
      <DataResultCell
        payload={payload({
          digest: undefined,
          table: { columns: ['ticker'], rows: [{ ticker: 'AAPL' }], matched: 812, scanned: 812, truncated: true, grouped: false },
        })}
      />,
    );
    expect(screen.getByText('Showing 1 of 812 matching rows.')).toBeTruthy();
  });

  it('abbreviates large numbers so the table stays readable', () => {
    render(
      <DataResultCell
        payload={payload({
          digest: undefined,
          table: { columns: ['v'], rows: [{ v: 412_880_113 }], matched: 1, scanned: 1, truncated: false, grouped: false },
        })}
      />,
    );
    expect(screen.getByRole('cell', { name: '412.88M' })).toBeTruthy();
  });

  it('keeps the raw payload behind a toggle', async () => {
    render(<DataResultCell payload={payload()} />);
    expect(screen.queryByText(/"kind": "data-cell"/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /raw result/ }));
    expect(screen.getByText(/"kind": "data-cell"/)).toBeTruthy();
  });

  it('renders an empty result without breaking', () => {
    render(
      <DataResultCell
        payload={payload({ digest: undefined, rowCount: 0, table: { columns: ['a'], rows: [], matched: 0, scanned: 5, truncated: false, grouped: false } })}
      />,
    );
    expect(screen.getByText('No rows matched.')).toBeTruthy();
  });
});

describe('ToolCallCard routing', () => {
  const activity = (over: Partial<ToolActivity> = {}): ToolActivity => ({
    id: 'call_1', name: 'summarize_grid_data', args: { targetGridId: 'grid-test' },
    status: 'ok', summary: '3 rows', result: payload(), ...over,
  });

  /** The analysis is the point of the turn — it renders in full, not collapsed
   *  behind a disclosure triangle like a config write. */
  it('renders a data payload as an output cell, expanded', () => {
    render(<ToolCallCard activity={activity()} />);
    expect(screen.getByText('TestGrid')).toBeTruthy();
    expect(screen.queryByText('summarize_grid_data')).toBeNull();
  });

  it('falls back to the ordinary card for a failed data call', () => {
    render(<ToolCallCard activity={activity({ status: 'error', result: undefined, summary: 'Open the blotter' })} />);
    expect(screen.getByText('summarize_grid_data')).toBeTruthy();
  });

  it('leaves every other tool result alone', () => {
    render(<ToolCallCard activity={activity({ name: 'list_grids', result: [{ id: 'grid-test' }] })} />);
    expect(screen.getByText('list_grids')).toBeTruthy();
  });
});
