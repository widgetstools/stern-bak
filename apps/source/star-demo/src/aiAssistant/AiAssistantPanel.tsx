import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Sparkles, Upload } from 'lucide-react';
import {
  Badge,
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
import { buildSystemPrompt } from './systemPrompt';
import { useToolExecutor } from './useToolExecutor';
import { ChatTranscript } from './chat/ChatTranscript';
import { Composer } from './chat/Composer';
import { useChatSession } from './chat/useChatSession';
import { toAttachment, filesFromDataTransfer, AttachmentError, type Attachment } from './chat/attachments';

const DEFAULT_BASE_URL = 'http://127.0.0.1:3000';
const LOG = '[aiAssistant]';

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

export function AiAssistantPanel() {
  const [grids, setGrids] = useState<GridOption[]>([]);
  const [targetGridId, setTargetGridId] = useState<string>('');
  const [models, setModels] = useState<string[]>([]);
  const [connectionOk, setConnectionOk] = useState<boolean | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);

  const [baseUrl, setBaseUrl] = useLocalStorageState('aiAssistant.baseUrl', DEFAULT_BASE_URL);
  const [apiKey, setApiKey] = useLocalStorageState('aiAssistant.apiKey', '');
  const [model, setModel] = useLocalStorageState('aiAssistant.model.v2', '');

  const systemPrompt = useMemo(() => buildSystemPrompt(), []);
  const { executeTool } = useToolExecutor();
  const session = useChatSession({ systemPrompt, baseUrl, apiKey, model, executeTool });
  const { transcript, isBusy, error, send, stop, setError } = session;

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
      className="relative flex flex-col h-full gap-2 p-3 text-sm"
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragging && (
        <div className="absolute inset-2 z-10 flex items-center justify-center gap-2 rounded-md border-2 border-dashed border-primary bg-background/80 text-xs pointer-events-none">
          <Upload className="h-4 w-4" />
          Drop images or text files to attach
        </div>
      )}

      <div className={cn('flex items-center gap-2 flex-shrink-0', isDragging && 'opacity-50')}>
        <Sparkles className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <Select value={targetGridId} onValueChange={handleSelectGrid}>
          <SelectTrigger className="h-7 text-xs w-40">
            <SelectValue placeholder="Target grid (optional)" />
          </SelectTrigger>
          <SelectContent>
            {grids.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="LLM server URL"
          className="h-7 text-xs flex-1"
        />
        <Input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="API key (optional)"
          type="password"
          className="h-7 text-xs w-28"
        />
        {models.length > 0 ? (
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="h-7 text-xs w-44">
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
            className="h-7 text-xs w-28"
          />
        )}
        <Badge variant={connectionOk ? 'default' : 'destructive'} className="text-[10px] flex-shrink-0">
          {connectionOk === null ? 'checking…' : connectionOk ? 'connected' : 'offline'}
        </Badge>
      </div>

      <ChatTranscript items={transcript} isBusy={isBusy} error={error} />

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
