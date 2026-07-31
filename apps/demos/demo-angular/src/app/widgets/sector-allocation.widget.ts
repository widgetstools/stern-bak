import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UIChart } from 'primeng/chart';
import { BONDS, SECTOR_ALLOC, SECTOR_COLORS } from '../services/trading-data.service';

function resolveCssColor(c: string): string {
  if (!c.startsWith('var(')) return c;
  const name = c.slice(4, -1).trim();
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || c;
}

const SECTOR_MAP = SECTOR_ALLOC.map((s) => {
  const bonds = BONDS.filter((b) => b.sector === s.sector);
  const mv = bonds.reduce((a, b) => a + parseFloat(b.face), 0);
  return { name: s.sector, value: mv };
});
const totalMv = SECTOR_MAP.reduce((a, s) => a + s.value, 0);

@Component({
  selector: 'sector-allocation-widget',
  standalone: true,
  imports: [CommonModule, UIChart],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `
    <div
      style="display:flex;flex-direction:column;height:100%;background:var(--ds-surface-primary);overflow:hidden"
    >
      <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:8px">
        <p-chart
          type="doughnut"
          [data]="chartData"
          [options]="chartOptions"
          width="100%"
          height="100%"
        />
      </div>
      <div
        style="display:flex;flex-wrap:wrap;gap:8px;padding:4px 14px 8px;flex-shrink:0;justify-content:center"
      >
        <div *ngFor="let s of legendItems" style="display:flex;align-items:center;gap:4px">
          <div
            [style.background]="s.color"
            style="width:7px;height:7px;border-radius:2px;flex-shrink:0"
          ></div>
          <span
            style="font-size:9px;color:var(--ds-text-muted);font-family:JetBrains Mono,monospace;white-space:nowrap"
            >{{ s.name }}</span
          >
        </div>
      </div>
    </div>
  `,
})
export class SectorAllocationWidget implements OnInit {
  @Input() api: any;
  @Input() panel: any;

  chartData: any = {};
  chartOptions: any = {};
  legendItems: { name: string; color: string }[] = [];

  ngOnInit() {
    const colors = SECTOR_COLORS.map(resolveCssColor);
    this.legendItems = SECTOR_MAP.map((s, i) => ({
      name: s.name,
      color: colors[i % colors.length],
    }));

    this.chartData = {
      labels: SECTOR_MAP.map((s) => s.name),
      datasets: [
        {
          data: SECTOR_MAP.map((s) => s.value),
          backgroundColor: colors,
          borderColor: 'var(--ds-surface-primary)',
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    };

    this.chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '45%',
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
              const pct = totalMv > 0 ? ((ctx.raw / totalMv) * 100).toFixed(1) : '0';
              return ` $${ctx.raw}MM · ${pct}%`;
            },
          },
        },
      },
    };
  }
}
