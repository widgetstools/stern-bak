import { Component, Input, AfterViewInit, ElementRef, ViewChild, OnDestroy } from '@angular/core';
import { SCENARIO_DATA } from '../services/trading-data.service';

@Component({
  selector: 'scenario-chart-widget',
  standalone: true,
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `<div style="flex:1;position:relative;background:var(--ds-surface-primary)">
    <canvas #canvas style="width:100%;height:100%;display:block"></canvas>
  </div>`,
})
export class ScenarioChartWidget implements AfterViewInit, OnDestroy {
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
    const pad = { l: 50, r: 16, t: 16, b: 40 };
    ctx.clearRect(0, 0, W, H);
    const g = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    ctx.fillStyle = g('--ds-surface-primary');
    ctx.fillRect(0, 0, W, H);

    const maxAbs = Math.max(...SCENARIO_DATA.map((d) => Math.abs(d.total)));
    const barW = ((W - pad.l - pad.r) / SCENARIO_DATA.length) * 0.6;
    const gap = (W - pad.l - pad.r) / SCENARIO_DATA.length;
    const midY = pad.t + (H - pad.t - pad.b) / 2;

    // Grid + zero line
    ctx.strokeStyle = g('--ds-surface-secondary');
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(pad.l, midY);
    ctx.lineTo(W - pad.r, midY);
    ctx.stroke();

    SCENARIO_DATA.forEach((d, i) => {
      const x = pad.l + i * gap + (gap - barW) / 2;
      const barH = (Math.abs(d.total) / maxAbs) * ((H - pad.t - pad.b) / 2);
      const color = d.total >= 0 ? 'var(--ds-accent-info)' : g('--ds-accent-negative');
      ctx.fillStyle = color;
      if (d.total >= 0) {
        ctx.beginPath();
        ctx.roundRect(x, midY - barH, barW, barH, [2, 2, 0, 0]);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.roundRect(x, midY, barW, barH, [0, 0, 2, 2]);
        ctx.fill();
      }
      ctx.fillStyle = g('--ds-text-muted');
      ctx.font = '9px JetBrains Mono,monospace';
      ctx.textAlign = 'center';
      ctx.fillText(d.scenario, x + barW / 2, H - pad.b + 14);
    });
  }
}
