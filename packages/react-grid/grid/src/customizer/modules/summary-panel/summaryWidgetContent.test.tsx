/**
 * @vitest-environment jsdom
 *
 * recharts + the ChartContainer wrapper are stubbed exactly as
 * `apps/source/star-demo/src/aiAssistant/chat/DataResultCell.test.tsx` does —
 * this file lives in a different package from `@wellsfargo-starui/react`, so
 * vitest resolves the two independently, and mounting a real recharts tree
 * in jsdom has nothing to do with what's under test here: that the right
 * spec reaches the renderer.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SummaryWidgetContent } from './summaryWidgetContent.js';
import type { SummaryWidget } from './index.js';

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

const ROWS = [
  { sector: 'Tech', marketValue: 100 },
  { sector: 'Tech', marketValue: 200 },
  { sector: 'Financials', marketValue: 700 },
];

describe('SummaryWidgetContent', () => {
  it('renders a digest widget grouped by the configured column', () => {
    const widget: SummaryWidget = { id: 'w1', kind: 'digest', query: { groupBy: ['sector'] } };
    render(<SummaryWidgetContent widget={widget} rows={ROWS} />);
    expect(screen.getByText('Financials')).toBeTruthy();
    expect(screen.getByText('Tech')).toBeTruthy();
  });

  it('surfaces a query validation error rather than crashing', () => {
    const widget: SummaryWidget = { id: 'w1', kind: 'chart', query: { aggregate: [{ column: 'marketValue', fn: 'sum' }] } };
    render(<SummaryWidgetContent widget={widget} rows={ROWS} />);
    expect(screen.getByText(/aggregate needs groupBy/)).toBeTruthy();
  });

  it('renders a chart widget through DataChart when the query resolves', () => {
    const widget: SummaryWidget = {
      id: 'w1',
      kind: 'chart',
      query: { groupBy: ['sector'], aggregate: [{ column: 'marketValue', fn: 'sum' }] },
    };
    render(<SummaryWidgetContent widget={widget} rows={ROWS} />);
    expect(screen.getByTestId('ChartContainer')).toBeTruthy();
  });

  it('says there is not enough data rather than rendering a broken chart', () => {
    const widget: SummaryWidget = { id: 'w1', kind: 'chart', query: { groupBy: ['sector'] } };
    render(<SummaryWidgetContent widget={widget} rows={[{ sector: 'OnlyOne' }]} />);
    expect(screen.getByText('Not enough data to chart yet.')).toBeTruthy();
  });

  it('renders a heatmap widget as a shaded table', () => {
    const widget: SummaryWidget = { id: 'w1', kind: 'heatmap', query: { columns: ['sector', 'marketValue'] } };
    render(<SummaryWidgetContent widget={widget} rows={ROWS} />);
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'marketValue' })).toBeTruthy();
  });
});
