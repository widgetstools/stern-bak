import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegendContent,
  ChartStyle,
  ChartTooltipContent,
} from './chart.js';

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="chart-viewport">{children}</div>
    ),
  };
});

afterEach(cleanup);

const config = {
  revenue: { label: 'Revenue', color: '#3366ff' },
  cost: {
    label: 'Cost',
    theme: { light: '#111111', dark: '#eeeeee' },
  },
} as const;

describe('ChartContainer', () => {
  it('renders chart content inside a labelled data-chart shell', () => {
    const { container } = render(
      <ChartContainer config={config} className="h-48">
        <BarChart data={[{ month: 'Jan', revenue: 10 }]}>
          <XAxis dataKey="month" />
          <YAxis />
          <Bar dataKey="revenue" fill="var(--color-revenue)" />
        </BarChart>
      </ChartContainer>,
    );

    expect(container.querySelector('[data-chart]')).toHaveClass('h-48');
    expect(container.querySelector('style')).not.toBeNull();
  });

  it('omits inline theme styles when no colors are configured', () => {
    const { container } = render(
      <ChartStyle id="empty-chart" config={{ plain: { label: 'Plain' } }} />,
    );

    expect(container.querySelector('style')).toBeNull();
  });
});

function renderInChartContext(ui: React.ReactNode) {
  return render(<ChartContainer config={config}>{ui}</ChartContainer>);
}

describe('ChartTooltipContent', () => {
  it('returns nothing when inactive', () => {
    const { container } = renderInChartContext(
      <ChartTooltipContent active={false} payload={[]} />,
    );

    expect(container.querySelector('.grid.min-w-\\[8rem\\]')).toBeNull();
  });

  it('renders formatted values for an active payload', () => {
    renderInChartContext(
      <ChartTooltipContent
        active
        label="Jan"
        payload={[
          {
            name: 'revenue',
            dataKey: 'revenue',
            value: 1200,
            color: '#3366ff',
            payload: { fill: '#3366ff' },
          },
        ]}
      />,
    );

    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('1,200')).toBeInTheDocument();
  });

  it('honours a custom formatter override', () => {
    renderInChartContext(
      <ChartTooltipContent
        active
        payload={[
          {
            name: 'revenue',
            dataKey: 'revenue',
            value: 5,
            payload: {},
          },
        ]}
        formatter={(value) => <span>Custom {value}</span>}
      />,
    );

    expect(screen.getByText('Custom 5')).toBeInTheDocument();
  });
});

describe('ChartLegendContent', () => {
  it('renders configured labels for each legend item', () => {
    renderInChartContext(
      <ChartLegendContent
        payload={[
          { value: 'revenue', dataKey: 'revenue', color: '#3366ff' },
          { value: 'cost', dataKey: 'cost', color: '#111111' },
        ]}
      />,
    );

    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('Cost')).toBeInTheDocument();
  });

  it('returns nothing when payload is empty', () => {
    const { container } = renderInChartContext(<ChartLegendContent payload={[]} />);

    expect(container.querySelector('.flex.items-center.justify-center.gap-4')).toBeNull();
  });
});
