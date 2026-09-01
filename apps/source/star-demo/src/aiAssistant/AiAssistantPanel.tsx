import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Sparkles, Upload, SquarePen, PanelRightClose, PanelRightOpen } from 'lucide-react';
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
// Type-only: the design-system's `ResizablePanel` is a bare re-export of
// `Panel` (see `packages/react-core/ui/src/components/resizable.tsx`) and
// doesn't re-export its own imperative-handle type, so this reaches past the
// wrapper for the type alone — erased at build time, no runtime dependency
// beyond what `@wellsfargo-starui/react` already pulls in.
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { loadRegistryConfig } from '@wellsfargo-starui/openfin/config';
import { checkHealth, fetchModels, pickDefaultModel } from './llmClient';
import { usePlatformBootstrap } from '../platformBootstrap';
import { resolveGridForInstance, resolveGridEntry, readActiveProfile } from './gridProfiles';
import { useUndoStack } from './useUndoStack';
import { sessionKey, saveSession, loadSession, clearSession } from './chat/sessionStore';
import { startersFor } from './chat/starters';
import type { ToolName } from './tools';
import { buildSystemPrompt } from './systemPrompt';
import { useToolExecutor } from './useToolExecutor';
import { ChatTranscript } from './chat/ChatTranscript';
import { Composer } from './chat/Composer';
import { useChatSession, type TranscriptItem } from './chat/useChatSession';
import { AnalysisPanel, type AnalysisEntry } from './chat/AnalysisPanel';
import { DATA_CELL, type DataCellPayload } from './dataTools';
import { toAttachment, filesFromDataTransfer, AttachmentError, type Attachment } from './chat/attachments';

const DEFAULT_BASE_URL = 'http://127.0.0.1:3000';
const LOG = '[aiAssistant]';

/**
 * Settings-strip controls: borderless until hovered or focused. These are
 * configured once and then ignored, so they shouldn't compete with the
 * conversation for attention.
 */
const QUIET_CONTROL =
  'h-7 text-[11px] border-transparent bg-transparent shadow-none hover:bg-muted/50 ' +
  'focus-visible:bg-muted/50 focus-visible:ring-0 focus-visible:border-border transition-colors';

interface GridOption {
  id: string;
  displayName: string;
}

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
        /* storage unavailable — per-viewer convenience only, safe to skip */
      }
    },
    [key],
  );
  return [value, update] as const;
}

export interface AiAssistantPanelProps {
  /** Blotter this panel is tied to, from `?grid=` when the caller knew it. */
  scopedGridId?: string;
  /**
   * The calling window's config-row id, from `?instance=`. Resolved to a
   * registry entry on mount — the window knows this for certain, whereas a
   * registry id it derives itself can be wrong.
   */
  scopedInstanceId?: string;
  /** Display name for the header; falls back to the registry lookup. */
  scopedGridName?: string;
  /**
   * When true the panel may only act on `scopedGridId`: the grid picker is
   * hidden and the executor refuses calls aimed anywhere else.
   */
  locked?: boolean;
  /** Fires once the instance id resolves, so the page header can show it too. */
  onScopeResolved?: (
    scope: { gridId: string; displayName?: string; instanceId?: string; profileId?: string; profileName?: string } | null,
  ) => void;
}

