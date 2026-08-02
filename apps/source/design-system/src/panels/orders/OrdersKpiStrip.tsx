import type { WidgetProps } from '@widgetstools/react-dock-manager';
import { useDemoState } from '../../state/DemoStateProvider';
import type { OrderStatus } from '../../data/types';
import { orderStatusColor } from './orderStatus';

const STATUSES: OrderStatus[] = ['filled', 'partial', 'pending', 'cancelled'];

// ── Filled donut ───────────────────────────────────────────────────────────────

function Donut({ pct }: { pct: number }) {
  const r = 22, c = r + 4, size = c * 2, circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={c} cy={c} r={r} fill="none" strokeWidth={5} stroke="var(--ds-surface-tertiary)" />
      <circle cx={c} cy={c} r={r} fill="none" strokeWidth={5} stroke="var(--ds-accent-positive)"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)} strokeLinecap="round"
        transform={`rotate(-90 ${c} ${c})`} />
      <text x={c} y={c + 4} textAnchor="middle"
        style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--ds-font-mono)', fill: 'var(--ds-text-primary)' }}>
        {pct}%
      </text>
    </svg>
  );
}

// ── Total-notional bar ─────────────────────────────────────────────────────────

function NotionalBar({ label, mm, max, color }: { label: string; mm: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ width: 28, fontSize: 'var(--ds-font-size-2xs)', color: 'var(--ds-text-muted)' }}>{label}</span>
      <div className="h-1.5 w-24 overflow-hidden rounded-full" style={{ background: 'var(--ds-surface-tertiary)' }}>
        <div className="h-full rounded-full" style={{ width: `${max ? (mm / max) * 100 : 0}%`, background: color }} />
      </div>
      <span style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 'var(--ds-font-size-2xs)', color: 'var(--ds-text-secondary)' }}>${mm}M</span>
    </div>
  );
}

export function OrdersKpiStrip(_props: WidgetProps) {
  const { store } = useDemoState();
  const orders = store.state.orders;
  const total = orders.length || 1;

  const counts = Object.fromEntries(STATUSES.map((s) => [s, orders.filter((o) => o.status === s).length])) as Record<OrderStatus, number>;
  const pctFilled = Math.round(((counts.filled + counts.partial * 0.5) / total) * 100);

  const buyMM = Math.round(orders.filter((o) => o.side === 'buy').reduce((s, o) => s + o.qty, 0) / 1_000_000);
  const sellMM = Math.round(orders.filter((o) => o.side === 'sell').reduce((s, o) => s + o.qty, 0) / 1_000_000);
  const totalMM = buyMM + sellMM;
  const maxMM = Math.max(buyMM, sellMM, 1);

  return (
    <div className="flex h-full items-center gap-6 px-5" data-testid="orders-kpi" style={{ background: 'var(--ds-surface-primary)' }}>
      {/* Donut + count */}
      <div className="flex items-center gap-3">
        <Donut pct={pctFilled} />
        <div>
          <div style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 'var(--ds-font-size-lg)', fontWeight: 700, color: 'var(--ds-text-primary)' }}>{orders.length}</div>
          <div style={{ fontSize: 'var(--ds-font-size-2xs)', color: 'var(--ds-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Orders Today</div>
        </div>
      </div>

      <div className="h-10 w-px" style={{ background: 'var(--ds-border-primary)' }} />

      {/* Segmented status bar + legend */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--ds-surface-tertiary)' }}>
          {STATUSES.map((s) => counts[s] > 0 && (
            <div key={s} style={{ width: `${(counts[s] / total) * 100}%`, background: orderStatusColor(s) }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-4">
          {STATUSES.map((s) => (
            <span key={s} className="flex items-center gap-1.5" style={{ fontSize: 'var(--ds-font-size-2xs)', color: 'var(--ds-text-secondary)' }}>
              <span className="h-2 w-2 rounded-full" style={{ background: orderStatusColor(s) }} />
              <span className="capitalize">{s}</span>
              <strong style={{ color: 'var(--ds-text-primary)' }}>{counts[s]}</strong>
            </span>
          ))}
        </div>
      </div>

      <div className="h-10 w-px" style={{ background: 'var(--ds-border-primary)' }} />

      {/* Total notional */}
      <div className="flex items-center gap-4">
        <div>
          <div style={{ fontSize: 'var(--ds-font-size-2xs)', color: 'var(--ds-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Notional</div>
          <div style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 'var(--ds-font-size-lg)', fontWeight: 700, color: 'var(--ds-accent-info)' }}>${totalMM}MM</div>
        </div>
        <div className="flex flex-col gap-1.5">
          <NotionalBar label="BUY" mm={buyMM} max={maxMM} color="var(--ds-accent-positive)" />
          <NotionalBar label="SELL" mm={sellMM} max={maxMM} color="var(--ds-accent-negative)" />
        </div>
      </div>
    </div>
  );
}
