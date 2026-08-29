/**
 * Renders whichever chart `buildChartSpec` chose.
 *
 * Colour is reserved for the data marks. The axes, grid and labels stay
 * monochrome so the cell still reads as part of a monochrome panel — the marks
 * are the only thing that needs to be distinguishable, and colouring the chrome
 * as well would make the chart shout over the transcript around it.
 *
 * Shared between this module's summary-panel widgets and the AI Assistant's
 * own data-result cell (`apps/source/star-demo/src/aiAssistant/chat/DataResultCell.tsx`,
 * which imports this from `@wellsfargo-starui/grid`) — one renderer, one place
 * to fix a chart bug.
 */
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@wellsfargo-starui/react/chart';
import { CHART_COLORS, type ChartSpec } from '@wellsfargo-starui/data';

/** Named so recharts' `var(--color-<key>)` indirection resolves to the ramp. */
const CHART_CONFIG = {
  value: { label: 'Value', color: CHART_COLORS[0] },
  y: { label: 'Y', color: CHART_COLORS[1] },
} satisfies ChartConfig;

export function compactNumber(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? '');
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Number.isInteger(value) ? value : Math.round(value * 100) / 100);
}

const AXIS = { tickLine: false, axisLine: false, tick: { fontSize: 9 } } as const;
const MARGIN = { top: 4, right: 8, bottom: 4, left: 8 } as const;

function truncate(v: string): string {
  return v.length > 10 ? `${v.slice(0, 9)}…` : v;
}

export function DataChart({ spec }: { spec: ChartSpec }) {
  const { kind, points } = spec;
  // Horizontal bars and pies need room per category; the rest are fixed.
  const height = kind === 'hbar' ? Math.max(160, points.length * 20 + 40) : kind === 'pie' ? 200 : 170;

  return (
    <ChartContainer config={CHART_CONFIG} className="w-full" style={{ height }}>
      {renderChart(spec)}
    </ChartContainer>
  );
}

function renderChart(spec: ChartSpec) {
  const { kind, points } = spec;

  if (kind === 'pie') {
    return (
      // Slices are identified by legend, not by position — without it a donut
      // is five anonymous colours.
      <PieChart margin={MARGIN}>
        <ChartTooltip content={<ChartTooltipContent nameKey="label" />} />
        <Pie data={points} dataKey="value" nameKey="label" innerRadius="42%" outerRadius="72%" paddingAngle={1}>
          {points.map((point) => (
            <Cell key={point.label} fill={point.fill} stroke="var(--background)" strokeWidth={1} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="label" />} />
      </PieChart>
    );
  }

  if (kind === 'line' || kind === 'area') {
    const Chart = kind === 'line' ? LineChart : AreaChart;
    return (
      <Chart data={points} margin={MARGIN}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" tickFormatter={truncate} />
        <YAxis {...AXIS} width={40} tickFormatter={compactNumber} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {kind === 'line' ? (
          <Line type="monotone" dataKey="value" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
        ) : (
          <Area type="monotone" dataKey="value" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.18} />
        )}
      </Chart>
    );
  }

  if (kind === 'scatter') {
    return (
      <ScatterChart margin={{ ...MARGIN, left: 12 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" dataKey="value" name={spec.labelKey} {...AXIS} tickFormatter={compactNumber} />
        <YAxis type="number" dataKey="y" name={spec.yKey} {...AXIS} width={40} tickFormatter={compactNumber} />
        <ZAxis range={[24, 24]} />
        <ChartTooltip content={<ChartTooltipContent nameKey="label" />} />
        <Scatter data={points}>
          {points.map((point, i) => (
            <Cell key={`${point.label}-${i}`} fill={point.fill} fillOpacity={0.75} />
          ))}
        </Scatter>
      </ScatterChart>
    );
  }

  if (kind === 'hbar') {
    return (
      <BarChart data={points} layout="vertical" margin={{ ...MARGIN, left: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" {...AXIS} tickFormatter={compactNumber} />
        <YAxis type="category" dataKey="label" {...AXIS} width={92} tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="value" radius={[0, 2, 2, 0]}>
          {points.map((point) => <Cell key={point.label} fill={point.fill} />)}
        </Bar>
      </BarChart>
    );
  }

  return (
    <BarChart data={points} margin={MARGIN}>
      <CartesianGrid vertical={false} strokeDasharray="3 3" />
      <XAxis dataKey="label" {...AXIS} interval={0} tickFormatter={truncate} />
      <YAxis {...AXIS} width={40} tickFormatter={compactNumber} />
      <ChartTooltip content={<ChartTooltipContent />} />
      <Bar dataKey="value" radius={[2, 2, 0, 0]}>
        {points.map((point) => <Cell key={point.label} fill={point.fill} />)}
      </Bar>
    </BarChart>
  );
}
