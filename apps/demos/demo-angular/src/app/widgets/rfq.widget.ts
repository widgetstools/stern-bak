import { Component, Input, OnInit, OnDestroy, inject, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SharedStateService } from '../services/shared-state.service';
import {
  BONDS,
  DEALERS,
  type Bond,
  type RfqRequest,
  type RfqQuote,
} from '../services/trading-data.service';

const RFQ_TTL = 30;
let rfqCounter = 1;
function makeQuote(bond: Bond, side: 'Buy' | 'Sell', dealer: string): RfqQuote {
  const spread = 0.04 + Math.random() * 0.08;
  const mid = (bond.bid + bond.ask) / 2;
  const bid = +(mid - spread / 2 + (Math.random() - 0.5) * 0.02).toFixed(3);
  const ask = +(mid + spread / 2 + (Math.random() - 0.5) * 0.02).toFixed(3);
  return {
    dealer,
    bid,
    ask,
    bidSize: `$${Math.floor(Math.random() * 8 + 2)}MM`,
    askSize: `$${Math.floor(Math.random() * 8 + 2)}MM`,
    ts: Date.now(),
    status: 'live',
  };
}

const RFQ_STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  live: { bg: 'rgba(59,130,246,0.1)', color: 'var(--ds-accent-info)', border: 'rgba(59,130,246,0.25)' },
  done: { bg: 'rgba(20,217,160,0.12)', color: 'var(--ds-accent-positive)', border: 'rgba(20,217,160,0.25)' },
  stale: { bg: 'rgba(74,82,117,0.2)', color: 'var(--ds-text-muted)', border: 'rgba(74,82,117,0.25)' },
};

