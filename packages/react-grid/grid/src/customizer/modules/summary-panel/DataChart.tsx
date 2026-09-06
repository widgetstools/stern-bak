/**
 * Renders whichever chart `buildChartSpec` chose.
 *
 * Colour is reserved for the data marks. The axes, grid and labels stay
 * monochrome so the cell still reads as part of a monochrome panel — the marks
 * are the only thing that needs to be distinguishable, and colouring the chrome
 * as well would make the chart shout over the transcript around it.
 *
 * Every kind here is TRUSTED code selected by name. The model picks
 * `spec.kind`; it never supplies drawing instructions. That is what keeps a
 * "draw me something custom" request from becoming an eval — see the
 * expression engine's same posture in `valueFormatterFromTemplate.ts`.
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
  ComposedChart,
  Funnel,
  FunnelChart,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  Sankey,
  Scatter,
  ScatterChart,
  Tooltip,
  Treemap,
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
  SERIES_COLOR_ALT,
  chartColor,
  fillForStyle,
  isMultiSeries,
  formatValue,
  formatCompact,
  labelContrastClass,
  type ChartPoint,
  type ChartSpec,
  type ChartStyle,
} from '@wellsfargo-starui/data';

/** Named so recharts' `var(--color-<key>)` indirection resolves to the ramp. */
/**
 * Legend labels, built from the spec rather than fixed.
 *
 * `ChartLegendContent` resolves a label as `config[dataKey].label`, and the
 * config used to be a module constant mapping `value → "Value"` and
 * `y → "Y"` — so a combo of `pnl` bars against a `dailyPnl` line drew a legend
 * reading "Value" and "Y", naming neither measure. Worse for a multi-series
 * chart, whose dataKeys are the series keys: absent from the constant
 * entirely, they resolved to `undefined` and the legend rendered a swatch with
 * no text beside it.
 *
 * The raw colId is used as-is, matching the caption underneath, because it is
 * the name the user's own data uses.
 */
export function chartConfigFor(spec: ChartSpec): ChartConfig {
  const config: ChartConfig = {
    value: { label: spec.valueKey || 'Value', color: CHART_COLORS[0] },
    y: { label: spec.yKey || 'Y', color: CHART_COLORS[1] },
  };
  (spec.series ?? []).forEach((s, i) => {
    config[s.key] = { label: s.label, color: chartColor(i) };
  });
  return config;
}

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
  // Ticks inherit the chart's muted colour; at 10px on a dark ground they
  // need the full token rather than a faded one to stay readable.
  tick: { fontSize: 'var(--ds-font-size-2xs, 11px)', fill: 'var(--ds-text-secondary)' },
} as const;
const MARGIN = { top: 4, right: 8, bottom: 4, left: 8 } as const;

/**
 * Category-axis ticks that thin themselves instead of overprinting.
 *
 * `interval={0}` forces every label to render whatever the width, so eight
 * desks — or six traders — in a narrow panel drew on top of each other into an
 * illegible smear. That is worse than showing fewer labels, because none of
 * them could be read at all. `preserveStartEnd` plus a minimum gap lets
 * recharts drop what will not fit: the first and last always survive, and the
 * tooltip still names every point exactly on hover.
 *
 * Shared rather than repeated, because it drifted apart once already — the
 * plain bar chart was fixed while the combo and horizontal-bar charts kept
 * overprinting.
 */
const CATEGORY_TICKS = { interval: 'preserveStartEnd' as const, minTickGap: 8 };

/**
 * Value-axis props for the scale the spec asked for.
 *
 * Two things force an explicit domain. A log axis cannot include zero, and
 * recharts defaults a numeric YAxis to `[0, dataMax]` — so `scale="log"` alone
 * renders an empty plot. And a zoomed baseline IS a domain change: anchored at
 * zero, eight bond prices between 98 and 103 are eight identical bars, which
 * is the whole reason this exists.
 *
 * `buildChartSpec` has already refused a log scale that the data cannot carry,
 * so by here `scale === 'log'` means every plotted value is positive.
 */
