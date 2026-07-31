import type { ColDef } from 'ag-grid-community';
import { positionColumnDefs } from './positionColumns';
import { tradeColumnDefs } from './tradeColumns';
import { orderColumnDefs } from './orderColumns';

export interface DataTypeConfig {
  columnDefs: ColDef[];
  rowIdField: string;
  defaultColDef: ColDef;
}

const defaultColDef: ColDef = {
  floatingFilter: true,
  filter: true,
  sortable: true,
  resizable: true,
};

export const columnDefsByType: Record<
  'positions' | 'trades' | 'orders',
  DataTypeConfig
> = {
  // Positions cycle the mock universe with a rotating accountIdx when
  // rowCount > universe size — so cusip alone is NOT unique. The
  // generator emits a synthetic `id: 'POS-<cusip>-<accountIdx>'`.
  positions: { columnDefs: positionColumnDefs, rowIdField: 'id',      defaultColDef },
  trades:    { columnDefs: tradeColumnDefs,    rowIdField: 'tradeId', defaultColDef },
  orders:    { columnDefs: orderColumnDefs,    rowIdField: 'id',      defaultColDef },
};
