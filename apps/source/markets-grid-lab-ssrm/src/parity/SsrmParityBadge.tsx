/**
 * One-line parity verdict rendered above each tab's grid, expandable to the
 * mechanism notes — so a gap is stated where the feature is being looked
 * at, not only on the matrix page.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ParityEntry, ParityStatus } from './parityNotes';

export const STATUS_LABEL: Record<ParityStatus, string> = {
  full: 'Full parity',
  partial: 'Partial',
  gap: 'Gap',
};

export const STATUS_CLASS: Record<ParityStatus, string> = {
  full: 'border-[color:var(--ds-accent-positive)] text-[color:var(--ds-accent-positive)]',
  partial: 'border-[color:var(--ds-accent-warning)] text-[color:var(--ds-accent-warning)]',
  gap: 'border-[color:var(--ds-accent-negative)] text-[color:var(--ds-accent-negative)]',
};

export function SsrmParityBadge({ entry }: { entry: ParityEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="mb-2 rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)]"
      data-testid={`parity-badge-${entry.tabId}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
        <span
          className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_CLASS[entry.status]}`}
        >
          {STATUS_LABEL[entry.status]}
        </span>
        <span className="min-w-0 truncate text-[12px] text-[color:var(--ds-text-secondary)]">
          {entry.summary}
        </span>
      </button>
      {open ? (
        <ul className="flex flex-col gap-1 border-t border-[color:var(--ds-border-primary)] px-4 py-2 pl-8">
          {entry.notes.map((note) => (
            <li key={note} className="list-disc text-[12px] leading-snug text-[color:var(--ds-text-primary)]">
              {note}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
