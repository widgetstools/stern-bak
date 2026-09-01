/**
 * Owns one conversation: the wire messages, the display transcript, the
 * streaming turn loop, tool execution, and abort.
 *
 * Two parallel representations are kept deliberately:
 *   - `messages`   — exactly what goes to the model (system prompt, tool
 *                    results, multimodal parts).
 *   - `transcript` — what the user sees (bubbles + tool activity cards),
 *                    which omits the system prompt and renders tool calls
 *                    as their own items rather than opaque JSON.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChat, parseToolArgs, toolName, contentToText, type ChatMessage } from '../llmClient';
import { TOOL_SCHEMAS } from '../tools';
import { DATA_CELL } from '../dataTools';
import type { ToolExecutionResult } from '../useToolExecutor';
import type { ToolName } from '../tools';
import type { ToolActivity } from './ToolCallCard';
import { buildUserContent, type Attachment } from './attachments';

const LOG = '[aiAssistant]';
const REQUEST_TIMEOUT_MS = 120_000;
/** Safety valve: the model could otherwise ping-pong tool calls forever. */
const MAX_TOOL_ROUNDS = 8;
/**
 * How many result rows the MODEL sees. `query_grid_data` can return up to 500
 * (MAX_LIMIT in dataQuery.ts), and a tool result lives in `messagesRef` for
 * the rest of the conversation — so one wide query would otherwise re-bill
 * thousands of tokens on EVERY later turn. The panel still renders every row;
 * this only trims the copy sent to the model.
 *
 * 50 is deliberately the query engine's own DEFAULT_LIMIT: an ordinary query
 * is untouched, and only a deliberately-large one trims. The model is told
 * exactly what was withheld so it can re-query rather than guess.
 */
const MAX_MODEL_RESULT_ROWS = 50;

/**
 * The model's view of a tool result. Identical to the result itself except
 * that an over-long data-cell row set is capped — see
 * `MAX_MODEL_RESULT_ROWS`. Returns the original object (not a copy) whenever
 * nothing needs trimming, so the common path allocates nothing.
 */
export function forModel(result: ToolExecutionResult): ToolExecutionResult {
  const data = result.data as
    | { kind?: string; table?: { rows?: unknown[]; matched?: number } }
    | undefined;
  const rows = data?.kind === DATA_CELL ? data.table?.rows : undefined;
  if (!Array.isArray(rows) || rows.length <= MAX_MODEL_RESULT_ROWS) return result;

  const withheld = rows.length - MAX_MODEL_RESULT_ROWS;
  return {
    ...result,
    data: {
      ...data,
      table: {
        ...data!.table,
        rows: rows.slice(0, MAX_MODEL_RESULT_ROWS),
        // Named so the model treats this as "ask again, narrower" rather than
        // as the complete answer. The user still sees all of them in the panel.
        rowsWithheldFromModel: withheld,
        note: `Showing the first ${MAX_MODEL_RESULT_ROWS} of ${rows.length} rows; ${withheld} withheld from this message. The user can see all of them in the panel. Re-query with a filter, a smaller limit, or an aggregation if you need the rest.`,
      },
    },
  };
}

export type TranscriptItem =
  | { kind: 'user'; id: string; text: string; attachments: Array<{ name: string; kind: Attachment['kind'] }> }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'tool'; id: string; activity: ToolActivity };

export interface UseChatSessionOptions {
  systemPrompt: string;
  baseUrl: string;
  apiKey?: string;
  model?: string;
  executeTool: (name: ToolName, args: Record<string, unknown>) => Promise<ToolExecutionResult>;
  /** Called with the user's message when a turn starts — undo uses it as the label. */
  onTurnStart?: (label: string) => void;
  /** Called before each tool runs, so undo can snapshot what it is about to change. */
  onToolCall?: (name: ToolName, args: Record<string, unknown>) => Promise<void> | void;
  /** Called once the turn (including its tool rounds) has settled. */
  onTurnEnd?: () => void;
}

let seq = 0;
const nextId = () => `it-${Date.now().toString(36)}-${seq++}`;

