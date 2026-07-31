import { Component, Input, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedStateService } from '../services/shared-state.service';

@Component({
  selector: 'order-kpi-widget',
  standalone: true,
  imports: [CommonModule],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `
    <div
      style="display:flex;align-items:stretch;height:100%;overflow:hidden;background:var(--ds-surface-primary);gap:1px"
    >
      <!-- Fill rate ring -->
      <div style="display:flex;align-items:center;gap:14px;padding:8px 18px;flex-shrink:0">
        <div style="position:relative;width:48px;height:48px">
          <svg viewBox="0 0 48 48" width="48" height="48">
            <circle cx="24" cy="24" r="20" fill="none" stroke="var(--ds-surface-tertiary)" stroke-width="4" />
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="var(--ds-accent-positive)"
              stroke-width="4"
              [attr.stroke-dasharray]="fillRate * 1.257 + ' 125.7'"
              stroke-linecap="round"
              transform="rotate(-90 24 24)"
              style="transition:stroke-dasharray 0.5s ease"
            />
          </svg>
          <div
            style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"
          >
            <span class="font-mono-fi font-bold" style="font-size:13px;color:var(--ds-text-primary)"
              >{{ fillRate }}%</span
            >
          </div>
        </div>
        <div>
          <div
            class="font-mono-fi font-bold"
            style="font-size:18px;color:var(--ds-text-primary);line-height:1"
          >
            {{ total }}
          </div>
          <div style="font-size:9px;color:var(--ds-text-muted);margin-top:2px">ORDERS TODAY</div>
        </div>
      </div>
      <div style="width:1px;background:var(--ds-border-primary);align-self:stretch;margin:8px 0"></div>
      <!-- Status breakdown -->
      <div
        style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:8px 18px;gap:6px"
      >
        <div
          style="display:flex;height:6px;border-radius:3px;overflow:hidden;background:var(--ds-surface-tertiary)"
        >
          <div
            *ngIf="filled > 0"
            [style.width.%]="(filled / total) * 100"
            style="background:var(--ds-accent-positive);transition:width 0.5s ease"
          ></div>
          <div
            *ngIf="pending > 0"
            [style.width.%]="(pending / total) * 100"
            style="background:var(--ds-accent-warning);transition:width 0.5s ease"
          ></div>
          <div
            *ngIf="cancelled > 0"
            [style.width.%]="(cancelled / total) * 100"
            style="background:var(--ds-accent-negative);transition:width 0.5s ease"
          ></div>
        </div>
        <div style="display:flex;gap:16px">
          <div *ngFor="let s of statusItems" style="display:flex;align-items:center;gap:5px">
            <div
              style="width:6px;height:6px;border-radius:50%;flex-shrink:0"
              [style.background]="s.color"
            ></div>
            <span style="font-size:9px;color:var(--ds-text-muted)">{{ s.label }}</span>
            <span class="font-mono-fi font-semibold" style="font-size:11px;color:var(--ds-text-primary)">{{
              s.val
            }}</span>
          </div>
        </div>
      </div>
      <div style="width:1px;background:var(--ds-border-primary);align-self:stretch;margin:8px 0"></div>
      <!-- Notional -->
      <div style="display:flex;align-items:center;gap:16px;padding:8px 18px;flex-shrink:0">
        <div>
          <div style="font-size:9px;color:var(--ds-text-muted);margin-bottom:2px">TOTAL NOTIONAL</div>
          <div
            class="font-mono-fi font-bold"
            style="font-size:18px;color:var(--ds-accent-info);line-height:1"
          >
            $67MM
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:3px">
          <div style="display:flex;align-items:center;gap:5px">
            <span style="font-size:9px;color:var(--ds-text-muted);width:24px">BUY</span>
            <div
              style="width:60px;height:4px;border-radius:2px;background:var(--ds-surface-tertiary);overflow:hidden"
            >
              <div style="width:62%;height:100%;background:var(--ds-accent-positive);border-radius:2px"></div>
            </div>
            <span class="font-mono-fi" style="font-size:9px;color:var(--ds-accent-positive)">$42M</span>
          </div>
          <div style="display:flex;align-items:center;gap:5px">
            <span style="font-size:9px;color:var(--ds-text-muted);width:24px">SELL</span>
            <div
              style="width:60px;height:4px;border-radius:2px;background:var(--ds-surface-tertiary);overflow:hidden"
            >
              <div style="width:38%;height:100%;background:var(--ds-accent-negative);border-radius:2px"></div>
            </div>
            <span class="font-mono-fi" style="font-size:9px;color:var(--ds-accent-negative)">$25M</span>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class OrderKpiWidget {
  @Input() api: any;
  @Input() panel: any;
  private shared = inject(SharedStateService);

  get orders() {
    return this.shared.orders();
  }
  get filled() {
    return this.orders.filter((o) => o.status === 'Filled').length;
  }
  get pending() {
    return this.orders.filter((o) => o.status === 'Pending' || o.status === 'Partial').length;
  }
  get cancelled() {
    return this.orders.filter((o) => o.status === 'Cancelled').length;
  }
  get total() {
    return this.orders.length;
  }
  get fillRate() {
    return this.total > 0 ? Math.round((this.filled / this.total) * 100) : 0;
  }
  get statusItems() {
    return [
      { label: 'Filled', val: this.filled, color: 'var(--ds-accent-positive)' },
      { label: 'Pending', val: this.pending, color: 'var(--ds-accent-warning)' },
      { label: 'Cancelled', val: this.cancelled, color: 'var(--ds-accent-negative)' },
    ];
  }
}
