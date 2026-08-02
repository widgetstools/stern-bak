import type { WidgetProps } from '@widgetstools/react-dock-manager';
import { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@wellsfargo-starui/react/chart';
import { useDemoState } from '../../state/DemoStateProvider';

const RATING_COLORS: Record<string, string> = {
  aaa: 'var(--ds-chart-1)',
  aa:  'var(--ds-chart-2)',
  a:   'var(--ds-chart-3)',
  bbb: 'var(--ds-chart-4)',
  hy:  'var(--ds-chart-5)',
};

const RATING_LABELS: Record<string, string> = {
  aaa: 'AAA', aa: 'AA', a: 'A', bbb: 'BBB', hy: 'HY',
};

const CHART_CONFIG: ChartConfig = {
  aaa: { label: 'AAA', color: 'var(--ds-chart-1)' },
  aa:  { label: 'AA',  color: 'var(--ds-chart-2)' },
  a:   { label: 'A',   color: 'var(--ds-chart-3)' },
  bbb: { label: 'BBB', color: 'var(--ds-chart-4)' },
  hy:  { label: 'HY',  color: 'var(--ds-chart-5)' },
};

const CURRENT_YEAR = 2026;

function computeDuration(maturityStr: string): number {
  const matYear = parseInt(maturityStr.slice(0, 4), 10);
  return Math.max(0.5, matYear - CURRENT_YEAR);
}

function buildScatterData(
  instruments: ReturnType<typeof useDemoState>['store']['state']['instruments'],
  quotes: ReturnType<typeof useDemoState>['store']['state']['quotes'],
) {
  return instruments.map((inst) => {
    const q = quotes[inst.id];
    return {
      duration: computeDuration(inst.maturity),
      oas: q?.oas ?? inst.gSpd,
      dv01: q?.dv01 ?? 5,
      ratingClass: inst.ratingClass,
      ticker: inst.ticker,
    };
  });
}

function groupByRating(points: ReturnType<typeof buildScatterData>) {
  const groups: Record<string, typeof points> = {};
  for (const p of points) {
    const rc = p.ratingClass;
    if (!groups[rc]) groups[rc] = [];
    groups[rc].push(p);
  }
  return groups;
}

export function OasDurationScatter(_props: WidgetProps) {
  const { store } = useDemoState();
  const { instruments, quotes } = store.state;

  const grouped = useMemo(() => {
    const data = buildScatterData(instruments, quotes);
    return groupByRating(data);
  }, [instruments, quotes]);

  const ratingOrder = ['aaa', 'aa', 'a', 'bbb', 'hy'] as const;

  return (
    <div className="flex h-full flex-col" data-testid="panel-oasDuration">
      <div className="shrink-0 border-b border-[color:var(--ds-border-primary)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
        OAS vs Duration
      </div>
      <div className="min-h-0 flex-1 p-2">
        <ChartContainer config={CHART_CONFIG} className="h-full w-full">
          <ScatterChart margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-border-secondary)" />
            <XAxis dataKey="duration" name="Duration" unit="y" tickLine={false} axisLine={false} fontSize={10} />
            <YAxis dataKey="oas" name="OAS" unit="bp" tickLine={false} axisLine={false} fontSize={10} width={36} />
            <ZAxis dataKey="dv01" range={[40, 300]} name="DV01" />
            <ChartTooltip content={<ChartTooltipContent />} />
            {ratingOrder.map((rc) =>
              grouped[rc] ? (
                <Scatter
                  key={rc}
                  name={RATING_LABELS[rc]}
                  data={grouped[rc]}
                  fill={RATING_COLORS[rc]}
                  fillOpacity={0.8}
                />
              ) : null,
            )}
          </ScatterChart>
        </ChartContainer>
      </div>
      <div className="shrink-0 flex gap-3 px-3 pb-2 flex-wrap">
        {ratingOrder.map((rc) => (
          <div key={rc} className="flex items-center gap-1 text-[10px] text-[color:var(--ds-text-secondary)]">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: RATING_COLORS[rc] }} />
            {RATING_LABELS[rc]}
          </div>
        ))}
      </div>
    </div>
  );
}