function valueAxisProps(spec: ChartSpec) {
  if (spec.scale === 'log') {
    return { scale: 'log' as const, domain: ['auto', 'auto'] as [string, string], allowDataOverflow: true };
  }
  if (spec.baseline === 'auto') {
    return { domain: ['auto', 'auto'] as [string, string] };
  }
  return {};
}

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
  if (kind === 'sankey') return Math.max(220, pointCount * 18 + 60);
  if (kind === 'funnel') return Math.max(200, pointCount * 34 + 40);
  if (kind === 'pie' || kind === 'treemap' || kind === 'radar') return 200;
  // Multi-series always carries a legend, and a legend eats into the plot.
  if (isMultiSeries(kind)) return 210;
  return 170;
}

/**
 * The style's palette override, applied per point.
 *
 * `spec.fill` is what the data alone implies; this is the user's "colour these
 * by sign" on top of it. Recomputed at render rather than baked into the spec
 * so restyling never means re-running the query.
 */
function fillsFor(spec: ChartSpec, style: ChartStyle | undefined): string[] {
  if (!style?.palette || style.palette === 'auto') return spec.points.map((p) => p.fill);
  return spec.points.map((p, i) => fillForStyle(spec.kind, p.value, i, spec.signed, style.palette));
}

export function DataChart({ spec, style }: { spec: ChartSpec; style?: ChartStyle }) {
  const { kind, points } = spec;

  return (
    <ChartContainer
      config={chartConfigFor(spec)}
      // Label contrast overrides the container's own `fill-muted-foreground`
      // on tick text, so it has to be applied here rather than on the axes.
      className={`w-full h-full ${labelContrastClass(style?.labelContrast)}`}
      style={{ minHeight: minHeightFor(kind, points.length) }}
    >
      {renderChart(spec, style)}
    </ChartContainer>
  );
}

/**
 * One candle: a thin wick from low to high, and a body from open to close.
 *
 * Recharts hands a shape the pixel box it laid out for the bar and the datum
 * behind it. The bar's own `value` spans low..high (see `candlestickChart`),
 * so the box IS the wick's extent — the body is interpolated inside it. Plain
 * SVG: no d3, nothing evaluated.
 */
function Candle(props: Record<string, unknown>) {
  const x = props.x as number;
  const y = props.y as number;
  const width = props.width as number;
  const height = props.height as number;
  const point = props.payload as ChartPoint | undefined;
  const fill = (props.fill as string) ?? CHART_COLORS[0];
  if (!point || height <= 0) return null;

  const { open = 0, high = 0, low = 0, close = 0 } = point;
  const span = high - low;
  // A period that never moved has no body to draw — show the wick alone
  // rather than dividing by zero.
  const yFor = (v: number) => (span === 0 ? y + height / 2 : y + ((high - v) / span) * height);

  const bodyTop = yFor(Math.max(open, close));
  const bodyBottom = yFor(Math.min(open, close));
  const bodyWidth = Math.max(2, width * 0.6);
  const bodyX = x + (width - bodyWidth) / 2;

  return (
    <g>
      <line x1={x + width / 2} x2={x + width / 2} y1={y} y2={y + height} stroke={fill} strokeWidth={1} />
      <rect
        x={bodyX}
        y={bodyTop}
        width={bodyWidth}
        // A doji (open === close) would otherwise be an invisible 0px rect.
        height={Math.max(1, bodyBottom - bodyTop)}
        fill={fill}
      />
    </g>
  );
}

