import { Component, Input, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgGridAngular } from 'ag-grid-angular';

import { ModuleRegistry, type ColDef, type GridApi, type GridReadyEvent } from 'ag-grid-community';
import { AllEnterpriseModule, LicenseManager } from 'ag-grid-enterprise';
import { fiGridTheme } from '../services/ag-grid-theme';
import { BONDS, type Bond } from '../services/trading-data.service';
import { SharedStateService } from '../services/shared-state.service';
import {
  TickerCellRenderer,
  RatingBadgeRenderer,
  OasValueRenderer,
  SignedValueRenderer,
  SideCellRenderer,
} from '../services/cell-renderers';

ModuleRegistry.registerModules([AllEnterpriseModule]);
LicenseManager.setLicenseKey('');

@Component({
  selector: 'bond-blotter-widget',
  standalone: true,
  imports: [CommonModule, FormsModule, AgGridAngular],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `
    <!-- Toolbar -->
    <div
      style="display:flex;align-items:center;justify-content:space-between;padding:0 12px;height:28px;border-bottom:1px solid var(--ds-border-primary);background:var(--ds-surface-primary);flex-shrink:0"
    >
      <div style="display:flex;align-items:center;gap:6px">
        <button *ngFor="let f of quickFilters" class="pact">{{ f }}</button>
        <div style="width:1px;height:14px;background:var(--ds-border-secondary)"></div>
        <button class="pact">CSV</button>
        <button class="pact">Cols</button>
      </div>
      <span
        class="font-mono-fi"
        style="font-size:9px;padding:1px 6px;border-radius:2px;background:var(--ds-surface-tertiary);color:var(--ds-text-secondary);border:1px solid var(--ds-border-secondary)"
        >{{ filteredData.length }}</span
      >
    </div>
    <!-- Sector filters -->
    <div
      style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-bottom:1px solid var(--ds-border-primary);background:var(--ds-surface-ground);flex-shrink:0"
    >
      <button
        *ngFor="let s of sectors"
        (click)="sectorFilter = s"
        class="font-mono-fi"
        [style.fontSize.px]="9"
        [style.padding]="'2px 8px'"
        [style.borderRadius.px]="2"
        [style.background]="sectorFilter === s ? 'rgba(59,130,246,0.1)' : 'transparent'"
        [style.borderColor]="sectorFilter === s ? 'var(--ds-accent-info)' : 'var(--ds-border-secondary)'"
        [style.color]="sectorFilter === s ? 'var(--ds-accent-info)' : 'var(--ds-text-muted)'"
        style="border:1px solid;font-weight:500;letter-spacing:0.04em;text-transform:uppercase;cursor:pointer"
      >
        {{ s }}
      </button>
      <div style="margin-left:auto;position:relative">
        <input
          [(ngModel)]="search"
          placeholder="Ticker / CUSIP / Issuer..."
          class="font-mono-fi"
          style="height:24px;padding:0 8px 0 24px;width:176px;border-radius:2px;background:var(--ds-surface-secondary);color:var(--ds-text-primary);font-size:11px;border:1px solid var(--ds-border-secondary);outline:none"
        />
      </div>
    </div>
    <!-- Grid -->
    <div style="flex:1;overflow:hidden">
      <ag-grid-angular
        style="width:100%;height:100%"
        [theme]="gridTheme"
        [rowData]="filteredData"
        [columnDefs]="colDefs"
        [defaultColDef]="defaultColDef"
        [getRowId]="getRowId"
        [animateRows]="true"
        [headerHeight]="32"
        [rowHeight]="28"
        (gridReady)="onGridReady($event)"
        (rowClicked)="onRowClicked($event)"
      />
    </div>
  `,
})
export class BondBlotterWidget implements OnInit, OnDestroy {
  @Input() api: any;
  @Input() panel: any;

  private shared = inject(SharedStateService);
  private tickInterval: any;

  gridTheme = fiGridTheme;
  gridApi: GridApi<Bond> | null = null;
  rowData: Bond[] = [];
  search = '';
  sectorFilter = 'All';
  quickFilters = ['All', 'UST', 'Corp', 'Muni', 'Axes'];
  sectors = ['All', 'Government', 'Financials', 'Technology', 'Healthcare', 'Consumer', 'Telecom'];

