import { Component, Input, AfterViewInit, ElementRef, ViewChild, OnDestroy } from '@angular/core';
import { YC_CHART_DATA } from '../services/trading-data.service';

@Component({
  selector: 'yield-curve-widget',
  standalone: true,
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `<div style="flex:1;position:relative;background:var(--ds-surface-primary)">
    <canvas #canvas style="width:100%;height:100%;display:block"></canvas>
  </div>`,
})
export class YieldCurveWidget implements AfterViewInit, OnDestroy {
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
    const data = YC_CHART_DATA;
    const W = canvas.width,
      H = canvas.height;
    const pad = { l: 40, r: 16, t: 16, b: 28 };
    ctx.clearRect(0, 0, W, H);
    const g = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    ctx.fillStyle = g('--ds-surface-primary');
    ctx.fillRect(0, 0, W, H);

    const allVals = data.flatMap((d) => [d.today, d.week, d.month]);
    const minV = Math.min(...allVals) * 0.99,
      maxV = Math.max(...allVals) * 1.01;
    const n = data.length;
    const xOf = (i: number) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
    const yOf = (v: number) => pad.t + (1 - (v - minV) / (maxV - minV)) * (H - pad.t - pad.b);

    // Grid
    ctx.strokeStyle = g('--ds-surface-secondary');
    ctx.lineWidth = 0.5;
    for (let i = 1; i <= 4; i++) {
      const y = pad.t + ((H - pad.t - pad.b) * i) / 5;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(W - pad.r, y);
      ctx.stroke();
      const val = maxV - ((maxV - minV) * i) / 5;
      ctx.fillStyle = g('--ds-text-muted');
      ctx.font = '9px JetBrains Mono,monospace';
      ctx.textAlign = 'right';
      ctx.fillText(val.toFixed(2), pad.l - 4, y + 3);
    }
    // X labels
    data.forEach((d, i) => {
      ctx.fillStyle = g('--ds-text-muted');
      ctx.font = '9px JetBrains Mono,monospace';
      ctx.textAlign = 'center';
      ctx.fillText(d.tenor, xOf(i), H - pad.b + 14);
    });

    // Lines
    const drawLine = (
      key: 'today' | 'week' | 'month',
      color: string,
      width: number,
      dash: number[],
    ) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      data.forEach((d, i) => {
        i === 0 ? ctx.moveTo(xOf(i), yOf(d[key])) : ctx.lineTo(xOf(i), yOf(d[key]));
      });
      ctx.stroke();
      ctx.setLineDash([]);
    };
    drawLine('month', g('--ds-surface-secondary'), 1, [2, 4]);
    drawLine('week', g('--ds-border-primary'), 1.2, [4, 4]);
    drawLine('today', 'var(--ds-accent-info)', 2, []);

    // Today dots
    data.forEach((d, i) => {
      ctx.beginPath();
      ctx.arc(xOf(i), yOf(d.today), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'var(--ds-accent-info)';
      ctx.fill();
    });

    // Legend
    ctx.textAlign = 'left';
    [
      ['Today', 'var(--ds-accent-info)'],
      ['-1 Week', g('--ds-border-primary')],
      ['-1 Month', g('--ds-surface-secondary')],
    ].forEach(([label, color], idx) => {
      ctx.fillStyle = color as string;
      ctx.fillRect(pad.l + idx * 80, 4, 12, 3);
      ctx.fillStyle = g('--ds-text-muted');
      ctx.font = '8px JetBrains Mono,monospace';
      ctx.fillText(label as string, pad.l + idx * 80 + 16, 8);
    });
  }
}
