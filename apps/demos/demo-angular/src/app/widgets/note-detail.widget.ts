import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedStateService } from '../services/shared-state.service';

@Component({
  selector: 'note-detail-widget',
  standalone: true,
  imports: [CommonModule],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `
    <div
      style="display:flex;flex-direction:column;height:100%;background:var(--ds-surface-primary);overflow:hidden"
    >
      <div style="display:flex;justify-content:flex-end;padding:4px 10px;flex-shrink:0">
        <button
          *ngFor="let b of actions"
          class="font-mono-fi"
          style="font-size:9px;padding:2px 8px;margin-left:3px;border-radius:2px;border:1px solid var(--ds-border-primary);background:transparent;color:var(--ds-text-secondary);cursor:pointer"
        >
          {{ b }}
        </button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:24px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
          <span
            style="font-size:18px;font-weight:700;color:var(--ds-accent-info);font-family:JetBrains Mono,monospace"
            >{{ note.ticker }}</span
          >
          <span
            style="font-size:11px;padding:3px 8px;border-radius:2px;font-family:JetBrains Mono,monospace"
            [style.background]="ratingBg(note.rating)"
            [style.color]="ratingColor(note.rating)"
            [style.border]="'1px solid ' + ratingBorder(note.rating)"
            >{{ note.rating }}</span
          >
        </div>
        <div
          style="font-size:13px;color:var(--ds-text-primary);line-height:1.5;max-width:600px;font-family:JetBrains Mono,monospace;margin-bottom:16px"
        >
          {{ note.title }}
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
          <div
            *ngFor="let f of metaFields"
            style="padding:12px;border-radius:3px;border:1px solid var(--ds-border-primary);background:var(--ds-surface-secondary)"
          >
            <div
              style="font-size:9px;color:var(--ds-text-secondary);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em"
            >
              {{ f.l }}
            </div>
            <div style="font-size:11px;color:var(--ds-text-primary);font-family:JetBrains Mono,monospace">
              {{ f.v }}
            </div>
          </div>
        </div>
        <div
          *ngIf="note.target"
          style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px"
        >
          <div
            style="padding:12px;border-radius:3px;border:1px solid var(--ds-border-primary);background:var(--ds-surface-secondary)"
          >
            <div
              style="font-size:9px;color:var(--ds-text-secondary);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em"
            >
              OAS Target (12M)
            </div>
            <div
              style="font-size:18px;font-weight:700;color:var(--ds-accent-positive);font-family:JetBrains Mono,monospace"
            >
              +{{ note.target }}bp
            </div>
          </div>
          <div
            style="padding:12px;border-radius:3px;border:1px solid var(--ds-border-primary);background:var(--ds-surface-secondary)"
          >
            <div
              style="font-size:9px;color:var(--ds-text-secondary);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em"
            >
              Current OAS
            </div>
            <div
              style="font-size:18px;font-weight:700;color:var(--ds-accent-warning);font-family:JetBrains Mono,monospace"
            >
              +{{ note.prev }}bp
            </div>
          </div>
        </div>
        <div style="border-top:1px solid var(--ds-border-primary);padding-top:16px">
          <div
            style="font-size:9px;color:var(--ds-text-secondary);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em"
          >
            Summary
          </div>
          <p
            style="font-size:11px;color:var(--ds-text-secondary);line-height:1.8;font-family:JetBrains Mono,monospace"
          >
            {{ note.body }}
          </p>
        </div>
      </div>
    </div>
  `,
})
export class NoteDetailWidget {
  @Input() api: any;
  @Input() panel: any;
  private shared = inject(SharedStateService);
  actions = ['PDF', 'Share'];

  get note() {
    return this.shared.selectedNote();
  }
  get metaFields() {
    return [
      { l: 'Author', v: this.note.author },
      { l: 'Sector', v: this.note.sector },
      { l: 'Published', v: this.note.date + ' 2026' },
    ];
  }

  ratingColor(r: string) {
    return r === 'Overweight'
      ? 'var(--ds-accent-positive)'
      : r === 'Underweight'
        ? 'var(--ds-accent-negative)'
        : 'var(--ds-accent-warning)';
  }
  ratingBg(r: string) {
    return r === 'Overweight'
      ? 'rgba(20,217,160,0.1)'
      : r === 'Underweight'
        ? 'rgba(255,77,109,0.1)'
        : 'rgba(255,140,66,0.1)';
  }
  ratingBorder(r: string) {
    return r === 'Overweight'
      ? 'rgba(20,217,160,0.3)'
      : r === 'Underweight'
        ? 'rgba(255,77,109,0.3)'
        : 'rgba(255,140,66,0.3)';
  }
}
