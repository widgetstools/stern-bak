import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'risk-kpi-widget',
  standalone: true,
  imports: [CommonModule],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `
    <div style="display:grid;grid-template-columns:repeat(6,1fr);height:100%;overflow:hidden">
      <div
        *ngFor="let k of kpis; let i = index"
        style="background:var(--ds-surface-primary);padding:10px 14px;display:flex;flex-direction:column;justify-content:center"
        [style.borderRight]="i < 5 ? '1px solid var(--ds-border-primary)' : 'none'"
      >
        <div
          style="font-size:11px;color:var(--ds-text-secondary);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.05em"
        >
          {{ k.label }}
        </div>
        <div
          style="font-size:18px;font-weight:600;font-family:JetBrains Mono,monospace"
          [style.color]="k.color"
        >
          {{ k.val }}
        </div>
        <div
          style="font-size:9px;color:var(--ds-text-muted);margin-top:2px;font-family:JetBrains Mono,monospace"
        >
          {{ k.sub }}
        </div>
      </div>
    </div>
  `,
})
export class RiskKpiWidget {
  @Input() api: any;
  @Input() panel: any;
  kpis = [
    { label: 'Portfolio DV01', val: '$18,420', sub: 'per bp', color: 'var(--ds-accent-info)' },
    { label: 'Total MV', val: '$54.2M', sub: 'MTD +$1.4M', color: 'var(--ds-accent-info)' },
    { label: 'VaR 95% 1D', val: '-$248K', sub: 'within limit', color: 'var(--ds-accent-warning)' },
    { label: 'OAS Duration', val: '4.82 yrs', sub: 'mod duration', color: 'var(--ds-accent-info)' },
    { label: 'Spread PnL MTD', val: '+$142K', sub: 'vs bench +38K', color: 'var(--ds-accent-positive)' },
    { label: 'Credit Delta', val: '$8,240', sub: 'IG/HY blended', color: 'var(--ds-accent-info)' },
  ];
}
