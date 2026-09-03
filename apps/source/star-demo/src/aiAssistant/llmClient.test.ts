import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamChat, checkHealth, fetchModels, pickDefaultModel, parseToolArgs, toolName } from './llmClient';
import type { OpenAIToolCall } from './llmClient';

function sseStreamFrom(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
}

function mockFetchOnce(body: ReadableStream<Uint8Array>, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, status, body, text: async () => '' }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('streamChat', () => {
  it('accumulates streamed content deltas and calls onDelta per chunk', async () => {
    mockFetchOnce(
      sseStreamFrom([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    );
    const chunks: string[] = [];

    const result = await streamChat({
      baseUrl: 'http://127.0.0.1:3000',
      messages: [{ role: 'user', content: 'hi' }],
      onDelta: (c) => chunks.push(c),
    });

    expect(result).toEqual({ role: 'assistant', content: 'Hello', tool_calls: undefined });
    expect(chunks).toEqual(['Hel', 'lo']);
  });

  it('handles an SSE frame split across two stream chunks', async () => {
    mockFetchOnce(
      sseStreamFrom(['data: {"choices":[{"delta":{"content":"Hel', 'lo"}}]}\n\ndata: [DONE]\n\n']),
    );

    const result = await streamChat({ baseUrl: 'http://127.0.0.1:3000', messages: [] });

    expect(result.content).toBe('Hello');
  });

  it('accumulates tool_call argument fragments by index into a complete call', async () => {
    mockFetchOnce(
      sseStreamFrom([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"get_grid","arguments":""}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"a\\":"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}}]}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    );

    const result = await streamChat({ baseUrl: 'http://127.0.0.1:3000', messages: [] });

    expect(result.tool_calls).toHaveLength(1);
    const call = result.tool_calls![0] as OpenAIToolCall;
    expect(call.id).toBe('call_1');
    expect(toolName(call)).toBe('get_grid');
    expect(parseToolArgs(call)).toEqual({ a: 1 });
  });

  it('throws when the stream ends without [DONE] (server errored mid-response)', async () => {
    // The server just res.end()s with no error frame when it fails after
    // headers — without the [DONE] check this looks like a short success.
    mockFetchOnce(sseStreamFrom(['data: {"choices":[{"delta":{"content":"partial"}}]}\n\n']));

    await expect(streamChat({ baseUrl: 'http://127.0.0.1:3000', messages: [] })).rejects.toThrow(/\[DONE\]/);
  });

  it('sends multimodal content parts through unchanged', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: sseStreamFrom(['data: [DONE]\n\n']), text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);

    await streamChat({
      baseUrl: 'http://127.0.0.1:3000',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
            { type: 'text', text: 'what is this?' },
          ],
        },
      ],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { messages: Array<{ content: unknown }> };
    expect(body.messages[0].content).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
      { type: 'text', text: 'what is this?' },
    ]);
  });

  it('throws with the response body on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, body: null, text: async () => 'bad key' }),
    );

    await expect(streamChat({ baseUrl: 'http://127.0.0.1:3000', messages: [] })).rejects.toThrow(/401/);
  });

  it('sends the Authorization header only when an apiKey is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: sseStreamFrom(['data: [DONE]\n\n']), text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);

    await streamChat({ baseUrl: 'http://127.0.0.1:3000', apiKey: 'secret', messages: [] });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret');
  });
});

describe('fetchModels', () => {
  it('maps the OpenAI models list to ids', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ object: 'list', data: [{ id: 'claude-sonnet-4.6' }, { id: 'auto' }] }),
    }));

    await expect(fetchModels('http://127.0.0.1:3000')).resolves.toEqual(['claude-sonnet-4.6', 'auto']);
  });

  it('de-duplicates ids the server advertises more than once', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        object: 'list',
        data: [{ id: 'claude-opus-4.8' }, { id: 'auto' }, { id: 'claude-opus-4.8' }],
      }),
    }));

    await expect(fetchModels('http://127.0.0.1:3000')).resolves.toEqual(['claude-opus-4.8', 'auto']);
  });

  it('returns [] when the server is unreachable rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(fetchModels('http://127.0.0.1:3000')).resolves.toEqual([]);
  });
});

describe('pickDefaultModel', () => {
  it('prefers the highest-ranked Claude model the server offers', () => {
    expect(pickDefaultModel(['gpt-4o', 'auto', 'claude-sonnet-4.6', 'claude-opus-4.8'])).toBe('claude-opus-4.8');
    expect(pickDefaultModel(['gpt-4o', 'auto', 'claude-sonnet-4.6'])).toBe('claude-sonnet-4.6');
  });

  it('falls back to auto, then to the first offered model, when no Claude model exists', () => {
    expect(pickDefaultModel(['gpt-4o', 'auto'])).toBe('auto');
    expect(pickDefaultModel(['gpt-4o'])).toBe('gpt-4o');
    expect(pickDefaultModel([])).toBe('auto');
  });
});

describe('checkHealth', () => {
  it('returns true when the health endpoint responds ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await expect(checkHealth('http://127.0.0.1:3000')).resolves.toBe(true);
  });

  it('falls back to /v1/models when /health is missing (Ollama, LM Studio, vLLM)', async () => {
    const fetchMock = vi.fn(async (url: string) => ({ ok: !String(url).endsWith('/health') }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(checkHealth('http://127.0.0.1:11434')).resolves.toBe(true);
    expect(fetchMock.mock.calls.map(([u]) => String(u))).toEqual([
      'http://127.0.0.1:11434/health',
      'http://127.0.0.1:11434/v1/models',
    ]);
  });

  it('is false when neither /health nor /v1/models responds ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(checkHealth('http://127.0.0.1:11434')).resolves.toBe(false);
  });

  it('returns false when fetch rejects (server not running)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(checkHealth('http://127.0.0.1:3000')).resolves.toBe(false);
  });
});
