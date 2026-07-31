import type { ColDef, ValueFormatterParams } from 'ag-grid-community';

const num2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPx = (p: ValueFormatterParams) =>
  p.value == null ? '' : num2.format(p.value as number);
const fmtTime = (p: ValueFormatterParams) => {
  const v = p.value as number | null | undefined;
  if (v == null) return '';
  return new Date(v).toLocaleTimeString('en-GB', { hour12: false });
};

export const orderColumnDefs: ColDef[] = [
  { field: 'id',         headerName: 'ID',     width: 110, pinned: 'left', filter: 'agTextColumnFilter' },
  { field: 'instrument', headerName: 'Symbol', width: 120, filter: 'agSetColumnFilter' },
  { field: 'side',       headerName: 'Side',   width: 80,  filter: 'agSetColumnFilter' },
  { field: 'status',     headerName: 'Status', width: 150, filter: 'agSetColumnFilter' },
  { field: 'quantity',   headerName: 'Qty',    width: 100, type: 'numericColumn', filter: 'agNumberColumnFilter' },
  { field: 'price',      headerName: 'Price',  width: 110, type: 'numericColumn', valueFormatter: fmtPx, filter: 'agNumberColumnFilter' },
  { field: 'timestamp',  headerName: 'Time',   width: 110, valueFormatter: fmtTime, filter: 'agTextColumnFilter' },
];
