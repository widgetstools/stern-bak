import { useMemo, useState } from 'react';
import type { WidgetProps } from '@widgetstools/react-dock-manager';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, RowClassParams, RowClickedEvent } from 'ag-grid-community';
import '../lib/agGridSetup';
import { gridTheme } from '../lib/agGridTheme';
import { useDemoState } from '../state/DemoStateProvider';
import type { Order, OrderStatus } from '../data/types';
import { orderStatusColor } from './orders/orderStatus';

type Filter = 'all' | OrderStatus;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'filled', label: 'Filled' },
  { id: 'partial', label: 'Partial' },
  { id: 'pending', label: 'Pending' },
  { id: 'cancelled', label: 'Cancelled' },
];

const fmtMM = (face: number) => (face === 0 ? '—' : `$${(face / 1_000_000).toFixed(0)}MM`);
const fmtTime = (ts: number) => {
  const d = new Date(ts);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

function StatusCell({ value }: { value: OrderStatus }) {
  const c = orderStatusColor(value);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 'var(--ds-radius-sm)',
      border: `1px solid ${c}`, color: c, fontSize: 'var(--ds-font-size-2xs)', fontWeight: 600,
      // Explicit line-height: as a flex child the badge would otherwise inherit
      // the AG cell's row-height line-height and grow taller than the cell,
      // clipping its top/bottom borders under the cell's overflow:hidden.
      lineHeight: 1.4, textTransform: 'capitalize', letterSpacing: '0.03em',
    }}>{value}</span>
  );
}

const COLS: ColDef<Order>[] = [
  { headerName: 'Time', valueGetter: (p) => fmtTime(p.data!.ts), width: 70 },
  { field: 'ticker', headerName: 'Bond', minWidth: 150, flex: 1 },
  { field: 'side', headerName: 'Side', width: 70, valueFormatter: (p) => String(p.value).toUpperCase(),
    cellStyle: (p) => ({ color: p.value === 'buy' ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)', fontWeight: 600 }) },
  { field: 'kind', headerName: 'Type', width: 78 },
  { field: 'qty', headerName: 'Qty', width: 90, type: 'rightAligned', valueFormatter: (p) => fmtMM(p.value) },
  { field: 'filled', headerName: 'Filled', width: 90, type: 'rightAligned', valueFormatter: (p) => fmtMM(p.value),
    cellStyle: { color: 'var(--ds-accent-positive)' } },
  { field: 'price', headerName: 'Px', width: 84, type: 'rightAligned', valueFormatter: (p) => (p.value ? Number(p.value).toFixed(3) : '—') },
  { field: 'ytm', headerName: 'YTM', width: 78, type: 'rightAligned', valueFormatter: (p) => (p.value ? `${Number(p.value).toFixed(2)}%` : '—') },
  { field: 'status', headerName: 'Status', width: 124, cellRenderer: StatusCell,
    cellStyle: { display: 'flex', alignItems: 'center' } },
];

export function OrdersBlotter(_props: WidgetProps) {
  const { store, selectedOrderId, setSelectedOrderId } = useDemoState();
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(
    () => store.state.orders.filter((o) => filter === 'all' || o.status === filter),
    [store.state.orders, filter],
  );

  const getRowStyle = (p: RowClassParams<Order>) =>
    p.data?.id === selectedOrderId ? { background: 'var(--ds-state-selection)' } : undefined;

  return (
    <div className="flex h-full flex-col" data-testid="orders-blotter">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[color:var(--ds-border-primary)] px-3 py-2">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className="rounded px-2.5 py-1 text-[color:var(--ds-text-secondary)] transition-colors hover:text-[color:var(--ds-text-primary)]"
              style={{
                fontSize: 'var(--ds-font-size-2xs)', fontWeight: active ? 700 : 500, letterSpacing: '0.04em',
                background: active ? 'var(--ds-surface-secondary)' : 'transparent',
                color: active ? 'var(--ds-text-primary)' : undefined,
                boxShadow: active ? 'inset 0 0 0 1px var(--ds-border-primary)' : undefined,
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1">
        <AgGridReact<Order>
          theme={gridTheme}
          rowData={rows}
          columnDefs={COLS}
          getRowId={(p) => p.data.id}
          getRowStyle={getRowStyle}
          defaultColDef={{ sortable: true, resizable: true }}
          animateRows={false}
          onRowClicked={(e: RowClickedEvent<Order>) => { if (e.data?.id) setSelectedOrderId(e.data.id); }}
        />
      </div>
    </div>
  );
}
