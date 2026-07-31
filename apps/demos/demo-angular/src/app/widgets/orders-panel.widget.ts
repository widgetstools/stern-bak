import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgGridAngular } from 'ag-grid-angular';

import { ModuleRegistry, type ColDef } from 'ag-grid-community';
import { AllEnterpriseModule, LicenseManager } from 'ag-grid-enterprise';
import { fiGridTheme } from '../services/ag-grid-theme';
import { INITIAL_ORDERS, INITIAL_TRADES } from '../services/trading-data.service';
import {
  SideCellRenderer,
  FilledAmountRenderer,
  StatusBadgeRenderer,
} from '../services/cell-renderers';

ModuleRegistry.registerModules([AllEnterpriseModule]);
LicenseManager.setLicenseKey('');

@Component({
  selector: 'orders-panel-widget',
  standalone: true,
  imports: [CommonModule, AgGridAngular],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `
    <div style="display:flex;flex-direction:column;height:100%;background:var(--ds-surface-primary)">
      <!-- Tabs -->
      <div
        style="display:flex;align-items:center;border-bottom:1px solid var(--ds-border-primary);flex-shrink:0"
      >
        <button
          *ngFor="let t of tabNames"
          (click)="tab = t.key"
          class="bn-tab"
          [class.active]="tab === t.key"
        >
          {{ t.label }}
        </button>
        <div
          style="margin-left:auto;display:flex;align-items:center;gap:16px;padding-right:16px"
        ></div>
      </div>
      <!-- Content -->
      <div style="flex:1;overflow:hidden">
        <!-- Order History -->
        <ag-grid-angular
          *ngIf="tab === 'orders'"
          style="width:100%;height:100%"
          [theme]="gridTheme"
          [rowData]="orders"
          [columnDefs]="orderColDefs"
          [defaultColDef]="defaultColDef"
          [headerHeight]="28"
          [rowHeight]="26"
        />
        <!-- Trade History -->
        <ag-grid-angular
          *ngIf="tab === 'trades'"
          style="width:100%;height:100%"
          [theme]="gridTheme"
          [rowData]="trades"
          [columnDefs]="tradeColDefs"
          [defaultColDef]="defaultColDef"
          [headerHeight]="28"
          [rowHeight]="26"
        />
        <!-- Funds -->
        <div
          *ngIf="tab === 'funds'"
          style="padding:16px;display:grid;grid-template-columns:repeat(4,1fr);gap:16px"
        >
          <div
            *ngFor="let f of funds"
            style="padding:12px;border-radius:4px;border:1px solid var(--ds-border-secondary);background:var(--ds-surface-secondary)"
          >
            <div class="font-bold" style="color:var(--ds-text-primary);margin-bottom:4px">{{ f.asset }}</div>
            <div style="font-size:11px;color:var(--ds-text-secondary)">
              Available: <span class="font-mono-fi" style="color:var(--ds-text-primary)">{{ f.avail }}</span>
            </div>
            <div style="font-size:11px;color:var(--ds-text-secondary)">
              In Order: <span class="font-mono-fi" style="color:var(--ds-text-primary)">{{ f.locked }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class OrdersPanelWidget {
  @Input() api: any;
  @Input() panel: any;

  gridTheme = fiGridTheme;
  tab = 'orders';
  tabNames = [
    { key: 'orders', label: 'Order History' },
    { key: 'trades', label: 'Trade History' },
    { key: 'open', label: 'Open Orders (0)' },
    { key: 'funds', label: 'Funds' },
  ];
  orders = INITIAL_ORDERS;
  trades = INITIAL_TRADES;
  funds = [
    { asset: 'USD', avail: '0.00', locked: '0.00' },
    { asset: 'UST', avail: '0.00', locked: '0.00' },
    { asset: 'AAPL', avail: '0.00', locked: '0.00' },
  ];

  orderColDefs: ColDef[] = [
    {
      field: 'time',
      headerName: 'Date',
      flex: 0.6,
      cellStyle: { color: 'var(--ds-text-secondary)' },
    },
    {
      field: 'bond',
      headerName: 'Pair',
      flex: 1,
    },
    {
      field: 'type',
      headerName: 'Type',
      flex: 0.6,
      cellStyle: { color: 'var(--ds-text-secondary)' },
    },
    {
      field: 'side',
      headerName: 'Side',
      flex: 0.5,
      cellRenderer: SideCellRenderer,
    },
    {
      field: 'px',
      headerName: 'Price',
      flex: 0.7,
      type: 'numericColumn',
      valueFormatter: (p) => (p.value > 0 ? Number(p.value).toFixed(3) : '---'),
    },
    {
      field: 'qty',
      headerName: 'Amount',
      flex: 0.6,
      type: 'numericColumn',
    },
    {
      field: 'filled',
      headerName: 'Filled',
      flex: 0.6,
      type: 'numericColumn',
      cellRenderer: FilledAmountRenderer,
    },
    {
      headerName: 'Total',
      flex: 0.7,
      type: 'numericColumn',
      cellStyle: { color: 'var(--ds-text-secondary)' },
      valueGetter: (p) => {
        if (!p.data || p.data.px <= 0) return '---';
        const val = parseFloat(String(p.data.qty).replace(/[$MM,]/g, ''));
        return (p.data.px * val).toFixed(0);
      },
    },
    {
      field: 'status',
      headerName: 'Status',
      flex: 0.6,
      cellRenderer: StatusBadgeRenderer,
    },
  ];

  tradeColDefs: ColDef[] = [
    {
      field: 'time',
      headerName: 'Date',
      flex: 0.6,
      cellStyle: { color: 'var(--ds-text-secondary)' },
    },
    {
      field: 'bond',
      headerName: 'Pair',
      flex: 1,
    },
    {
      field: 'side',
      headerName: 'Side',
      flex: 0.5,
      cellRenderer: SideCellRenderer,
    },
    {
      field: 'price',
      headerName: 'Price',
      flex: 0.7,
      type: 'numericColumn',
      valueFormatter: (p) => Number(p.value).toFixed(3),
    },
    {
      field: 'size',
      headerName: 'Amount',
      flex: 0.6,
      type: 'numericColumn',
    },
    {
      headerName: 'Total',
      flex: 0.6,
      type: 'numericColumn',
      cellStyle: { color: 'var(--ds-text-secondary)' },
      valueGetter: () => '---',
    },
    {
      headerName: 'Fee',
      flex: 0.5,
      type: 'numericColumn',
      cellStyle: { color: 'var(--ds-text-secondary)' },
      valueGetter: () => '---',
    },
    {
      field: 'status',
      headerName: 'Status',
      flex: 0.6,
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
}
