import type { WidgetProps } from '@widgetstools/react-dock-manager';
import { useDemoState } from '../../state/DemoStateProvider';
import { orderStatusColor } from './orderStatus';
import { fmtMoney } from '../../data/formatters';

const label: React.CSSProperties = {
  fontSize: 'var(--ds-font-size-2xs)', color: 'var(--ds-text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
};
const value: React.CSSProperties = { fontFamily: 'var(--ds-font-mono)', fontSize: 'var(--ds-font-size-sm)', color: 'var(--ds-text-primary)' };

const fmtTime = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

export function OrderDetail(_props: WidgetProps) {
  const { store, selectedOrderId } = useDemoState();
  const order = store.state.orders.find((o) => o.id === selectedOrderId);
  const inst = order ? store.state.instruments.find((i) => i.id === order.instrumentId) : undefined;

  if (!order) {
    return (
      <div className="flex h-full items-center justify-center text-[color:var(--ds-text-faint)]" data-testid="order-detail"
        style={{ fontSize: 'var(--ds-font-size-xs)' }}>
        Select an order to view detail
      </div>
    );
  }

  const sideColor = order.side === 'buy' ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)';
  const rows: { k: string; v: string; color?: string }[] = [
    { k: 'Order Type', v: order.kind },
    { k: 'Side', v: order.side.toUpperCase(), color: sideColor },
    { k: 'Quantity', v: fmtMoney(order.qty) },
    { k: 'Filled', v: order.filled === 0 ? '—' : fmtMoney(order.filled), color: 'var(--ds-accent-positive)' },
    { k: 'Price', v: order.price ? order.price.toFixed(3) : '—' },
    { k: 'YTM', v: order.ytm ? `${order.ytm.toFixed(2)}%` : '—' },
    { k: 'Time', v: fmtTime(order.ts) },
    { k: 'Settlement', v: order.kind === 'RFQ' ? 'T+1' : 'T+2' },
  ];

  return (
    <div className="flex h-full flex-col" data-testid="order-detail">
      <div className="shrink-0 border-b border-[color:var(--ds-border-primary)] px-3 py-2.5">
        <div style={{ ...value, fontWeight: 700 }}>{inst?.ticker ?? order.ticker}</div>
        <div className="mt-1.5">
          <span style={{
            display: 'inline-flex', padding: '1px 8px', borderRadius: 'var(--ds-radius-sm)',
            border: `1px solid ${orderStatusColor(order.status)}`, color: orderStatusColor(order.status),
            fontSize: 'var(--ds-font-size-2xs)', fontWeight: 600, textTransform: 'capitalize',
          }}>{order.status}</span>
        </div>
      </div>
      <div className="flex flex-col">
        {rows.map((r) => (
          <div key={r.k} className="flex items-center justify-between border-b border-[color:var(--ds-border-primary)]/60 px-3 py-2.5">
            <span style={label}>{r.k}</span>
            <span style={{ ...value, color: r.color ?? value.color }}>{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
