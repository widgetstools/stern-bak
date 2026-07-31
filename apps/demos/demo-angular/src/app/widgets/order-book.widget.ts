import { Component, Input, OnInit, OnDestroy, inject, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SharedStateService } from '../services/shared-state.service';
import { DEALERS } from '../services/trading-data.service';

/* ── Types ── */
type QuoteType = 'STREAM' | 'RFQ' | 'IND';

interface Level {
  dealer: string;
  price: number;
  yield: number;
  face: number;
  dv01: number;
  quoteType: QuoteType;
  total: number;
  pct: number;
}

interface RecentTrade {
  side: 'BUY' | 'SELL';
  dealer: string;
  price: number;
  yield: number;
  face: number;
  time: string;
}

/* ── Helpers ── */
const pickDealer = () => DEALERS[Math.floor(Math.random() * DEALERS.length)];
const pickQuoteType = (): QuoteType => {
  const r = Math.random();
  return r < 0.55 ? 'STREAM' : r < 0.85 ? 'RFQ' : 'IND';
};

function genLevels(
  mid: number,
  bondYtm: number,
  bondDv01: number,
  side: 'ask' | 'bid',
  n = 15,
): Level[] {
  const levels: Level[] = [];
  let cumFace = 0;
  for (let i = 0; i < n; i++) {
    const offset = side === 'ask' ? (i + 0.5) * 0.025 : -(i + 0.5) * 0.025;
    const price = +(mid + offset).toFixed(3);
    const yieldOffset = side === 'ask' ? -(i + 0.5) * 0.008 : (i + 0.5) * 0.008;
    const yld = +(bondYtm + yieldOffset).toFixed(3);
    const face = +(Math.random() * 4 + 0.5).toFixed(1);
    cumFace += face;
    const dv01 = +(face * bondDv01 * 0.01).toFixed(1);
    levels.push({
      dealer: pickDealer(),
      price,
      yield: yld,
      face,
      dv01,
      quoteType: pickQuoteType(),
      total: +cumFace.toFixed(1),
      pct: 0,
    });
  }
  const maxTotal = levels[levels.length - 1].total;
  return levels.map((l) => ({ ...l, pct: (l.total / maxTotal) * 100 }));
}

const BADGE_STYLES: Record<QuoteType, { bg: string; color: string }> = {
  STREAM: { bg: 'rgba(20,217,160,0.12)', color: 'var(--ds-accent-positive)' },
  RFQ: { bg: 'rgba(59,130,246,0.12)', color: 'var(--ds-accent-info)' },
  IND: { bg: 'rgba(255,140,66,0.12)', color: 'var(--ds-accent-warning)' },
};

