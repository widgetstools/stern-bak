import type { WidgetProps } from '@widgetstools/react-dock-manager';
import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Cell, LabelList } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@wellsfargo-starui/react/chart';
import { useDemoState } from '../../state/DemoStateProvider';

const CHART_CONFIG: ChartConfig = {
  oas: { label: 'OAS (bp)', color: 'var(--ds-chart-2)' },
};

const CHART_COLORS = [
  'var(--ds-chart-1)',
  'var(--ds-chart-2)',
  'var(--ds-chart-3)',
  'var(--ds-chart-4)',
  'var(--ds-chart-5)',
];

function rampColor(idx: number, total: number): string {
  const pos = total > 1 ? idx / (total - 1) : 0;
  const colorIdx = Math.round(pos * (CHART_COLORS.length - 1));
  return CHART_COLORS[colorIdx];
}

function buildDistributionData(
  instruments: ReturnType<typeof useDemoState>['store']['state']['instruments'],
  quotes: ReturnType<typeof useDemoState>['store']['state']['quotes'],
) {
  const issuerMap = new Map<string, number[]>();
  for (const inst of instruments) {
    const issuer = inst.ticker.split(' ')[0];
    const oasVal = quotes[inst.id]?.oas ?? inst.gSpd;
    const arr = issuerMap.get(issuer) ?? [];
    arr.push(oasVal);
    issuerMap.set(issuer, arr);
  }
  return Array.from(issuerMap.entries())
    .map(([issuer, vals]) => ({
      issuer,
      oas: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
    }))
    .sort((a, b) => b.oas - a.oas);
}

export function OasDistribution(_props: WidgetProps) {
  const { store } = useDemoState();
  const { instruments, quotes } = store.state;

  const data = useMemo(() => buildDistributionData(instruments, quotes), [instruments, quotes]);
  const total = data.length;

  return (
    <div className="flex h-full flex-col" data-testid="panel-oasDistribution">
      <div className="shrink-0 border-b border-[color:var(--ds-border-primary)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
        OAS Distribution by Issuer
      </div>
      <div className="min-h-0 flex-1 p-2">
        <ChartContainer config={CHART_CONFIG} className="h-full w-full">
          <BarChart
            layout="vertical"
            data={data}
            margin={{ left: 48, right: 36, top: 4, bottom: 4 }}
          >
            <XAxis type="number" tickLine={false} axisLine={false} fontSize={10} unit="bp" />
            <YAxis
              type="category"
              dataKey="issuer"
              tickLine={false}
              axisLine={false}
              fontSize={10}
              width={44}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="oas" radius={[0, 3, 3, 0]} maxBarSize={18} isAnimationActive={false}>
              <LabelList dataKey="oas" position="right" fontSize={9} fill="var(--ds-text-muted)" formatter={(v: unknown) => `${String(v)}bp`} />
              {data.map((_, idx) => (
                <Cell key={idx} fill={rampColor(idx, total)} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}
