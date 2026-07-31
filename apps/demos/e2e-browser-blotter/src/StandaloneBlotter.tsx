import { useEffect, useMemo, useRef, useState } from 'react';
import type { ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { MarketsGrid } from '@wellsfargo-starui/grid';
import { GRID_ID, type RowShape } from './blotterColumns';

export function StandaloneBlotter({
  onGridReady: onGridReadyProp,
}: {
  onGridReady?: (api: GridApi<RowShape>) => void;
}) {
  const initialRows = useMemo(() => generateRows(500), []);
  const [rows, setRows] = useState<RowShape[]>(initialRows);
  const apiRef = useRef<GridApi<RowShape> | null>(null);

  useEffect(() => {
    const tick = () => {
      const updates: RowShape[] = [];
      const n = 30;
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(Math.random() * rows.length);
        const row = rows[idx];
        const drift = (Math.random() - 0.5) * 0.5;
        const next: RowShape = {
          ...row,
          price: Math.max(0, row.price + drift),
          yield: Math.max(0, row.yield + drift * 0.05),
          bidPrice: Math.max(0, row.bidPrice + drift),
          askPrice: Math.max(0, row.askPrice + drift),
        };
        rows[idx] = next;
        updates.push(next);
      }
      apiRef.current?.applyTransactionAsync({ update: updates });
    };
    const handle = setInterval(tick, 50);
    return () => clearInterval(handle);
  }, [rows]);

  const onGridReady = (event: GridReadyEvent<RowShape>) => {
    apiRef.current = event.api;
    onGridReadyProp?.(event.api);
  };

  return (
    <MarketsGrid<RowShape>
      gridId={GRID_ID}
      rowData={rows}
      columnDefs={COLUMNS}
      rowIdField="id"
      onGridReady={onGridReady}
    />
  );
}

const SECTORS = ['Financial', 'Industrial', 'Utility', 'Sovereign', 'Corporate', 'Mortgage'];
const ISSUERS = [
  'Apple Inc.', 'Microsoft Corp', 'JPMorgan Chase', 'Bank of America',
  'Toyota Motor', 'BHP Group', 'Vodafone Group', 'Siemens AG',
  'Daimler AG', 'BNP Paribas',
];

const COLUMNS: ColDef<RowShape>[] = [
  { field: 'id', headerName: 'ID', initialWidth: 100, pinned: 'left', filter: 'agTextColumnFilter' },
  { field: 'cusip', headerName: 'CUSIP', initialWidth: 130, filter: 'agTextColumnFilter' },
  { field: 'issuer', headerName: 'Issuer', initialWidth: 200, filter: 'agTextColumnFilter' },
  { field: 'sector', headerName: 'Sector', initialWidth: 140, filter: 'agSetColumnFilter' },
  { field: 'price', headerName: 'Price', initialWidth: 110, filter: 'agNumberColumnFilter', enableCellChangeFlash: true },
  { field: 'yield', headerName: 'Yield %', initialWidth: 100, filter: 'agNumberColumnFilter', enableCellChangeFlash: true },
  { field: 'bidPrice', headerName: 'Bid', initialWidth: 100, filter: 'agNumberColumnFilter', enableCellChangeFlash: true },
  { field: 'askPrice', headerName: 'Ask', initialWidth: 100, filter: 'agNumberColumnFilter', enableCellChangeFlash: true },
];

function generateRows(count: number): RowShape[] {
  const rows: RowShape[] = [];
  for (let i = 0; i < count; i++) {
    const issuer = ISSUERS[i % ISSUERS.length];
    const sector = SECTORS[i % SECTORS.length];
    const cusip = String(100000000 + i).padStart(9, '0');
    rows.push({
      id: `R${String(i).padStart(5, '0')}`,
      cusip,
      issuer,
      sector,
      price: 95 + Math.random() * 10,
      yield: 2 + Math.random() * 4,
      bidPrice: 95 + Math.random() * 10,
      askPrice: 95 + Math.random() * 10,
    });
  }
  return rows;
}
