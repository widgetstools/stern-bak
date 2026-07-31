import type { ColDef } from 'ag-grid-community';

export const positionColumnDefs: ColDef[] = [
  { field: 'positionId', headerName: 'Position ID', filter: true },
  { field: 'cusip', headerName: 'CUSIP', filter: true },
  { field: 'account', headerName: 'Account', filter: true },
  { field: 'quantity', headerName: 'Qty', type: 'numericColumn' },
  { field: 'marketValue', headerName: 'MV', type: 'numericColumn' },
];
