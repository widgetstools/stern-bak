import type { WidgetProps } from '@widgetstools/react-dock-manager';
import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@wellsfargo-starui/ui/chart';
import { makeRng } from '../../data/seeds';

const CHART_CONFIG: ChartConfig = {
  ig: { label: 'IG OAS (bp)',  color: 'var(--ds-chart-1)' },
  hy: { label: 'HY OAS (bp)',  color: 'var(--ds-chart-4)' },
};

const SERIES_LENGTH = 60;

function buildHistoricalSeries(): { label: string; ig: number; hy: number }[] {
  const rng = makeRng(0xf1b0a5);
  let ig = 115; let hy = 380;
  const now = new Date(2026, 5, 22);
  return Array.from({ length: SERIES_LENGTH }, (_, i) => {
    ig = Math.max(40, Math.min(300, ig + (rng() - 0.5) * 6));
    hy = Math.max(150, Math.min(700, hy + (rng() - 0.5) * 18));
    const d = new Date(now);
    d.setDate(d.getDate() - (SERIES_LENGTH - 1 - i));
    const label = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    return { label, ig: Math.round(ig), hy: Math.round(hy) };
  });
}

const HISTORICAL_SERIES = buildHistoricalSeries();

export function HistoricalOas(_props: WidgetProps) {
  const data = useMemo(() => HISTORICAL_SERIES, []);
  const ticks = useMemo(() => {
    const step = Math.floor(SERIES_LENGTH / 5);
    return data.filter((_, i) => i % step === 0).map((d) => d.label);
  }, [data]);

  return (
    <div className="flex h-full flex-col" data-testid="panel-historicalOas">
      <div className="shrink-0 border-b border-[color:var(--ds-border-primary)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
        Historical OAS — IG vs HY (60d)
      </div>
      <div className="min-h-0 flex-1 p-2">
        <ChartContainer config={CHART_CONFIG} className="h-full w-full">
          <AreaChart data={data} margin={{ left: 4, right: 36, top: 8, bottom: 4 }}>
            <defs>
              <linearGradient id="gradIg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--ds-chart-1)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--ds-chart-1)" stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id="gradHy" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--ds-chart-4)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--ds-chart-4)" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--ds-border-secondary)" />
            <XAxis dataKey="label" ticks={ticks} tickLine={false} axisLine={false} fontSize={10} />
            <YAxis yAxisId="ig" tickLine={false} axisLine={false} fontSize={10} width={28} unit="bp" />
            <YAxis yAxisId="hy" orientation="right" tickLine={false} axisLine={false} fontSize={10} width={36} unit="bp" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              yAxisId="ig"
              dataKey="ig"
              stroke="var(--ds-chart-1)"
              fill="url(#gradIg)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Area
              yAxisId="hy"
              dataKey="hy"
              stroke="var(--ds-chart-4)"
              fill="url(#gradHy)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      </div>
      <div className="shrink-0 flex gap-4 px-3 pb-1.5">
        {(['ig', 'hy'] as const).map((k) => (
          <div key={k} className="flex items-center gap-1 text-[10px] text-[color:var(--ds-text-secondary)]">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: k === 'ig' ? 'var(--ds-chart-1)' : 'var(--ds-chart-4)' }} />
            {CHART_CONFIG[k].label as string}
          </div>
        ))}
      </div>
    </div>
  );
}
