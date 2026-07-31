import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgGridAngular } from 'ag-grid-angular';

import { ModuleRegistry, type ColDef } from 'ag-grid-community';
import { AllEnterpriseModule, LicenseManager } from 'ag-grid-enterprise';
import { fiGridTheme } from '../services/ag-grid-theme';
import { SharedStateService } from '../services/shared-state.service';
import {
  SideCellRenderer,
  FilledAmountRenderer,
  StatusBadgeRenderer,
} from '../services/cell-renderers';

ModuleRegistry.registerModules([AllEnterpriseModule]);
LicenseManager.setLicenseKey('');

@Component({
  selector: 'order-blotter-widget',
  standalone: true,
  imports: [CommonModule, AgGridAngular],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `
    <div
      style="display:flex;flex-direction:column;height:100%;background:var(--ds-surface-primary);overflow:hidden"
    >
      <div style="display:flex;justify-content:flex-end;padding:4px 10px;flex-shrink:0">
        <button
          *ngFor="let f of filters"
          (click)="shared.orderFilter.set(f)"
          class="font-mono-fi"
          style="font-size:9px;padding:2px 8px;margin-left:3px;border-radius:2px;cursor:pointer"
          [style.background]="shared.orderFilter() === f ? 'var(--ds-border-primary)' : 'transparent'"
          [style.border]="'1px solid var(--ds-border-primary)'"
          [style.color]="shared.orderFilter() === f ? 'var(--ds-text-primary)' : 'var(--ds-text-secondary)'"
        >
          {{ f }}
        </button>
      </div>
      <div style="flex:1;overflow:hidden">
        <ag-grid-angular
          style="width:100%;height:100%"
          [theme]="gridTheme"
          [rowData]="filteredOrders"
          [columnDefs]="colDefs"
          [defaultColDef]="defaultColDef"
          [headerHeight]="28"
          [rowHeight]="26"
          (rowClicked)="onRowClicked($event)"
        />
      </div>
    </div>
  `,
})
export class OrderBlotterWidget {
  @Input() api: any;
  @Input() panel: any;
  shared = inject(SharedStateService);
  filters = ['All', 'Filled', 'Partial', 'Pending', 'Cancelled'];

  gridTheme = fiGridTheme;
  colDefs: ColDef[] = [
    {
      field: 'time',
      headerName: 'TIME',
      flex: 0.6,
      cellStyle: { color: 'var(--ds-text-muted)', fontSize: '9px' },
    },
    {
      field: 'bond',
      headerName: 'BOND',
      flex: 1,
      cellStyle: { color: 'var(--ds-accent-info)' },
    },
    {
      field: 'side',
      headerName: 'SIDE',
      flex: 0.5,
      cellRenderer: SideCellRenderer,
    },
    {
      field: 'type',
      headerName: 'TYPE',
      flex: 0.5,
      cellStyle: { color: 'var(--ds-text-secondary)', fontSize: '9px' },
    },
    {
      field: 'qty',
      headerName: 'QTY',
      flex: 0.6,
      type: 'numericColumn',
    },
    {
      field: 'filled',
      headerName: 'FILLED',
      flex: 0.6,
      type: 'numericColumn',
      cellRenderer: FilledAmountRenderer,
    },
    {
      field: 'px',
      headerName: 'PX',
      flex: 0.7,
      type: 'numericColumn',
      valueFormatter: (p) => (p.value > 0 ? Number(p.value).toFixed(3) : '---'),
    },
    {
      field: 'ytm',
      headerName: 'YTM',
      flex: 0.6,
      type: 'numericColumn',
      cellStyle: { color: 'var(--ds-text-secondary)' },
      valueFormatter: (p) => (p.value > 0 ? Number(p.value).toFixed(2) + '%' : '---'),
    },
    {
      field: 'status',
      headerName: 'STATUS',
      flex: 0.7,
      cellRenderer: StatusBadgeRenderer,
    },
  ];

  defaultColDef: ColDef = {
    sortable: true,
    resizable: true,
    suppressMovable: true,
    cellStyle: {
      fontFamily: 'JetBrains Mono,monospace',
      fontSize: '11px',
    },
  };

  get filteredOrders() {
    const f = this.shared.orderFilter();
    return this.shared.orders().filter((o) => f === 'All' || o.status === f);
  }

  onRowClicked(e: any) {
    if (e.data) this.shared.selectedOrder.set(e.data);
  }
}
