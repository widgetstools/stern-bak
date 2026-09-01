/**
 * The side panel: where a data-tool result actually renders now, instead of
 * inline in the transcript (see `AnalysisResultCard`/`ToolCallCard` for the
 * compact reference that's left behind there).
 *
 * Purely presentational — `entries`/`activeId` are derived and owned by
 * `AiAssistantPanel` (it also needs `entries.length` for the panel's
 * auto-open trigger and to reset `activeId` on a new chat), this just
 * renders whatever it's handed.
 */
import { BarChart3 } from 'lucide-react';
import { cn } from '@wellsfargo-starui/react';
import { DataResultCell } from './DataResultCell';
import type { DataCellPayload } from '../dataTools';

export interface AnalysisEntry {
  /** The TRANSCRIPT item's id — see the id-safety note on `ToolCallCardProps`. */
  id: string;
  payload: DataCellPayload;
}

export interface AnalysisPanelProps {
  entries: AnalysisEntry[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function AnalysisPanel({ entries, activeId, onSelect }: AnalysisPanelProps) {
  // Falls back to the newest entry when `activeId` doesn't (yet, or any
  // longer) match one — e.g. right after a new chat clears the transcript
  // but before the reset effect has caught up.
  const active = entries.find((e) => e.id === activeId) ?? entries.at(-1);

  if (!active) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <BarChart3 className="h-5 w-5 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">
          Analysis results open here — ask for a summary, a query, a pivot, or a chart.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {entries.length > 1 && (
        <div className="flex flex-shrink-0 gap-1 overflow-x-auto border-b border-border/60 px-2 py-1.5">
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onSelect(entry.id)}
              title={entry.payload.ran}
              className={cn(
                'max-w-[110px] flex-shrink-0 truncate rounded-full border px-2 py-0.5 text-[10px] transition-colors',
                entry.id === active.id
                  ? 'border-[color:var(--ds-bot-accent)] bg-[color:var(--ds-bot-accent)] text-[color:var(--ds-bot-accent-foreground)]'
                  : 'border-border/60 text-muted-foreground hover:text-foreground',
              )}
            >
              {entry.payload.gridName}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {/* Keyed on the entry id so switching entries resets DataResultCell's
            own local state (its "raw result" toggle) instead of leaking it
            across unrelated results. */}
        <DataResultCell key={active.id} payload={active.payload} />
      </div>
    </div>
  );
}
