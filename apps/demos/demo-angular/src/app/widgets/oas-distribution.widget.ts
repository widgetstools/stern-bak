import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UIChart } from 'primeng/chart';
import { OAS_DATA } from '../services/trading-data.service';

const sorted = [...OAS_DATA].sort((a, b) => b.oas - a.oas);

@Component({
  selector: 'oas-distribution-widget',
  standalone: true,
  imports: [CommonModule, UIChart],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `
    <div
      style="display:flex;flex-direction:column;height:100%;background:var(--ds-surface-primary);overflow:hidden"
    >
      <div style="flex:1;padding:8px 6px">
        <p-chart
          type="bar"
          [data]="chartData"
          [options]="chartOptions"
          width="100%"
          height="100%"
        />
      </div>
    </div>
  `,
})
export class OasDistributionWidget implements OnInit {
  @Input() api: any;
  @Input() panel: any;

  chartData: any = {};
  chartOptions: any = {};

  ngOnInit() {
    const colors = sorted.map((d) => {
      if ((d as any).color && !(d as any).color.startsWith('var(')) return (d as any).color;
      return 'var(--ds-accent-info)';
    });

    this.chartData = {
      labels: sorted.map((d) => d.name),
      datasets: [
        {
          label: 'OAS',
          data: sorted.map((d) => d.oas),
          backgroundColor: colors.map((c) => c + 'cc'),
          borderColor: colors,
          borderWidth: 1,
          borderRadius: 3,
          barPercentage: 0.7,
        },
      ],
    };

    this.chartOptions = {
      indexAxis: 'y' as const,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(30,35,45,0.95)',
          titleFont: { size: 11, family: 'JetBrains Mono,monospace' },
          bodyFont: { size: 11, family: 'JetBrains Mono,monospace' },
          padding: 8,
          cornerRadius: 3,
          callbacks: {
            label: (ctx: any) => ` OAS: +${ctx.raw}bp`,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: 'var(--ds-text-muted)',
            font: { size: 9, family: 'JetBrains Mono,monospace' },
            callback: (v: number) => `+${v}bp`,
          },
          grid: { color: 'rgba(255,255,255,0.06)' },
        },
        y: {
          ticks: { color: 'var(--ds-text-muted)', font: { size: 9, family: 'JetBrains Mono,monospace' } },
          grid: { display: false },
        },
      },
    };
  }
}
