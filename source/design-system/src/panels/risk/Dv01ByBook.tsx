import type { WidgetProps } from '@widgetstools/react-dock-manager';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@wellsfargo-starui/ui/chart';
import { BOOK_RISK } from '../../data/seeds';

// ── chart config at module scope ──────────────────────────────────────────────

const BAR_COLORS = [
  'var(--ds-chart-1)',
  'var(--ds-chart-2)',
  'var(--ds-chart-3)',
  'var(--ds-chart-4)',
  'var(--ds-chart-5)',
] as const;

const CHART_CONFIG: ChartConfig = {
  dv01: { label: 'DV01 ($)', color: 'var(--ds-chart-1)' },
};

const CHART_DATA = BOOK_RISK.map((r) => ({ book: r.book, dv01: r.dv01 }));

// Short label so X-axis labels fit in narrow panels
const SHORT_LABELS: Record<string, string> = {
  'CREDIT-IG':  'CR-IG',
  'CREDIT-HY':  'CR-HY',
  'RATES-UST':  'UST',
  'RATES-TIPS': 'TIPS',
  'MUNI':       'MUNI',
};

// ── component ─────────────────────────────────────────────────────────────────

export function Dv01ByBook(_props: WidgetProps) {
  return (
    <div className="flex h-full flex-col" data-testid="panel-dv01ByBook">
      <div className="shrink-0 border-b border-[color:var(--ds-border-primary)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
        DV01 by Book
      </div>
      <div className="min-h-0 flex-1 p-2">
        <ChartContainer config={CHART_CONFIG} className="h-full w-full">
          <BarChart data={CHART_DATA} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--ds-border-secondary)" />
            <XAxis
              dataKey="book"
              tickLine={false}
              axisLine={false}
              fontSize={10}
              tickFormatter={(v: string) => SHORT_LABELS[v] ?? v}
            />
            <YAxis tickLine={false} axisLine={false} fontSize={10} width={40} unit="$" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="dv01" maxBarSize={40} radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {CHART_DATA.map((_row, idx) => (
                <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}
