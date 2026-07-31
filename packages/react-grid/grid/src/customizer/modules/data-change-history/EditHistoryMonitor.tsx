import {
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { Badge, Button } from '@wellsfargo-starui/ui';
import type { EditJournalEntry, EditSource } from '@wellsfargo-starui/engine';

const MONITOR_HEIGHT_PX = 240;
const ROW_HEIGHT_PX = 36;
const VIRTUAL_THRESHOLD = 25;
const OVERSCAN = 4;

const ROW_GRID =
  'grid grid-cols-[5.75rem_5.5rem_minmax(0,1fr)_2.25rem_3.25rem] items-center gap-2 px-3';

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function sourceBadge(source: EditSource): string {
  switch (source) {
    case 'smart-edit':
      return 'Smart Edit';
    case 'bulk-update':
      return 'Bulk';
    case 'plus-minus':
      return '+/−';
    case 'shortcut':
      return 'Shortcut';
    case 'cell-editor':
      return 'Cell';
    default:
      return source;
  }
}

interface Range {
  start: number;
  end: number;
}

function useMonitorWindow(
  scrollRef: RefObject<HTMLDivElement | null>,
  count: number,
  enabled: boolean,
): Range {
  const [range, setRange] = useState<Range>({ start: 0, end: count });

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const recompute = () => {
      if (!enabled) {
        setRange({ start: 0, end: count });
        return;
      }
      const viewportH = scroller.clientHeight;
      if (viewportH === 0) {
        setRange({ start: 0, end: count });
        return;
      }
      const start = Math.max(0, Math.floor(scroller.scrollTop / ROW_HEIGHT_PX) - OVERSCAN);
      const visible = Math.ceil(viewportH / ROW_HEIGHT_PX) + OVERSCAN * 2;
      const end = Math.min(count, start + visible);
      setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };

    recompute();
    scroller.addEventListener('scroll', recompute, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(recompute) : null;
    ro?.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', recompute);
      ro?.disconnect();
    };
  }, [scrollRef, count, enabled]);

  return range;
}

export interface EditHistoryMonitorProps {
  entries: readonly EditJournalEntry[];
  canUndoEntry: (entryId: string) => boolean;
  onUndo: (entryId: string) => void;
}

export function EditHistoryMonitor({ entries, canUndoEntry, onUndo }: EditHistoryMonitorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualize = entries.length > VIRTUAL_THRESHOLD;
  const range = useMonitorWindow(scrollRef, entries.length, virtualize);
  const visible = virtualize ? entries.slice(range.start, range.end) : entries;
  const padTop = virtualize ? range.start * ROW_HEIGHT_PX : 0;
  const padBottom = virtualize
    ? Math.max(0, (entries.length - range.end) * ROW_HEIGHT_PX)
    : 0;

  if (entries.length === 0) {
    return (
      <div
        className="flex items-center justify-center border-t border-[color:var(--ds-border-primary)] px-3 text-sm text-[color:var(--ds-text-secondary)]"
        style={{ height: MONITOR_HEIGHT_PX }}
        data-testid="dch-monitor-empty"
      >
        No edits recorded this session.
      </div>
    );
  }

  return (
    <div className="border-t border-[color:var(--ds-border-primary)]" data-testid="dch-monitor-table">
      <div
        className={`${ROW_GRID} border-b border-[color:var(--ds-border-primary)] py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ds-text-muted)]`}
        aria-hidden
      >
        <span>Time</span>
        <span>Source</span>
        <span>Label</span>
        <span className="text-right">Cells</span>
        <span />
      </div>
      <div
        ref={scrollRef}
        className="ds-scrollbar overflow-y-auto"
        style={{ height: MONITOR_HEIGHT_PX }}
        data-testid="dch-monitor-scroll"
      >
        {padTop > 0 && <div aria-hidden style={{ height: padTop }} />}
        {visible.map((entry) => (
          <div
            key={entry.id}
            className={`${ROW_GRID} border-b border-[color:var(--ds-border-primary)] text-[length:var(--ds-font-size-sm)] last:border-b-0`}
            style={{ height: ROW_HEIGHT_PX }}
            data-testid={`dch-entry-${entry.id}`}
          >
            <span className="tabular-nums text-[color:var(--ds-text-secondary)]">
              {formatTime(entry.at)}
            </span>
            <span>
              <Badge variant="outline">{sourceBadge(entry.source)}</Badge>
            </span>
            <span className="truncate">{entry.label}</span>
            <span className="text-right tabular-nums">{entry.patches.length}</span>
            <span className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                disabled={!canUndoEntry(entry.id)}
                data-testid={`dch-undo-entry-${entry.id}`}
                onClick={() => onUndo(entry.id)}
              >
                Undo
              </Button>
            </span>
          </div>
        ))}
        {padBottom > 0 && <div aria-hidden style={{ height: padBottom }} />}
      </div>
    </div>
  );
}
