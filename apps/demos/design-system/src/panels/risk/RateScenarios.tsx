import type { WidgetProps } from '@widgetstools/react-dock-manager';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, Cell } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@wellsfargo-starui/ui/chart';
import { RATE_SCENARIOS } from '../../data/seeds';

// ── chart config at module scope ──────────────────────────────────────────────

const CHART_CONFIG: ChartConfig = {
  pnl: { label: 'P&L ($)', color: 'var(--ds-accent-positive)' },
};

// ── component ─────────────────────────────────────────────────────────────────

function pnlFill(pnl: number): string {
  return pnl >= 0 ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)';
}

export function RateScenarios(_props: WidgetProps) {
  return (
    <div className="flex h-full flex-col" data-testid="panel-rateScenarios">
      <div className="shrink-0 border-b border-[color:var(--ds-border-primary)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
        Rate Scenarios (P&amp;L)
      </div>
      <div className="min-h-0 flex-1 p-2">
        <ChartContainer config={CHART_CONFIG} className="h-full w-full">
          <BarChart data={RATE_SCENARIOS} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--ds-border-secondary)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={9} />
            <YAxis tickLine={false} axisLine={false} fontSize={10} width={50} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ReferenceLine y={0} stroke="var(--ds-border-primary)" strokeWidth={1} />
            <Bar dataKey="pnl" maxBarSize={32} radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {RATE_SCENARIOS.map((row, idx) => (
                <Cell key={idx} fill={pnlFill(row.pnl)} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}
