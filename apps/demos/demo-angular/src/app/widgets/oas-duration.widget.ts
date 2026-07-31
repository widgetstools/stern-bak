import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UIChart } from 'primeng/chart';
import { BONDS } from '../services/trading-data.service';

const SCATTER_DATA = BONDS.map((b) => ({
  name: b.ticker,
  x: b.dur,
  y: b.oas,
  r: Math.min(5 + b.dv01 / 300, 10),
  rtg: b.rtgClass,
}));

const RTG_COLOR: Record<string, string> = {
  aaa: 'var(--ds-accent-info)',
  aa: 'var(--ds-accent-info)',
  a: 'var(--ds-accent-positive)',
  bbb: 'var(--ds-accent-warning)',
  hy: 'var(--ds-accent-negative)',
};

const rtgGroups = Object.keys(RTG_COLOR);

@Component({
  selector: 'oas-duration-widget',
  standalone: true,
  imports: [CommonModule, UIChart],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `
    <div
      style="display:flex;flex-direction:column;height:100%;background:var(--ds-surface-primary);overflow:hidden"
    >
      <div style="flex:1;padding:8px 6px 0">
        <p-chart
          type="bubble"
          [data]="chartData"
          [options]="chartOptions"
          width="100%"
          height="100%"
        />
      </div>
      <div style="display:flex;gap:10px;padding:4px 14px 8px;flex-shrink:0">
        <div *ngFor="let item of legend" style="display:flex;align-items:center;gap:4px">
          <div [style.background]="item.color" style="width:7px;height:7px;border-radius:50%"></div>
          <span style="font-size:9px;color:var(--ds-text-muted);font-family:JetBrains Mono,monospace">{{
            item.label
          }}</span>
        </div>
      </div>
    </div>
  `,
})
export class OasDurationWidget implements OnInit {
  @Input() api: any;
  @Input() panel: any;

  legend = rtgGroups.map((r) => ({ label: r.toUpperCase(), color: RTG_COLOR[r] }));
  chartData: any = {};
  chartOptions: any = {};

  ngOnInit() {
    this.chartData = {
      datasets: rtgGroups.map((rtg) => ({
        label: rtg.toUpperCase(),
        data: SCATTER_DATA.filter((d) => d.rtg === rtg).map((d) => ({ x: d.x, y: d.y, r: d.r })),
        backgroundColor: RTG_COLOR[rtg] + 'bf',
        borderColor: RTG_COLOR[rtg],
        borderWidth: 1,
      })),
    };

    this.chartOptions = {
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
            label: (ctx: any) => {
              const pt = ctx.raw;
              return ` Dur: ${pt.x.toFixed(1)}yr  OAS: +${pt.y}bp`;
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Duration (yrs)',
            color: 'var(--ds-text-muted)',
            font: { size: 9, family: 'JetBrains Mono,monospace' },
          },
          ticks: { color: 'var(--ds-text-muted)', font: { size: 9, family: 'JetBrains Mono,monospace' } },
          grid: { color: 'rgba(255,255,255,0.06)' },
        },
        y: {
          ticks: {
            color: 'var(--ds-text-muted)',
            font: { size: 9, family: 'JetBrains Mono,monospace' },
            callback: (v: number) => `+${v}`,
          },
          grid: { color: 'rgba(255,255,255,0.06)' },
        },
      },
    };
  }
}
