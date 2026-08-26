import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Sparkles, Upload, SquarePen } from 'lucide-react';
import {
  Button,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  cn,
} from '@wellsfargo-starui/react';
import { loadRegistryConfig } from '@wellsfargo-starui/openfin/config';
import { checkHealth, fetchModels, pickDefaultModel } from './llmClient';
import { usePlatformBootstrap } from '../platformBootstrap';
import { resolveGridForInstance, resolveGridEntry } from './gridProfiles';
import { useUndoStack } from './useUndoStack';
import { sessionKey, saveSession, loadSession, clearSession } from './chat/sessionStore';
import { startersFor } from './chat/starters';
import type { ToolName } from './tools';
import { buildSystemPrompt } from './systemPrompt';
import { useToolExecutor } from './useToolExecutor';
import { ChatTranscript } from './chat/ChatTranscript';
import { Composer } from './chat/Composer';
import { useChatSession } from './chat/useChatSession';
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
  onScopeResolved?: (scope: { gridId: string; displayName?: string } | null) => void;
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

  const scopedGrid = useMemo(
    () => grids.find((g) => g.id === resolvedGridId),
    [grids, resolvedGridId],
  );
  const scopedLabel = scopedGrid?.displayName ?? scopedGridName;

  const reportScope = useRef(onScopeResolved);
  reportScope.current = onScopeResolved;
  useEffect(() => {
    if (!locked) return;
    reportScope.current?.(resolvedGridId ? { gridId: resolvedGridId, displayName: scopedLabel } : null);
  }, [locked, resolvedGridId, scopedLabel]);


  const systemPrompt = useMemo(
    () => buildSystemPrompt(locked && resolvedGridId ? { gridId: resolvedGridId, displayName: scopedLabel } : undefined),
    [locked, resolvedGridId, scopedLabel],
  );
  const { executeTool } = useToolExecutor({
    defaultGridId: targetGridId || undefined,
    lockedGridId: locked ? resolvedGridId : undefined,
    // The window the wand was clicked in — written to unconditionally, so the
    // grid the user is actually looking at can never be the one that's missed.
    focusInstanceId: locked ? scopedInstanceId : undefined,
  });
  const undo = useUndoStack(platform?.configManager);

  // `undo_last_change` is served here rather than in the executor: the stack is
  // this panel's conversation state, not platform state.
  const executeToolWithUndo = useCallback(
    async (name: ToolName, args: Record<string, unknown>) => {
      if (name === 'undo_last_change') return undo.undoLast();
      return executeTool(name, args);
    },
    [executeTool, undo],
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
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        {locked && resolvedGridId ? (
          // Scoped panels state their blotter instead of offering a choice —
          // the id is what the user needs to confirm they're in the right one.
          <span
            className="flex items-baseline gap-1.5 flex-shrink-0 max-w-[16rem] truncate"
            title={`Scoped to ${scopedLabel ?? resolvedGridId} (${resolvedGridId})${scopedInstanceId ? ` · window ${scopedInstanceId}` : ''}`}
          >
            {scopedLabel && <span className="text-xs font-medium text-foreground truncate">{scopedLabel}</span>}
            <span className="font-mono text-[10px] text-muted-foreground truncate">{resolvedGridId}</span>
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

      <ChatTranscript
        items={transcript}
        isBusy={isBusy}
        error={error}
        starters={startersFor(Boolean(locked && resolvedGridId))}
        onPickStarter={handleSend}
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
  );
}
