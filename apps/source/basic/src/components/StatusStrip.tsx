import { useMemo } from 'react';
import type { Bond } from '../mockBonds';

interface StatusStripProps {
  rows: Bond[];
  activeProfileName: string | null;
  profileCount: number;
  storageKey: string;
}

const intl = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function StatusStrip({
  rows,
  activeProfileName,
  profileCount,
  storageKey,
}: StatusStripProps) {
  const stats = useMemo(() => {
    const total = rows.length;
    const notional = rows.reduce((s, r) => s + r.notional, 0);
    const dv01 = rows.reduce((s, r) => s + r.dv01 * (r.notional / 1_000_000), 0);
    const pnlDay = rows.reduce((s, r) => s + r.pnlDay, 0);
    const ig = rows.filter((r) => !r.rating.startsWith('B') || r.rating === 'BBB' || r.rating === 'BBB+' || r.rating === 'BBB-').length;
    const hy = total - ig;
    return { total, notional, dv01, pnlDay, ig, hy };
  }, [rows]);

  return (
    <div className="flex h-[34px] shrink-0 items-center gap-6 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] px-4 font-mono text-[11px] text-[color:var(--ds-text-secondary)]">
      <Metric label="Lines" value={intl.format(stats.total)} />
      <Metric label="Notional" value={`$${compact.format(stats.notional)}`} />
      <Metric label="DV01" value={`$${compact.format(stats.dv01)}`} />
      <Metric
        label="P&L (D)"
        value={`${stats.pnlDay >= 0 ? '+' : '−'}$${compact.format(Math.abs(stats.pnlDay))}`}
        tone={stats.pnlDay >= 0 ? 'positive' : 'negative'}
      />
      <Metric label="IG" value={intl.format(stats.ig)} />
      <Metric label="HY" value={intl.format(stats.hy)} />
      <div className="mx-2 h-3 w-px bg-[color:var(--ds-border-primary)]" />
      <Metric
        label="Layout"
        value={activeProfileName ?? '—'}
        tone={activeProfileName ? 'accent' : undefined}
      />
      <Metric label="Saved" value={String(profileCount)} />
      <div className="ml-auto flex items-center gap-2 text-[10px] text-[color:var(--ds-text-faint)]">
        <span className="font-mono uppercase tracking-[0.12em]">localStorage key</span>
        <code className="rounded-sm border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-2 py-[2px] text-[color:var(--ds-text-secondary)]">
          {storageKey}
        </code>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'positive' | 'negative' | 'accent';
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-[color:var(--ds-accent-positive)]'
      : tone === 'negative'
        ? 'text-[color:var(--ds-accent-negative)]'
        : tone === 'accent'
          ? 'text-[color:var(--ds-accent-info)]'
          : 'text-[color:var(--ds-text-primary)]';
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--ds-text-faint)]">
        {label}
      </span>
      <span className={`tabular-nums ${toneClass}`}>{value}</span>
    </div>
  );
}
