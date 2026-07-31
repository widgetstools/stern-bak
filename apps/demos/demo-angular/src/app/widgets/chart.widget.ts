import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  ViewChild,
  inject,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedStateService } from '../services/shared-state.service';
import { type Bond } from '../services/trading-data.service';

interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

function generateCandles(base: number, n = 120): Candle[] {
  const candles: Candle[] = [];
  let price = base * 0.96;
  const now = Date.now();
  for (let i = n; i >= 0; i--) {
    const o = price;
    const move = (Math.random() - 0.48) * base * 0.006;
    const c = Math.max(base * 0.85, Math.min(base * 1.15, o + move));
    const range = Math.abs(c - o) * (1 + Math.random());
    const h = Math.max(o, c) + range * Math.random() * 0.5;
    const l = Math.min(o, c) - range * Math.random() * 0.5;
    const v = Math.random() * 500 + 50;
    candles.push({ t: now - i * 24 * 3600000, o, h, l, c, v });
    price = c;
  }
  return candles;
}

function calcMA(candles: Candle[], period: number): number[] {
  return candles.map((_, i) =>
    i < period - 1 ? 0 : candles.slice(i - period + 1, i + 1).reduce((s, c) => s + c.c, 0) / period,
  );
}

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

@Component({
  selector: 'chart-widget',
  standalone: true,
  imports: [CommonModule],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `
    <!-- Toolbar — compact, wraps on narrow containers -->
    <div
      style="display:flex;flex-wrap:wrap;align-items:center;gap:2px;padding:4px 8px;border-bottom:1px solid var(--ds-border-primary);flex-shrink:0;min-height:28px"
    >
      <button
        *ngFor="let iv of intervals"
        (click)="interval = iv"
        class="font-mono-fi"
        [style.background]="interval === iv ? 'var(--ds-surface-tertiary)' : 'transparent'"
        [style.color]="interval === iv ? 'var(--ds-accent-info)' : 'var(--ds-text-secondary)'"
        style="font-size:11px;padding:2px 6px;line-height:16px;border-radius:4px;border:none;cursor:pointer"
      >
        {{ iv }}
      </button>
      <div
        style="width:1px;height:12px;background:var(--ds-border-secondary);margin:0 2px;flex-shrink:0"
      ></div>
      <span
        *ngFor="let ind of indicators"
        class="font-mono-fi"
        style="font-size:11px;padding:2px 5px;line-height:16px;border-radius:4px;background:var(--ds-surface-tertiary);color:var(--ds-text-secondary);cursor:pointer"
        >{{ ind }}</span
      >
      <div style="flex:1 1 0;min-width:4px"></div>
      <div style="display:flex;align-items:center;gap:2px">
        <button
          *ngFor="let ct of chartTypes"
          (click)="chartType = ct"
          class="font-mono-fi"
          [style.background]="chartType === ct ? 'var(--ds-surface-tertiary)' : 'transparent'"
          [style.borderColor]="chartType === ct ? 'var(--ds-border-secondary)' : 'transparent'"
          [style.color]="chartType === ct ? 'var(--ds-text-primary)' : 'var(--ds-text-secondary)'"
          style="font-size:11px;padding:2px 6px;line-height:16px;border-radius:4px;border:1px solid transparent;cursor:pointer"
        >
          {{ ct }}
        </button>
      </div>
    </div>
    <div style="flex:1;position:relative;min-height:0">
      <canvas
        #chartCanvas
        style="position:absolute;inset:0;width:100%;height:100%;display:block"
      ></canvas>
    </div>
  `,
})
export class ChartWidget implements OnInit, OnDestroy, AfterViewInit {
  @Input() api: any;
  @Input() panel: any;
  @ViewChild('chartCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private shared = inject(SharedStateService);
  private candles: Candle[] = [];
  private liveId: any;
  private resizeObs?: ResizeObserver;
  private lastBondId = '';

  interval = '1D';
  chartType = 'Original';
  intervals = ['Time', 'm', 'H', '1D', '1W', '1M'];
  indicators = ['VOL', 'MA'];
  chartTypes = ['Original', 'Trading View', 'Depth'];

  constructor() {
    effect(() => {
      const bond = this.shared.selectedBond();
      if (bond.id !== this.lastBondId) {
        this.lastBondId = bond.id;
        this.candles = generateCandles(bond.bid, 120);
        this.redraw();
      }
    });
  }

  ngOnInit() {
    const bond = this.shared.selectedBond();
    this.lastBondId = bond.id;
    this.candles = generateCandles(bond.bid, 120);
  }

  private logicalW = 800;
  private logicalH = 400;

  ngAfterViewInit() {
    const canvas = this.canvasRef.nativeElement;
    const container = canvas.parentElement!;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.logicalW = w;
      this.logicalH = h;
      this.redraw();
    };
    this.resizeObs = new ResizeObserver(resize);
    this.resizeObs.observe(container);
    resize();

    this.liveId = setInterval(() => {
      const last = { ...this.candles[this.candles.length - 1] };
      const delta = (Math.random() - 0.48) * last.c * 0.001;
      last.c = Math.max(last.l * 0.995, Math.min(last.h * 1.005, last.c + delta));
      last.h = Math.max(last.h, last.c);
      last.l = Math.min(last.l, last.c);
      last.v += Math.random() * 5;
      this.candles = [...this.candles.slice(0, -1), last];
      this.redraw();
    }, 1500);
  }

