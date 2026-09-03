/**
 * Minimal OpenAI-compatible chat-completions client, streaming (SSE).
 *
 * Talks to `copilotLLMServer` (a local VS Code extension exposing GitHub
 * Copilot at `http://127.0.0.1:3000` by default) but speaks the plain
 * OpenAI `chat.completions` contract, so any OpenAI-compatible endpoint
 * works as a drop-in replacement later.
 */

import type { ToolName } from './tools';

const LOG = '[aiAssistant]';

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/**
 * Multimodal content parts, exactly as `copilotLLMServer/src/messages.ts`
 * accepts them:
 *   - image_url  — the `url` MUST be an inline `data:` URI; remote URLs are
 *                  rejected outright (never fetched) and the MIME allowlist
 *                  is png/jpeg/gif/webp only.
 *   - file       — non-standard part; `file_data` is a data URI or bare
 *                  base64. Text documents only (1 MB decoded); the server
 *                  does not decode PDF/DOCX.
 * See `useAttachments.ts`, which enforces both rules client-side so users
 * get an inline error instead of an opaque HTTP 400.
 */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** String for plain text; array to attach images/files to a user turn. */
  content: string | ContentPart[];
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

/** Flattens a message's content to plain text (for transcript display / persistence). */
export function contentToText(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content;
  return content
    .map((p) => (p.type === 'text' ? p.text : p.type === 'image_url' ? '[image]' : `[file: ${p.file.filename}]`))
    .join(' ');
}

export interface StreamChatOptions {
  baseUrl: string;
  apiKey?: string;
  model?: string;
  messages: ChatMessage[];
  tools?: unknown[];
  onDelta?: (textChunk: string) => void;
  signal?: AbortSignal;
}

export interface StreamChatResult {
  role: 'assistant';
  content: string;
  tool_calls?: OpenAIToolCall[];
}

interface StreamChunkDelta {
  content?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: 'function';
    function?: { name?: string; arguments?: string };
  }>;
}

/** Streams one chat-completions round trip, returning the finished assistant message. */
export async function streamChat(opts: StreamChatOptions): Promise<StreamChatResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;
  const url = `${opts.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
  const model = opts.model ?? 'auto';
  const requestBody = {
    model,
    stream: true,
    workspace_tools: false,
    messages: opts.messages,
    tools: opts.tools,
  };

  const startedAt = performance.now();
  console.debug(`${LOG} → POST ${url}`, {
    model,
    messageCount: opts.messages.length,
    lastRole: opts.messages.at(-1)?.role,
    toolNames: (opts.tools as Array<{ function?: { name?: string } }> | undefined)?.map((t) => t.function?.name),
  });

  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers, signal: opts.signal, body: JSON.stringify(requestBody) });
  } catch (err) {
    console.error(`${LOG} ✗ fetch failed after ${Math.round(performance.now() - startedAt)}ms`, err);
    throw err;
  }
  console.debug(`${LOG} ← ${res.status} ${res.statusText} (${Math.round(performance.now() - startedAt)}ms to headers)`);

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    console.error(`${LOG} ✗ error body:`, text || res.statusText);
    throw new Error(`LLM request failed (${res.status}): ${text || res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let sawDone = false;
  const toolCallsByIndex = new Map<number, { id: string; name: string; arguments: string }>();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice('data:'.length).trim();
      if (payload === '[DONE]') {
        sawDone = true;
        continue;
      }

      const chunk = JSON.parse(payload) as { choices?: Array<{ delta?: StreamChunkDelta }> };
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;
      console.debug(`${LOG} chunk`, delta);

      if (delta.content) {
        content += delta.content;
        opts.onDelta?.(delta.content);
      }
      // Note: this server sends each tool call complete in a SINGLE frame,
      // but OpenAI-compatible servers may fragment `arguments` across frames —
      // accumulate by index so both shapes work.
      for (const tc of delta.tool_calls ?? []) {
        const existing = toolCallsByIndex.get(tc.index) ?? { id: '', name: '', arguments: '' };
        if (tc.id) existing.id = tc.id;
        if (tc.function?.name) existing.name += tc.function.name;
        if (tc.function?.arguments) existing.arguments += tc.function.arguments;
        toolCallsByIndex.set(tc.index, existing);
      }
    }
  }

  // The server ends the response with no error frame when it fails after
  // headers are sent, so a stream that stops without `[DONE]` is a failure,
  // not a short answer. Without this it would look like an empty success.
  if (!sawDone) {
    throw new Error(
      'LLM stream ended unexpectedly (no [DONE] marker) — the server likely errored mid-response. Check the Copilot LLM Server output in VS Code.',
    );
  }

  const tool_calls: OpenAIToolCall[] = [...toolCallsByIndex.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, tc]) => ({
      id: tc.id || `call_${Math.random().toString(36).slice(2)}`,
      type: 'function' as const,
      function: { name: tc.name, arguments: tc.arguments },
    }));

  console.debug(`${LOG} ✓ done in ${Math.round(performance.now() - startedAt)}ms`, {
    contentLength: content.length,
    toolCalls: tool_calls.map((c) => ({ name: c.function.name, arguments: c.function.arguments })),
  });

  return { role: 'assistant', content, tool_calls: tool_calls.length > 0 ? tool_calls : undefined };
}

