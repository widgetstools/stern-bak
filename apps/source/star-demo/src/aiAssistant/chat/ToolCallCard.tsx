/**
 * One tool invocation, rendered inline in the transcript — the visible
 * "what the assistant is doing" element, collapsed to a single line by
 * default and expandable to show the exact arguments and result.
 */
import { useState } from 'react';
import { ChevronRight, Loader2, Check, X, Wrench } from 'lucide-react';
import { cn } from '@wellsfargo-starui/react';
import { DataResultCell } from './DataResultCell';
import { DATA_CELL, type DataCellPayload } from '../dataTools';

export type ToolCallStatus = 'running' | 'ok' | 'error';

export interface ToolActivity {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: ToolCallStatus;
  /** Human-readable one-liner from the tool result. */
  summary?: string;
  /** Full result payload, shown when expanded. */
  result?: unknown;
}

/**
 * Monochrome by design: status reads from the glyph and its weight, not from
 * hue. A failure is the one case that earns extra contrast, so it renders at
 * full foreground while success stays quiet.
 */
function StatusIcon({ status }: { status: ToolCallStatus }) {
  if (status === 'running') return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
  if (status === 'ok') return <Check className="h-3 w-3 text-muted-foreground" />;
  return <X className="h-3 w-3 text-foreground" />;
}

/** Data tools return a payload the transcript renders as an output cell. */
function asDataCell(result: unknown): DataCellPayload | undefined {
  return typeof result === 'object' && result !== null && (result as { kind?: string }).kind === DATA_CELL
    ? (result as DataCellPayload)
    : undefined;
}

export function ToolCallCard({ activity }: { activity: ToolActivity }) {
  const [open, setOpen] = useState(false);
  const hasDetail = Object.keys(activity.args).length > 0 || activity.result !== undefined;

  // An analysis result is the point of the turn, not a detail of it — it
  // renders in full, without waiting for a click.
  const dataCell = activity.status === 'ok' ? asDataCell(activity.result) : undefined;
  if (dataCell) return <DataResultCell payload={dataCell} />;

  return (
    <div className="w-full rounded-lg border border-border/60 text-xs">
      <button
        type="button"
        onClick={() => hasDetail && setOpen((v) => !v)}
        disabled={!hasDetail}
        className={cn(
          'flex w-full items-center gap-2 px-2.5 py-1.5 text-left rounded-lg',
          hasDetail && 'cursor-pointer hover:bg-muted/40 transition-colors',
        )}
      >
        {hasDetail ? (
          <ChevronRight
            className={cn('h-3 w-3 flex-shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
          />
        ) : (
          <Wrench className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        )}
        <span className="font-mono text-[11px] flex-shrink-0 text-foreground/90">{activity.name}</span>
        {/* `min-w-0` is what makes `truncate` actually truncate: a flex item
            defaults to `min-width: auto`, so a long single-line summary (e.g.
            get_grid_columns listing 20 columns) keeps its full content width,
            widening the whole transcript. That pushes every `self-end` user
            bubble off-screen to the right — the message looks like it vanished. */}
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{activity.summary ?? ''}</span>
        <StatusIcon status={activity.status} />
      </button>

      {open && hasDetail && (
        <div className="border-t border-border/60 px-2.5 py-2 space-y-2">
          {Object.keys(activity.args).length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mb-1">Arguments</div>
              <pre className="overflow-x-auto rounded-md bg-muted/40 p-2 text-[10px] leading-relaxed">
                {JSON.stringify(activity.args, null, 2)}
              </pre>
            </div>
          )}
          {activity.result !== undefined && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mb-1">Result</div>
              <pre className="overflow-x-auto rounded-md bg-muted/40 p-2 text-[10px] leading-relaxed max-h-48">
                {typeof activity.result === 'string' ? activity.result : JSON.stringify(activity.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
