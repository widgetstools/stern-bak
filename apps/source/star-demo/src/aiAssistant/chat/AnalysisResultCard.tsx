/**
 * The compact reference a data-tool result leaves in the transcript now that
 * `ToolCallCard` no longer renders the full notebook cell inline — the cell
 * itself lives in the side panel (`AnalysisPanel.tsx`). This is "here's what
 * ran, click to see it", not the analysis itself.
 *
 * Same `min-w-0`/`truncate` convention as the rest of the transcript's cards:
 * a long `ran` description has to shrink, not widen the column and push
 * `self-end` user bubbles off-screen.
 */
import { BarChart3, ArrowUpRight } from 'lucide-react';
import { cn } from '@wellsfargo-starui/react';
import type { DataCellPayload } from '../dataTools';

export function AnalysisResultCard({ payload, onOpen }: { payload: DataCellPayload; onOpen?: () => void }) {
  return (
    <button
      type="button"
      // Wrapped, not `onClick={onOpen}` directly: React's onClick always
      // hands the handler a MouseEvent, and a `() => void`-typed callback
      // doesn't stop that from being passed through at runtime — only a
      // wrapper that discards its own argument does. `onOpen` must never
      // receive anything; see the id-safety note on `ToolCallCardProps`.
      onClick={() => onOpen?.()}
      disabled={!onOpen}
      title="View in the analysis panel"
      aria-label="View in the analysis panel"
      className={cn(
        'flex w-full items-center gap-2 rounded-lg border border-border/60 px-2.5 py-1.5 text-left text-xs',
        onOpen && 'cursor-pointer hover:bg-muted/40 transition-colors',
      )}
    >
      <BarChart3 className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
      <span className="font-mono text-[11px] flex-shrink-0 text-foreground/90">{payload.gridName}</span>
      <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{payload.ran}</span>
      {payload.source === 'sample' && (
        // A generated sample must never read like the user's real data — the
        // same promise ProvenanceLine keeps inside the panel's full cell.
        <span className="flex-shrink-0 rounded border border-border/60 px-1 py-0.5 text-[9px] uppercase tracking-wider text-foreground">
          sample
        </span>
      )}
      <span className="font-mono text-[10px] tabular-nums text-muted-foreground flex-shrink-0">{payload.rowCount} rows</span>
      {onOpen && <ArrowUpRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />}
    </button>
  );
}
