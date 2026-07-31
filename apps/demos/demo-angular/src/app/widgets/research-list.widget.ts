import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedStateService } from '../services/shared-state.service';
import { RESEARCH_NOTES } from '../services/trading-data.service';

@Component({
  selector: 'research-list-widget',
  standalone: true,
  imports: [CommonModule],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `
    <div
      style="display:flex;flex-direction:column;height:100%;background:var(--ds-surface-primary);overflow:hidden"
    >
      <div
        style="display:flex;align-items:center;justify-content:space-between;padding:4px 10px;flex-shrink:0"
      >
        <div style="display:flex;flex-wrap:wrap;gap:3px">
          <button
            *ngFor="let s of sectors"
            (click)="shared.researchFilter.set(s)"
            class="font-mono-fi"
            style="font-size:9px;padding:2px 8px;border-radius:2px;cursor:pointer"
            [style.background]="shared.researchFilter() === s ? 'var(--ds-border-primary)' : 'transparent'"
            [style.border]="'1px solid var(--ds-border-primary)'"
            [style.color]="shared.researchFilter() === s ? 'var(--ds-text-primary)' : 'var(--ds-text-secondary)'"
          >
            {{ s }}
          </button>
        </div>
        <span
          style="font-size:11px;color:var(--ds-text-muted);font-family:JetBrains Mono,monospace;flex-shrink:0;margin-left:8px"
          >{{ filteredNotes.length }} notes</span
        >
      </div>
      <div style="flex:1;overflow-y:auto">
        <div
          *ngFor="let note of filteredNotes"
          (click)="shared.selectedNote.set(note)"
          style="margin:6px 8px;padding:12px;border-radius:3px;cursor:pointer;transition:border-color .15s"
          [style.background]="
            shared.selectedNote().id === note.id ? 'var(--ds-surface-secondary)' : 'var(--ds-surface-primary)'
          "
          [style.border]="
            '1px solid ' + (shared.selectedNote().id === note.id ? 'var(--ds-accent-warning)' : 'var(--ds-border-primary)')
          "
        >
          <div
            style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:5px"
          >
            <div>
              <span
                style="font-size:11px;font-weight:700;color:var(--ds-accent-info);font-family:JetBrains Mono,monospace"
                >{{ note.ticker }}</span
              >
              <span
                style="font-size:9px;color:var(--ds-text-muted);font-family:JetBrains Mono,monospace;margin-left:8px"
                >{{ note.date }}</span
              >
            </div>
            <span
              style="font-size:9px;padding:1px 5px;border-radius:2px;flex-shrink:0;font-family:JetBrains Mono,monospace"
              [style.background]="ratingBg(note.rating)"
              [style.color]="ratingColor(note.rating)"
              [style.border]="'1px solid ' + ratingBorder(note.rating)"
              >{{ note.rating }}</span
            >
          </div>
          <div
            style="font-size:11px;color:var(--ds-text-primary);line-height:1.4;margin-bottom:5px;font-family:JetBrains Mono,monospace"
          >
            {{ note.title }}
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <span style="font-size:9px;color:var(--ds-text-muted);font-family:JetBrains Mono,monospace">{{
              note.author
            }}</span>
            <span
              style="font-size:9px;padding:0 4px;border-radius:2px;background:var(--ds-surface-secondary);color:var(--ds-text-secondary);border:1px solid var(--ds-border-primary);font-family:JetBrains Mono,monospace"
              >{{ note.sector }}</span
            >
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ResearchListWidget {
  @Input() api: any;
  @Input() panel: any;
  shared = inject(SharedStateService);
  sectors = ['All', 'Government', 'Financials', 'Technology', 'Consumer', 'Cross-Asset'];

  get filteredNotes() {
    const f = this.shared.researchFilter();
    return RESEARCH_NOTES.filter((n) => f === 'All' || n.sector === f);
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
