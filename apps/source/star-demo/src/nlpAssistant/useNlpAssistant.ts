/**
 * The NLP assistant's turn loop — the LLM-free counterpart of
 * `aiAssistant/chat/useChatSession.ts`.
 *
 * One user message → classify → extract → route → run ONE tool → template a
 * reply. The local pipeline always runs first (sub-millisecond, offline); when
 * it is unsure and a server URL is configured, the server's model result
 * replaces it. Either way the action goes through `dispatchTool`, the same
 * executor the LLM assistant uses, so both assistants share every tool.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';
import type { ToolName } from '../aiAssistant/tools';
import type { ToolExecutionResult } from '../aiAssistant/toolResult';
import { resolveGridEntry } from '../aiAssistant/gridProfiles';
import { readColumnCatalogue, isNumericColumn } from '../aiAssistant/columnResolver';
import { classifyIntent, shouldUseServerNLP, type AssistantIntent } from './intentClassifier';
import { extractEntities, type CatalogueColumn, type ExtractedEntities } from './entityExtractor';
import { routeToTool } from './toolRouter';
import { generateResponse, clarificationFor } from './responseGenerator';
import { parseOnServer, serverHealthy } from './nlpClient';

export interface NlpTurnDebug {
  intent: AssistantIntent;
  confidence: number;
  source: 'local' | 'server';
  model?: string;
  latencyMs: number;
  tool?: ToolName;
  args?: Record<string, unknown>;
  reason?: string;
}

export type NlpTranscriptItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string; debug?: NlpTurnDebug; result?: ToolExecutionResult };

export interface UseNlpAssistantOptions {
  configManager: ConfigManager;
  configStore: DataProviderConfigStore;
  targetGridId?: string;
  /** Server-side NLP base URL; empty/undefined = local only. */
  serverUrl?: string;
  executeTool: (name: ToolName, args: Record<string, unknown>) => Promise<ToolExecutionResult>;
}

let seq = 0;
const nextId = () => `nlp-${Date.now().toString(36)}-${seq++}`;

export function useNlpAssistant(opts: UseNlpAssistantOptions) {
  const { configManager, configStore, targetGridId, serverUrl, executeTool } = opts;
  const [items, setItems] = useState<NlpTranscriptItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [serverOk, setServerOk] = useState<boolean | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueColumn[]>([]);
  const history = useRef<string[]>([]);

  // Column catalogue for the target grid — what every phrase resolves against.
  useEffect(() => {
    let cancelled = false;
    if (!targetGridId) {
      setCatalogue([]);
      return;
    }
    void (async () => {
      const entry = await resolveGridEntry(targetGridId);
      if (!entry) return;
      const cols = await readColumnCatalogue(configManager, configStore, entry);
      if (cancelled) return;
      setCatalogue(cols.map((c) => ({ colId: c.colId, headerName: c.headerName ?? c.colId, numeric: isNumericColumn(c) })));
    })();
    return () => {
      cancelled = true;
    };
  }, [configManager, configStore, targetGridId]);

  useEffect(() => {
    if (!serverUrl) {
      setServerOk(null);
      return;
    }
    let cancelled = false;
    void serverHealthy(serverUrl).then((ok) => {
      if (!cancelled) setServerOk(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [serverUrl]);

  const numericCols = useMemo(() => new Set(catalogue.filter((c) => c.numeric).map((c) => c.colId)), [catalogue]);

  const push = useCallback((item: NlpTranscriptItem) => setItems((prev) => [...prev, item]), []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      push({ kind: 'user', id: nextId(), text: trimmed });
      setBusy(true);
      const t0 = performance.now();
      try {
        if (!targetGridId) {
          push({ kind: 'assistant', id: nextId(), text: 'Pick a blotter first — I need to know which grid to act on.' });
          return;
        }

        // 1. Local pass.
        const local = classifyIntent(trimmed);
        let intent = local.intent;
        let confidence = local.confidence;
        let entities: ExtractedEntities = extractEntities(trimmed, catalogue);
        let source: NlpTurnDebug['source'] = 'local';
        let model: string | undefined;

        // 2. Server pass when local is unsure and a server is up.
        if (serverUrl && serverOk && shouldUseServerNLP(local)) {
          try {
            const remote = await parseOnServer({ text: trimmed, columns: catalogue, history: history.current.slice(-3) }, serverUrl);
            if (remote.confidence >= confidence || intent === 'unknown') {
              intent = remote.intent;
              confidence = remote.confidence;
              // Server entities win on the fields it filled; local keeps the rest.
              entities = {
                ...entities,
                ...remote.entities,
                columns: remote.entities.columns.length ? remote.entities.columns : entities.columns,
                aggregations: Object.keys(remote.entities.aggregations).length ? remote.entities.aggregations : entities.aggregations,
                filters: remote.entities.filters.length ? remote.entities.filters : entities.filters,
              };
              source = 'server';
              model = remote.model;
            }
          } catch (err) {
            console.warn('[nlpAssistant] server parse failed, using local result', err);
          }
        }

        const debug: NlpTurnDebug = { intent, confidence, source, model, latencyMs: Math.round(performance.now() - t0) };

        // 3. Route.
        const routed = routeToTool(intent, entities, { targetGridId, numericCols });
        if (!routed.ok) {
          push({ kind: 'assistant', id: nextId(), text: clarificationFor(intent, entities), debug });
          return;
        }
        debug.tool = routed.call.tool;
        debug.args = routed.call.args;
        debug.reason = routed.call.reason;

        // 4. Act.
        const result = await executeTool(routed.call.tool, routed.call.args);
        debug.latencyMs = Math.round(performance.now() - t0);
        const entry = await resolveGridEntry(targetGridId);
        push({
          kind: 'assistant',
          id: nextId(),
          text: generateResponse({
            intent,
            entities,
            gridName: entry?.displayName,
            toolSummary: result.ok ? result.summary : undefined,
            ok: result.ok,
            error: result.ok ? undefined : result.summary,
            confidence,
            source,
          }),
          debug,
          result,
        });
        history.current = [...history.current.slice(-9), trimmed];
      } finally {
        setBusy(false);
      }
    },
    [busy, catalogue, executeTool, numericCols, push, serverOk, serverUrl, targetGridId],
  );

  const clear = useCallback(() => {
    setItems([]);
    history.current = [];
  }, []);

  return { items, busy, send, clear, serverOk, catalogue, history: history.current };
}
