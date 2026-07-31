import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UIChart } from 'primeng/chart';
import { DURATION_BUCKETS, BUCKET_RANGES, BONDS } from '../services/trading-data.service';

const BUCKET_DETAIL = DURATION_BUCKETS.map((d, i) => {
  const [lo, hi] = BUCKET_RANGES[i];
  const bonds = BONDS.filter((b) => b.dur >= lo && b.dur < hi);
  const avgOas = bonds.length ? Math.round(bonds.reduce((a, b) => a + b.oas, 0) / bonds.length) : 0;
  return { ...d, avgOas, bonds: bonds.length };
});
const totalDv01All = BUCKET_DETAIL.reduce((a, d) => a + d.dv01, 0);

@Component({
  selector: 'duration-buckets-widget',
  standalone: true,
  imports: [CommonModule, UIChart],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `
    <div
      style="display:flex;flex-direction:column;height:100%;background:var(--ds-surface-primary);overflow:hidden"
    >
      <div style="flex:1;padding:8px 6px 0">
        <p-chart
          type="bar"
          [data]="chartData"
          [options]="chartOptions"
          width="100%"
          height="100%"
        />
      </div>
      <div
        style="display:flex;gap:14px;padding:6px 14px;border-top:1px solid var(--ds-border-primary);flex-shrink:0"
      >
        <div *ngFor="let s of summary" style="display:flex;align-items:center;gap:4px">
          <span style="font-size:9px;color:var(--ds-text-muted)">{{ s.l }}</span>
          <span class="font-mono-fi font-semibold" style="font-size:11px" [style.color]="s.c">{{
            s.v
          }}</span>
        </div>
      </div>
    </div>
  `,
})
export class DurationBucketsWidget {
  @Input() api: any;
  @Input() panel: any;

  summary = [
    { l: 'Total DV01', v: `$${(totalDv01All / 1000).toFixed(1)}K`, c: 'var(--ds-accent-info)' },
    { l: 'Avg Dur', v: '4.82yr', c: 'var(--ds-accent-info)' },
    { l: 'Bonds', v: String(BUCKET_DETAIL.reduce((a, d) => a + d.bonds, 0)), c: 'var(--ds-text-primary)' },
    {
      l: 'Wt Avg OAS',
      v: `+${Math.round(BUCKET_DETAIL.reduce((a, d) => a + d.avgOas * d.bonds, 0) / BUCKET_DETAIL.reduce((a, d) => a + d.bonds, 0))}bp`,
      c: 'var(--ds-accent-warning)',
    },
  ];

  chartData = {
    labels: BUCKET_DETAIL.map((d) => d.label),
    datasets: [
      {
        label: 'DV01',
        data: BUCKET_DETAIL.map((d) => d.dv01),
        backgroundColor: 'rgba(59,130,246,0.8)',
        borderRadius: 3,
        barPercentage: 0.6,
        yAxisID: 'dv01',
      },
      {
        label: 'Avg OAS',
        data: BUCKET_DETAIL.map((d) => d.avgOas),
        backgroundColor: 'rgba(255,140,66,0.7)',
        borderRadius: 3,
        barPercentage: 0.5,
        yAxisID: 'oas',
      },
    ],
  };

  chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        align: 'end' as const,
        labels: {
          color: 'var(--ds-text-muted)',
          font: { size: 9, family: 'JetBrains Mono,monospace' },
          boxWidth: 10,
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
        ticks: { color: 'var(--ds-text-muted)', font: { size: 9, family: 'JetBrains Mono,monospace' } },
        grid: { display: false },
      },
      dv01: {
        position: 'left' as const,
        ticks: {
          color: 'var(--ds-text-muted)',
          font: { size: 9, family: 'JetBrains Mono,monospace' },
          callback: (v: number) => `$${(v / 1000).toFixed(0)}K`,
        },
        grid: { color: 'rgba(255,255,255,0.06)' },
      },
      oas: {
        position: 'right' as const,
        ticks: {
          color: 'var(--ds-text-muted)',
          font: { size: 9, family: 'JetBrains Mono,monospace' },
          callback: (v: number) => `${v}bp`,
        },
        grid: { display: false },
      },
    },
  };
}