/**
 * Model ids we prefer, best first. The server advertises whatever the
 * signed-in Copilot seat exposes, so this is a preference order applied
 * against the live `/v1/models` list — not a hardcoded assumption.
 */
export const PREFERRED_MODELS = [
  'claude-opus-4.8',
  'claude-opus-4.7',
  'claude-sonnet-4.6',
  'claude-sonnet-4.5',
  'claude-haiku-4.5',
];

/**
 * Lists model ids the server offers. Returns [] when it can't be reached.
 *
 * Ids are de-duplicated: the Copilot server advertises the same model more
 * than once (once per capability entry), which otherwise renders duplicate
 * `<SelectItem value>`s — React logs a duplicate-key warning per model and
 * Radix concatenates every matching item's label into the trigger, so the
 * picker reads "claude-opus-4.8claude-opus-4.8".
 */
export async function fetchModels(baseUrl: string, apiKey?: string): Promise<string[]> {
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/models`, { headers });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: Array<{ id?: string }> };
    const ids = [
      ...new Set((body.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id))),
    ];
    console.debug(`${LOG} models`, ids);
    return ids;
  } catch (err) {
    console.debug(`${LOG} models unavailable`, err);
    return [];
  }
}

/** Best available model: highest-ranked preferred id present, else 'auto', else the first offered. */
export function pickDefaultModel(available: string[]): string {
  const preferred = PREFERRED_MODELS.find((m) => available.includes(m));
  if (preferred) return preferred;
  if (available.includes('auto')) return 'auto';
  return available[0] ?? 'auto';
}

export async function checkHealth(baseUrl: string): Promise<boolean> {
  const root = baseUrl.replace(/\/$/, '');
  const url = `${root}/health`;
  try {
    const res = await fetch(url);
    console.debug(`${LOG} health ${url} → ${res.status}`);
    if (res.ok) return true;
    // Not every OpenAI-compatible server has /health (Ollama, LM Studio,
    // vLLM behind a bare proxy) — /v1/models is the one endpoint they all share.
    const models = await fetch(`${root}/v1/models`);
    console.debug(`${LOG} health fallback ${root}/v1/models → ${models.status}`);
    return models.ok;
  } catch (err) {
    console.debug(`${LOG} health ${url} → unreachable`, err);
    return false;
  }
}

/** Parses a tool call's JSON arguments, typed by the caller-known tool name. */
export function parseToolArgs<T = Record<string, unknown>>(call: OpenAIToolCall): T {
  return JSON.parse(call.function.arguments || '{}') as T;
}

export function toolName(call: OpenAIToolCall): ToolName {
  return call.function.name as ToolName;
}