@Component({
  selector: 'rfq-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  styles: [
    `
      .rfq-history-item .rfq-remove-btn {
        opacity: 0;
        transition: opacity 0.15s ease;
      }
      .rfq-history-item:hover .rfq-remove-btn {
        opacity: 1;
      }
    `,
  ],
  template: `
    <div style="display:flex;flex-direction:column;height:100%;background:var(--ds-surface-primary)">
      <!-- Live count toolbar -->
      <div
        style="display:flex;align-items:center;justify-content:flex-end;padding:0 12px;height:32px;border-bottom:1px solid var(--ds-border-primary);flex-shrink:0"
      >
        <span
          class="font-mono-fi"
          style="font-size:9px;padding:1px 6px;border-radius:2px;background:rgba(59,130,246,0.08);color:var(--ds-accent-info);border:1px solid rgba(59,130,246,0.2)"
          >{{ liveCount }} live</span
        >
      </div>
      <div style="display:flex;flex:1;overflow:hidden;gap:1px;background:var(--ds-border-primary)">
        <!-- Left: RFQ ticket -->
        <div
          style="display:flex;flex-direction:column;flex-shrink:0;width:220px;background:var(--ds-surface-secondary)"
        >
          <div
            style="display:flex;align-items:center;padding:0 12px;height:28px;border-bottom:1px solid var(--ds-border-primary);background:rgba(59,130,246,0.06)"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--ds-accent-info)"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              style="margin-right:6px"
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span class="col-hdr" style="color:var(--ds-accent-info)">New RFQ</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;padding:12px">
            <!-- Instrument -->
            <div>
              <div class="col-hdr" style="margin-bottom:4px">Instrument</div>
              <div
                *ngIf="activeBond && !instrOpen"
                (click)="instrOpen = true"
                class="font-mono-fi"
                style="font-size:11px;font-weight:700;padding:6px 8px;border-radius:2px;border:1px solid rgba(0,188,212,0.25);background:rgba(0,188,212,0.06);color:var(--ds-accent-info);cursor:pointer;display:flex;align-items:center;justify-content:space-between"
              >
                <span>{{ activeBond.ticker }} {{ activeBond.cpn }} {{ activeBond.mat }}</span>
              </div>
              <div *ngIf="!activeBond || instrOpen" style="position:relative">
                <input
                  [(ngModel)]="instrSearch"
                  (focus)="instrOpen = true"
                  placeholder="CUSIP, ticker, issuer..."
                  class="font-mono-fi"
                  style="font-size:11px;width:100%;padding:6px 8px;border-radius:2px;border:1px solid var(--ds-accent-info);background:var(--ds-surface-tertiary);color:var(--ds-text-primary);outline:none;box-sizing:border-box"
                />
              </div>
              <div
                *ngIf="instrOpen && instrResults.length > 0"
                style="position:relative;z-index:50;border-radius:2px;border:1px solid var(--ds-border-secondary);background:var(--ds-surface-secondary);max-height:200px;overflow-y:auto;margin-top:2px"
              >
                <div
                  *ngFor="let b of instrResults"
                  (click)="pickBond(b)"
                  style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;cursor:pointer;border-bottom:1px solid var(--ds-border-primary);font-size:9px;font-family:JetBrains Mono,monospace"
                  (mouseenter)="
                    $event.currentTarget &&
                      ($any($event.currentTarget).style.background = 'var(--ds-surface-tertiary)')
                  "
                  (mouseleave)="
                    $event.currentTarget &&
                      ($any($event.currentTarget).style.background = 'transparent')
                  "
                >
                  <div>
                    <span style="color:var(--ds-accent-info);font-weight:700">{{ b.ticker }}</span>
                    <span style="color:var(--ds-text-secondary);margin-left:4px">{{ b.cpn }} {{ b.mat }}</span>
                  </div>
                  <span style="color:var(--ds-text-muted)">{{ b.cusip }}</span>
                </div>
              </div>
            </div>
            <!-- Bid/Ask display -->
            <div
              *ngIf="activeBond && !instrOpen"
              style="display:grid;grid-template-columns:1fr 1fr;gap:4px"
            >
              <div
                class="font-mono-fi"
                style="font-size:11px;font-weight:600;padding:4px 8px;border-radius:2px;background:rgba(59,130,246,0.08);color:var(--ds-accent-info);text-align:right;border:1px solid rgba(59,130,246,0.15)"
              >
                <span style="font-size:9px;color:var(--ds-text-muted);display:block;margin-bottom:1px"
                  >BID</span
                >
                {{ activeBond.bid.toFixed(3) }}
              </div>
              <div
                class="font-mono-fi"
                style="font-size:11px;font-weight:600;padding:4px 8px;border-radius:2px;background:rgba(255,77,109,0.08);color:var(--ds-accent-negative);text-align:right;border:1px solid rgba(255,77,109,0.15)"
              >
                <span style="font-size:9px;color:var(--ds-text-muted);display:block;margin-bottom:1px"
                  >ASK</span
                >
                {{ activeBond.ask.toFixed(3) }}
              </div>
            </div>
            <!-- Side -->
            <div>
              <div class="col-hdr" style="margin-bottom:4px">Side</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
                <button
                  *ngFor="let s of ['Buy', 'Sell']"
                  (click)="rfqSide = $any(s)"
                  class="font-mono-fi font-bold"
                  style="padding:6px;border-radius:2px;font-size:11px;letter-spacing:0.04em;cursor:pointer"
                  [style.background]="
                    rfqSide === s
                      ? s === 'Buy'
                        ? 'rgba(20,217,160,0.15)'
                        : 'rgba(255,77,109,0.15)'
                      : 'transparent'
                  "
                  [style.border]="
                    '1px solid ' +
                    (rfqSide === s
                      ? s === 'Buy'
                        ? 'rgba(20,217,160,0.4)'
                        : 'rgba(255,77,109,0.4)'
                      : 'var(--ds-border-secondary)')
                  "
                  [style.color]="
                    rfqSide === s
                      ? s === 'Buy'
                        ? 'var(--ds-accent-positive)'
                        : 'var(--ds-accent-negative)'
                      : 'var(--ds-text-muted)'
                  "
                >
                  {{ $any(s).toUpperCase() }}
                </button>
              </div>
            </div>
            <!-- Size -->
            <div>
              <div class="col-hdr" style="margin-bottom:4px">Size (MM)</div>
              <div
                style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:4px"
              >
                <button
                  *ngFor="let v of ['2', '5', '10', '15']"
                  (click)="rfqSize = v"
                  class="font-mono-fi"
                  style="padding:4px;border-radius:2px;font-size:9px;cursor:pointer"
                  [style.background]="rfqSize === v ? 'rgba(59,130,246,0.12)' : 'var(--ds-surface-tertiary)'"
                  [style.border]="
                    '1px solid ' + (rfqSize === v ? 'var(--ds-accent-info)' : 'var(--ds-border-secondary)')
                  "
                  [style.color]="rfqSize === v ? 'var(--ds-accent-info)' : 'var(--ds-text-secondary)'"
                >
                  {{ v }}
                </button>
              </div>
              <input
                type="number"
                [(ngModel)]="rfqSize"
                class="font-mono-fi"
                style="font-size:11px;width:100%;padding:6px 8px;border-radius:2px;border:1px solid var(--ds-border-secondary);background:var(--ds-surface-tertiary);color:var(--ds-text-primary);outline:none;box-sizing:border-box"
              />
            </div>
            <!-- Dealers -->
            <div>
              <div class="col-hdr" style="margin-bottom:4px">Dealers (all)</div>
              <div style="display:flex;flex-wrap:wrap;gap:4px">
                <span
                  *ngFor="let d of dealers"
                  class="font-mono-fi"
                  style="font-size:9px;padding:2px 6px;border-radius:2px;background:rgba(59,130,246,0.08);color:var(--ds-accent-info);border:1px solid rgba(59,130,246,0.2)"
                  >{{ d }}</span
                >
              </div>
            </div>
            <!-- Send -->
            <button
              (click)="sendRfq()"
              [disabled]="!activeBond"
              class="font-mono-fi font-bold"
              style="width:100%;padding:8px;border-radius:2px;font-size:11px;letter-spacing:0.06em;display:flex;align-items:center;justify-content:center;gap:6px;margin-top:4px;border:none;cursor:pointer"
              [style.background]="activeBond ? 'var(--ds-accent-info)' : 'var(--ds-surface-tertiary)'"
              [style.color]="activeBond ? 'var(--ds-text-primary)' : 'var(--ds-text-faint)'"
            >
              SEND RFQ
            </button>
          </div>
          <!-- RFQ history -->
          <div style="border-top:1px solid var(--ds-border-primary);flex:1;overflow-y:auto">
            <div
              style="display:flex;align-items:center;justify-content:space-between;padding:0 12px;height:28px;border-bottom:1px solid var(--ds-border-primary)"
            >
              <span class="col-hdr">RFQ History</span>
              <button
                *ngIf="hasCompletedRfqs"
                (click)="clearHistory()"
                class="font-mono-fi"
                style="font-size:9px;color:var(--ds-text-faint);background:none;border:none;cursor:pointer;padding:0;display:flex;align-items:center;gap:3px"
                (mouseenter)="$any($event.currentTarget).style.color = 'var(--ds-accent-negative)'"
                (mouseleave)="$any($event.currentTarget).style.color = 'var(--ds-text-faint)'"
              >
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  />
                </svg>
                CLEAR
              </button>
            </div>
            <div
              *ngFor="let r of requests"
              (click)="activeId = r.id"
              class="rfq-history-item"
              style="padding:8px 12px;border-bottom:1px solid var(--ds-border-primary);cursor:pointer;position:relative"
              [style.background]="activeId === r.id ? 'var(--ds-surface-tertiary)' : 'transparent'"
            >
              <div
                style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px"
              >
                <div style="display:flex;align-items:center;gap:8px">
                  <span class="font-mono-fi font-bold" style="font-size:9px;color:var(--ds-accent-info)">{{
                    r.id
                  }}</span>
                  <span
                    class="font-mono-fi"
                    style="font-size:9px;font-weight:600"
                    [style.color]="r.side === 'Buy' ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)'"
                    >{{ r.side.toUpperCase() }}</span
                  >
                </div>
                <div style="display:flex;align-items:center;gap:6px">
                  <span
                    class="font-mono-fi"
                    style="font-size:9px;padding:1px 6px;border-radius:2px"
                    [style.background]="statusBg(r.status)"
                    [style.color]="statusColor(r.status)"
                    [style.border]="'1px solid ' + statusBorder(r.status)"
                    >{{ r.status.toUpperCase() }}</span
                  >
                  <button
                    *ngIf="r.status === 'done' || r.status === 'cancelled'"
                    (click)="removeRfq(r.id); $event.stopPropagation()"
                    class="rfq-remove-btn"
                    style="background:none;border:none;cursor:pointer;padding:0;color:var(--ds-text-faint);line-height:0"
                    (mouseenter)="$any($event.currentTarget).style.color = 'var(--ds-accent-negative)'"
                    (mouseleave)="$any($event.currentTarget).style.color = 'var(--ds-text-faint)'"
                  >
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
              <div class="font-mono-fi" style="font-size:9px;color:var(--ds-text-secondary)">{{ r.bond }}</div>
              <div style="display:flex;align-items:center;justify-content:space-between">
                <span class="font-mono-fi" style="font-size:9px;color:var(--ds-text-muted)">
                  {{ r.size }} · {{ r.quotes.length }} quotes
                </span>
                <div
                  *ngIf="r.status === 'pending' || r.status === 'quoted'"
                  style="position:relative;width:28px;height:28px;flex-shrink:0"
                >
                  <svg viewBox="0 0 28 28" width="28" height="28">
                    <circle
                      cx="14"
                      cy="14"
                      r="11"
                      fill="none"
                      stroke="var(--ds-surface-tertiary)"
                      stroke-width="2.5"
                    />
                    <circle
                      cx="14"
                      cy="14"
                      r="11"
                      fill="none"
                      [attr.stroke]="countdownColor(r.createdAt)"
                      stroke-width="2.5"
                      [attr.stroke-dasharray]="countdownDash(r.createdAt)"
                      stroke-linecap="round"
                      transform="rotate(-90 14 14)"
                      style="transition:stroke-dasharray 0.15s linear,stroke 0.3s ease"
                    />
                  </svg>
                  <div
                    style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700"
                    [style.color]="countdownColor(r.createdAt)"
                  >
                    {{ countdownSecs(r.createdAt) }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- Right: Quote ladder -->
        <div
          style="display:flex;flex-direction:column;flex:1;overflow:hidden;background:var(--ds-surface-primary)"
        >
          <ng-container *ngIf="activeReq">
            <!-- Active RFQ header -->
            <div
              style="display:flex;align-items:center;justify-content:space-between;padding:0 12px;height:32px;border-bottom:1px solid var(--ds-border-primary);flex-shrink:0"
            >
              <div style="display:flex;align-items:center;gap:12px">
                <span class="ph-title">{{ activeReq.id }}</span>
                <span class="font-mono-fi font-bold" style="font-size:11px;color:var(--ds-accent-info)">{{
                  activeReq.bond
                }}</span>
                <span
                  class="font-mono-fi font-bold"
                  style="font-size:11px"
                  [style.color]="activeReq.side === 'Buy' ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)'"
                  >{{ activeReq.side.toUpperCase() }}</span
                >
                <span class="font-mono-fi" style="font-size:11px;color:var(--ds-text-secondary)">{{
                  activeReq.size
                }}</span>
              </div>
              <!-- Countdown ring + cancel for live RFQs -->
              <div
                *ngIf="activeReq.status === 'pending' || activeReq.status === 'quoted'"
                style="display:flex;align-items:center;gap:8px"
              >
                <div style="position:relative;width:28px;height:28px;flex-shrink:0">
                  <svg viewBox="0 0 28 28" width="28" height="28">
                    <circle
                      cx="14"
                      cy="14"
                      r="11"
                      fill="none"
                      stroke="var(--ds-surface-tertiary)"
                      stroke-width="2.5"
                    />
                    <circle
                      cx="14"
                      cy="14"
                      r="11"
                      fill="none"
                      [attr.stroke]="countdownColor(activeReq.createdAt)"
                      stroke-width="2.5"
                      [attr.stroke-dasharray]="countdownDash(activeReq.createdAt)"
                      stroke-linecap="round"
                      transform="rotate(-90 14 14)"
                      style="transition:stroke-dasharray 0.15s linear,stroke 0.3s ease"
                    />
                  </svg>
                  <div
                    style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700"
                    [style.color]="countdownColor(activeReq.createdAt)"
                  >
                    {{ countdownSecs(activeReq.createdAt) }}
                  </div>
                </div>
                <span
                  *ngIf="activeReq.status === 'pending'"
                  class="font-mono-fi"
                  style="font-size:9px;color:var(--ds-accent-warning)"
                  >Awaiting quotes…</span
                >
                <button
                  (click)="cancelRfq(activeReq.id)"
                  class="font-mono-fi"
                  style="font-size:9px;padding:2px 8px;border-radius:2px;background:rgba(255,77,109,0.08);border:1px solid rgba(255,77,109,0.3);color:var(--ds-accent-negative);cursor:pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
            <!-- Best quote banner -->
            <div
              *ngIf="activeReq.quotes.length > 0 && activeReq.status !== 'done'"
              style="display:flex;align-items:center;gap:24px;padding:8px 16px;border-bottom:1px solid var(--ds-border-primary);background:var(--ds-surface-secondary);flex-shrink:0"
            >
              <div>
                <div class="col-hdr" style="margin-bottom:2px">Best Bid</div>
                <div class="font-mono-fi font-bold" style="font-size:13px;color:var(--ds-accent-info)">
                  {{ bestBid.toFixed(3) }}
                </div>
              </div>
              <div>
                <div class="col-hdr" style="margin-bottom:2px">Best Ask</div>
                <div class="font-mono-fi font-bold" style="font-size:13px;color:var(--ds-accent-negative)">
                  {{ bestAsk.toFixed(3) }}
                </div>
              </div>
              <div>
                <div class="col-hdr" style="margin-bottom:2px">Spread</div>
                <div class="font-mono-fi font-bold" style="font-size:13px;color:var(--ds-accent-warning)">
                  {{ ((bestAsk - bestBid) * 100).toFixed(1) }}c
                </div>
              </div>
              <div>
                <div class="col-hdr" style="margin-bottom:2px">Quotes</div>
                <div class="font-mono-fi font-bold" style="font-size:13px;color:var(--ds-accent-positive)">
                  {{ activeReq.quotes.length }}
                </div>
              </div>
            </div>
            <!-- Quote grid -->
            <div style="flex:1;overflow:hidden">
              <div
                *ngIf="activeReq.quotes.length === 0"
                style="display:flex;align-items:center;justify-content:center;height:100%"
              >
                <div style="text-align:center">
                  <div class="font-mono-fi" style="font-size:18px;color:var(--ds-border-secondary)">...</div>
                  <div class="font-mono-fi" style="font-size:11px;color:var(--ds-text-faint)">
                    Quotes incoming from dealers...
                  </div>
                </div>
              </div>
              <div *ngIf="activeReq.quotes.length > 0" style="width:100%;height:100%;overflow:auto">
                <table style="width:100%;border-collapse:collapse">
                  <thead>
                    <tr>
                      <th
                        style="font-size:9px;color:var(--ds-text-secondary);text-transform:uppercase;letter-spacing:0.04em;font-weight:600;padding:6px 8px;text-align:left;white-space:nowrap;background:var(--ds-surface-secondary);border-bottom:1px solid var(--ds-border-primary)"
                      >
                        DEALER
                      </th>
                      <th
                        style="font-size:9px;color:var(--ds-text-secondary);text-transform:uppercase;letter-spacing:0.04em;font-weight:600;padding:6px 8px;text-align:right;white-space:nowrap;background:var(--ds-surface-secondary);border-bottom:1px solid var(--ds-border-primary)"
                      >
                        BID
                      </th>
                      <th
                        style="font-size:9px;color:var(--ds-text-secondary);text-transform:uppercase;letter-spacing:0.04em;font-weight:600;padding:6px 8px;text-align:right;white-space:nowrap;background:var(--ds-surface-secondary);border-bottom:1px solid var(--ds-border-primary)"
                      >
                        BID SIZE
                      </th>
                      <th
                        style="font-size:9px;color:var(--ds-text-secondary);text-transform:uppercase;letter-spacing:0.04em;font-weight:600;padding:6px 8px;text-align:right;white-space:nowrap;background:var(--ds-surface-secondary);border-bottom:1px solid var(--ds-border-primary)"
                      >
                        ASK
                      </th>
                      <th
                        style="font-size:9px;color:var(--ds-text-secondary);text-transform:uppercase;letter-spacing:0.04em;font-weight:600;padding:6px 8px;text-align:right;white-space:nowrap;background:var(--ds-surface-secondary);border-bottom:1px solid var(--ds-border-primary)"
                      >
                        ASK SIZE
                      </th>
                      <th
                        style="font-size:9px;color:var(--ds-text-secondary);text-transform:uppercase;letter-spacing:0.04em;font-weight:600;padding:6px 8px;text-align:right;white-space:nowrap;background:var(--ds-surface-secondary);border-bottom:1px solid var(--ds-border-primary)"
                      >
                        SPREAD
                      </th>
                      <th
                        style="font-size:9px;color:var(--ds-text-secondary);text-transform:uppercase;letter-spacing:0.04em;font-weight:600;padding:6px 8px;text-align:left;white-space:nowrap;background:var(--ds-surface-secondary);border-bottom:1px solid var(--ds-border-primary)"
                      >
                        STATUS
                      </th>
                      <th
                        style="font-size:9px;color:var(--ds-text-secondary);text-transform:uppercase;letter-spacing:0.04em;font-weight:600;padding:6px 8px;text-align:left;white-space:nowrap;background:var(--ds-surface-secondary);border-bottom:1px solid var(--ds-border-primary)"
                      >
                        ACTION
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      *ngFor="let q of sortedQuotes"
                      [style.opacity]="q.status === 'stale' || q.status === 'done' ? 0.5 : 1"
                    >
                      <td
                        style="font-family:'JetBrains Mono',monospace;font-size:11px;padding:6px 8px;border-bottom:1px solid var(--ds-border-primary);white-space:nowrap;font-weight:700;color:var(--ds-accent-info)"
                      >
                        {{ q.dealer }}
                      </td>
                      <td
                        style="font-family:'JetBrains Mono',monospace;font-size:11px;padding:6px 8px;border-bottom:1px solid var(--ds-border-primary);white-space:nowrap;text-align:right"
                        [style.font-weight]="q.bid === bestBid ? '700' : '400'"
                        [style.color]="q.bid === bestBid ? 'var(--ds-accent-info)' : 'var(--ds-text-secondary)'"
                      >
                        {{ q.bid.toFixed(3)
                        }}<span
                          *ngIf="q.bid === bestBid"
                          style="margin-left:4px;font-size:9px;font-weight:700;color:var(--ds-accent-info)"
                          >&#9650;BEST</span
                        >
                      </td>
                      <td
                        style="font-family:'JetBrains Mono',monospace;font-size:11px;padding:6px 8px;border-bottom:1px solid var(--ds-border-primary);white-space:nowrap;text-align:right;color:var(--ds-text-secondary)"
                      >
                        {{ q.bidSize }}
                      </td>
                      <td
                        style="font-family:'JetBrains Mono',monospace;font-size:11px;padding:6px 8px;border-bottom:1px solid var(--ds-border-primary);white-space:nowrap;text-align:right"
                        [style.font-weight]="q.ask === bestAsk ? '700' : '400'"
                        [style.color]="q.ask === bestAsk ? 'var(--ds-accent-negative)' : 'var(--ds-accent-negative)'"
                      >
                        {{ q.ask.toFixed(3)
                        }}<span
                          *ngIf="q.ask === bestAsk"
                          style="margin-left:4px;font-size:9px;font-weight:700;color:var(--ds-accent-negative)"
                          >&#9660;BEST</span
                        >
                      </td>
                      <td
                        style="font-family:'JetBrains Mono',monospace;font-size:11px;padding:6px 8px;border-bottom:1px solid var(--ds-border-primary);white-space:nowrap;text-align:right;color:var(--ds-text-secondary)"
                      >
                        {{ q.askSize }}
                      </td>
                      <td
                        style="font-family:'JetBrains Mono',monospace;font-size:11px;padding:6px 8px;border-bottom:1px solid var(--ds-border-primary);white-space:nowrap;text-align:right;color:var(--ds-accent-warning)"
                      >
                        {{ ((q.ask - q.bid) * 100).toFixed(1) }}c
                      </td>
                      <td
                        style="font-family:'JetBrains Mono',monospace;font-size:11px;padding:6px 8px;border-bottom:1px solid var(--ds-border-primary);white-space:nowrap"
                      >
                        <span
                          style="font-size:9px;padding:1px 6px;border-radius:2px"
                          [style.background]="statusBg(q.status)"
                          [style.color]="statusColor(q.status)"
                          [style.border]="'1px solid ' + statusBorder(q.status)"
                          >{{ q.status.toUpperCase() }}</span
                        >
                      </td>
                      <td
                        style="font-family:'JetBrains Mono',monospace;font-size:11px;padding:6px 8px;border-bottom:1px solid var(--ds-border-primary);white-space:nowrap"
                      >
                        <ng-container *ngIf="q.status === 'done'">
                          <span style="color:var(--ds-accent-positive)">&#10003;</span>
                        </ng-container>
                        <ng-container
                          *ngIf="
                            q.status !== 'done' &&
                            q.status !== 'stale' &&
                            activeReq!.status !== 'done'
                          "
                        >
                          <div style="display:flex;gap:6px">
                            <button
                              class="font-mono-fi font-bold"
                              (click)="hitLift(activeReq!.id, q.dealer, 'hit')"
                              style="font-size:11px;padding:4px 10px;border-radius:2px;background:rgba(59,130,246,0.15);color:var(--ds-accent-info);border:1px solid rgba(59,130,246,0.35);cursor:pointer"
                            >
                              HIT
                            </button>
                            <button
                              class="font-mono-fi font-bold"
                              (click)="hitLift(activeReq!.id, q.dealer, 'lift')"
                              style="font-size:11px;padding:4px 10px;border-radius:2px;background:rgba(20,217,160,0.15);color:var(--ds-accent-positive);border:1px solid rgba(20,217,160,0.35);cursor:pointer"
                            >
                              LIFT
                            </button>
                          </div>
                        </ng-container>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <!-- Done banner -->
            <div
              *ngIf="activeReq.status === 'done'"
              style="display:flex;align-items:center;gap:12px;padding:8px 16px;border-top:1px solid var(--ds-border-primary);flex-shrink:0;background:rgba(20,217,160,0.05)"
            >
              <span class="font-mono-fi font-bold" style="font-size:11px;color:var(--ds-accent-positive)"
                >RFQ COMPLETE</span
              >
            </div>
          </ng-container>
          <div
            *ngIf="!activeReq"
            style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px"
          >
            <div class="font-mono-fi" style="font-size:11px;color:var(--ds-text-faint)">
              Select a bond from the blotter, then send an RFQ
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class RfqWidget implements OnInit, OnDestroy {
  @Input() api: any;
  @Input() panel: any;

  private shared = inject(SharedStateService);
  private quoteInterval: any;
  private staleInterval: any;
  private tickInterval: any;
  tick = signal(0); // triggers template re-render for countdown

  dealers = DEALERS;
  rfqSide: 'Buy' | 'Sell' = 'Buy';
  rfqSize = '5';
  activeId = '';
  instrSearch = '';
  instrOpen = false;
  localBond: Bond | null = null;

  get activeBond(): Bond | null {
    return this.localBond || this.shared.selectedBond();
  }
  get requests(): RfqRequest[] {
    return this.shared.rfqRequests();
  }
  get activeReq(): RfqRequest | null {
    return this.requests.find((r) => r.id === this.activeId) || this.requests[0] || null;
  }
  get liveCount(): number {
    return this.requests.filter((r) => r.status === 'pending' || r.status === 'quoted').length;
  }
  get bestBid(): number {
    return this.activeReq ? Math.max(...this.activeReq.quotes.map((q) => q.bid), 0) : 0;
  }
  get bestAsk(): number {
    return this.activeReq
      ? Math.min(...this.activeReq.quotes.filter((q) => q.ask > 0).map((q) => q.ask), 9999)
      : 9999;
  }
  get sortedQuotes() {
    return this.activeReq ? [...this.activeReq.quotes].sort((a, b) => b.bid - a.bid) : [];
  }
  get instrResults(): Bond[] {
    if (this.instrSearch.length === 0) return [];
    const q = this.instrSearch.toLowerCase();
    return BONDS.filter(
      (b) =>
        b.ticker.toLowerCase().includes(q) ||
        b.issuer.toLowerCase().includes(q) ||
        b.cusip.toLowerCase().includes(q) ||
        `${b.cpn}`.includes(q) ||
        b.mat.includes(q),
    ).slice(0, 8);
  }

  constructor() {
    effect(() => {
      const bond = this.shared.selectedBond();
      this.localBond = bond;
      this.instrSearch = '';
      this.instrOpen = false;
    });
  }

  // Countdown helpers (called from template — read tick() to stay reactive)
  countdownRemaining(createdAt: number): number {
    this.tick(); // subscribe to tick signal
    return Math.max(0, RFQ_TTL - (Date.now() - createdAt) / 1000);
  }
  countdownSecs(createdAt: number): string {
    const s = Math.ceil(this.countdownRemaining(createdAt));
    return s > 0 ? `${s}` : '—';
  }
  countdownColor(createdAt: number): string {
    const r = this.countdownRemaining(createdAt);
    return r > 15 ? 'var(--ds-accent-info)' : r > 7 ? 'var(--ds-accent-warning)' : 'var(--ds-accent-negative)';
  }
  countdownDash(createdAt: number): string {
    const r = this.countdownRemaining(createdAt);
    const C = 2 * Math.PI * 11;
    return `${(r / RFQ_TTL) * C} ${C}`;
  }

  get hasCompletedRfqs(): boolean {
    return this.requests.some((r) => r.status === 'done' || r.status === 'cancelled');
  }

  cancelRfq(rfqId: string) {
    this.shared.rfqRequests.update((prev) =>
      prev.map((r) =>
        r.id === rfqId
          ? {
              ...r,
              status: 'cancelled' as const,
              quotes: r.quotes.map((q) => ({ ...q, status: 'stale' as const })),
            }
          : r,
      ),
    );
  }

  removeRfq(rfqId: string) {
    this.shared.rfqRequests.update((prev) => prev.filter((r) => r.id !== rfqId));
    if (this.activeId === rfqId) this.activeId = '';
  }

  clearHistory() {
    this.shared.rfqRequests.update((prev) =>
      prev.filter((r) => r.status === 'pending' || r.status === 'quoted'),
    );
    this.activeId = '';
  }

  ngOnInit() {
    // Tick signal drives countdown ring re-renders
    this.tickInterval = setInterval(() => this.tick.update((v) => v + 1), 200);
    this.quoteInterval = setInterval(() => {
      this.shared.rfqRequests.update((prev) =>
        prev.map((r) => {
          if (r.status !== 'pending') return r;
          const elapsed = Date.now() - r.createdAt;
          if (elapsed < 800) return r;
          if (r.quotes.length < 6 && Math.random() < 0.6) {
            const remaining = DEALERS.filter((d) => !r.quotes.find((q) => q.dealer === d));
            if (remaining.length === 0) return { ...r, status: 'quoted' as const };
            const dealer = remaining[Math.floor(Math.random() * remaining.length)];
            const bond = this.activeBond || ({ bid: 100, ask: 100.25 } as Bond);
            const quote = makeQuote(bond, r.side, dealer);
            return {
              ...r,
              quotes: [...r.quotes, quote],
              status: (r.quotes.length >= 4 ? 'quoted' : 'pending') as any,
            };
          }
          if (r.quotes.length >= 4) return { ...r, status: 'quoted' as const };
          return r;
        }),
      );
    }, 600);
    this.staleInterval = setInterval(() => {
      this.shared.rfqRequests.update((prev) =>
        prev.map((r) => {
          const elapsed = (Date.now() - r.createdAt) / 1000;
          if ((r.status === 'pending' || r.status === 'quoted') && elapsed >= RFQ_TTL) {
            return {
              ...r,
              status: 'cancelled' as const,
              quotes: r.quotes.map((q) => ({ ...q, status: 'stale' as const })),
            };
          }
          return {
            ...r,
            quotes: r.quotes.map((q) => ({
              ...q,
              status: (q.status === 'live' && Date.now() - q.ts > RFQ_TTL * 1000
                ? 'stale'
                : q.status) as any,
            })),
          };
        }),
      );
    }, 1000);
  }

  ngOnDestroy() {
    if (this.quoteInterval) clearInterval(this.quoteInterval);
    if (this.staleInterval) clearInterval(this.staleInterval);
    if (this.tickInterval) clearInterval(this.tickInterval);
  }

  pickBond(b: Bond) {
    this.localBond = b;
    this.instrSearch = '';
    this.instrOpen = false;
  }

  sendRfq() {
    if (!this.activeBond) return;
    const id = `RFQ-${String(rfqCounter++).padStart(4, '0')}`;
    const newReq: RfqRequest = {
      id,
      bond: `${this.activeBond.ticker} ${this.activeBond.cpn} ${this.activeBond.mat}`,
      size: `$${this.rfqSize}MM`,
      side: this.rfqSide,
      status: 'pending',
      quotes: [],
      createdAt: Date.now(),
    };
    this.shared.rfqRequests.update((prev) => [newReq, ...prev]);
    this.activeId = id;
  }

  hitLift(rfqId: string, dealer: string, action: 'hit' | 'lift') {
    this.shared.rfqRequests.update((prev) =>
      prev.map((r) => {
        if (r.id !== rfqId) return r;
        return {
          ...r,
          status: 'done' as const,
          quotes: r.quotes
            .filter((q) => q.dealer === dealer)
            .map((q) => ({ ...q, status: 'done' as const })),
        };
      }),
    );
    setTimeout(() => {
      this.activeId = '';
      this.rfqSize = '5';
    }, 3000);
  }

  statusBg(s: string) {
    return s === 'pending'
      ? 'rgba(59,130,246,0.1)'
      : s === 'quoted'
        ? 'rgba(255,140,66,0.1)'
        : s === 'done'
          ? 'rgba(20,217,160,0.1)'
          : 'rgba(255,77,109,0.1)';
  }
  statusColor(s: string) {
    return s === 'pending'
      ? 'var(--ds-accent-info)'
      : s === 'quoted'
        ? 'var(--ds-accent-warning)'
        : s === 'done'
          ? 'var(--ds-accent-positive)'
          : 'var(--ds-accent-negative)';
  }
  statusBorder(s: string) {
    return s === 'pending'
      ? 'rgba(59,130,246,0.25)'
      : s === 'quoted'
        ? 'rgba(255,140,66,0.25)'
        : s === 'done'
          ? 'rgba(20,217,160,0.25)'
          : 'rgba(255,77,109,0.25)';
  }
}
