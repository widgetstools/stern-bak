import type { WidgetProps } from '@widgetstools/react-dock-manager';
import { useMemo } from 'react';
import { PieChart, Pie, Cell } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@wellsfargo-starui/ui/chart';
import { useDemoState } from '../../state/DemoStateProvider';

const SECTOR_CHART_COLORS = [
  'var(--ds-chart-1)',
  'var(--ds-chart-2)',
  'var(--ds-chart-3)',
  'var(--ds-chart-4)',
  'var(--ds-chart-5)',
  'var(--ds-accent-info)',
];

function buildSectorData(
  instruments: ReturnType<typeof useDemoState>['store']['state']['instruments'],
  positions: ReturnType<typeof useDemoState>['store']['state']['positions'],
) {
  const mvBySector = new Map<string, number>();
  for (const pos of positions) {
    const inst = instruments.find((i) => i.id === pos.instrumentId);
    const sector = inst?.sector ?? 'Other';
    mvBySector.set(sector, (mvBySector.get(sector) ?? 0) + Math.abs(pos.marketValue));
  }
  if (mvBySector.size === 0) {
    for (const inst of instruments) {
      mvBySector.set(inst.sector, (mvBySector.get(inst.sector) ?? 0) + 1);
    }
  }
  return [...mvBySector.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }));
}

function buildChartConfig(sectors: { name: string }[]): ChartConfig {
  const config: ChartConfig = {};
  sectors.forEach((s, i) => {
    config[s.name] = { label: s.name, color: SECTOR_CHART_COLORS[i % SECTOR_CHART_COLORS.length] };
  });
  return config;
}

export function SectorDonut(_props: WidgetProps) {
  const { store } = useDemoState();
  const { instruments, positions } = store.state;

  const sectors = useMemo(() => buildSectorData(instruments, positions), [instruments, positions]);
  const config = useMemo(() => buildChartConfig(sectors), [sectors]);
  const total = useMemo(() => sectors.reduce((s, d) => s + d.value, 0), [sectors]);

  return (
    <div className="flex h-full flex-col" data-testid="panel-sectorDonut">
      <div className="shrink-0 border-b border-[color:var(--ds-border-primary)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
        Sector Allocation
      </div>
      <div className="min-h-0 flex-1 flex flex-col items-center p-2">
        <ChartContainer config={config} className="h-full w-full max-h-[200px]">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent />} />
            <Pie
              data={sectors}
              dataKey="value"
              nameKey="name"
              innerRadius="55%"
              outerRadius="80%"
              strokeWidth={2}
              stroke="var(--ds-surface-primary)"
              isAnimationActive={false}
            >
              {sectors.map((entry, idx) => (
                <Cell
                  key={entry.name}
                  fill={SECTOR_CHART_COLORS[idx % SECTOR_CHART_COLORS.length]}
                />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="shrink-0 flex flex-wrap justify-center gap-x-3 gap-y-1 px-3 pb-1">
          {sectors.map((s, idx) => {
            const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
            return (
              <div key={s.name} className="flex items-center gap-1 text-[10px] text-[color:var(--ds-text-secondary)]">
                <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: SECTOR_CHART_COLORS[idx % SECTOR_CHART_COLORS.length] }} />
                {s.name} {pct}%
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
