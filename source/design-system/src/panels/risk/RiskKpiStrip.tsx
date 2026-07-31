import type { WidgetProps } from '@widgetstools/react-dock-manager';
import { Card, CardContent, CardHeader, CardTitle } from '@wellsfargo-starui/ui';
import { BOOK_RISK } from '../../data/seeds';
import { fmtMoney } from '../../data/formatters';

// ── static computations at module scope ──────────────────────────────────────

const totalDv01 = BOOK_RISK.reduce((s, r) => s + r.dv01, 0);
const totalMv   = BOOK_RISK.reduce((s, r) => s + r.mv,   0);
const totalPnl  = BOOK_RISK.reduce((s, r) => s + r.pnl,  0);

// VaR 95% 1D ≈ DV01 × z × bp-vol (z=1.65, bp-vol=8)
const var95 = -(totalDv01 * 1.65 * 8);

// DV01-weighted average OAS Duration (use oas as proxy for spread duration)
const wtOasDur = BOOK_RISK.reduce((s, r) => s + r.oas * r.dv01, 0) / totalDv01;

// Plausible credit delta (IG dv01 - HY dv01 * 0.5)
const igRow  = BOOK_RISK.find((r) => r.book === 'CREDIT-IG');
const hyRow  = BOOK_RISK.find((r) => r.book === 'CREDIT-HY');
const creditDelta = (igRow?.dv01 ?? 0) - (hyRow?.dv01 ?? 0) * 0.5;

// ── KPI descriptor list ───────────────────────────────────────────────────────

interface KpiDef {
  id: string;
  label: string;
  value: string;
  subLabel: string;
  color: string;
}

function buildKpis(): KpiDef[] {
  return [
    {
      id: 'portfolioDv01',
      label: 'Portfolio DV01',
      value: `$${Math.round(totalDv01).toLocaleString('en-US')}`,
      subLabel: 'per bp move',
      color: 'var(--ds-text-primary)',
    },
    {
      id: 'totalMv',
      label: 'Total MV',
      value: fmtMoney(totalMv),
      subLabel: 'all books',
      color: 'var(--ds-text-primary)',
    },
    {
      id: 'var95',
      label: 'VaR 95% 1D',
      value: fmtMoney(var95),
      subLabel: '1.65σ × 8bp vol',
      color: 'var(--ds-accent-warning)',
    },
    {
      id: 'oasDuration',
      label: 'OAS Duration',
      value: `${wtOasDur.toFixed(1)} bp`,
      subLabel: 'DV01-weighted avg',
      color: 'var(--ds-accent-info)',
    },
    {
      id: 'spreadPnl',
      label: 'Spread P&L MTD',
      value: fmtMoney(totalPnl),
      subLabel: 'all books',
      color: totalPnl >= 0 ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)',
    },
    {
      id: 'creditDelta',
      label: 'Credit Delta',
      value: `$${Math.round(creditDelta).toLocaleString('en-US')}`,
      subLabel: 'IG − 0.5×HY DV01',
      color: 'var(--ds-accent-purple)',
    },
  ];
}

const KPI_LIST = buildKpis();

// ── component ─────────────────────────────────────────────────────────────────

export function RiskKpiStrip(_props: WidgetProps) {
  return (
    <div className="flex h-full flex-col" data-testid="panel-riskKpi">
      <div className="shrink-0 border-b border-[color:var(--ds-border-primary)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
        Risk KPIs
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {KPI_LIST.map((kpi) => (
            <KpiCard key={kpi.id} def={kpi} />
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ def }: { def: KpiDef }) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-1 pt-3 px-3">
        <CardTitle className="text-[10px] uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
          {def.label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3 px-3">
        <div
          className="text-[18px] font-semibold leading-tight font-[family-name:var(--ds-font-mono)] truncate"
          style={{ color: def.color }}
        >
          {def.value}
        </div>
        <div className="mt-0.5 text-[10px] text-[color:var(--ds-text-faint)]">
          {def.subLabel}
        </div>
      </CardContent>
    </Card>
  );
}
