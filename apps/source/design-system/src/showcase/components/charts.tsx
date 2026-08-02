import { CartesianGrid, Line, LineChart, XAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@wellsfargo-starui/react/chart';
import type { ShowcaseEntry } from '../types';

const DATA = [
  { tenor: '2y', yield: 2.4 },
  { tenor: '5y', yield: 3.1 },
  { tenor: '10y', yield: 3.7 },
  { tenor: '20y', yield: 4.1 },
  { tenor: '30y', yield: 4.2 },
];

const CONFIG = {
  yield: { label: 'Yield %', color: 'var(--ds-chart-1)' },
} satisfies ChartConfig;

export const chartsEntries: ShowcaseEntry[] = [
  {
    id: 'chart', name: 'Chart', category: 'charts',
    importLine: "import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@wellsfargo-starui/react/chart';",
    code: `const config = { yield: { label: 'Yield %', color: 'var(--ds-chart-1)' } } satisfies ChartConfig;

<ChartContainer config={config} className="h-[200px] w-full">
  <LineChart data={data}>
    <CartesianGrid vertical={false} />
    <XAxis dataKey="tenor" />
    <ChartTooltip content={<ChartTooltipContent />} />
    <Line dataKey="yield" stroke="var(--color-yield)" dot={false} />
  </LineChart>
</ChartContainer>`,
    Demo: () => (
      <ChartContainer config={CONFIG} className="h-[200px] w-[320px]">
        <LineChart data={DATA} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="tenor" tickLine={false} axisLine={false} fontSize={11} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line dataKey="yield" type="monotone" stroke="var(--color-yield)" strokeWidth={2} dot={false} />
        </LineChart>
      </ChartContainer>
    ),
  },
];
