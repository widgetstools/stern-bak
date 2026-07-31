import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UIChart } from 'primeng/chart';
import { HIST_OAS } from '../services/trading-data.service';

@Component({
  selector: 'historical-oas-widget',
  standalone: true,
  imports: [CommonModule, UIChart],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `
    <div
      style="display:flex;flex-direction:column;height:100%;background:var(--ds-surface-primary);overflow:hidden"
    >
      <div style="display:flex;justify-content:flex-end;padding:4px 10px;flex-shrink:0">
        <button
          *ngFor="let p of periods"
          (click)="period = p"
          class="font-mono-fi"
          style="font-size:9px;padding:2px 6px;margin-left:3px;border-radius:2px;cursor:pointer"
          [style.background]="period === p ? 'var(--ds-border-primary)' : 'transparent'"
          [style.border]="'1px solid var(--ds-border-primary)'"
          [style.color]="period === p ? 'var(--ds-text-primary)' : 'var(--ds-text-secondary)'"
        >
          {{ p }}
        </button>
      </div>
      <div style="flex:1;padding:0 6px 8px">
        <p-chart
          type="line"
          [data]="chartData"
          [options]="chartOptions"
          width="100%"
          height="100%"
        />
      </div>
    </div>
  `,
})
export class HistoricalOasWidget implements OnInit {
  @Input() api: any;
  @Input() panel: any;
  periods = ['1M', '3M', '6M', '1Y'];
  period = '3M';

  chartData: any = {};
  chartOptions: any = {};

  ngOnInit() {
    this.chartData = {
      labels: HIST_OAS.map((d) => d.date),
      datasets: [
        {
          label: 'CDX IG',
          data: HIST_OAS.map((d) => d.ig),
          borderColor: 'var(--ds-accent-info)',
          backgroundColor: 'rgba(59,130,246,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 1.5,
          yAxisID: 'ig',
        },
        {
          label: 'CDX HY',
          data: HIST_OAS.map((d) => d.hy),
          borderColor: 'var(--ds-accent-negative)',
          backgroundColor: 'rgba(255,77,109,0.06)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 1.5,
          yAxisID: 'hy',
        },
      ],
    };

    this.chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
          align: 'start' as const,
          labels: {
            color: 'var(--ds-text-muted)',
            font: { size: 9, family: 'JetBrains Mono,monospace' },
            boxWidth: 12,
            padding: 8,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(30,35,45,0.95)',
          titleFont: { size: 11, family: 'JetBrains Mono,monospace' },
          bodyFont: { size: 11, family: 'JetBrains Mono,monospace' },
          padding: 8,
          cornerRadius: 3,
        },
      },
      scales: {
        x: {
          ticks: {
            color: 'var(--ds-text-muted)',
            font: { size: 9, family: 'JetBrains Mono,monospace' },
            maxTicksLimit: 8,
          },
          grid: { display: false },
        },
        ig: {
          position: 'left' as const,
          ticks: { color: 'var(--ds-text-muted)', font: { size: 9, family: 'JetBrains Mono,monospace' } },
          grid: { color: 'rgba(255,255,255,0.06)' },
        },
        hy: {
          position: 'right' as const,
          ticks: { color: 'var(--ds-text-muted)', font: { size: 9, family: 'JetBrains Mono,monospace' } },
          grid: { display: false },
        },
      },
    };
  }
}
