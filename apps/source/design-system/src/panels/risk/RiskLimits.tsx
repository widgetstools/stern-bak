import type { WidgetProps } from '@widgetstools/react-dock-manager';
import { BOOK_RISK } from '../../data/seeds';
import { fmtMoney } from '../../data/formatters';

// ── limit definitions at module scope ─────────────────────────────────────────

interface LimitDef {
  id: string;
  label: string;
  used: number;
  limit: number;
  unit: string;
}

const totalDv01   = BOOK_RISK.reduce((s, r) => s + r.dv01, 0);
const var95       = totalDv01 * 1.65 * 8;
const igRow       = BOOK_RISK.find((r) => r.book === 'CREDIT-IG');
const hyRow       = BOOK_RISK.find((r) => r.book === 'CREDIT-HY');

function buildLimits(): LimitDef[] {
  return [
    {
      id: 'dv01Limit',
      label: 'DV01 Limit',
      used: totalDv01,
      limit: 3_000,
      unit: '$',
    },
    {
      id: 'var95Limit',
      label: 'VaR 95%',
      used: var95,
      limit: 50_000,
      unit: '$',
    },
    {
      id: 'igOasDur',
      label: 'IG OAS Duration',
      used: igRow?.oas ?? 0,
      limit: 180,
      unit: 'bp',
    },
    {
      id: 'hyExposure',
      label: 'HY Exposure (DV01)',
      used: hyRow?.dv01 ?? 0,
      limit: 400,
      unit: '$',
    },
    {
      id: 'singleIssuer',
      label: 'Single Issuer Max',
      used: 620,   // CREDIT-IG DV01 — largest single-book position
      limit: 1_000,
      unit: '$',
    },
  ];
}

const LIMITS = buildLimits();

// ── color helpers ─────────────────────────────────────────────────────────────

function utilizationPct(def: LimitDef): number {
  return Math.min(100, Math.round((def.used / def.limit) * 100));
}

function gaugeColor(pct: number): string {
  if (pct > 85) return 'var(--ds-accent-negative)';
  if (pct > 65) return 'var(--ds-accent-warning)';
  return 'var(--ds-accent-positive)';
}

function formatUsed(def: LimitDef): string {
  if (def.unit === '$') return fmtMoney(def.used);
  return `${def.used}${def.unit}`;
}

function formatLimit(def: LimitDef): string {
  if (def.unit === '$') return fmtMoney(def.limit);
  return `${def.limit}${def.unit}`;
}

// ── simple progress bar (bg-primary not overrideable from Progress root props) ─

function ColoredProgress({ value, color }: { value: number; color: string }) {
  return (
    <div
      className="relative h-2 w-full overflow-hidden rounded-full"
      style={{ background: 'var(--ds-primary-soft)' }}
    >
      <div
        className="h-full transition-all"
        style={{ width: `${value}%`, background: color }}
      />
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

export function RiskLimits(_props: WidgetProps) {
  return (
    <div className="flex h-full flex-col" data-testid="panel-riskLimits">
      <div className="shrink-0 border-b border-[color:var(--ds-border-primary)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
        Risk Limit Utilization
      </div>
      <div className="min-h-0 flex-1 overflow-auto flex flex-col gap-4 p-4">
        {LIMITS.map((def) => (
          <LimitGauge key={def.id} def={def} />
        ))}
      </div>
    </div>
  );
}

function LimitGauge({ def }: { def: LimitDef }) {
  const pct   = utilizationPct(def);
  const color = gaugeColor(pct);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-[color:var(--ds-text-secondary)]">{def.label}</span>
        <span className="font-[family-name:var(--ds-font-mono)] font-semibold" style={{ color }}>
          {pct}%
        </span>
      </div>
      <ColoredProgress value={pct} color={color} />
      <div className="flex justify-between text-[10px] text-[color:var(--ds-text-muted)]">
        <span>Used: {formatUsed(def)}</span>
        <span>Limit: {formatLimit(def)}</span>
      </div>
    </div>
  );
}
