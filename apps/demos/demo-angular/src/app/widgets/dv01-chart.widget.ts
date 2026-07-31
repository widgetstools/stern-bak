import { Component, Input, AfterViewInit, ElementRef, ViewChild, OnDestroy } from '@angular/core';
import { RISK_POSITIONS } from '../services/trading-data.service';

const DV01_DATA = RISK_POSITIONS.map((p) => ({ name: p.book, dv01: p.dv01, pnl: p.pnl }));
const BAR_COLORS = ['var(--ds-accent-info)', 'var(--ds-accent-negative)', 'var(--ds-accent-info)', 'var(--ds-accent-info)', 'var(--ds-accent-info)'];

@Component({
  selector: 'dv01-chart-widget',
  standalone: true,
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `<div style="flex:1;position:relative;background:var(--ds-surface-primary)">
    <canvas #canvas style="width:100%;height:100%;display:block"></canvas>
  </div>`,
})
export class Dv01ChartWidget implements AfterViewInit, OnDestroy {
  @Input() api: any;
  @Input() panel: any;
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  private obs?: ResizeObserver;

  ngAfterViewInit() {
    const canvas = this.canvasRef.nativeElement;
    this.obs = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      this.draw();
    });
    this.obs.observe(canvas.parentElement!);
    canvas.width = canvas.offsetWidth || 400;
    canvas.height = canvas.offsetHeight || 200;
    this.draw();
  }
  ngOnDestroy() {
    this.obs?.disconnect();
  }

  private draw() {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width,
      H = canvas.height;
    const pad = { l: 60, r: 16, t: 16, b: 40 };
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ds-surface-primary').trim();
    ctx.fillRect(0, 0, W, H);

    const maxVal = Math.max(...DV01_DATA.map((d) => d.dv01));
    const barW = ((W - pad.l - pad.r) / DV01_DATA.length) * 0.6;
    const gap = (W - pad.l - pad.r) / DV01_DATA.length;

    // Grid
    ctx.strokeStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--ds-surface-secondary')
      .trim();
    ctx.lineWidth = 0.5;
    for (let i = 1; i <= 4; i++) {
      const y = pad.t + (H - pad.t - pad.b) * (1 - i / 4);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(W - pad.r, y);
      ctx.stroke();
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ds-text-muted').trim();
      ctx.font = '9px JetBrains Mono,monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`$${((maxVal * i) / 4 / 1000).toFixed(0)}K`, pad.l - 4, y + 3);
    }

    DV01_DATA.forEach((d, i) => {
      const x = pad.l + i * gap + (gap - barW) / 2;
      const barH = (d.dv01 / maxVal) * (H - pad.t - pad.b);
      const y = H - pad.b - barH;
      ctx.fillStyle = BAR_COLORS[i % BAR_COLORS.length];
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, [2, 2, 0, 0]);
      ctx.fill();
      // Label
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ds-text-muted').trim();
      ctx.font = '9px JetBrains Mono,monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        d.name.replace('CREDIT-', '').replace('RATES-', ''),
        x + barW / 2,
        H - pad.b + 14,
      );
    });
  }
}