export function AiAssistantPanel({
  scopedGridId,
  scopedInstanceId,
  scopedGridName,
  locked = false,
  onScopeResolved,
}: AiAssistantPanelProps = {}) {
  const [grids, setGrids] = useState<GridOption[]>([]);
  // A locked panel shows nothing until resolution confirms a registry entry —
  // briefly displaying an unverified id is how a wrong one gets trusted.
  const [resolvedGridId, setResolvedGridId] = useState<string | undefined>(locked ? undefined : scopedGridId);
  const [resolveFailed, setResolveFailed] = useState(false);
  // The layout the scoped window is actually showing right now — a live
  // readout, not something the conversation pins to (see readActiveProfile's
  // header note: pinning it would reintroduce the "my change isn't showing
  // up" confusion reload_grid/switch_profile exist to fix).
  const [activeProfile, setActiveProfile] = useState<{ id: string; name: string } | undefined>(undefined);
  const [targetGridId, setTargetGridId] = useState<string>(scopedGridId ?? '');
  const [models, setModels] = useState<string[]>([]);
  const [connectionOk, setConnectionOk] = useState<boolean | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);

  const [baseUrl, setBaseUrl] = useLocalStorageState('aiAssistant.baseUrl', DEFAULT_BASE_URL);
  const [apiKey, setApiKey] = useLocalStorageState('aiAssistant.apiKey', '');
  const [model, setModel] = useLocalStorageState('aiAssistant.model.v2', '');

  const { platform } = usePlatformBootstrap();

  // Resolve the calling window's instance id to the registry entry every tool
  // expects. Without this the panel scopes to an id that isn't registered and
  // the model has to ask the user which blotter they meant.
  useEffect(() => {
    if (!locked || !platform?.configManager) return;
    let cancelled = false;
    void (async () => {
      // Instance id first — it's the identifier the window is certain of.
      const fromInstance = scopedInstanceId
        ? await resolveGridForInstance(platform.configManager, scopedInstanceId)
        : undefined;
      // Then the caller's registry-id hint, but only if it's really registered:
      // accepting an unregistered id is what produced "star-demo-blotter".
      const fromHint = !fromInstance && scopedGridId ? await resolveGridEntry(scopedGridId) : undefined;
      const entry = fromInstance ?? fromHint;
      if (cancelled) return;
      if (entry) {
        setResolvedGridId(entry.id);
        setTargetGridId(entry.id);
        setResolveFailed(false);
      } else {
        setResolvedGridId(undefined);
        setResolveFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locked, scopedInstanceId, scopedGridId, platform]);

  // The row a scoped session actually reads/writes now that dispatchTool pins
  // an unpinned call to the focused window (see useToolExecutor.ts) — falls
  // back to the resolved grid id only for a singleton, where that row IS the
  // window.
  const scopedRowId = scopedInstanceId ?? resolvedGridId;
  const refreshActiveProfile = useCallback(() => {
    if (!locked || !platform?.configManager || !scopedRowId) return;
    void readActiveProfile(platform.configManager, scopedRowId).then((p) => {
      setActiveProfile({ id: p.id, name: p.name });
    });
  }, [locked, platform, scopedRowId]);
  useEffect(() => {
    refreshActiveProfile();
  }, [refreshActiveProfile]);

  const scopedGrid = useMemo(
    () => grids.find((g) => g.id === resolvedGridId),
    [grids, resolvedGridId],
  );
  const scopedLabel = scopedGrid?.displayName ?? scopedGridName;

  const reportScope = useRef(onScopeResolved);
  reportScope.current = onScopeResolved;
  useEffect(() => {
    if (!locked) return;
    reportScope.current?.(
      resolvedGridId
        ? {
            gridId: resolvedGridId,
            displayName: scopedLabel,
            instanceId: scopedInstanceId,
            profileId: activeProfile?.id,
            profileName: activeProfile?.name,
          }
        : null,
    );
  }, [locked, resolvedGridId, scopedLabel, scopedInstanceId, activeProfile]);


  const systemPrompt = useMemo(
    () => buildSystemPrompt(locked && resolvedGridId ? { gridId: resolvedGridId, displayName: scopedLabel } : undefined),
    [locked, resolvedGridId, scopedLabel],
  );
  const { executeTool } = useToolExecutor({
    defaultGridId: targetGridId || undefined,
    lockedGridId: locked ? resolvedGridId : undefined,
    // The window the wand was clicked in. dispatchTool (useToolExecutor.ts)
    // pins any call that doesn't name its own instance to this one, so an
    // ordinary unpinned call in this session reaches this window alone —
    // never the template, never a sibling window.
    focusInstanceId: locked ? scopedInstanceId : undefined,
  });
  const undo = useUndoStack(platform?.configManager);

  // `undo_last_change` is served here rather than in the executor: the stack is
  // this panel's conversation state, not platform state.
  const executeToolWithUndo = useCallback(
    async (name: ToolName, args: Record<string, unknown>) => {
      if (name === 'undo_last_change') {
        const result = await undo.undoLast();
        refreshActiveProfile();
        return result;
      }
      const result = await executeTool(name, args);
      // Cheap re-read so the header's layout name stays honest after a write,
      // a switch_profile, or a reload_grid — this is a live readout, never
      // something the conversation pins to (see activeProfile's declaration).
      refreshActiveProfile();
      return result;
    },
    [executeTool, undo, refreshActiveProfile],
  );

  const session = useChatSession({
    systemPrompt,
    baseUrl,
    apiKey,
    model,
    executeTool: executeToolWithUndo,
    onTurnStart: undo.beginTurn,
    onToolCall: undo.noteToolCall,
    onTurnEnd: undo.endTurn,
  });
  const { transcript, isBusy, error, send, stop, setError, noteContext, messages, reset } = session;

  // ── Analysis side panel ──
  // Entries are DERIVED from the transcript, not a second store — a data-cell
  // result already lives there, persisted the same way, for free.
  const analysisEntries = useMemo<AnalysisEntry[]>(
    () =>
      transcript
        .filter(
          (item): item is Extract<TranscriptItem, { kind: 'tool' }> =>
            item.kind === 'tool' &&
            typeof item.activity.result === 'object' &&
            item.activity.result !== null &&
            (item.activity.result as { kind?: string }).kind === DATA_CELL,
        )
        .map((item) => ({ id: item.id, payload: item.activity.result as DataCellPayload })),
    [transcript],
  );
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  // Auto-follows the newest result. Flips false only when the user clicks an
  // OLDER entry — clicking the current newest one (or a fresh result simply
  // arriving) leaves it following. A ref, not state: flipping it must never
  // itself trigger a render.
  const followAnalysisRef = useRef(true);
  useEffect(() => {
    if (!followAnalysisRef.current) return;
    const newest = analysisEntries.at(-1);
    if (newest) setActiveAnalysisId(newest.id);
  }, [analysisEntries]);
  const handleSelectAnalysis = useCallback(
    (id: string) => {
      setActiveAnalysisId(id);
      followAnalysisRef.current = id === analysisEntries.at(-1)?.id;
    },
    [analysisEntries],
  );

  const analysisPanelRef = useRef<PanelImperativeHandle>(null);
  const [panelCollapsedPref, setPanelCollapsedPref] = useLocalStorageState('aiAssistant.panelCollapsed', '0');
  const startedCollapsed = useRef(panelCollapsedPref === '1').current;
  // Belt-and-braces: `defaultSize` alone should already leave the panel in the
  // right collapsed/expanded state on first paint, but the imperative call
  // guarantees the library's OWN `isCollapsed()` bookkeeping (what the toggle
  // button and the resize handler below both read) agrees with it.
  useEffect(() => {
    if (startedCollapsed) analysisPanelRef.current?.collapse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggleAnalysisPanel = useCallback(() => {
    if (analysisPanelRef.current?.isCollapsed()) analysisPanelRef.current?.expand();
    else analysisPanelRef.current?.collapse();
  }, []);
  // The library has no onCollapse/onExpand — onResize fires for every size
  // change regardless of cause (this button, a handle drag past the
  // collapsible threshold, or the auto-open below), so reading the panel's
  // own `isCollapsed()` here is the one place the persisted preference is
  // ever written, no matter which of those caused the change.
  const handleAnalysisPanelResize = useCallback(() => {
    setPanelCollapsedPref(analysisPanelRef.current?.isCollapsed() ? '1' : '0');
  }, [setPanelCollapsedPref]);

  // Auto-opens the FIRST time a result lands, once per mount, overriding
  // whatever the persisted collapsed preference currently is — a result the
  // user can't see behind a collapsed panel defeats the point of asking.
  // After that first time it never forces the panel again; the user's own
  // toggling (persisted above) decides from then on.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current || analysisEntries.length === 0) return;
    autoOpenedRef.current = true;
    analysisPanelRef.current?.expand();
  }, [analysisEntries.length]);

  // ── Conversation persistence ──
  // Restored once on mount; saved whenever the transcript settles. Scoped
  // panels keep their own thread, keyed by grid.
  const storeKey = useMemo(() => sessionKey(locked ? (resolvedGridId ?? scopedInstanceId) : undefined), [locked, resolvedGridId, scopedInstanceId]);
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const saved = loadSession(storeKey);
    if (saved && saved.transcript.length > 0) reset(saved.messages, saved.transcript);
  }, [storeKey, reset]);

  useEffect(() => {
    if (!restoredRef.current || isBusy) return;
    saveSession(storeKey, messages.current, transcript);
  }, [storeKey, transcript, isBusy, messages]);

  const handleNewChat = useCallback(() => {
    clearSession(storeKey);
    reset();
    // A fresh conversation has no analysis of its own yet — don't leave the
    // panel pointing at a result that just vanished, and let its first
    // result auto-open the panel again same as a brand-new mount would.
    setActiveAnalysisId(null);
    followAnalysisRef.current = true;
    autoOpenedRef.current = false;
  }, [storeKey, reset]);

  // Explain a failed scope to the model too, so it asks a good question instead
  // of discovering mid-turn that the id it was given isn't registered.
  const announcedFailure = useRef(false);
  useEffect(() => {
    if (!locked || !resolveFailed || announcedFailure.current) return;
    announcedFailure.current = true;
    noteContext(
      `This window was opened from a blotter, but its config row (${scopedInstanceId ?? 'unknown'}) doesn't match ` +
        'any registered blotter, so there is no grid to scope to. Call list_grids and ask the user which one they mean.',
    );
  }, [locked, resolveFailed, scopedInstanceId, noteContext]);

  // Tell the model which grid the user picked. Appended as its own system
  // message rather than rewriting the base prompt, so history stays intact.
  const lastAnnouncedGrid = useRef<string>('');
  useEffect(() => {
    if (locked || !targetGridId || targetGridId === lastAnnouncedGrid.current) return;
    const grid = grids.find((g) => g.id === targetGridId);
    if (!grid) return;
    lastAnnouncedGrid.current = targetGridId;
    noteContext(
      `The user is now working on the "${grid.displayName}" blotter (targetGridId: "${grid.id}"). ` +
        'Use it whenever they refer to "this grid" or don\'t name one.',
    );
  }, [locked, targetGridId, grids, noteContext]);

  const history = useMemo(
    () => transcript.filter((i) => i.kind === 'user').map((i) => (i as { text: string }).text),
    [transcript],
  );

  useEffect(() => {
    let cancelled = false;
    void checkHealth(baseUrl).then((ok) => {
      if (!cancelled) setConnectionOk(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  // Populate the model list from the server and pick a default the first time
  // (or if the stored pick is no longer offered). Prefers Claude models.
  useEffect(() => {
    let cancelled = false;
    void fetchModels(baseUrl, apiKey || undefined).then((ids) => {
      if (cancelled || ids.length === 0) return;
      setModels(ids);
      if (!model || !ids.includes(model)) setModel(pickDefaultModel(ids));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, apiKey]);

  useEffect(() => {
    let cancelled = false;
    void loadRegistryConfig().then((config) => {
      if (cancelled) return;
      setGrids(
        (config?.entries ?? [])
          .filter((e) => e.componentType === 'grid')
          .map((e) => ({ id: e.id, displayName: e.displayName })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      const added: Attachment[] = [];
      for (const file of files) {
        try {
          added.push(await toAttachment(file));
        } catch (err) {
          // Rejections are expected (PDFs, oversize, unsupported images) —
          // surface the specific reason rather than failing silently.
          setError(err instanceof AttachmentError ? err.message : String(err));
        }
      }
      if (added.length > 0) setAttachments((prev) => [...prev, ...added]);
    },
    [setError],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      const current = attachments;
      setAttachments([]);
      void send(text, current).finally(() => {
        current.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
      });
    },
    [attachments, send],
  );

  const handleSelectGrid = useCallback(
    (id: string) => {
      setTargetGridId(id);
      const grid = grids.find((g) => g.id === id);
      if (grid) console.debug(`${LOG} target grid →`, grid);
    },
    [grids],
  );

  // Drag counter, not a boolean: dragenter/dragleave fire for every child
  // element, so a naive flag flickers as the pointer moves across the panel.
  const onDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  }, []);
  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsDragging(false);
    }
  }, []);
  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setIsDragging(false);
      void addFiles(filesFromDataTransfer(e.dataTransfer));
    },
    [addFiles],
  );

  return (
    <div
      className="relative flex flex-col h-full gap-2 px-4 py-3 text-sm bg-background"
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragging && (
        <div className="absolute inset-2 z-10 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong bg-background/85 text-xs text-muted-foreground pointer-events-none backdrop-blur-[1px]">
          <Upload className="h-4 w-4" />
          Drop images or text files to attach
        </div>
      )}

      {/* Settings strip: quiet by default so the conversation carries the
          panel. Borderless controls, and connection state as a dot rather
          than a coloured badge. */}
      <div className={cn('flex items-center gap-1.5 flex-shrink-0 min-w-0', isDragging && 'opacity-50')}>
        {/* Indigo, not muted-foreground — a small brand mark for the assistant.
            Deliberately its own `--ds-bot-accent` token, not `--primary`/
            `--accent`, which read as interactive controls elsewhere in the panel. */}
        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[color:var(--ds-bot-accent)] to-[color:var(--ds-bot-accent-deep)] text-white shadow-sm">
          <Sparkles className="h-3 w-3" />
        </span>
        {locked && resolvedGridId ? (
          // Scoped panels state their blotter instead of offering a choice —
          // the id is what the user needs to confirm they're in the right one.
          // "this window" + the active layout make clear every unpinned tool
          // call in this conversation targets this instance alone, not the
          // blotter's template or any sibling window (see useToolExecutor.ts).
          <span
            className="flex items-baseline gap-1.5 flex-shrink-0 max-w-[20rem] truncate"
            title={`Scoped to ${scopedLabel ?? resolvedGridId} (${resolvedGridId})${scopedInstanceId ? ` · window ${scopedInstanceId}` : ''}${activeProfile ? ` · layout ${activeProfile.name}` : ''}`}
          >
            {scopedLabel && <span className="text-xs font-medium text-foreground truncate">{scopedLabel}</span>}
            <span className="font-mono text-[10px] text-muted-foreground truncate">{resolvedGridId}</span>
            {scopedInstanceId && (
              <span className="text-[10px] text-muted-foreground/70 flex-shrink-0">· this window</span>
            )}
            {activeProfile && (
              <span className="text-[10px] text-muted-foreground/70 truncate">· {activeProfile.name}</span>
            )}
          </span>
        ) : locked && resolveFailed ? (
          // Better to say the window couldn't be identified than to scope to an
          // id that isn't registered and leave the model guessing.
          <span
            className="flex-shrink-0 text-[11px] text-muted-foreground truncate max-w-[18rem]"
            title={`This window's config row (${scopedInstanceId}) doesn't match a registered blotter.`}
          >
            Unrecognised blotter window
          </span>
        ) : (
          <Select value={targetGridId} onValueChange={handleSelectGrid}>
            <SelectTrigger className={QUIET_CONTROL + ' w-36 flex-shrink-0'}>
              <SelectValue placeholder="Target grid" />
            </SelectTrigger>
            <SelectContent>
              {grids.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="Server URL"
          className={QUIET_CONTROL + ' flex-1 min-w-0'}
        />
        <Input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="API key"
          type="password"
          className={QUIET_CONTROL + ' w-24 flex-shrink-0'}
        />
        {models.length > 0 ? (
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className={QUIET_CONTROL + ' w-40 flex-shrink-0'}>
              <SelectValue placeholder="model" />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="model"
            className={QUIET_CONTROL + ' w-24 flex-shrink-0'}
          />
        )}
        {transcript.length > 0 && (
          <Button
            size="icon"
            variant="ghost"
            onClick={handleNewChat}
            aria-label="New chat"
            title="Start a new conversation"
            className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-foreground"
          >
            <SquarePen className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          onClick={toggleAnalysisPanel}
          aria-label={panelCollapsedPref === '1' ? 'Show analysis panel' : 'Hide analysis panel'}
          title={panelCollapsedPref === '1' ? 'Show analysis panel' : 'Hide analysis panel'}
          className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-foreground"
        >
          {panelCollapsedPref === '1' ? <PanelRightOpen className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />}
        </Button>
        <span
          className="flex items-center gap-1.5 flex-shrink-0 pl-1 text-[10px] text-muted-foreground"
          title={connectionOk === null ? 'Checking the LLM server…' : connectionOk ? 'Connected' : 'Server unreachable'}
        >
          <span
            aria-hidden
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              connectionOk === null
                ? 'bg-muted-foreground/50 animate-pulse'
                : connectionOk
                  ? 'bg-foreground'
                  : 'border border-muted-foreground/60',
            )}
          />
          {connectionOk === null ? 'checking' : connectionOk ? 'connected' : 'offline'}
        </span>
      </div>

      <ResizablePanelGroup orientation="horizontal" resizeTargetMinimumSize={{ coarse: 12, fine: 8 }} className="flex-1 min-h-0">
        <ResizablePanel defaultSize="62" minSize={280}>
          <div className="flex flex-col h-full min-h-0 gap-2 pr-2">
            <ChatTranscript
              items={transcript}
              isBusy={isBusy}
              error={error}
              starters={startersFor(Boolean(locked && resolvedGridId))}
              onPickStarter={handleSend}
              onOpenAnalysis={handleSelectAnalysis}
            />

            <Composer
              attachments={attachments}
              onAddFiles={(files) => void addFiles(files)}
              onRemoveAttachment={removeAttachment}
              onSend={handleSend}
              onStop={stop}
              isBusy={isBusy}
              history={history}
            />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel
          panelRef={analysisPanelRef}
          defaultSize={startedCollapsed ? '0' : '38'}
          minSize={320}
          collapsible
          collapsedSize={0}
          onResize={handleAnalysisPanelResize}
        >
          <div className="h-full min-h-0 pl-2">
            <AnalysisPanel entries={analysisEntries} activeId={activeAnalysisId} onSelect={handleSelectAnalysis} />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
