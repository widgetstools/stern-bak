import { Component, Input, AfterViewInit, ElementRef, ViewChild, OnDestroy } from '@angular/core';
import { VAR_DATA } from '../services/trading-data.service';

@Component({
  selector: 'var-trend-widget',
  standalone: true,
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `<div style="flex:1;position:relative;background:var(--ds-surface-primary)">
    <canvas #canvas style="width:100%;height:100%;display:block"></canvas>
  </div>`,
})
export class VarTrendWidget implements AfterViewInit, OnDestroy {
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
    const pad = { l: 50, r: 16, t: 12, b: 20 };
    ctx.clearRect(0, 0, W, H);
    const g = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    ctx.fillStyle = g('--ds-surface-primary');
    ctx.fillRect(0, 0, W, H);

    const minV = Math.min(...VAR_DATA.map((d) => d.var));
    const maxV = Math.max(...VAR_DATA.map((d) => d.var));
    const n = VAR_DATA.length;
    const xOf = (i: number) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
    const yOf = (v: number) => pad.t + (1 - (v - minV) / (maxV - minV)) * (H - pad.t - pad.b);

    // Grid
    ctx.strokeStyle = g('--ds-surface-secondary');
    ctx.lineWidth = 0.5;
    for (let i = 1; i <= 3; i++) {
      const y = pad.t + ((H - pad.t - pad.b) * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(W - pad.r, y);
      ctx.stroke();
      const val = maxV - ((maxV - minV) * i) / 4;
      ctx.fillStyle = g('--ds-text-muted');
      ctx.font = '8px JetBrains Mono,monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`$${Math.abs(val).toFixed(0)}K`, pad.l - 4, y + 3);
    }

    // Line
    ctx.beginPath();
    ctx.strokeStyle = 'var(--ds-accent-warning)';
    ctx.lineWidth = 1.5;
    VAR_DATA.forEach((d, i) => {
      i === 0 ? ctx.moveTo(xOf(i), yOf(d.var)) : ctx.lineTo(xOf(i), yOf(d.var));
    });
    ctx.stroke();
  }
}