export function useChatSession(opts: UseChatSessionOptions) {
  const { systemPrompt, baseUrl, apiKey, model, executeTool, onTurnStart, onToolCall, onTurnEnd } = opts;

  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesRef = useRef<ChatMessage[]>([{ role: 'system', content: systemPrompt }]);
  const transcriptRef = useRef<TranscriptItem[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * Keep the BASE system message current.
   *
   * A ref initialiser runs once, so a prompt that arrives later — a scoped
   * panel only learns its blotter after resolving the instance id — would never
   * reach the model: it would answer from the prompt built on first render and
   * ask which grid the user meant. Only index 0 is replaced, so ambient
   * `noteContext` notes and the conversation itself survive.
   */
  useEffect(() => {
    const [first, ...rest] = messagesRef.current;
    messagesRef.current =
      first?.role === 'system'
        ? [{ role: 'system', content: systemPrompt }, ...rest]
        : [{ role: 'system', content: systemPrompt }, ...messagesRef.current];
  }, [systemPrompt]);

  const commitTranscript = useCallback((next: TranscriptItem[]) => {
    transcriptRef.current = next;
    setTranscript(next);
  }, []);

  const pushItem = useCallback(
    (item: TranscriptItem) => commitTranscript([...transcriptRef.current, item]),
    [commitTranscript],
  );

  const patchItem = useCallback(
    (id: string, patch: Partial<Extract<TranscriptItem, { kind: 'tool' }>['activity']>) => {
      commitTranscript(
        transcriptRef.current.map((it) =>
          it.kind === 'tool' && it.id === id ? { ...it, activity: { ...it.activity, ...patch } } : it,
        ),
      );
    },
    [commitTranscript],
  );

  /** Replace the whole conversation (loading a saved session, or resetting). */
  const reset = useCallback(
    (messages?: ChatMessage[], items?: TranscriptItem[]) => {
      abortRef.current?.abort();
      if (messages) {
        // A restored conversation carries the system prompt it was saved with,
        // which may predate this panel's scope. Refresh index 0 and keep the
        // rest — including any ambient notes appended during that session.
        const restored = [...messages];
        if (restored[0]?.role === 'system') restored[0] = { role: 'system', content: systemPrompt };
        else restored.unshift({ role: 'system', content: systemPrompt });
        messagesRef.current = restored;
      } else {
        messagesRef.current = [{ role: 'system', content: systemPrompt }];
      }
      commitTranscript(items ?? []);
      setError(null);
      setIsBusy(false);
    },
    [systemPrompt, commitTranscript],
  );

  const runTurn = useCallback(
    async (round = 0): Promise<void> => {
      if (round >= MAX_TOOL_ROUNDS) {
        setError(`Stopped after ${MAX_TOOL_ROUNDS} tool rounds — the assistant may be stuck in a loop.`);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      setIsBusy(true);
      setError(null);

      // The streaming assistant bubble is created lazily on the first text
      // delta, so a pure tool-call turn doesn't leave an empty bubble behind.
      let streamingId: string | null = null;
      // Some models open a turn with whitespace-only deltas ("\n\n") before
      // the real text — or before switching to tool calls. Creating the bubble
      // on those renders an empty bubble, which reads as a blank line in the
      // transcript, so hold them back until something visible arrives.
      let pending = '';

      try {
        const result = await streamChat({
          baseUrl,
          apiKey: apiKey || undefined,
          model: model || undefined,
          messages: messagesRef.current,
          tools: TOOL_SCHEMAS,
          signal: controller.signal,
          onDelta: (chunk) => {
            if (!streamingId) {
              pending += chunk;
              if (!pending.trim()) return;
              streamingId = nextId();
              pushItem({ kind: 'assistant', id: streamingId, text: pending });
              return;
            }
            const id = streamingId;
            commitTranscript(
              transcriptRef.current.map((it) =>
                it.kind === 'assistant' && it.id === id ? { ...it, text: it.text + chunk } : it,
              ),
            );
          },
        });

        messagesRef.current = [
          ...messagesRef.current,
          { role: 'assistant', content: result.content, tool_calls: result.tool_calls },
        ];

        const calls = result.tool_calls ?? [];
        if (calls.length === 0) return;

        for (const call of calls) {
          const name = toolName(call);
          const args = parseToolArgs<Record<string, unknown>>(call);
          const itemId = nextId();
          pushItem({ kind: 'tool', id: itemId, activity: { id: call.id, name, args, status: 'running' } });

          let toolResult: ToolExecutionResult;
          try {
            // Snapshot BEFORE the change, so undo reverses to where the turn
            // started rather than to some midpoint.
            await onToolCall?.(name, args);
            toolResult = await executeTool(name, args);
          } catch (err) {
            toolResult = { ok: false, summary: `Tool failed: ${err instanceof Error ? err.message : String(err)}` };
            console.error(`${LOG} tool ✗ ${name}`, err);
          }

          patchItem(itemId, {
            status: toolResult.ok ? 'ok' : 'error',
            summary: toolResult.summary,
            result: toolResult.data ?? toolResult.summary,
          });
          messagesRef.current = [
            ...messagesRef.current,
            { role: 'tool', tool_call_id: call.id, name: call.function.name, content: JSON.stringify(forModel(toolResult)) },
          ];
        }

        clearTimeout(timeoutId);
        await runTurn(round + 1);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // Distinguish a user Stop (keep partial text, no error) from the
          // watchdog firing on an unresponsive server.
          if (controller.signal.reason !== 'user') {
            setError(
              `No response after ${REQUEST_TIMEOUT_MS / 1000}s. Check VS Code for a pending "Allow language model access" prompt.`,
            );
          }
        } else {
          console.error(`${LOG} turn ✗`, err);
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        clearTimeout(timeoutId);
        if (abortRef.current === controller) {
          abortRef.current = null;
          setIsBusy(false);
        }
      }
    },
    [baseUrl, apiKey, model, executeTool, pushItem, patchItem, commitTranscript],
  );

  const send = useCallback(
    async (text: string, attachments: Attachment[]) => {
      if (isBusy) return;
      const content = buildUserContent(text, attachments);
      messagesRef.current = [...messagesRef.current, { role: 'user', content }];
      pushItem({
        kind: 'user',
        id: nextId(),
        text: text || contentToText(content),
        attachments: attachments.map((a) => ({ name: a.name, kind: a.kind })),
      });
      console.debug(`${LOG} user →`, text, attachments.length ? `(+${attachments.length} attachment(s))` : '');
      onTurnStart?.(text);
      try {
        await runTurn();
      } finally {
        onTurnEnd?.();
      }
    },
    [isBusy, pushItem, runTurn, onTurnStart, onTurnEnd],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort('user');
    setIsBusy(false);
  }, []);

  /**
   * Adds a system-role note to the wire conversation without touching the
   * visible transcript — used for ambient context like "the user switched to
   * this blotter". Appended rather than rewritten into the base prompt so
   * earlier turns keep the context they were answered under.
   */
  const noteContext = useCallback((text: string) => {
    messagesRef.current = [...messagesRef.current, { role: 'system', content: text }];
  }, []);

  return {
    transcript,
    messages: messagesRef,
    isBusy,
    error,
    send,
    stop,
    reset,
    setError,
    noteContext,
  };
}
