/**
 * The LLM-free assistant's chat surface. Same shell as `AiAssistantPanel`
 * (settings strip, transcript, composer, analysis side panel) minus the model
 * picker and API key — there is no model to pick. In their place: the optional
 * NLP server URL and a live local/server badge.
 *
 * Every assistant turn carries a debug line (intent · confidence · source ·
 * tool) so a wrong guess is diagnosable at a glance rather than a mystery.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cpu, Server, SquarePen, Wand2 } from 'lucide-react';
import {
  Button,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  cn,
} from '@wellsfargo-starui/react';
import { loadRegistryConfig } from '@wellsfargo-starui/openfin/config';
import { useDataServices } from '@wellsfargo-starui/react/data/runtime';
import { usePlatformBootstrap } from '../platformBootstrap';
import { useToolExecutor } from '../aiAssistant/useToolExecutor';
import { Composer } from '../aiAssistant/chat/Composer';
import { AnalysisPanel, type AnalysisEntry } from '../aiAssistant/chat/AnalysisPanel';
import { DATA_CELL, type DataCellPayload } from '../aiAssistant/dataTools';
import { DEFAULT_NLP_URL } from './nlpClient';
import { useNlpAssistant, type NlpTranscriptItem } from './useNlpAssistant';

const QUIET_CONTROL =
  'h-7 text-[11px] border-transparent bg-transparent shadow-none hover:bg-muted/50 ' +
  'focus-visible:bg-muted/50 focus-visible:ring-0 focus-visible:border-border transition-colors';

const STARTERS = [
  'group by sector and sum notional',
  'sort by market value desc',
  'show only rows where sector is Financials',
  'hide cusip',
  'top 10 by dv01 as a bar chart',
  'clear grouping',
];

function useLocalStorageState(key: string, initial: string) {
  const [value, setValue] = useState<string>(() => {
    try {
      return window.localStorage.getItem(key) ?? initial;
    } catch {
      return initial;
    }
  });
  const update = useCallback(
    (next: string) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        /* per-viewer convenience only */
      }
    },
    [key],
  );
  return [value, update] as const;
}

function DebugLine({ item }: { item: Extract<NlpTranscriptItem, { kind: 'assistant' }> }) {
  const d = item.debug;
  if (!d) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[9px] text-muted-foreground/70">
      <span>{d.intent}</span>
      <span>·</span>
      <span>{Math.round(d.confidence * 100)}%</span>
      <span>·</span>
      <span className="inline-flex items-center gap-0.5">
        {d.source === 'server' ? <Server className="h-2.5 w-2.5" /> : <Cpu className="h-2.5 w-2.5" />}
        {d.source}
        {d.model && ` (${d.model.split('/').pop()})`}
      </span>
      <span>·</span>
      <span>{d.latencyMs}ms</span>
      {d.tool && (
        <>
          <span>·</span>
          <span title={JSON.stringify(d.args, null, 2)}>{d.tool}</span>
        </>
      )}
    </div>
  );
}

export interface NlpAssistantPanelProps {
  scopedGridId?: string;
  scopedGridName?: string;
  locked?: boolean;
}

