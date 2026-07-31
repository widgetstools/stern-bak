import { useEffect, useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Button,
  Badge,
  Separator,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@wellsfargo-starui/ui';
import { Database, Copy, RefreshCw, Trash2, CheckCircle2 } from 'lucide-react';
import {
  marketsGridLocalStorageBundleKey,
  type MarketsGridLocalStorageConfig,
} from '@wellsfargo-starui/engine';

interface ConfigInspectorProps {
  gridId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClearAll: () => void;
}

interface Snapshot {
  raw: string | null;
  parsed: MarketsGridLocalStorageConfig | null;
  byteSize: number;
  readAt: number;
}

function readSnapshot(key: string): Snapshot {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { raw: null, parsed: null, byteSize: 0, readAt: Date.now() };
    let parsed: MarketsGridLocalStorageConfig | null = null;
    try {
      parsed = JSON.parse(raw) as MarketsGridLocalStorageConfig;
    } catch {
      parsed = null;
    }
    return { raw, parsed, byteSize: new Blob([raw]).size, readAt: Date.now() };
  } catch {
    return { raw: null, parsed: null, byteSize: 0, readAt: Date.now() };
  }
}

export function ConfigInspector({
  gridId,
  open,
  onOpenChange,
  onClearAll,
}: ConfigInspectorProps) {
  const storageKey = useMemo(() => marketsGridLocalStorageBundleKey(gridId), [gridId]);
  const [snapshot, setSnapshot] = useState<Snapshot>(() => readSnapshot(storageKey));
  const [copied, setCopied] = useState(false);

  // Read once when the sheet opens. The user can hit the Refresh button to
  // re-read on demand; no background polling so the rest of the app stays
  // quiet. This demo is about exercising MarketsGrid features, not keeping
  // the inspector continuously in sync.
  useEffect(() => {
    if (!open) return;
    setSnapshot(readSnapshot(storageKey));
  }, [open, storageKey]);

  const handleCopy = async () => {
    if (!snapshot.raw) return;
    try {
      await navigator.clipboard.writeText(snapshot.raw);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* swallow — clipboard access denied */
    }
  };

  const handleRefresh = () => setSnapshot(readSnapshot(storageKey));

  const profileCount = snapshot.parsed?.profiles.length ?? 0;
  const activeId = snapshot.parsed?.activeProfileId ?? null;
  const prettyJson = snapshot.raw
    ? JSON.stringify(snapshot.parsed ?? JSON.parse(snapshot.raw), null, 2)
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ds-text-secondary)] hover:bg-[color:var(--ds-surface-secondary)] hover:text-[color:var(--ds-text-primary)]"
          data-testid="config-inspector-trigger"
        >
          <Database size={12} strokeWidth={1.75} />
          Inspect storage
          <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-sm bg-[color:var(--ds-surface-sunken)] px-1 font-mono text-[10px] tabular-nums text-[color:var(--ds-text-faint)]">
            {profileCount}
          </span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-ground)] p-0 sm:max-w-[560px]"
      >
        <SheetHeader className="space-y-3 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-5 py-4">
          <div className="flex items-center justify-between gap-3 pr-8">
            <SheetTitle className="font-mono text-[14px] tracking-tight text-[color:var(--ds-text-primary)]">
              Layout storage inspector
            </SheetTitle>
            <Badge className="border-transparent bg-[color:var(--ds-overlay-info-soft)] font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ds-accent-info)]">
              localStorage
            </Badge>
          </div>
          <SheetDescription className="text-[12px] leading-relaxed text-[color:var(--ds-text-muted)]">
            Live view of the single JSON document that holds every saved
            layout under
            <code className="mx-1 rounded-sm border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] px-1.5 py-[1px] font-mono text-[11px] text-[color:var(--ds-text-secondary)]">
              {storageKey}
            </code>
            — the grid id is the key, the bundle is the value.
          </SheetDescription>
          <div className="flex items-center gap-2 pt-1">
            <Stat label="Layouts" value={String(profileCount)} />
            <Stat label="Size" value={formatBytes(snapshot.byteSize)} />
            <Stat label="Active" value={activeId ?? '—'} mono />
          </div>
        </SheetHeader>

        <Tabs defaultValue="profiles" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-5 mt-4 grid w-[calc(100%-2.5rem)] grid-cols-2 bg-[color:var(--ds-surface-sunken)]">
            <TabsTrigger
              value="profiles"
              className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em]"
            >
              Layouts
            </TabsTrigger>
            <TabsTrigger
              value="raw"
              className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em]"
            >
              Raw JSON
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="profiles"
            className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
          >
            <ScrollArea className="flex-1 px-5 py-4">
              {!snapshot.parsed || snapshot.parsed.profiles.length === 0 ? (
                <EmptyState />
              ) : (
                <ul className="flex flex-col gap-2">
                  {snapshot.parsed.profiles.map((p) => {
                    const isActive = p.id === activeId;
                    return (
                      <li
                        key={p.id}
                        className={
                          'rounded-md border bg-[color:var(--ds-surface-primary)] px-3 py-3 transition-colors ' +
                          (isActive
                            ? 'border-[color:var(--ds-accent-info)] shadow-[0_0_0_1px_var(--ds-accent-info)]'
                            : 'border-[color:var(--ds-border-primary)] hover:border-[color:var(--ds-border-secondary)]')
                        }
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[13px] font-semibold text-[color:var(--ds-text-primary)]">
                                {p.name}
                              </span>
                              {isActive && (
                                <Badge className="border-transparent bg-[color:var(--ds-accent-info)] font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--ds-primary-foreground)]">
                                  Active
                                </Badge>
                              )}
                            </div>
                            <code className="truncate font-mono text-[10px] text-[color:var(--ds-text-faint)]">
                              id: {p.id}
                            </code>
                          </div>
                          <div className="flex flex-col items-end gap-1 text-[10px] text-[color:var(--ds-text-muted)]">
                            <span className="font-mono">
                              {p.updatedAt ? new Date(p.updatedAt).toLocaleString() : '—'}
                            </span>
                            <span className="font-mono uppercase tracking-[0.12em] text-[color:var(--ds-text-faint)]">
                              {formatBytes(new Blob([JSON.stringify(p.state)]).size)}
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="raw"
            className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
          >
            <ScrollArea className="flex-1 px-5 py-4">
              {prettyJson == null ? (
                <EmptyState />
              ) : (
                <pre className="rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] p-4 font-mono text-[11px] leading-relaxed text-[color:var(--ds-text-secondary)]">
                  {prettyJson}
                </pre>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <Separator className="bg-[color:var(--ds-border-primary)]" />
        <div className="flex items-center justify-between gap-2 bg-[color:var(--ds-surface-primary)] px-5 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--ds-text-faint)]">
            Refresh manually
          </span>
          <TooltipProvider delayDuration={250}>
            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRefresh}
                    className="h-7 w-7 text-[color:var(--ds-text-secondary)] hover:bg-[color:var(--ds-surface-secondary)]"
                    data-testid="inspector-refresh"
                  >
                    <RefreshCw size={13} strokeWidth={1.75} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Re-read storage</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopy}
                    disabled={!snapshot.raw}
                    className="h-7 w-7 text-[color:var(--ds-text-secondary)] hover:bg-[color:var(--ds-surface-secondary)]"
                    data-testid="inspector-copy"
                  >
                    {copied ? (
                      <CheckCircle2
                        size={13}
                        strokeWidth={1.75}
                        className="text-[color:var(--ds-accent-positive)]"
                      />
                    ) : (
                      <Copy size={13} strokeWidth={1.75} />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Copy JSON</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClearAll}
                    className="h-7 gap-1.5 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ds-accent-negative)] hover:bg-[color:var(--ds-overlay-negative-soft)] hover:text-[color:var(--ds-accent-negative)]"
                    data-testid="inspector-clear"
                  >
                    <Trash2 size={12} strokeWidth={1.75} />
                    Reset
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Wipe localStorage entry and reload
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5 rounded-sm border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] px-2 py-1">
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--ds-text-faint)]">
        {label}
      </span>
      <span
        className={
          'text-[11px] text-[color:var(--ds-text-primary)] ' +
          (mono ? 'font-mono' : 'font-semibold')
        }
      >
        {value}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] py-12 text-center">
      <Database
        size={20}
        strokeWidth={1.4}
        className="text-[color:var(--ds-text-faint)]"
      />
      <p className="text-[12px] font-medium text-[color:var(--ds-text-muted)]">
        No bundle written yet
      </p>
      <p className="max-w-[280px] text-[11px] leading-relaxed text-[color:var(--ds-text-faint)]">
        Save a layout, change a column, or apply a filter — the grid will
        flush a JSON document here.
      </p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
