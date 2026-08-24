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
import { useCallback, useRef, useState } from 'react';
import { streamChat, parseToolArgs, toolName, contentToText, type ChatMessage } from '../llmClient';
import { TOOL_SCHEMAS } from '../tools';
import type { ToolExecutionResult } from '../useToolExecutor';
import type { ToolName } from '../tools';
import type { ToolActivity } from './ToolCallCard';
import { buildUserContent, type Attachment } from './attachments';

const LOG = '[aiAssistant]';
const REQUEST_TIMEOUT_MS = 120_000;
/** Safety valve: the model could otherwise ping-pong tool calls forever. */
const MAX_TOOL_ROUNDS = 8;

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
}

let seq = 0;
const nextId = () => `it-${Date.now().toString(36)}-${seq++}`;

export function useChatSession(opts: UseChatSessionOptions) {
  const { systemPrompt, baseUrl, apiKey, model, executeTool } = opts;

  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesRef = useRef<ChatMessage[]>([{ role: 'system', content: systemPrompt }]);
  const transcriptRef = useRef<TranscriptItem[]>([]);
  const abortRef = useRef<AbortController | null>(null);

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
      messagesRef.current = messages ?? [{ role: 'system', content: systemPrompt }];
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
            { role: 'tool', tool_call_id: call.id, name: call.function.name, content: JSON.stringify(toolResult) },
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
      await runTurn();
    },
    [isBusy, pushItem, runTurn],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort('user');
    setIsBusy(false);
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
  };
}
