import { Component, Input, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SharedStateService } from '../services/shared-state.service';

@Component({
  selector: 'trade-ticket-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `
    <div style="display:flex;flex-direction:column;height:100%;background:var(--ds-surface-primary)">
      <!-- Security header -->
      <div
        style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--ds-border-primary);flex-shrink:0;background:rgba(0,188,212,0.04)"
      >
        <span class="font-mono-fi font-bold" style="font-size:9px;color:var(--ds-accent-info)"
          >{{ bond.ticker }} {{ bond.cpn }} {{ bond.mat }}</span
        >
        <span class="font-mono-fi font-semibold" style="font-size:11px;color:var(--ds-text-primary)">{{
          mid.toFixed(3)
        }}</span>
      </div>
      <!-- Bid / Ask strip -->
      <div
        style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--ds-border-primary);flex-shrink:0"
      >
        <div
          class="font-mono-fi"
          style="font-size:11px;font-weight:600;text-align:center;padding:6px 0;background:var(--tt-bid-strip);color:var(--ds-accent-info)"
        >
          <span style="font-size:9px;color:var(--ds-text-muted);display:block">BID</span>
          {{ bond.bid.toFixed(3) }}
        </div>
        <div
          class="font-mono-fi"
          style="font-size:11px;font-weight:600;text-align:center;padding:6px 0;background:var(--tt-ask-strip);color:var(--ds-accent-negative)"
        >
          <span style="font-size:9px;color:var(--ds-text-muted);display:block">ASK</span>
          {{ bond.ask.toFixed(3) }}
        </div>
      </div>
      <!-- Buy/Sell toggle -->
      <div
        style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--ds-border-primary);flex-shrink:0"
      >
        <button
          (click)="side = 'BUY'"
          style="padding:8px;font-size:11px;font-weight:700;letter-spacing:0.06em;border:none;cursor:pointer;transition:all 150ms"
          [style.color]="side === 'BUY' ? 'var(--ds-accent-positive)' : 'var(--ds-text-muted)'"
          [style.background]="side === 'BUY' ? 'rgba(20,217,160,0.08)' : 'transparent'"
          [style.borderBottom]="
            side === 'BUY' ? '2px solid var(--ds-accent-positive)' : '2px solid transparent'
          "
        >
          BUY
        </button>
        <button
          (click)="side = 'SELL'"
          style="padding:8px;font-size:11px;font-weight:700;letter-spacing:0.06em;border:none;cursor:pointer;transition:all 150ms"
          [style.color]="side === 'SELL' ? 'var(--ds-accent-negative)' : 'var(--ds-text-muted)'"
          [style.background]="side === 'SELL' ? 'rgba(255,77,109,0.08)' : 'transparent'"
          [style.borderBottom]="
            side === 'SELL' ? '2px solid var(--ds-accent-negative)' : '2px solid transparent'
          "
        >
          SELL
        </button>
      </div>
      <div
        style="flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px"
      >
        <!-- Order type tabs -->
        <div style="display:flex;gap:12px;margin-bottom:4px">
          <button
            *ngFor="let t of orderTypes"
            (click)="orderType = t"
            class="order-type-tab"
            [style.fontSize.px]="11"
            [style.color]="orderType === t ? 'var(--ds-accent-info)' : 'var(--ds-text-muted)'"
            [style.borderBottomColor]="orderType === t ? 'var(--ds-accent-info)' : 'transparent'"
          >
            {{ t }}
          </button>
        </div>
        <!-- Stop price -->
        <div *ngIf="orderType === 'Stop-Limit'">
          <label style="font-size:9px;color:var(--ds-text-muted);display:block;margin-bottom:2px"
            >Stop Price</label
          >
          <div style="position:relative">
            <input
              class="price-input"
              style="padding-right:56px"
              placeholder="Trigger at..."
              [(ngModel)]="stopPrice"
            />
            <span
              style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:11px;color:var(--ds-text-muted)"
              >USD</span
            >
          </div>
        </div>
        <!-- Price -->
        <div *ngIf="orderType !== 'Market'">
          <label style="font-size:9px;color:var(--ds-text-muted);display:block;margin-bottom:2px">{{
            orderType === 'Stop-Limit' ? 'Limit Price' : 'Price'
          }}</label>
          <div style="position:relative">
            <input
              class="price-input"
              style="padding-right:56px"
              placeholder="Price"
              [(ngModel)]="price"
            />
            <span
              style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:11px;color:var(--ds-text-muted)"
              >USD</span
            >
          </div>
        </div>
        <div
          *ngIf="orderType === 'Market'"
          style="padding:6px 10px;border-radius:3px;background:var(--ds-surface-secondary);font-size:11px;color:var(--ds-text-secondary);font-family:JetBrains Mono,monospace"
        >
          Market - Best available price
        </div>
        <!-- Amount -->
        <div>
          <label style="font-size:9px;color:var(--ds-text-muted);display:block;margin-bottom:2px"
            >Notional</label
          >
          <div style="position:relative">
            <input
              class="price-input"
              style="padding-right:56px"
              placeholder="Face amount"
              [(ngModel)]="amount"
            />
            <span
              style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:11px;color:var(--ds-text-muted)"
              >MM</span
            >
          </div>
        </div>
        <!-- Pct quick fill -->
        <div style="display:flex;gap:4px">
          <button
            *ngFor="let p of pcts"
            (click)="handlePct(p)"
            style="flex:1;padding:4px;border-radius:4px;font-size:11px;font-weight:500;cursor:pointer;transition:all 150ms"
            [style.background]="pct === p ? 'var(--ds-surface-tertiary)' : 'transparent'"
            [style.borderColor]="'var(--ds-border-secondary)'"
            [style.border]="'1px solid var(--ds-border-secondary)'"
            [style.color]="
              pct === p ? (side === 'BUY' ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)') : 'var(--ds-text-muted)'
            "
          >
            {{ p }}%
          </button>
        </div>
        <!-- TIF -->
        <div>
          <label style="font-size:9px;color:var(--ds-text-muted);display:block;margin-bottom:2px"
            >Time in Force</label
          >
          <div style="display:flex;gap:4px">
            <button
              *ngFor="let t of tifs"
              (click)="tif = t"
              class="font-mono-fi"
              style="flex:1;padding:4px;border-radius:4px;font-size:9px;font-weight:500;border:1px solid var(--ds-border-secondary);cursor:pointer;transition:all 150ms"
              [style.background]="tif === t ? 'var(--ds-surface-tertiary)' : 'transparent'"
              [style.color]="tif === t ? 'var(--ds-text-primary)' : 'var(--ds-text-muted)'"
            >
              {{ t }}
            </button>
          </div>
        </div>
        <!-- Total -->
        <div
          *ngIf="orderType !== 'Market' && total"
          style="display:flex;justify-content:space-between;font-family:JetBrains Mono,monospace;font-size:11px;color:var(--ds-text-secondary);padding:4px 0"
        >
          <span>Est. Total</span>
          <span style="color:var(--ds-text-primary)">\${{ total }} USD</span>
        </div>
        <!-- Summary -->
        <div
          style="padding:6px 8px;border-radius:3px;background:var(--ds-surface-secondary);font-size:9px;color:var(--ds-text-muted);font-family:JetBrains Mono,monospace;line-height:1.6"
          [style.borderLeft]="'3px solid ' + (side === 'BUY' ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)')"
        >
          <span
            [style.color]="side === 'BUY' ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)'"
            style="font-weight:700"
            >{{ side }}</span
          >
          {{ amount || '---' }}MM {{ bond.ticker }} {{ bond.cpn }} {{ bond.mat }}<br />
          {{ orderType }}{{ orderType !== 'Market' ? ' @ ' + price : ''
          }}{{ orderType === 'Stop-Limit' ? ' stop ' + (stopPrice || '---') : '' }} · {{ tif }}
        </div>
      </div>
      <!-- Submit CTA -->
      <div style="padding:0 12px 12px;flex-shrink:0">
        <button
          (click)="handleSubmit()"
          [disabled]="!canSubmit || submitting"
          [class]="side === 'BUY' ? 'btn-buy' : 'btn-sell'"
          [style.opacity]="canSubmit && !submitting ? 1 : 0.4"
          [style.cursor]="canSubmit && !submitting ? 'pointer' : 'not-allowed'"
          style="font-size:11px"
        >
          {{
            submitting
              ? 'Submitting...'
              : side === 'BUY'
                ? 'Buy ' + bond.ticker
                : 'Sell ' + bond.ticker
          }}
        </button>
      </div>
    </div>
  `,
})
export class TradeTicketWidget {
  @Input() api: any;
  @Input() panel: any;

  private shared = inject(SharedStateService);

  side: 'BUY' | 'SELL' = 'BUY';
  orderType: 'Limit' | 'Market' | 'Stop-Limit' = 'Limit';
  price = '';
  stopPrice = '';
  amount = '';
  pct = 0;
  tif: 'GTC' | 'IOC' | 'FOK' | 'DAY' = 'GTC';
  submitting = false;

  orderTypes: ('Limit' | 'Market' | 'Stop-Limit')[] = ['Limit', 'Market', 'Stop-Limit'];
  pcts = [25, 50, 75, 100];
  tifs: ('GTC' | 'IOC' | 'FOK' | 'DAY')[] = ['GTC', 'IOC', 'FOK', 'DAY'];

  get bond() {
    return this.shared.selectedBond();
  }
  get mid() {
    return (this.bond.bid + this.bond.ask) / 2;
  }
  get total() {
    return this.amount && +this.price ? (+this.amount * +this.price).toFixed(2) : '';
  }
  get canSubmit() {
    return (
      +this.amount > 0 &&
      (this.orderType === 'Market' || +this.price > 0) &&
      (this.orderType !== 'Stop-Limit' || +this.stopPrice > 0)
    );
  }

  constructor() {
    effect(() => {
      const bond = this.shared.selectedBond();
      this.price = this.side === 'BUY' ? bond.bid.toFixed(3) : bond.ask.toFixed(3);
    });
    effect(() => {
      const cp = this.shared.clickedPrice();
      if (cp !== undefined) this.price = cp.toFixed(3);
    });
  }

  handlePct(p: number) {
    this.pct = p;
    if (+this.price > 0) this.amount = ((this.mid * p) / 100 / +this.price).toFixed(5);
  }

  handleSubmit() {
    if (!this.canSubmit) return;
    this.submitting = true;
    setTimeout(() => {
      this.submitting = false;
      this.amount = '';
      this.pct = 0;
    }, 600);
  }
}