  colDefs: ColDef<Bond>[] = [
    {
      field: 'ticker',
      headerName: 'TICKER',
      minWidth: 60,
      flex: 0.7,
      pinned: 'left',
      cellRenderer: TickerCellRenderer,
    },
    {
      field: 'issuer',
      headerName: 'ISSUER',
      minWidth: 100,
      flex: 1.2,
      cellStyle: { color: 'var(--ds-text-secondary)', fontSize: '11px' },
    },
    {
      field: 'cpn',
      headerName: 'CPN',
      minWidth: 55,
      flex: 0.6,
      valueFormatter: (p) => p.value?.toFixed(3),
      type: 'numericColumn',
    },
    {
      field: 'mat',
      headerName: 'MAT',
      minWidth: 50,
      flex: 0.5,
      cellStyle: { color: 'var(--ds-text-secondary)' },
    },
    {
      field: 'cusip',
      headerName: 'CUSIP',
      minWidth: 80,
      flex: 0.8,
      cellStyle: { color: 'var(--ds-text-muted)', fontSize: '9px' },
    },
    {
      field: 'rtg',
      headerName: 'RTG',
      minWidth: 45,
      flex: 0.5,
      cellRenderer: RatingBadgeRenderer,
    },
    {
      field: 'sector',
      headerName: 'SECTOR',
      minWidth: 70,
      flex: 0.8,
      cellStyle: { color: 'var(--ds-text-secondary)', fontSize: '9px' },
    },
    {
      field: 'bid',
      headerName: 'BID',
      minWidth: 65,
      flex: 0.7,
      type: 'numericColumn',
      cellStyle: { color: 'var(--ds-accent-info)', fontWeight: 600 },
      valueFormatter: (p) => Number(p.value).toFixed(3),
    },
    {
      field: 'ask',
      headerName: 'ASK',
      minWidth: 65,
      flex: 0.7,
      type: 'numericColumn',
      cellStyle: { color: 'var(--ds-accent-negative)', fontWeight: 600 },
      valueFormatter: (p) => Number(p.value).toFixed(3),
    },
    {
      colId: 'mid',
      headerName: 'MID',
      minWidth: 60,
      flex: 0.7,
      type: 'numericColumn',
      cellStyle: { color: 'var(--ds-text-secondary)' },
      valueGetter: (p) => (p.data ? (p.data.bid + p.data.ask) / 2 : 0),
      valueFormatter: (p) => Number(p.value).toFixed(3),
    },
    {
      field: 'ytm',
      headerName: 'YTM',
      minWidth: 50,
      flex: 0.6,
      valueFormatter: (p) => p.value?.toFixed(3),
      type: 'numericColumn',
    },
    {
      field: 'ytw',
      headerName: 'YTW',
      minWidth: 50,
      flex: 0.6,
      valueFormatter: (p) => p.value?.toFixed(3),
      type: 'numericColumn',
      cellStyle: { color: 'var(--ds-text-secondary)' },
    },
    {
      field: 'oas',
      headerName: 'OAS',
      minWidth: 50,
      flex: 0.5,
      type: 'numericColumn',
      cellRenderer: OasValueRenderer,
    },
    {
      field: 'dur',
      headerName: 'DUR',
      minWidth: 50,
      flex: 0.5,
      valueFormatter: (p) => p.value?.toFixed(2),
      type: 'numericColumn',
    },
    {
      field: 'dv01',
      headerName: 'DV01',
      minWidth: 50,
      flex: 0.6,
      valueFormatter: (p) => p.value?.toLocaleString(),
      type: 'numericColumn',
    },
    {
      field: 'gSpd',
      headerName: 'G-SPD',
      minWidth: 50,
      flex: 0.5,
      type: 'numericColumn',
      cellRenderer: SignedValueRenderer,
    },
    {
      field: 'cvx',
      headerName: 'CVX',
      minWidth: 45,
      flex: 0.5,
      valueFormatter: (p) => p.value?.toFixed(2),
      type: 'numericColumn',
    },
    {
      field: 'face',
      headerName: 'FACE',
      minWidth: 50,
      flex: 0.5,
      cellStyle: { color: 'var(--ds-text-secondary)' },
    },
    {
      field: 'side',
      headerName: 'SIDE',
      minWidth: 45,
      flex: 0.5,
      cellRenderer: SideCellRenderer,
    },
    {
      field: 'axes',
      headerName: 'AXES',
      minWidth: 50,
      flex: 0.5,
      cellStyle: { color: 'var(--ds-text-muted)', fontSize: '9px' },
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

  get filteredData(): Bond[] {
    return this.rowData.filter((b) => {
      const ms = this.sectorFilter === 'All' || b.sector === this.sectorFilter;
      const mq =
        !this.search ||
        [b.ticker, b.issuer, b.cusip].some((v) =>
          v.toLowerCase().includes(this.search.toLowerCase()),
        );
      return ms && mq;
    });
  }

  getRowId = (p: { data: Bond }) => p.data.id;

  ngOnInit() {
    this.rowData = BONDS.map((b) => ({ ...b }));
    this.tickInterval = setInterval(() => {
      const updates: Bond[] = [];
      this.rowData = this.rowData.map((b) => {
        if (Math.random() < 0.22) {
          const delta = (Math.random() - 0.5) * 0.05;
          const nb = { ...b, bid: +(b.bid + delta).toFixed(3), ask: +(b.ask + delta).toFixed(3) };
          updates.push(nb);
          return nb;
        }
        return b;
      });
      if (this.gridApi && updates.length) {
        this.gridApi.applyTransactionAsync({ update: updates });
      }
    }, 1200);
  }

  ngOnDestroy() {
    if (this.tickInterval) clearInterval(this.tickInterval);
  }

  onGridReady(e: GridReadyEvent) {
    this.gridApi = e.api;
  }

  onRowClicked(e: any) {
    if (e.data) this.shared.selectedBond.set(e.data);
  }
}
