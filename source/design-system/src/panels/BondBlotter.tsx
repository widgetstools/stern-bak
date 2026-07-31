import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, RowClickedEvent } from 'ag-grid-community';
import '../lib/agGridSetup';
import { blotterTheme } from '../lib/agGridTheme';
import type { TerminalState } from '../data/types';

interface BlotterRow {
  id: string;
  ticker: string;
  rating: string;
  sector: string;
  coupon: number;
  bid: number;
  mid: number;
  ask: number;
  ytm: number;
  oas: number;
  changePct: number;
}

const num = (digits: number) => ({
  type: 'rightAligned' as const,
  valueFormatter: (p: { value: number | null }) => (p.value == null ? '' : p.value.toFixed(digits)),
});

const COLS: ColDef<BlotterRow>[] = [
  { field: 'ticker', headerName: 'Instrument', minWidth: 150, pinned: 'left' },
  { field: 'rating', headerName: 'Rating', width: 90 },
  { field: 'sector', headerName: 'Sector', width: 120 },
  { field: 'coupon', headerName: 'Coupon', width: 90, ...num(3) },
  { field: 'bid', headerName: 'Bid', width: 90, ...num(3), enableCellChangeFlash: true },
  { field: 'mid', headerName: 'Mid', width: 90, ...num(3), enableCellChangeFlash: true },
  { field: 'ask', headerName: 'Ask', width: 90, ...num(3), enableCellChangeFlash: true },
  { field: 'ytm', headerName: 'YTM', width: 90, ...num(3) },
  { field: 'oas', headerName: 'OAS', width: 80, ...num(0) },
  {
    field: 'changePct',
    headerName: 'Chg%',
    width: 90,
    ...num(2),
    cellStyle: (p: { value: number | null }) => ({
      color: (p.value ?? 0) >= 0 ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)',
    }),
  },
];

export interface BondBlotterProps {
  state: TerminalState;
  onRowClicked?: (id: string) => void;
}

export function BondBlotter({ state, onRowClicked }: BondBlotterProps) {
  const rows = useMemo<BlotterRow[]>(
    () =>
      state.instruments.map((inst) => {
        const q = state.quotes[inst.id];
        return {
          id: inst.id, ticker: inst.ticker, rating: inst.rating, sector: inst.sector,
          coupon: inst.coupon, bid: q.bid, mid: q.mid, ask: q.ask, ytm: q.ytm, oas: q.oas,
          changePct: q.changePct,
        };
      }),
    [state],
  );

  const handleRowClicked = onRowClicked
    ? (e: RowClickedEvent<BlotterRow>) => { if (e.data?.id) onRowClicked(e.data.id); }
    : undefined;

  return (
    <div className="h-full w-full" data-testid="bond-blotter">
      <AgGridReact<BlotterRow>
        theme={blotterTheme}
        rowData={rows}
        columnDefs={COLS}
        getRowId={(p) => p.data.id}
        defaultColDef={{ sortable: true, resizable: true }}
        animateRows={false}
        onRowClicked={handleRowClicked}
      />
    </div>
  );
}
