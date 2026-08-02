import { useState } from 'react';
import type { WidgetProps } from '@widgetstools/react-dock-manager';
import { Badge, ScrollArea } from '@wellsfargo-starui/react';
import { RESEARCH_NOTES } from '../../data/seeds';
import type { ResearchNote } from '../../data/types';
import { useResearchSelection } from '../../state/ResearchProvider';
import { ratingBadgeStyle } from './ratingHelpers';

// ── Sector filter helpers ──────────────────────────────────────────────────────

const ALL_SECTORS: string[] = ['All', ...Array.from(new Set(RESEARCH_NOTES.map((n) => n.sector))).sort()];

// ── Sub-components ────────────────────────────────────────────────────────────

function SectorChips({ active, onChange }: { active: string; onChange: (s: string) => void }) {
  return (
    <div
      className="flex shrink-0 flex-wrap gap-1 border-b px-3 py-2"
      style={{ borderColor: 'var(--ds-border-primary)' }}
    >
      {ALL_SECTORS.map((sector) => {
        const isActive = sector === active;
        return (
          <button
            key={sector}
            onClick={() => onChange(sector)}
            className="rounded px-2 py-0.5 text-[11px] font-medium transition-colors"
            style={{
              background: isActive ? 'var(--ds-state-selection)' : 'transparent',
              color: isActive ? 'var(--ds-text-primary)' : 'var(--ds-text-secondary)',
              border: `1px solid ${isActive ? 'var(--ds-border-secondary)' : 'var(--ds-border-tertiary)'}`,
            }}
          >
            {sector}
          </button>
        );
      })}
    </div>
  );
}

function NoteCard({ note, isSelected, onClick }: { note: ResearchNote; isSelected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-none border-b px-3 py-2.5 text-left transition-colors${isSelected ? '' : ' hover:bg-[color:var(--ds-state-hover-overlay)]'}`}
      style={{
        borderColor: 'var(--ds-border-tertiary)',
        background: isSelected ? 'var(--ds-state-selection)' : undefined,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[12px] font-semibold leading-tight"
          style={{ fontFamily: 'var(--ds-font-mono)', color: 'var(--ds-text-primary)' }}
        >
          {note.ticker}
        </span>
        <Badge
          variant="outline"
          className="shrink-0 text-[10px]"
          style={ratingBadgeStyle(note.rating)}
        >
          {note.rating}
        </Badge>
      </div>
      <div
        className="mt-1 text-[12px] font-medium leading-snug"
        style={{ color: 'var(--ds-text-primary)' }}
      >
        {note.title}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--ds-text-muted)' }}>
        <span>{note.author}</span>
        <span>·</span>
        <span>{note.sector}</span>
        <span>·</span>
        <span>{note.date}</span>
      </div>
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ResearchList(_props: WidgetProps) {
  const [activeSector, setActiveSector] = useState<string>('All');
  const { selectedNoteId, setSelectedNoteId } = useResearchSelection();

  const filtered = activeSector === 'All'
    ? RESEARCH_NOTES
    : RESEARCH_NOTES.filter((n) => n.sector === activeSector);

  return (
    <div className="flex h-full flex-col" data-testid="panel-researchList">
      <div
        className="shrink-0 border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-wide"
        style={{ borderColor: 'var(--ds-border-primary)', color: 'var(--ds-text-secondary)' }}
      >
        Research Notes
      </div>
      <SectorChips active={activeSector} onChange={setActiveSector} />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col">
          {filtered.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              isSelected={note.id === selectedNoteId}
              onClick={() => setSelectedNoteId(note.id)}
            />
          ))}
          {filtered.length === 0 && (
            <div
              className="flex items-center justify-center py-8 text-[12px]"
              style={{ color: 'var(--ds-text-faint)' }}
            >
              No notes for this sector.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
