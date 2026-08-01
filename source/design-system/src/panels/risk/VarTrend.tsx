import type { WidgetProps } from '@widgetstools/react-dock-manager';
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@wellsfargo-starui/ui/chart';
import { makeRng } from '../../data/seeds';
import { fmtMoney } from '../../data/formatters';

// ── deterministic VaR series at module scope ──────────────────────────────────

interface VarPoint {
  day: string;
  var: number;
}

function buildVarSeries(): VarPoint[] {
  const rng = makeRng(0xdeadbeef);
  const points: VarPoint[] = [];
  let current = -180_000;
  for (let i = 0; i < 30; i++) {
    current += (rng() - 0.5) * 40_000;
    // Clamp to realistic -120k..-300k range
    current = Math.max(-300_000, Math.min(-120_000, current));
    points.push({ day: `D${i + 1}`, var: Math.round(current) });
  }
  return points;
}

const VAR_SERIES = buildVarSeries();

export function latestVarFromSeries(series: readonly VarPoint[]): number {
  return series[series.length - 1]?.var ?? 0;
}

const latestVar = latestVarFromSeries(VAR_SERIES);

// ── chart config at module scope ──────────────────────────────────────────────

const CHART_CONFIG: ChartConfig = {
  var: { label: 'VaR 95% 1D ($)', color: 'var(--ds-accent-warning)' },
};

// ── component ─────────────────────────────────────────────────────────────────

export function VarTrend(_props: WidgetProps) {
  return (
    <div className="flex h-full flex-col" data-testid="panel-varTrend">
      <div className="shrink-0 border-b border-[color:var(--ds-border-primary)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
        VaR 95% 1D — 30D Trend
      </div>
      <div className="min-h-0 flex-1 p-2">
        <ChartContainer config={CHART_CONFIG} className="h-full w-full">
          <LineChart data={VAR_SERIES} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-border-secondary)" />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              fontSize={9}
              interval={4}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={10}
              width={60}
              tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              type="monotone"
              dataKey="var"
              stroke="var(--ds-accent-warning)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      </div>
      <div className="shrink-0 border-t border-[color:var(--ds-border-primary)] px-3 py-1.5 flex items-center gap-2 text-[11px]">
        <span className="text-[color:var(--ds-text-muted)]">Current VaR:</span>
        <span
          className="font-[family-name:var(--ds-font-mono)] font-semibold"
          style={{ color: 'var(--ds-accent-warning)' }}
        >
          {fmtMoney(latestVar)}
        </span>
      </div>
    </div>
  );
}