function renderChart(spec: ChartSpec, style?: ChartStyle) {
  const { kind, points } = spec;
  const showGrid = style?.showGrid !== false;
  const showLegend = style?.showLegend !== false;
  const fills = fillsFor(spec, style);
  const money = (v: unknown) => formatValue(spec.valueKey, v);

  if (isMultiSeries(kind) && spec.series?.length) {
    // Recharts wants one flat key per series; the spec keeps them nested under
    // `values` so `ChartPoint.value` can stay the stack total for every
    // generic reader. Flattening here keeps that contract intact.
    const data = points.map((p) => ({ label: p.label, ...(p.values ?? {}) }));
    const series = spec.series;
    // The palette override applies per SERIES here, not per point — colour
    // identifies which measure a mark belongs to.
    const tint = (i: number) =>
      style?.palette && style.palette !== 'auto' ? chartColor(i) : series[i].fill;
    // A stack of anonymous colours says nothing, so the legend is not optional
    // the way it is for a single-series chart.
    const legend = <ChartLegend content={<ChartLegendContent />} />;
    const value = (v: unknown, name: unknown) =>
      spec.normalize ? `${Number(v).toFixed(1)}%` : formatValue(String(name ?? spec.valueKey), v);
    const yTick = spec.normalize ? (v: number) => `${v}%` : compactNumber;

    if (kind === 'multiLine' || kind === 'stackedArea') {
      const Chart = kind === 'multiLine' ? LineChart : AreaChart;
      return (
        <Chart data={data} margin={MARGIN}>
          {showGrid && <CartesianGrid vertical={false} strokeDasharray="3 3" />}
          <XAxis dataKey="label" {...AXIS} {...CATEGORY_TICKS} tickFormatter={truncate} />
          <YAxis {...AXIS} {...valueAxisProps(spec)} width={44} tickFormatter={yTick} />
          <ChartTooltip content={<ChartTooltipContent formatter={value} />} />
          {spec.signed && <ReferenceLine y={0} stroke="var(--ds-border-secondary)" strokeWidth={1} />}
          {series.map((s, i) =>
            kind === 'multiLine' ? (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={tint(i)} strokeWidth={2} dot={false} />
            ) : (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stackId="series"
                stroke={tint(i)}
                fill={tint(i)}
                fillOpacity={0.55}
              />
            ),
          )}
          {legend}
        </Chart>
      );
    }

    return (
      <BarChart data={data} margin={MARGIN}>
        {showGrid && <CartesianGrid vertical={false} strokeDasharray="3 3" />}
        <XAxis dataKey="label" {...AXIS} {...CATEGORY_TICKS} tickFormatter={truncate} />
        <YAxis {...AXIS} {...valueAxisProps(spec)} width={44} tickFormatter={yTick} />
        <ChartTooltip content={<ChartTooltipContent formatter={value} />} />
        {spec.signed && <ReferenceLine y={0} stroke="var(--ds-border-secondary)" strokeWidth={1} />}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            // Grouped bars sit side by side; a shared stackId is the only
            // difference between the two kinds.
            stackId={kind === 'stackedBar' ? 'series' : undefined}
            fill={tint(i)}
            radius={kind === 'groupedBar' ? [2, 2, 0, 0] : undefined}
          />
        ))}
        {legend}
      </BarChart>
    );
  }

  if (kind === 'pie') {
    return (
      // Slices are identified by legend, not by position — without it a donut
      // is five anonymous colours.
      <PieChart margin={MARGIN}>
        <ChartTooltip content={<ChartTooltipContent nameKey="label" formatter={money} />} />
        <Pie data={points} dataKey="value" nameKey="label" innerRadius="42%" outerRadius="72%" paddingAngle={1}>
          {points.map((point, i) => (
            <Cell key={point.label} fill={fills[i]} stroke="var(--background)" strokeWidth={1} />
          ))}
        </Pie>
        {showLegend && <ChartLegend content={<ChartLegendContent nameKey="label" />} />}
      </PieChart>
    );
  }

  if (kind === 'treemap') {
    return (
      // Area is the whole encoding, so the tiles carry their own labels —
      // a legend would make the reader look away from the rectangle to
      // find out what it is.
      <Treemap
        data={points.map((p, i) => ({ ...p, name: p.label, fill: fills[i] }))}
        dataKey="value"
        nameKey="label"
        stroke="var(--background)"
        isAnimationActive={false}
      >
        <Tooltip content={<ChartTooltipContent nameKey="label" formatter={money} />} />
      </Treemap>
    );
  }

  if (kind === 'funnel') {
    return (
      <FunnelChart margin={MARGIN}>
        <ChartTooltip content={<ChartTooltipContent nameKey="label" formatter={money} />} />
        <Funnel dataKey="value" nameKey="label" data={points} isAnimationActive={false}>
          {points.map((point, i) => (
            <Cell key={point.label} fill={fills[i]} stroke="var(--background)" />
          ))}
          <LabelList
            position="right"
            dataKey="label"
            className="fill-foreground"
            style={{ fontSize: 'var(--ds-font-size-2xs, 10px)' }}
          />
        </Funnel>
      </FunnelChart>
    );
  }

  if (kind === 'radar') {
    return (
      <RadarChart data={points} margin={MARGIN}>
        {showGrid && <PolarGrid />}
        <PolarAngleAxis dataKey="label" tick={AXIS.tick} />
        <PolarRadiusAxis tick={AXIS.tick} tickFormatter={compactNumber} />
        <ChartTooltip content={<ChartTooltipContent nameKey="label" formatter={money} />} />
        <Radar dataKey="value" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.22} />
      </RadarChart>
    );
  }

  if (kind === 'sankey') {
    return (
      // Recharts' Sankey takes the graph whole rather than as children, and
      // wants a single element — the tooltip is its only child.
      <Sankey
        data={{ nodes: spec.nodes ?? [], links: spec.links ?? [] }}
        nodePadding={18}
        margin={{ top: 8, right: 96, bottom: 8, left: 8 }}
        link={{ stroke: 'var(--ds-chart-1)', strokeOpacity: 0.22 }}
        node={{ fill: 'var(--ds-chart-1)' }}
      >
        <Tooltip content={<ChartTooltipContent nameKey="name" formatter={money} />} />
      </Sankey>
    );
  }

  if (kind === 'waterfall') {
    return (
      // Two stacked bars: an invisible floor that lifts each step to where the
      // running total had got to, and the step itself drawn on top of it.
      <BarChart data={points} margin={MARGIN}>
        {showGrid && <CartesianGrid vertical={false} strokeDasharray="3 3" />}
        <XAxis dataKey="label" {...AXIS} {...CATEGORY_TICKS} tickFormatter={truncate} />
        <YAxis {...AXIS} {...valueAxisProps(spec)} width={40} tickFormatter={compactNumber} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              nameKey="label"
              // `span` is the drawn magnitude; the signed delta is what the
              // reader actually wants to see.
              formatter={(_v, _n, item) => money((item?.payload as ChartPoint | undefined)?.value)}
            />
          }
        />
        <ReferenceLine y={0} stroke="var(--ds-border-secondary)" strokeWidth={1} />
        <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="span" stackId="waterfall" radius={[2, 2, 0, 0]}>
          {points.map((point, i) => (
            <Cell key={`${point.label}-${i}`} fill={fills[i]} />
          ))}
        </Bar>
      </BarChart>
    );
  }

  if (kind === 'combo') {
    return (
      // The second measure gets its own axis on the right. Sharing one axis is
      // what makes a combo chart useless: a rate in single digits against a
      // notional in millions draws as a flat line along the floor.
      <ComposedChart data={points} margin={MARGIN}>
        {showGrid && <CartesianGrid vertical={false} strokeDasharray="3 3" />}
        <XAxis dataKey="label" {...AXIS} {...CATEGORY_TICKS} tickFormatter={truncate} />
        <YAxis yAxisId="left" {...AXIS} width={40} tickFormatter={compactNumber} />
        <YAxis yAxisId="right" orientation="right" {...AXIS} width={40} tickFormatter={compactNumber} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(v, name) => formatValue(name === 'y' ? (spec.yKey ?? '') : spec.valueKey, v)}
            />
          }
        />
        {spec.signed && <ReferenceLine yAxisId="left" y={0} stroke="var(--ds-border-secondary)" strokeWidth={1} />}
        <Bar yAxisId="left" dataKey="value" radius={[2, 2, 0, 0]} name={spec.valueKey}>
          {points.map((point, i) => (
            <Cell key={`${point.label}-${i}`} fill={fills[i]} />
          ))}
        </Bar>
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="y"
          name={spec.yKey}
          stroke={SERIES_COLOR_ALT}
          strokeWidth={2}
          dot={false}
        />
        {showLegend && <ChartLegend content={<ChartLegendContent />} />}
      </ComposedChart>
    );
  }

  if (kind === 'candlestick') {
    return (
      // The bar spans low..high so recharts lays out the wick's box for us;
      // `Candle` draws the body inside it. `low` is the floor rather than
      // zero, because a price series that never approaches zero would
      // otherwise be a row of full-height candles with no visible variation.
      <BarChart
        data={points.map((p) => ({ ...p, wick: [p.low ?? 0, p.high ?? 0] }))}
        margin={MARGIN}
      >
        {showGrid && <CartesianGrid vertical={false} strokeDasharray="3 3" />}
        <XAxis dataKey="label" {...AXIS} {...CATEGORY_TICKS} tickFormatter={truncate} />
        <YAxis {...AXIS} width={44} {...{ domain: ['dataMin', 'dataMax'] as [string, string], ...valueAxisProps(spec) }} tickFormatter={compactNumber} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              nameKey="label"
              formatter={(_v, _n, item) => {
                const p = item?.payload as ChartPoint | undefined;
                if (!p) return '';
                const f = (v: number | undefined) => formatValue(spec.valueKey, v);
                return `O ${f(p.open)} · H ${f(p.high)} · L ${f(p.low)} · C ${f(p.close)}`;
              }}
            />
          }
        />
        <Bar dataKey="wick" shape={<Candle />} isAnimationActive={false}>
          {points.map((point, i) => (
            <Cell key={`${point.label}-${i}`} fill={fills[i]} />
          ))}
        </Bar>
      </BarChart>
    );
  }

  if (kind === 'line' || kind === 'area') {
    const Chart = kind === 'line' ? LineChart : AreaChart;
    return (
      <Chart data={points} margin={MARGIN}>
        {showGrid && <CartesianGrid vertical={false} strokeDasharray="3 3" />}
        <XAxis dataKey="label" {...AXIS} {...CATEGORY_TICKS} tickFormatter={truncate} />
        <YAxis {...AXIS} {...valueAxisProps(spec)} width={40} tickFormatter={compactNumber} />
        <ChartTooltip content={<ChartTooltipContent formatter={money} />} />
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
        <YAxis type="number" dataKey="y" name={spec.yKey} {...AXIS} {...valueAxisProps(spec)} width={40} tickFormatter={compactNumber} />
        <ZAxis range={[24, 24]} />
        <ChartTooltip content={<ChartTooltipContent nameKey="label" formatter={money} />} />
        <Scatter data={points}>
          {points.map((point, i) => (
            <Cell key={`${point.label}-${i}`} fill={fills[i]} fillOpacity={0.75} />
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
        <ChartTooltip content={<ChartTooltipContent formatter={money} />} />
        {spec.signed && <ReferenceLine x={0} stroke="var(--ds-border-secondary)" strokeWidth={1} />}
        <Bar dataKey="value" radius={[0, 2, 2, 0]}>
          {points.map((point, i) => <Cell key={point.label} fill={fills[i]} />)}
        </Bar>
      </BarChart>
    );
  }

  return (
    <BarChart data={points} margin={MARGIN}>
      {showGrid && <CartesianGrid vertical={false} strokeDasharray="3 3" />}
      <XAxis dataKey="label" {...AXIS} {...CATEGORY_TICKS} tickFormatter={truncate} />
      <YAxis {...AXIS} {...valueAxisProps(spec)} width={40} tickFormatter={compactNumber} />
      <ChartTooltip content={<ChartTooltipContent formatter={money} />} />
      {spec.signed && <ReferenceLine y={0} stroke="var(--ds-border-secondary)" strokeWidth={1} />}
      <Bar dataKey="value" radius={[2, 2, 0, 0]}>
        {points.map((point, i) => <Cell key={point.label} fill={fills[i]} />)}
      </Bar>
    </BarChart>
  );
}
