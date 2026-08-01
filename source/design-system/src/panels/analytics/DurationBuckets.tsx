import type { WidgetProps } from '@widgetstools/react-dock-manager';
import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@wellsfargo-starui/react/chart';
import { useDemoState } from '../../state/DemoStateProvider';

const CHART_CONFIG: ChartConfig = {
  count: { label: 'Bonds',    color: 'var(--ds-chart-1)' },
  dv01:  { label: 'DV01 $k', color: 'var(--ds-chart-3)' },
};

const BUCKETS = [
  { label: '0-1Y',  min: 0,  max: 1  },
  { label: '1-3Y',  min: 1,  max: 3  },
  { label: '3-5Y',  min: 3,  max: 5  },
  { label: '5-7Y',  min: 5,  max: 7  },
  { label: '7-10Y', min: 7,  max: 10 },
  { label: '10Y+',  min: 10, max: Infinity },
];

const CURRENT_YEAR = 2026;

function yearsToMaturity(maturityStr: string): number {
  const matYear = parseInt(maturityStr.slice(0, 4), 10);
  const matMonth = parseInt(maturityStr.slice(5, 7), 10);
  return matYear - CURRENT_YEAR + (matMonth - 6) / 12;
}

function buildBucketData(
  instruments: ReturnType<typeof useDemoState>['store']['state']['instruments'],
  quotes: ReturnType<typeof useDemoState>['store']['state']['quotes'],
) {
  const buckets = BUCKETS.map((b) => ({ label: b.label, count: 0, dv01: 0, oasSum: 0, oasQty: 0, yearsDv01Sum: 0 }));
  for (const inst of instruments) {
    const yrs = yearsToMaturity(inst.maturity);
    const idx = BUCKETS.findIndex((b) => yrs >= b.min && yrs < b.max);
    if (idx < 0) continue;
    const q = quotes[inst.id];
    const dv01 = q?.dv01 ?? 5;
    const oas = q?.oas ?? inst.gSpd;
    buckets[idx].count += 1;
    buckets[idx].dv01 += dv01;
    buckets[idx].oasSum += oas;
    buckets[idx].oasQty += 1;
    buckets[idx].yearsDv01Sum += yrs * dv01;
  }
  return buckets.map((b) => ({
    label: b.label,
    count: b.count,
    dv01: Math.round(b.dv01 * 10) / 10,
    avgOas: b.oasQty > 0 ? Math.round(b.oasSum / b.oasQty) : 0,
    avgDur: b.dv01 > 0 ? Math.round((b.yearsDv01Sum / b.dv01) * 10) / 10 : 0,
  }));
}

function buildFooter(
  instruments: ReturnType<typeof useDemoState>['store']['state']['instruments'],
  quotes: ReturnType<typeof useDemoState>['store']['state']['quotes'],
) {
  let totalDv01 = 0, oasWtSum = 0, durationWtSum = 0, bonds = 0;
  for (const inst of instruments) {
    const q = quotes[inst.id];
    const dv01 = q?.dv01 ?? 5;
    const oas = q?.oas ?? inst.gSpd;
    const dur = yearsToMaturity(inst.maturity);
    totalDv01 += dv01;
    oasWtSum += oas * dv01;
    durationWtSum += dur * dv01;
    bonds += 1;
  }
  return {
    totalDv01: Math.round(totalDv01 * 10) / 10,
    avgDur: totalDv01 > 0 ? Math.round((durationWtSum / totalDv01) * 10) / 10 : 0,
    bonds,
    wtAvgOas: totalDv01 > 0 ? Math.round(oasWtSum / totalDv01) : 0,
  };
}

export function DurationBuckets(_props: WidgetProps) {
  const { store } = useDemoState();
  const { instruments, quotes } = store.state;

  const data = useMemo(() => buildBucketData(instruments, quotes), [instruments, quotes]);
  const footer = useMemo(() => buildFooter(instruments, quotes), [instruments, quotes]);

  return (
    <div className="flex h-full flex-col" data-testid="panel-durationBuckets">
      <div className="shrink-0 border-b border-[color:var(--ds-border-primary)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
        Duration Bucket Distribution
      </div>
      <div className="min-h-0 flex-1 p-2">
        <ChartContainer config={CHART_CONFIG} className="h-full w-full">
          <BarChart data={data} margin={{ left: 4, right: 28, top: 8, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--ds-border-secondary)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} />
            <YAxis yAxisId="left"  tickLine={false} axisLine={false} fontSize={10} width={28} />
            <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} fontSize={10} width={32} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar yAxisId="left"  dataKey="count" fill="var(--ds-chart-1)" radius={[3, 3, 0, 0]} maxBarSize={32} isAnimationActive={false} />
            <Bar yAxisId="right" dataKey="dv01"  fill="var(--ds-chart-3)" radius={[3, 3, 0, 0]} maxBarSize={32} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
      </div>
      <div className="shrink-0 border-t border-[color:var(--ds-border-primary)] px-3 py-1.5 flex gap-4 text-[10px] text-[color:var(--ds-text-muted)]">
        <span>Total DV01: <strong className="text-[color:var(--ds-text-secondary)]">${footer.totalDv01}k</strong></span>
        <span>Avg Dur: <strong className="text-[color:var(--ds-text-secondary)]">{footer.avgDur}y</strong></span>
        <span>Bonds: <strong className="text-[color:var(--ds-text-secondary)]">{footer.bonds}</strong></span>
        <span>Wt-Avg OAS: <strong className="text-[color:var(--ds-text-secondary)]">{footer.wtAvgOas}bp</strong></span>
      </div>
    </div>
  );
}
