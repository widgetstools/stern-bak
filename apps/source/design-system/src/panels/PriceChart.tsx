import { useMemo } from 'react';
import { Area, AreaChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@wellsfargo-starui/react/chart';
import type { TerminalState } from '../data/types';

const CONFIG = { mid: { label: 'Mid', color: 'var(--ds-chart-1)' } } satisfies ChartConfig;

export interface PriceChartProps {
  state: TerminalState;
  instrumentId: string;
}

export function PriceChart({ state, instrumentId }: PriceChartProps) {
  const inst = state.instruments.find((i) => i.id === instrumentId);
  const data = useMemo(
    () => (state.history[instrumentId] ?? []).map((mid, i) => ({ i, mid })),
    [state.history, instrumentId],
  );

  return (
    <div className="flex h-full flex-col" data-testid="price-chart">
      <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--ds-border-primary)] px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">Price</span>
        <span className="text-[12px] text-[color:var(--ds-text-primary)]">{inst?.ticker}</span>
      </div>
      <div className="min-h-0 flex-1 p-3">
        <ChartContainer config={CONFIG} className="h-full w-full">
          <AreaChart data={data} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
            <XAxis dataKey="i" hide />
            <YAxis domain={['dataMin - 0.3', 'dataMax + 0.3']} hide />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area dataKey="mid" type="monotone" stroke="var(--color-mid)" fill="var(--color-mid)" fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
}
