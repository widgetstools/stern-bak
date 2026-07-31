import { Component, Input, AfterViewInit, ElementRef, ViewChild, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { INTRADAY } from '../services/trading-data.service';

@Component({
  selector: 'intraday-chart-widget',
  standalone: true,
  imports: [CommonModule],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `
    <div
      style="display:flex;flex-direction:column;height:100%;background:var(--ds-surface-primary);overflow:hidden"
    >
      <div style="display:flex;justify-content:flex-end;padding:4px 10px;flex-shrink:0">
        <button
          *ngFor="let k of keys"
          (click)="selected = k; draw()"
          class="font-mono-fi"
          style="font-size:9px;padding:2px 8px;margin-left:3px;border-radius:2px;cursor:pointer"
          [style.background]="selected === k ? 'var(--ds-border-primary)' : 'transparent'"
          [style.border]="'1px solid var(--ds-border-primary)'"
          [style.color]="selected === k ? 'var(--ds-text-primary)' : 'var(--ds-text-secondary)'"
        >
          {{ k }}
        </button>
      </div>
      <div style="flex:1;position:relative">
        <canvas #canvas style="width:100%;height:100%;display:block"></canvas>
      </div>
    </div>
  `,
})
export class IntradayChartWidget implements AfterViewInit, OnDestroy {
  @Input() api: any;
  @Input() panel: any;
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  private obs?: ResizeObserver;
  keys = Object.keys(INTRADAY);
  selected = 'UST 10Y';

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

  draw() {
    if (!this.canvasRef) return;
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const series = INTRADAY[this.selected] || INTRADAY['UST 10Y'];
    const W = canvas.width,
      H = canvas.height;
    const pad = { l: 44, r: 16, t: 8, b: 24 };
    ctx.clearRect(0, 0, W, H);
    const g = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    ctx.fillStyle = g('--ds-surface-primary');
    ctx.fillRect(0, 0, W, H);

    const vals = series.map((s) => s.v);
    const minV = Math.min(...vals) * 0.999,
      maxV = Math.max(...vals) * 1.001;
    const n = series.length;
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
      ctx.fillText(val.toFixed(2), pad.l - 4, y + 3);
    }

    // Area fill
    const grad = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
    grad.addColorStop(0, 'rgba(59,130,246,0.15)');
    grad.addColorStop(1, 'rgba(59,130,246,0)');
    ctx.beginPath();
    series.forEach((s, i) => {
      i === 0 ? ctx.moveTo(xOf(i), yOf(s.v)) : ctx.lineTo(xOf(i), yOf(s.v));
    });
    ctx.lineTo(xOf(n - 1), H - pad.b);
    ctx.lineTo(pad.l, H - pad.b);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = 'var(--ds-accent-info)';
    ctx.lineWidth = 1.8;
    series.forEach((s, i) => {
      i === 0 ? ctx.moveTo(xOf(i), yOf(s.v)) : ctx.lineTo(xOf(i), yOf(s.v));
    });
    ctx.stroke();
  }
}
