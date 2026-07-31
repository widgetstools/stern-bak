import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgGridAngular } from 'ag-grid-angular';

import { ModuleRegistry, type ColDef, type GridApi, type GridReadyEvent } from 'ag-grid-community';
import { AllEnterpriseModule, LicenseManager } from 'ag-grid-enterprise';
import { fiGridTheme } from '../services/ag-grid-theme';
import { MARKET_INDICES, type MarketIndex } from '../services/trading-data.service';
import { ChangeValueRenderer, YtdValueRenderer } from '../services/cell-renderers';

ModuleRegistry.registerModules([AllEnterpriseModule]);
LicenseManager.setLicenseKey('');

@Component({
  selector: 'market-indices-widget',
  standalone: true,
  imports: [CommonModule, AgGridAngular],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `
    <div
      style="display:flex;flex-direction:column;height:100%;background:var(--ds-surface-primary);overflow:hidden"
    >
      <div style="flex:1;overflow:hidden">
        <ag-grid-angular
          style="width:100%;height:100%"
          [theme]="gridTheme"
          [rowData]="indices"
          [columnDefs]="colDefs"
          [defaultColDef]="defaultColDef"
          [headerHeight]="28"
          [rowHeight]="26"
          [getRowId]="getRowId"
          (gridReady)="onGridReady($event)"
        />
      </div>
    </div>
  `,
})
export class MarketIndicesWidget implements OnInit, OnDestroy {
  @Input() api: any;
  @Input() panel: any;

  gridTheme = fiGridTheme;
  gridApi: GridApi | null = null;
  indices: MarketIndex[] = [];
  private tickId: any;

  colDefs: ColDef<MarketIndex>[] = [
    {
      field: 'name',
      headerName: 'INDEX',
      flex: 1.5,
      cellStyle: { color: 'var(--ds-text-primary)' },
    },
    {
      field: 'val',
      headerName: 'LAST',
      flex: 0.8,
      type: 'numericColumn',
      valueFormatter: (p) => p.value?.toFixed(2),
    },
    {
      field: 'chg',
      headerName: 'CHG',
      flex: 0.8,
      type: 'numericColumn',
      cellRenderer: ChangeValueRenderer,
    },
    {
      field: 'ytd',
      headerName: 'YTD',
      flex: 0.8,
      type: 'numericColumn',
      cellRenderer: YtdValueRenderer,
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

  getRowId = (p: { data: MarketIndex }) => p.data.name;

  onGridReady(e: GridReadyEvent) {
    this.gridApi = e.api;
  }

  ngOnInit() {
    this.indices = MARKET_INDICES.map((i) => ({ ...i }));
    this.tickId = setInterval(() => {
      this.indices = this.indices.map((idx) => {
        if (Math.random() < 0.3) {
          const delta = (Math.random() - 0.5) * 0.08;
          return { ...idx, val: +(idx.val + delta).toFixed(2), chg: +(idx.chg + delta).toFixed(2) };
        }
        return idx;
      });
    }, 1800);
  }

  ngOnDestroy() {
    if (this.tickId) clearInterval(this.tickId);
  }
}