export function NlpAssistantPanel({ scopedGridId, locked = false }: NlpAssistantPanelProps) {
  const { platform } = usePlatformBootstrap();
  const { configStore } = useDataServices();
  const [grids, setGrids] = useState<Array<{ id: string; displayName: string }>>([]);
  const [targetGridId, setTargetGridId] = useState(scopedGridId ?? '');
  const [serverUrl, setServerUrl] = useLocalStorageState('nlpAssistant.serverUrl', '');
  const [useServer, setUseServer] = useLocalStorageState('nlpAssistant.useServer', 'false');

  useEffect(() => {
    void loadRegistryConfig().then((registry) => {
      const entries = (registry?.entries ?? [])
        .filter((e) => e.componentType === 'markets-grid')
        .map((e) => ({ id: e.id, displayName: e.displayName ?? e.id }));
      setGrids(entries);
      if (!targetGridId && entries[0]) setTargetGridId(entries[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { executeTool } = useToolExecutor({
    defaultGridId: targetGridId || undefined,
    lockedGridId: locked ? scopedGridId : undefined,
  });

  const { items, busy, send, clear, serverOk, history } = useNlpAssistant({
    configManager: platform.configManager,
    configStore: configStore!,
    targetGridId: targetGridId || undefined,
    serverUrl: useServer === 'true' ? serverUrl || DEFAULT_NLP_URL : undefined,
    executeTool,
  });

  // Data-tool results (query/summarize) carry a DATA_CELL payload — surface
  // them in the same analysis side panel the LLM assistant uses.
  const analysisEntries = useMemo<AnalysisEntry[]>(
    () =>
      items.flatMap((it) => {
        if (it.kind !== 'assistant' || !it.result?.ok) return [];
        const data = it.result.data as { kind?: string } | undefined;
        return data?.kind === DATA_CELL ? [{ id: it.id, payload: data as DataCellPayload }] : [];
      }),
    [items],
  );
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  useEffect(() => {
    if (analysisEntries.length) setActiveAnalysisId(analysisEntries[analysisEntries.length - 1].id);
  }, [analysisEntries.length]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [items.length]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5 border-b border-border/60 px-2 py-1">
        {!locked && (
          <Select value={targetGridId} onValueChange={setTargetGridId}>
            <SelectTrigger className={cn(QUIET_CONTROL, 'w-44')} aria-label="Target grid">
              <SelectValue placeholder="Grid…" />
            </SelectTrigger>
            <SelectContent>
              {grids.map((g) => (
                <SelectItem key={g.id} value={g.id} className="text-[11px]">
                  {g.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          variant="ghost"
          size="sm"
          className={cn(QUIET_CONTROL, 'gap-1 px-2', useServer === 'true' && 'text-[color:var(--ds-bot-accent)]')}
          onClick={() => setUseServer(useServer === 'true' ? 'false' : 'true')}
          title="Toggle the server-side NLP model (local keyword pipeline runs regardless)"
          aria-pressed={useServer === 'true'}
        >
          {useServer === 'true' ? <Server className="h-3 w-3" /> : <Cpu className="h-3 w-3" />}
          {useServer === 'true' ? (serverOk === false ? 'server down' : serverOk ? 'server' : 'server…') : 'local'}
        </Button>
        {useServer === 'true' && (
          <Input
            className={cn(QUIET_CONTROL, 'w-52 font-mono')}
            placeholder={DEFAULT_NLP_URL}
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            aria-label="NLP server URL"
          />
        )}
        <span className="ml-auto" />
        <Button variant="ghost" size="sm" className={cn(QUIET_CONTROL, 'px-2')} onClick={clear} title="New chat" aria-label="New chat">
          <SquarePen className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize={62} minSize={40}>
          <div className="flex h-full min-h-0 flex-col">
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {items.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <Wand2 className="h-5 w-5 text-muted-foreground/50" />
                  <p className="max-w-[40ch] text-xs text-muted-foreground">
                    No model, no API key: this assistant parses your words locally and calls the same grid tools the AI
                    assistant does. Try one of these:
                  </p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {STARTERS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void send(s)}
                        className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {items.map((it) =>
                    it.kind === 'user' ? (
                      <div
                        key={it.id}
                        className="max-w-[85%] self-end rounded-lg bg-[color:var(--ds-bot-accent-soft)] px-2.5 py-1.5 text-xs text-foreground"
                      >
                        {it.text}
                      </div>
                    ) : (
                      <div key={it.id} className="max-w-[92%] self-start">
                        <div
                          className={cn(
                            'rounded-lg border px-2.5 py-1.5 text-xs',
                            it.result && !it.result.ok ? 'border-[color:var(--ds-accent-negative)]/50' : 'border-border/60',
                          )}
                        >
                          {it.text}
                        </div>
                        <DebugLine item={it} />
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
            <div className="flex-shrink-0 border-t border-border/60 p-2">
              <Composer
                attachments={[]}
                onAddFiles={() => {}}
                onRemoveAttachment={() => {}}
                onSend={(t) => void send(t)}
                onStop={() => {}}
                isBusy={busy}
                history={history}
              />
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={38} minSize={20} collapsible collapsedSize={0}>
          <div className="h-full min-h-0 pl-2">
            <AnalysisPanel entries={analysisEntries} activeId={activeAnalysisId} onSelect={setActiveAnalysisId} gridId={targetGridId} />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
