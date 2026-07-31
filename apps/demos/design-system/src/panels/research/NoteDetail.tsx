import type { WidgetProps } from '@widgetstools/react-dock-manager';
import { Badge, Card, CardContent, CardHeader, CardTitle, ScrollArea } from '@wellsfargo-starui/ui';
import { RESEARCH_NOTES } from '../../data/seeds';
import type { ResearchNote } from '../../data/types';
import { useResearchSelection } from '../../state/ResearchProvider';
import { ratingBadgeStyle } from './ratingHelpers';

// ── Sub-components ────────────────────────────────────────────────────────────

function MetaGrid({ note }: { note: ResearchNote }) {
  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-1 py-2">
      <MetaItem label="Author" value={note.author} />
      <MetaItem label="Sector" value={note.sector} />
      <MetaItem label="Published" value={note.date} />
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--ds-text-muted)' }}>
        {label}
      </span>
      <span className="text-[12px]" style={{ color: 'var(--ds-text-secondary)' }}>
        {value}
      </span>
    </div>
  );
}

function OasCards({ note }: { note: ResearchNote }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card>
        <CardHeader className="pb-1 pt-3 px-3">
          <CardTitle className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--ds-text-secondary)' }}>
            OAS Target (12M)
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3 px-3">
          <span
            className="text-[22px] font-semibold leading-tight"
            style={{ fontFamily: 'var(--ds-font-mono)', color: 'var(--ds-accent-positive)' }}
          >
            {note.oasTarget !== null ? `${note.oasTarget} bp` : '—'}
          </span>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-1 pt-3 px-3">
          <CardTitle className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--ds-text-secondary)' }}>
            Current OAS
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3 px-3">
          <span
            className="text-[22px] font-semibold leading-tight"
            style={{ fontFamily: 'var(--ds-font-mono)', color: 'var(--ds-accent-warning)' }}
          >
            {note.oasCurrent} bp
          </span>
        </CardContent>
      </Card>
    </div>
  );
}

function SummarySection({ summary }: { summary: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: 'var(--ds-text-secondary)' }}
      >
        Summary
      </span>
      <p className="text-[13px] leading-relaxed" style={{ color: 'var(--ds-text-primary)' }}>
        {summary}
      </p>
    </div>
  );
}

function KeyRisks({ risks }: { risks: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <span
        className="text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: 'var(--ds-text-secondary)' }}
      >
        Key Risks
      </span>
      <div
        className="rounded p-3"
        style={{
          border: '1px solid var(--ds-border-secondary)',
          background: 'var(--ds-surface-sunken)',
        }}
      >
        <ul className="flex flex-col gap-1.5">
          {risks.map((risk) => (
            <li key={risk} className="flex gap-2 text-[12px]" style={{ color: 'var(--ds-text-secondary)' }}>
              <span style={{ color: 'var(--ds-accent-negative)' }}>▸</span>
              {risk}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="flex h-full items-center justify-center text-[12px]"
      style={{ color: 'var(--ds-text-faint)' }}
    >
      Select a note from the list.
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function NoteDetail(_props: WidgetProps) {
  const { selectedNoteId } = useResearchSelection();
  const note = RESEARCH_NOTES.find((n) => n.id === selectedNoteId);

  return (
    <div className="flex h-full flex-col" data-testid="panel-noteDetail">
      {note ? <NoteContent note={note} /> : <EmptyState />}
    </div>
  );
}

function NoteContent({ note }: { note: ResearchNote }) {
  return (
    <>
      {/* Header */}
      <div
        className="shrink-0 border-b px-4 py-3"
        style={{ borderColor: 'var(--ds-border-primary)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span
              className="text-[14px] font-bold leading-tight"
              style={{ fontFamily: 'var(--ds-font-mono)', color: 'var(--ds-text-primary)' }}
            >
              {note.ticker}
            </span>
            <span className="text-[13px] font-medium" style={{ color: 'var(--ds-text-primary)' }}>
              {note.title}
            </span>
          </div>
          <Badge variant="outline" className="shrink-0 text-[11px]" style={ratingBadgeStyle(note.rating)}>
            {note.rating}
          </Badge>
        </div>
        <MetaGrid note={note} />
      </div>

      {/* Body */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4">
          <OasCards note={note} />
          <SummarySection summary={note.summary} />
          <KeyRisks risks={note.risks} />
        </div>
      </ScrollArea>
    </>
  );
}
