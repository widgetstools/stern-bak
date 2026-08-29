/**
 * @vitest-environment jsdom
 *
 * recharts + the ChartContainer wrapper are stubbed exactly as
 * `apps/source/star-demo/src/aiAssistant/chat/DataResultCell.test.tsx` does —
 * this file lives in a different package from `@wellsfargo-starui/react`, so
 * vitest resolves the two independently, and mounting a real recharts tree
 * in jsdom has nothing to do with what a 'chart' widget is under test for
 * here: that the right spec reaches the renderer.
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import { GridPlatform } from '@wellsfargo-starui/core';
import { GridProvider } from '../../hooks/GridProvider.js';
import { SummaryPanelView } from './SummaryPanelView.js';
import { summaryPanelModule, SUMMARY_PANEL_MODULE_ID, type SummaryPanelState } from './index.js';

vi.mock('@wellsfargo-starui/react/chart', () => ({
  ChartContainer: ({ children }: React.PropsWithChildren) =>
    React.createElement('div', { 'data-testid': 'ChartContainer' }, children),
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
  ChartLegend: () => null,
  ChartLegendContent: () => null,
}));

vi.mock('recharts', () => {
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

function makeApi(rows: Record<string, unknown>[]): GridApi {
  return {
    forEachNode: (cb: (node: { data: Record<string, unknown> }) => void) => {
      rows.forEach((data) => cb({ data }));
    },
  } as unknown as GridApi;
}

function setup(rows: Record<string, unknown>[], state: SummaryPanelState) {
  const platform = new GridPlatform({ gridId: 'summary-panel-test', modules: [summaryPanelModule] });
  platform.store.setModuleState<SummaryPanelState>(SUMMARY_PANEL_MODULE_ID, () => state);
  const utils = render(
    <GridProvider platform={platform}>
      <SummaryPanelView />
    </GridProvider>,
  );
  act(() => platform.onGridReady(makeApi(rows)));
  return utils;
}

describe('SummaryPanelView', () => {
  it('renders nothing when no widgets are configured', () => {
    const { container } = setup([], { widgets: [] });
    expect(container.querySelector('[data-testid="summary-panel-strip"]')).toBeNull();
  });

  it('renders a digest card summarizing the current rows, grouped as configured', () => {
    setup(
      [
        { sector: 'Tech', marketValue: 100 },
        { sector: 'Tech', marketValue: 200 },
        { sector: 'Financials', marketValue: 700 },
      ],
      { widgets: [{ id: 'w1', title: 'By sector', kind: 'digest', query: { groupBy: ['sector'] } }] },
    );
    expect(screen.getByText('By sector')).toBeTruthy();
    expect(screen.getByText('Financials')).toBeTruthy();
    expect(screen.getByText('Tech')).toBeTruthy();
  });

  it('surfaces a query validation error rather than crashing the card', () => {
    setup(
      [{ sector: 'Tech', marketValue: 100 }],
      { widgets: [{ id: 'w1', kind: 'chart', query: { aggregate: [{ column: 'marketValue', fn: 'sum' }] } }] },
    );
    expect(screen.getByText(/aggregate needs groupBy/)).toBeTruthy();
  });

  it('renders a chart widget through DataChart when the query resolves', () => {
    setup(
      [
        { sector: 'Tech', marketValue: 300 },
        { sector: 'Financials', marketValue: 700 },
        { sector: 'Energy', marketValue: 500 },
      ],
      {
        widgets: [
          {
            id: 'w1',
            kind: 'chart',
            query: { groupBy: ['sector'], aggregate: [{ column: 'marketValue', fn: 'sum' }] },
          },
        ],
      },
    );
    expect(screen.getByTestId('ChartContainer')).toBeTruthy();
  });

  it('renders a heatmap widget as a shaded table', () => {
    setup(
      [
        { sector: 'Tech', marketValue: 300 },
        { sector: 'Financials', marketValue: 700 },
      ],
      { widgets: [{ id: 'w1', kind: 'heatmap', query: { columns: ['sector', 'marketValue'] } }] },
    );
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'marketValue' })).toBeTruthy();
  });
});
