/**
 * One tool invocation, rendered inline in the transcript — the visible
 * "what the assistant is doing" element, collapsed to a single line by
 * default and expandable to show the exact arguments and result.
 */
import { useState } from 'react';
import { ChevronRight, Loader2, Check, X, Wrench } from 'lucide-react';
import { cn } from '@wellsfargo-starui/react';

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

function StatusIcon({ status }: { status: ToolCallStatus }) {
  if (status === 'running') return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
  if (status === 'ok') return <Check className="h-3 w-3 text-[var(--ds-accent-positive,#16a34a)]" />;
  return <X className="h-3 w-3 text-destructive" />;
}

export function ToolCallCard({ activity }: { activity: ToolActivity }) {
  const [open, setOpen] = useState(false);
  const hasDetail = Object.keys(activity.args).length > 0 || activity.result !== undefined;

  return (
    <div className="self-start w-full max-w-[95%] rounded-md border border-border bg-card/60 text-xs">
      <button
        type="button"
        onClick={() => hasDetail && setOpen((v) => !v)}
        disabled={!hasDetail}
        className={cn(
          'flex w-full items-center gap-1.5 px-2 py-1 text-left',
          hasDetail && 'cursor-pointer hover:bg-muted/50 rounded-md',
        )}
      >
        {hasDetail ? (
          <ChevronRight className={cn('h-3 w-3 flex-shrink-0 transition-transform', open && 'rotate-90')} />
        ) : (
          <Wrench className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        )}
        <span className="font-mono text-[11px] flex-shrink-0">{activity.name}</span>
        {/* `min-w-0` is what makes `truncate` actually truncate: a flex item
            defaults to `min-width: auto`, so a long single-line summary (e.g.
            get_grid_columns listing 20 columns) keeps its full content width,
            widening the whole transcript. That pushes every `self-end` user
            bubble off-screen to the right — the message looks like it vanished. */}
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{activity.summary ?? ''}</span>
        <StatusIcon status={activity.status} />
      </button>

      {open && hasDetail && (
        <div className="border-t border-border px-2 py-1.5 space-y-1.5">
          {Object.keys(activity.args).length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Arguments</div>
              <pre className="overflow-x-auto rounded bg-background p-1.5 text-[10px] leading-relaxed">
                {JSON.stringify(activity.args, null, 2)}
              </pre>
            </div>
          )}
          {activity.result !== undefined && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Result</div>
              <pre className="overflow-x-auto rounded bg-background p-1.5 text-[10px] leading-relaxed max-h-48">
                {typeof activity.result === 'string' ? activity.result : JSON.stringify(activity.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
