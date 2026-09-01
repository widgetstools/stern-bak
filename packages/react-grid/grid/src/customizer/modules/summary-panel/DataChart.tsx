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
  ReferenceLine,
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
import {
  CHART_COLORS,
  formatValue,
  formatCompact,
  labelContrastClass,
  type ChartSpec,
  type ChartStyle,
} from '@wellsfargo-starui/data';

/** Named so recharts' `var(--color-<key>)` indirection resolves to the ramp. */
const CHART_CONFIG = {
  value: { label: 'Value', color: CHART_COLORS[0] },
  y: { label: 'Y', color: CHART_COLORS[1] },
} satisfies ChartConfig;

/**
 * Axis ticks only — there is room for about six characters, so a rounded
 * magnitude beats an exact number. Table cells, tooltips and commentary use
 * the column's real format instead (`formatValue`).
 */
export const compactNumber = formatCompact;

/**
 * Axis type was hardcoded at 9px — below the design system's own smallest type
 * token (`--text-2xs`, 10px), which is the floor for a reason. Reading it from
 * the token keeps the chart in step with the rest of the app and with whatever
 * the density setting does to it.
 */
const AXIS = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 'var(--ds-font-size-2xs, 10px)' },
} as const;
const MARGIN = { top: 4, right: 8, bottom: 4, left: 8 } as const;

function truncate(v: string): string {
  return v.length > 10 ? `${v.slice(0, 9)}…` : v;
}

/**
 * Height is a FLOOR, not a fixed size: the chart grows into whatever the panel
 * gives it. Fixed pixel heights meant a chart in a tall dock panel left the
 * bottom half empty while the same chart in the chat side panel was squashed.
 * Horizontal bars still scale with category count, since each bar needs its
 * own row whatever the container height.
 */
function minHeightFor(kind: ChartSpec['kind'], pointCount: number): number {
  if (kind === 'hbar') return Math.max(160, pointCount * 20 + 40);
  return kind === 'pie' ? 200 : 170;
}

export function DataChart({ spec, style }: { spec: ChartSpec; style?: ChartStyle }) {
  const { kind, points } = spec;

  return (
    <ChartContainer
      config={CHART_CONFIG}
      // Label contrast overrides the container's own `fill-muted-foreground`
      // on tick text, so it has to be applied here rather than on the axes.
      className={`w-full h-full ${labelContrastClass(style?.labelContrast)}`}
      style={{ minHeight: minHeightFor(kind, points.length) }}
    >
      {renderChart(spec, style)}
    </ChartContainer>
  );
}

function renderChart(spec: ChartSpec, style?: ChartStyle) {
  const { kind, points } = spec;
  const showGrid = style?.showGrid !== false;
  const showLegend = style?.showLegend !== false;

  if (kind === 'pie') {
    return (
      // Slices are identified by legend, not by position — without it a donut
      // is five anonymous colours.
      <PieChart margin={MARGIN}>
        <ChartTooltip content={<ChartTooltipContent nameKey="label" formatter={(v) => formatValue(spec.valueKey, v)} />} />
        <Pie data={points} dataKey="value" nameKey="label" innerRadius="42%" outerRadius="72%" paddingAngle={1}>
          {points.map((point) => (
            <Cell key={point.label} fill={point.fill} stroke="var(--background)" strokeWidth={1} />
          ))}
        </Pie>
        {showLegend && <ChartLegend content={<ChartLegendContent nameKey="label" />} />}
      </PieChart>
    );
  }

  if (kind === 'line' || kind === 'area') {
    const Chart = kind === 'line' ? LineChart : AreaChart;
    return (
      <Chart data={points} margin={MARGIN}>
        {showGrid && <CartesianGrid vertical={false} strokeDasharray="3 3" />}
        <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" tickFormatter={truncate} />
        <YAxis {...AXIS} width={40} tickFormatter={compactNumber} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatValue(spec.valueKey, v)} />} />
        {spec.signed && <ReferenceLine y={0} stroke="var(--ds-border-secondary)" strokeWidth={1} />}
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
        {showGrid && <CartesianGrid strokeDasharray="3 3" />}
        <XAxis type="number" dataKey="value" name={spec.labelKey} {...AXIS} tickFormatter={compactNumber} />
        <YAxis type="number" dataKey="y" name={spec.yKey} {...AXIS} width={40} tickFormatter={compactNumber} />
        <ZAxis range={[24, 24]} />
        <ChartTooltip content={<ChartTooltipContent nameKey="label" formatter={(v) => formatValue(spec.valueKey, v)} />} />
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
        {showGrid && <CartesianGrid horizontal={false} strokeDasharray="3 3" />}
        <XAxis type="number" {...AXIS} tickFormatter={compactNumber} />
        <YAxis type="category" dataKey="label" {...AXIS} width={92} tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatValue(spec.valueKey, v)} />} />
        {spec.signed && <ReferenceLine x={0} stroke="var(--ds-border-secondary)" strokeWidth={1} />}
        <Bar dataKey="value" radius={[0, 2, 2, 0]}>
          {points.map((point) => <Cell key={point.label} fill={point.fill} />)}
        </Bar>
      </BarChart>
    );
  }

  return (
    <BarChart data={points} margin={MARGIN}>
      {showGrid && <CartesianGrid vertical={false} strokeDasharray="3 3" />}
      <XAxis dataKey="label" {...AXIS} interval={0} tickFormatter={truncate} />
      <YAxis {...AXIS} width={40} tickFormatter={compactNumber} />
      <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatValue(spec.valueKey, v)} />} />
      {spec.signed && <ReferenceLine y={0} stroke="var(--ds-border-secondary)" strokeWidth={1} />}
      <Bar dataKey="value" radius={[2, 2, 0, 0]}>
        {points.map((point) => <Cell key={point.label} fill={point.fill} />)}
      </Bar>
    </BarChart>
  );
}
