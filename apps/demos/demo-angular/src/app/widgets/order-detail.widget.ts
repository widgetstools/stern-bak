import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedStateService } from '../services/shared-state.service';

@Component({
  selector: 'order-detail-widget',
  standalone: true,
  imports: [CommonModule],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `
    <div
      style="display:flex;flex-direction:column;height:100%;background:var(--ds-surface-primary);overflow:hidden"
    >
      <ng-container *ngIf="shared.selectedOrder() as sel">
        <div
          style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px"
        >
          <div
            style="padding:12px;border-radius:3px;border:1px solid var(--ds-border-primary);background:var(--ds-surface-secondary)"
          >
            <div
              style="font-family:JetBrains Mono,monospace;font-weight:700;font-size:11px;color:var(--ds-accent-info);margin-bottom:5px"
            >
              {{ sel.bond }}
            </div>
            <span
              class="font-mono-fi"
              style="font-size:9px;padding:1px 6px;border-radius:2px"
              [ngClass]="statusClass(sel.status)"
              >{{ sel.status }}</span
            >
          </div>
          <div
            *ngFor="let item of getFields(sel)"
            style="display:flex;align-items:center;justify-content:space-between;padding-bottom:6px;border-bottom:1px solid rgba(43,49,57,0.5)"
          >
            <span style="font-size:9px;color:var(--ds-text-secondary);font-family:JetBrains Mono,monospace">{{
              item.label
            }}</span>
            <span
              style="font-size:11px;font-family:JetBrains Mono,monospace"
              [style.color]="
                item.label === 'Side'
                  ? item.value === 'Buy'
                    ? 'var(--ds-accent-positive)'
                    : 'var(--ds-accent-negative)'
                  : 'var(--ds-text-primary)'
              "
              >{{ item.value }}</span
            >
          </div>
          <button
            *ngIf="sel.status === 'Pending' || sel.status === 'Partial'"
            style="width:100%;padding:7px;border-radius:3px;border:1px solid rgba(255,77,109,0.3);background:rgba(255,77,109,0.1);color:var(--ds-accent-negative);font-family:JetBrains Mono,monospace;font-weight:700;font-size:11px;cursor:pointer;margin-top:4px"
          >
            CANCEL ORDER
          </button>
        </div>
      </ng-container>
      <div
        *ngIf="!shared.selectedOrder()"
        style="flex:1;display:flex;align-items:center;justify-content:center"
      >
        <span style="font-size:11px;color:var(--ds-text-faint);font-family:JetBrains Mono,monospace"
          >Click a row to view detail</span
        >
      </div>
    </div>
  `,
})
export class OrderDetailWidget {
  @Input() api: any;
  @Input() panel: any;
  shared = inject(SharedStateService);

  getFields(sel: any) {
    return [
      { label: 'Order Type', value: sel.type },
      { label: 'Side', value: sel.side },
      { label: 'Quantity', value: sel.qty },
      { label: 'Filled', value: sel.filled },
      { label: 'Price', value: sel.px > 0 ? sel.px.toFixed(3) : '---' },
      { label: 'YTM', value: sel.ytm > 0 ? sel.ytm.toFixed(2) + '%' : '---' },
      { label: 'Time', value: sel.time },
      { label: 'Settlement', value: 'T+2' },
    ];
  }

  statusClass(s: string) {
    if (s === 'Filled') return 'badge-filled';
    if (s === 'Partial') return 'badge-partial';
    if (s === 'Pending') return 'badge-new';
    if (s === 'Cancelled') return 'badge-cancel';
    return 'badge-new';
  }
}
