import type { WidgetProps } from '@widgetstools/react-dock-manager';
import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Cell, ReferenceLine } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@wellsfargo-starui/ui/chart';
import { useDemoState } from '../../state/DemoStateProvider';

const CHART_CONFIG: ChartConfig = {
  base:  { label: 'base',   color: 'transparent' },
  delta: { label: 'P&L ($k)', color: 'var(--ds-chart-1)' },
};

interface WaterfallRow {
  name: string;
  base: number;
  delta: number;
  fill: string;
  isTotal: boolean;
  signedTotal?: number;
}

function buildWaterfallData(
  positions: ReturnType<typeof useDemoState>['store']['state']['positions'],
): WaterfallRow[] {
  const totalPnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
  const totalK   = Math.round(totalPnl / 1000);

  const steps: Array<{ label: string; delta: number }> = [
    { label: 'Carry',  delta: Math.round(totalK *  0.42) },
    { label: 'Spread', delta: Math.round(totalK *  0.31) },
    { label: 'Rates',  delta: Math.round(totalK * -0.18) },
    { label: 'FX',     delta: Math.round(totalK * -0.08) },
    { label: 'Costs',  delta: Math.round(totalK * -0.05) },
  ];

  const rows: WaterfallRow[] = [];
  let running = 0;

  for (const step of steps) {
    const base = step.delta >= 0 ? running : running + step.delta;
    rows.push({
      name: step.label,
      base,
      delta: Math.abs(step.delta),
      fill: step.delta >= 0 ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)',
      isTotal: false,
    });
    running += step.delta;
  }

  const totalSum = steps.reduce((s, s2) => s + s2.delta, 0);
  rows.push({
    name: 'Total',
    base: 0,
    delta: Math.abs(totalSum),
    fill: 'var(--ds-chart-1)',
    isTotal: true,
    signedTotal: totalSum,
  });

  return rows;
}

export function PnlAttribution(_props: WidgetProps) {
  const { store } = useDemoState();
  const { positions } = store.state;

  const data = useMemo(() => buildWaterfallData(positions), [positions]);
  const totalRow = data.find((d) => d.isTotal);
  const netPnl   = totalRow?.signedTotal ?? 0;
  const fmtK = (n: number) => `${n >= 0 ? '+' : ''}$${n.toLocaleString('en-US')}k`;

  return (
    <div className="flex h-full flex-col" data-testid="panel-pnlAttribution">
      <div className="shrink-0 border-b border-[color:var(--ds-border-primary)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
        P&amp;L Attribution MTD
      </div>
      <div className="min-h-0 flex-1 p-2">
        <ChartContainer config={CHART_CONFIG} className="h-full w-full">
          <BarChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
            <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={10} />
            <YAxis tickLine={false} axisLine={false} fontSize={10} width={38} unit="k" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ReferenceLine y={0} stroke="var(--ds-border-primary)" strokeWidth={1} />
            <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="delta" stackId="w" maxBarSize={40} radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {data.map((row, idx) => (
                <Cell key={idx} fill={row.fill} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
      <div className="shrink-0 border-t border-[color:var(--ds-border-primary)] px-3 py-1.5 flex items-center gap-2 text-[11px]">
        <span className="text-[color:var(--ds-text-muted)]">Net P&amp;L MTD:</span>
        <span
          className="font-[family-name:var(--ds-font-mono)] font-semibold"
          style={{ color: netPnl >= 0 ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)' }}
        >
          {fmtK(netPnl)}
        </span>
      </div>
    </div>
  );
}
