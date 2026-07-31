import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgGridAngular } from 'ag-grid-angular';

import { ModuleRegistry, type ColDef } from 'ag-grid-community';
import { AllEnterpriseModule, LicenseManager } from 'ag-grid-enterprise';
import { fiGridTheme } from '../services/ag-grid-theme';
import { RISK_POSITIONS, BONDS } from '../services/trading-data.service';
import { BookNameRenderer, OasValueRenderer, PnlValueRenderer } from '../services/cell-renderers';

const HEAT_COLORS = ['var(--ds-accent-info)', 'var(--ds-accent-info)', 'var(--ds-accent-warning)', 'var(--ds-accent-warning)', 'var(--ds-accent-negative)', 'var(--ds-accent-negative)'];
const heatLevel = (oas: number) =>
  oas < 20 ? 0 : oas < 50 ? 1 : oas < 100 ? 2 : oas < 150 ? 3 : oas < 250 ? 4 : 5;

ModuleRegistry.registerModules([AllEnterpriseModule]);
LicenseManager.setLicenseKey('');

@Component({
  selector: 'book-risk-widget',
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
          [rowData]="positions"
          [columnDefs]="colDefs"
          [defaultColDef]="defaultColDef"
          [headerHeight]="28"
          [rowHeight]="26"
        />
      </div>
      <!-- OAS heatmap -->
      <div style="border-top:1px solid var(--ds-border-primary);flex-shrink:0">
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:8px">
          <div
            *ngFor="let b of heatBonds"
            style="display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:3px;padding:5px 2px"
            [style.background]="getHeatBg(b.oas)"
            [style.border]="'1px solid ' + getHeatBorder(b.oas)"
          >
            <div
              style="font-size:9px;font-weight:700;font-family:JetBrains Mono,monospace"
              [style.color]="getHeatColor(b.oas)"
            >
              {{ b.ticker }}
            </div>
            <div style="font-size:9px;color:var(--ds-text-muted);font-family:JetBrains Mono,monospace">
              {{ b.oas > 0 ? '+' + b.oas : b.oas }}
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class BookRiskWidget {
  @Input() api: any;
  @Input() panel: any;

  gridTheme = fiGridTheme;
  positions = RISK_POSITIONS;
  heatBonds = BONDS.slice(0, 16);

  colDefs: ColDef[] = [
    {
      field: 'book',
      headerName: 'BOOK',
      flex: 1,
      cellRenderer: BookNameRenderer,
    },
    {
      field: 'mv',
      headerName: 'MV',
      flex: 0.7,
      type: 'numericColumn',
    },
    {
      field: 'dv01',
      headerName: 'DV01',
      flex: 0.7,
      type: 'numericColumn',
      cellStyle: { color: 'var(--ds-accent-info)' },
      valueFormatter: (p) => p.value?.toLocaleString(),
    },
    {
      field: 'oas',
      headerName: 'OAS',
      flex: 0.7,
      type: 'numericColumn',
      cellRenderer: OasValueRenderer,
    },
    {
      field: 'pnl',
      headerName: 'P&L',
      flex: 0.7,
      type: 'numericColumn',
      cellRenderer: PnlValueRenderer,
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

  getHeatColor(oas: number) {
    return HEAT_COLORS[heatLevel(oas)];
  }
  getHeatBg(oas: number) {
    return HEAT_COLORS[heatLevel(oas)] + '1a';
  }
  getHeatBorder(oas: number) {
    return HEAT_COLORS[heatLevel(oas)] + '30';
  }
}