  ngOnDestroy() {
    if (this.liveId) clearInterval(this.liveId);
    this.resizeObs?.disconnect();
  }

  private redraw() {
    if (!this.canvasRef) return;
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx || !this.candles.length) return;

    const W = this.logicalW,
      H = this.logicalH;
    const pad = { l: 50, r: 16, t: 28, b: 48, vol: 60 };
    const chartH = H - pad.t - pad.b - pad.vol;
    ctx.clearRect(0, 0, W, H);

    const prices = this.candles.flatMap((c) => [c.h, c.l]);
    const maxP = Math.max(...prices) * 1.001,
      minP = Math.min(...prices) * 0.999;
    const maxV = Math.max(...this.candles.map((c) => c.v));
    const n = this.candles.length,
      cW = (W - pad.l - pad.r) / n;
    const xOf = (i: number) => pad.l + (i + 0.5) * cW;
    const yOf = (p: number) => pad.t + (1 - (p - minP) / (maxP - minP)) * chartH;
    const yVol = (v: number) => H - pad.b - (v / maxV) * (pad.vol * 0.85);

    const bgColor = getCssVar('--ds-surface-primary'),
      gridColor = getCssVar('--ds-surface-secondary'),
      labelColor = getCssVar('--ds-text-muted');
    const greenColor = getCssVar('--ds-accent-positive'),
      redColor = getCssVar('--ds-accent-negative');
    const blueColor = getCssVar('--ds-accent-info'),
      cyanColor = getCssVar('--ds-accent-info');

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 5; i++) {
      const y = pad.t + (chartH * i) / 5;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(W - pad.r, y);
      ctx.stroke();
      const p = maxP - ((maxP - minP) * i) / 5;
      ctx.fillStyle = labelColor;
      ctx.font = '9px JetBrains Mono,monospace';
      ctx.textAlign = 'right';
      ctx.fillText(p.toFixed(3), pad.l - 4, y + 3);
    }
    for (let i = 0; i < n; i += 15) {
      const x = xOf(i);
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, H - pad.b);
      ctx.stroke();
      const d = new Date(this.candles[i].t);
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'center';
      ctx.fillText(`${d.getMonth() + 1}/${d.getDate()}`, x, H - pad.b + 14);
    }

    // Volume
    this.candles.forEach((c, i) => {
      const x = xOf(i),
        yv = yVol(c.v);
      ctx.fillStyle = c.c >= c.o ? `${greenColor}4d` : `${redColor}4d`;
      ctx.fillRect(x - cW * 0.4, yv, cW * 0.8, H - pad.b - yv);
    });

    // MA lines
    const ma7 = calcMA(this.candles, 7),
      ma25 = calcMA(this.candles, 25),
      ma99 = calcMA(this.candles, 99);
    const drawMA = (data: number[], color: string) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      data.forEach((v, i) => {
        if (!v) return;
        i === 0 || !data[i - 1] ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v));
      });
      ctx.stroke();
    };
    drawMA(ma7, blueColor);
    drawMA(ma25, 'var(--ds-accent-info)');
    drawMA(ma99, cyanColor);

    // Candles
    this.candles.forEach((c, i) => {
      const x = xOf(i),
        bullish = c.c >= c.o,
        color = bullish ? greenColor : redColor;
      const yO = yOf(c.o),
        yC = yOf(c.c),
        yH = yOf(c.h),
        yL = yOf(c.l);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yH);
      ctx.lineTo(x, Math.min(yO, yC));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, Math.max(yO, yC));
      ctx.lineTo(x, yL);
      ctx.stroke();
      const bodyH = Math.max(1, Math.abs(yC - yO));
      ctx.fillStyle = color;
      if (bullish) ctx.fillRect(x - cW * 0.4, yC, cW * 0.8, bodyH);
      else ctx.fillRect(x - cW * 0.4, yO, cW * 0.8, bodyH);
    });

    // Last price line
    const last = this.candles[this.candles.length - 1];
    const lastY = yOf(last.c);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = last.c >= last.o ? greenColor : redColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, lastY);
    ctx.lineTo(W - pad.r - 50, lastY);
    ctx.stroke();
    ctx.setLineDash([]);
    const tagColor = last.c >= last.o ? greenColor : redColor;
    ctx.fillStyle = tagColor;
    ctx.beginPath();
    ctx.roundRect(W - pad.r - 48, lastY - 9, 48, 18, 2);
    ctx.fill();
    ctx.fillStyle = getCssVar('--ds-text-primary');
    ctx.font = 'bold 9px JetBrains Mono,monospace';
    ctx.textAlign = 'center';
    ctx.fillText(last.c.toFixed(3), W - pad.r - 24, lastY + 3);

    // MA legend
    ctx.textAlign = 'left';
    [
      [`MA(7)`, blueColor, ma7],
      [`MA(25)`, 'var(--ds-accent-info)', ma25],
      [`MA(99)`, cyanColor, ma99],
    ].forEach(([label, color, data]: any[], idx) => {
      const v = data[data.length - 1];
      ctx.fillStyle = color as string;
      ctx.font = '9px JetBrains Mono,monospace';
      ctx.fillText(`${label}: ${v?.toFixed(3) || ''}`, pad.l + idx * 100, pad.t - 6);
    });
  }
}