@Component({
  selector: 'order-book-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `
    <div style="display:flex;flex-direction:column;height:100%;background:var(--ds-surface-primary)">
      <!-- Instrument context bar -->
      <div
        style="display:flex;align-items:center;gap:12px;padding:6px 12px;border-bottom:1px solid var(--ds-border-primary);flex-shrink:0;background:rgba(0,188,212,0.04)"
      >
        <span class="font-mono-fi font-bold" style="font-size:9px;color:var(--ds-accent-info)">
          {{ bond.ticker }} {{ bond.cpn }} {{ bond.mat }}
        </span>
        <span class="font-mono-fi" style="font-size:9px;color:var(--ds-text-muted)">{{ bond.issuer }}</span>
        <span class="font-mono-fi" style="font-size:9px;color:var(--ds-text-muted)"
          >CUSIP {{ bond.cusip }}</span
        >
        <span class="font-mono-fi" style="font-size:9px;color:var(--ds-text-secondary)">{{ bond.rtg }}</span>
        <div style="margin-left:auto;display:flex;align-items:center;gap:12px">
          <span class="font-mono-fi" style="font-size:9px">
            <span style="color:var(--ds-text-muted)">OAS </span>
            <span style="color:var(--ds-accent-warning);font-weight:600">{{
              bond.oas > 0 ? '+' + bond.oas : bond.oas
            }}</span>
          </span>
          <span class="font-mono-fi" style="font-size:9px">
            <span style="color:var(--ds-text-muted)">DUR </span>
            <span style="color:var(--ds-accent-info);font-weight:600">{{ bond.dur }}</span>
          </span>
        </div>
      </div>

      <!-- Toolbar -->
      <div
        style="display:flex;align-items:center;justify-content:space-between;padding:4px 12px;border-bottom:1px solid var(--ds-border-primary);flex-shrink:0"
      >
        <div style="display:flex;align-items:center;gap:4px">
          <button
            *ngFor="let opt of viewOpts"
            (click)="setView(opt.v)"
            [attr.aria-label]="'Show ' + opt.v"
            [attr.title]="'Show ' + opt.v"
            style="width:24px;height:20px;border-radius:4px;font-size:11px;border:none;cursor:pointer"
            [style.background]="view === opt.v ? 'var(--ds-surface-tertiary)' : 'transparent'"
            [style.color]="
              opt.v === 'asks'
                ? 'var(--ds-accent-negative)'
                : opt.v === 'bids'
                  ? 'var(--ds-accent-positive)'
                  : 'var(--ds-text-secondary)'
            "
          >
            {{ opt.icon }}
          </button>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="font-mono-fi" style="font-size:9px;color:var(--ds-text-muted)">
            {{ asks().length + bids().length }} levels
          </span>
          <span
            class="live-dot"
            style="width:5px;height:5px;border-radius:50%;background:var(--ds-accent-positive);display:inline-block"
          ></span>
          <span class="font-mono-fi" style="font-size:9px;color:var(--ds-accent-positive)">LIVE</span>
        </div>
      </div>

      <!-- Column headers -->
      <div
        class="ob-grid-cols"
        style="display:grid;padding:4px 8px;background:var(--ds-surface-secondary);flex-shrink:0"
      >
        <div class="col-hdr" style="text-align:left">Dealer</div>
        <div class="col-hdr" style="text-align:right">Price</div>
        <div class="col-hdr" style="text-align:right">Yield</div>
        <div class="col-hdr" style="text-align:right">Face (MM)</div>
        <div class="col-hdr" style="text-align:right">DV01 ($K)</div>
        <div class="col-hdr" style="text-align:center">Type</div>
      </div>

      <!-- Order book levels -->
      <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0">
        <!-- Asks -->
        <div
          *ngIf="view === 'both' || view === 'asks'"
          style="display:flex;flex-direction:column;overflow-y:auto;flex:1;min-height:0"
        >
          <div style="margin-top:auto">
            <div
              class="font-mono-fi"
              style="padding:2px 8px;font-size:9px;font-weight:700;color:var(--ds-accent-negative);letter-spacing:0.06em"
            >
              OFFERS (ASK)
            </div>
            <div
              *ngFor="let a of asks(); let i = index"
              (click)="onClickPrice(a.price)"
              class="ob-row-ask ob-grid-cols"
              style="display:grid;padding:2px 8px;cursor:pointer;position:relative"
              [style.--fill-pct]="a.pct + '%'"
            >
              <div class="font-mono-fi" style="font-size:11px;color:var(--ds-text-secondary)">
                {{ a.dealer }}
              </div>
              <div class="font-mono-fi" style="font-size:11px;color:var(--ds-accent-negative);text-align:right">
                {{ a.price.toFixed(3) }}
              </div>
              <div class="font-mono-fi" style="font-size:11px;color:var(--ds-text-primary);text-align:right">
                {{ a.yield.toFixed(3) }}
              </div>
              <div class="font-mono-fi" style="font-size:11px;color:var(--ds-text-primary);text-align:right">
                {{ a.face.toFixed(1) }}
              </div>
              <div class="font-mono-fi" style="font-size:11px;color:var(--ds-accent-info);text-align:right">
                {{ a.dv01.toFixed(1) }}
              </div>
              <div style="text-align:center">
                <span
                  class="font-mono-fi"
                  [style.fontSize.px]="9"
                  style="font-weight:600;padding:1px 4px;border-radius:2px;letter-spacing:0.03em"
                  [style.background]="badgeStyle(a.quoteType).bg"
                  [style.color]="badgeStyle(a.quoteType).color"
                  >{{ a.quoteType }}</span
                >
              </div>
            </div>
          </div>
        </div>

        <!-- Spread bar -->
        <div
          *ngIf="view === 'both'"
          style="display:flex;align-items:center;padding:6px 12px;border-top:1px solid var(--ds-border-primary);border-bottom:1px solid var(--ds-border-primary);flex-shrink:0;background:linear-gradient(90deg, rgba(20,217,160,0.08), var(--ds-surface-secondary), rgba(255,77,109,0.08))"
        >
          <span class="font-mono-fi font-bold" style="font-size:11px" [style.color]="spreadColor()">
            {{ mid().toFixed(3) }}
          </span>
          <span class="font-mono-fi" style="font-size:9px;color:var(--ds-text-muted);margin-left:12px">
            ≈ {{ '$' + mid().toFixed(3) }}
          </span>
          <div style="margin-left:auto;display:flex;align-items:center;gap:16px">
            <span class="font-mono-fi" style="font-size:9px">
              <span style="color:var(--ds-text-muted)">Spread </span>
              <span style="color:var(--ds-accent-warning);font-weight:600">{{ spread().toFixed(3) }}</span>
              <span style="color:var(--ds-text-muted)"> ({{ spreadPct() }}%)</span>
            </span>
            <span class="font-mono-fi" style="font-size:9px">
              <span style="color:var(--ds-text-muted)">Mid Yld </span>
              <span style="color:var(--ds-accent-info);font-weight:600">{{ bond.ytm.toFixed(3) }}</span>
            </span>
            <span class="font-mono-fi" style="font-size:9px">
              <span style="color:var(--ds-text-muted)">Z-Spd </span>
              <span style="color:var(--ds-accent-info);font-weight:600">{{ bond.gSpd }}</span>
            </span>
            <span [style.color]="spreadColor()" style="font-size:9px;font-weight:700">
              {{ spread() < 0 ? '↓' : '↑' }}
            </span>
          </div>
        </div>

        <!-- Bids -->
        <div *ngIf="view === 'both' || view === 'bids'" style="flex:1;overflow-y:auto;min-height:0">
          <div
            class="font-mono-fi"
            style="padding:2px 8px;font-size:9px;font-weight:700;color:var(--ds-accent-positive);letter-spacing:0.06em"
          >
            BIDS
          </div>
          <div
            *ngFor="let b of bids(); let i = index"
            (click)="onClickPrice(b.price)"
            class="ob-row-bid ob-grid-cols"
            style="display:grid;padding:2px 8px;cursor:pointer;position:relative"
            [style.--fill-pct]="b.pct + '%'"
          >
            <div class="font-mono-fi" style="font-size:11px;color:var(--ds-text-secondary)">{{ b.dealer }}</div>
            <div class="font-mono-fi" style="font-size:11px;color:var(--ds-accent-positive);text-align:right">
              {{ b.price.toFixed(3) }}
            </div>
            <div class="font-mono-fi" style="font-size:11px;color:var(--ds-text-primary);text-align:right">
              {{ b.yield.toFixed(3) }}
            </div>
            <div class="font-mono-fi" style="font-size:11px;color:var(--ds-text-primary);text-align:right">
              {{ b.face.toFixed(1) }}
            </div>
            <div class="font-mono-fi" style="font-size:11px;color:var(--ds-accent-info);text-align:right">
              {{ b.dv01.toFixed(1) }}
            </div>
            <div style="text-align:center">
              <span
                class="font-mono-fi"
                [style.fontSize.px]="9"
                style="font-weight:600;padding:1px 4px;border-radius:2px;letter-spacing:0.03em"
                [style.background]="badgeStyle(b.quoteType).bg"
                [style.color]="badgeStyle(b.quoteType).color"
                >{{ b.quoteType }}</span
              >
            </div>
          </div>
        </div>
      </div>

      <!-- Aggregate DV01 footer -->
      <div
        style="display:flex;align-items:center;padding:6px 12px;border-top:1px solid var(--ds-border-primary);background:var(--ds-surface-secondary);flex-shrink:0"
      >
        <div style="display:flex;align-items:center;gap:16px">
          <span class="font-mono-fi" style="font-size:9px">
            <span style="color:var(--ds-text-muted)">BID DV01 </span>
            <span style="color:var(--ds-accent-positive);font-weight:600">{{ '$' + bidDv01() + 'K' }}</span>
          </span>
          <span class="font-mono-fi" style="font-size:9px">
            <span style="color:var(--ds-text-muted)">ASK DV01 </span>
            <span style="color:var(--ds-accent-negative);font-weight:600">{{ '$' + askDv01() + 'K' }}</span>
          </span>
        </div>
        <div style="margin-left:auto;display:flex;align-items:center;gap:16px">
          <span class="font-mono-fi" style="font-size:9px">
            <span style="color:var(--ds-text-muted)">MIN SIZE </span>
            <span style="color:var(--ds-text-secondary);font-weight:600">{{ minSize() }}MM</span>
          </span>
          <span class="font-mono-fi" style="font-size:9px">
            <span style="color:var(--ds-text-muted)">FIRM </span>
            <span style="color:var(--ds-accent-positive);font-weight:600">{{ firmCount() }}</span>
          </span>
          <span class="font-mono-fi" style="font-size:9px">
            <span style="color:var(--ds-text-muted)">SETTLE </span>
            <span style="color:var(--ds-text-secondary);font-weight:600">T+1</span>
          </span>
        </div>
      </div>

      <!-- Recent trades -->
      <div
        style="border-top:1px solid var(--ds-border-primary);flex-shrink:0;max-height:160px;overflow:hidden;display:flex;flex-direction:column"
      >
        <div class="ob-trades-cols" style="display:grid;padding:4px 8px;background:var(--ds-surface-secondary)">
          <div class="col-hdr" style="text-align:left">Side</div>
          <div class="col-hdr" style="text-align:left">Cpty</div>
          <div class="col-hdr" style="text-align:right">Price</div>
          <div class="col-hdr" style="text-align:right">Yield</div>
          <div class="col-hdr" style="text-align:right">Face</div>
          <div class="col-hdr" style="text-align:right">Time</div>
        </div>
        <div style="overflow-y:auto;flex:1">
          <div
            *ngFor="let t of trades()"
            class="ob-trades-cols"
            style="display:grid;padding:2px 8px"
          >
            <div
              class="font-mono-fi"
              style="font-size:11px;font-weight:700"
              [style.color]="t.side === 'BUY' ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)'"
            >
              {{ t.side }}
            </div>
            <div class="font-mono-fi" style="font-size:11px;color:var(--ds-text-secondary)">{{ t.dealer }}</div>
            <div class="font-mono-fi" style="font-size:11px;color:var(--ds-text-primary);text-align:right">
              {{ t.price.toFixed(3) }}
            </div>
            <div class="font-mono-fi" style="font-size:11px;color:var(--ds-text-primary);text-align:right">
              {{ t.yield.toFixed(3) }}
            </div>
            <div class="font-mono-fi" style="font-size:11px;color:var(--ds-text-primary);text-align:right">
              {{ t.face.toFixed(1) }}
            </div>
            <div class="font-mono-fi" style="font-size:11px;color:var(--ds-text-muted);text-align:right">
              {{ t.time }}
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class OrderBookWidget implements OnInit, OnDestroy {
  @Input() api: any;
  @Input() panel: any;

  private shared = inject(SharedStateService);
  private intervalId: any;

  asks = signal<Level[]>([]);
  bids = signal<Level[]>([]);
  trades = signal<RecentTrade[]>([]);
  view: 'both' | 'asks' | 'bids' = 'both';
  viewOpts = [
    { v: 'both', icon: '\u2580\u2584' },
    { v: 'bids', icon: '\u2584' },
    { v: 'asks', icon: '\u2580' },
  ];

  mid = signal(100);
  spread = signal(0);
  spreadPct = signal('0');
  spreadColor = signal('var(--ds-accent-positive)');

  // Aggregate computed signals
  bidDv01 = signal('0');
  askDv01 = signal('0');
  firmCount = signal(0);
  minSize = signal('0');

  readonly badgeStyles = BADGE_STYLES;

  get bond() {
    return this.shared.selectedBond();
  }

  badgeStyle(type: QuoteType) {
    return BADGE_STYLES[type];
  }

  constructor() {
    effect(() => {
      const bond = this.shared.selectedBond();
      this.mid.set((bond.bid + bond.ask) / 2);
      this.generateBook();
    });
  }

  ngOnInit() {
    this.generateBook();
  }

  ngOnDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private generateBook() {
    if (this.intervalId) clearInterval(this.intervalId);
    const bond = this.shared.selectedBond();
    this.asks.set(genLevels(this.mid(), bond.ytm, bond.dv01, 'ask', 15).reverse());
    this.bids.set(genLevels(this.mid(), bond.ytm, bond.dv01, 'bid', 15));
    this.updateSpread();
    this.updateAggregates();

    this.intervalId = setInterval(() => {
      const b = this.shared.selectedBond();
      const newMid = this.mid() + (Math.random() - 0.5) * 0.04;
      this.asks.set(genLevels(newMid, b.ytm, b.dv01, 'ask', 15).reverse());
      this.bids.set(genLevels(newMid, b.ytm, b.dv01, 'bid', 15));
      this.updateSpread();
      this.updateAggregates();

      // Generate trade
      const side: 'BUY' | 'SELL' = Math.random() > 0.5 ? 'BUY' : 'SELL';
      const price = +(newMid + (side === 'BUY' ? 0.012 : -0.012)).toFixed(3);
      const yld = +(b.ytm + (side === 'BUY' ? -0.005 : 0.005)).toFixed(3);
      const face = +(Math.random() * 3 + 0.5).toFixed(1);
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      this.trades.set([
        { side, dealer: pickDealer(), price, yield: yld, face, time },
        ...this.trades().slice(0, 14),
      ]);
    }, 1200);
  }

  private updateSpread() {
    const asksVal = this.asks();
    const bidsVal = this.bids();
    if (asksVal.length && bidsVal.length) {
      const sp = +(asksVal[asksVal.length - 1].price - bidsVal[0].price).toFixed(3);
      this.spread.set(sp);
      this.spreadPct.set(((sp / this.mid()) * 100).toFixed(4));
      this.spreadColor.set(
        bidsVal[0]?.price > asksVal[asksVal.length - 1]?.price
          ? 'var(--ds-accent-negative)'
          : 'var(--ds-accent-positive)',
      );
    }
  }

  private updateAggregates() {
    const a = this.asks();
    const b = this.bids();
    this.bidDv01.set(b.reduce((s, l) => s + l.dv01, 0).toFixed(1));
    this.askDv01.set(a.reduce((s, l) => s + l.dv01, 0).toFixed(1));
    this.firmCount.set([...a, ...b].filter((l) => l.quoteType === 'STREAM').length);
    const all = [...a, ...b];
    this.minSize.set(all.length ? Math.min(...all.map((l) => l.face)).toFixed(1) : '0');
  }

  setView(v: string) {
    this.view = v as 'both' | 'asks' | 'bids';
  }

  onClickPrice(price: number) {
    this.shared.clickedPrice.set(price);
  }
}
