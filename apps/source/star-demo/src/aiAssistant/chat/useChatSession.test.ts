import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useChatSession } from './useChatSession';
import type { ChatMessage } from '../llmClient';

const mockStreamChat = vi.fn();
vi.mock('../llmClient', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, streamChat: (...args: unknown[]) => mockStreamChat(...args) };
});

function options(over: Record<string, unknown> = {}) {
  return {
    systemPrompt: 'BASE PROMPT',
    baseUrl: 'http://localhost:3000',
    executeTool: vi.fn().mockResolvedValue({ ok: true, summary: 'done' }),
    ...over,
  };
}

/** The messages actually sent on the wire for the most recent call. */
function sentMessages(): ChatMessage[] {
  return (mockStreamChat.mock.calls.at(-1)?.[0] as { messages: ChatMessage[] }).messages;
}

beforeEach(() => {
  mockStreamChat.mockReset().mockResolvedValue({ role: 'assistant', content: 'ok' });
});

describe('system prompt lifecycle', () => {
  /**
   * The bug this guards: a scoped panel only learns its blotter after resolving
   * the instance id, so the prompt changes AFTER first render. A ref
   * initialiser captured the original, and the model kept asking which grid
   * the user meant despite the header naming it.
   */
  it('sends a prompt that arrived after the first render', async () => {
    const { rerender, result } = renderHook((props: { systemPrompt: string }) => useChatSession(options(props)), {
      initialProps: { systemPrompt: 'UNSCOPED' },
    });

    rerender({ systemPrompt: 'SCOPED TO grid-credit-axe-blotter' });
    await act(async () => {
      await result.current.send('group by sector', []);
    });

    expect(sentMessages()[0]).toEqual({ role: 'system', content: 'SCOPED TO grid-credit-axe-blotter' });
  });

  it('replaces only the base prompt, keeping the conversation and ambient notes', async () => {
    const { rerender, result } = renderHook((props: { systemPrompt: string }) => useChatSession(options(props)), {
      initialProps: { systemPrompt: 'UNSCOPED' },
    });

    act(() => result.current.noteContext('The user switched to Axe Blotter.'));
    await act(async () => {
      await result.current.send('first question', []);
    });

    rerender({ systemPrompt: 'SCOPED' });
    await act(async () => {
      await result.current.send('second question', []);
    });

    const messages = sentMessages();
    expect(messages[0]).toEqual({ role: 'system', content: 'SCOPED' });
    expect(messages.some((m) => m.content === 'The user switched to Axe Blotter.')).toBe(true);
    expect(messages.filter((m) => m.role === 'user')).toHaveLength(2);
    // Exactly one base prompt — not one per prompt change.
    expect(messages.filter((m) => m.content === 'SCOPED' || m.content === 'UNSCOPED')).toHaveLength(1);
  });

  it('refreshes the base prompt of a restored conversation', async () => {
    const { result } = renderHook(() => useChatSession(options({ systemPrompt: 'CURRENT PROMPT' })));

    act(() =>
      result.current.reset(
        [
          { role: 'system', content: 'STALE PROMPT FROM LAST SESSION' },
          { role: 'user', content: 'earlier question' },
        ],
        [{ kind: 'user', id: 'u1', text: 'earlier question', attachments: [] }],
      ),
    );
    await act(async () => {
      await result.current.send('new question', []);
    });

    const messages = sentMessages();
    expect(messages[0]).toEqual({ role: 'system', content: 'CURRENT PROMPT' });
    expect(messages.some((m) => m.content === 'STALE PROMPT FROM LAST SESSION')).toBe(false);
    expect(messages.some((m) => m.content === 'earlier question')).toBe(true);
  });

  it('gives a restored conversation a prompt even if it was saved without one', async () => {
    const { result } = renderHook(() => useChatSession(options({ systemPrompt: 'CURRENT PROMPT' })));

    act(() => result.current.reset([{ role: 'user', content: 'orphan' }], []));
    await act(async () => {
      await result.current.send('next', []);
    });

    expect(sentMessages()[0]).toEqual({ role: 'system', content: 'CURRENT PROMPT' });
  });

  it('starts a brand-new conversation from the current prompt', async () => {
    const { result } = renderHook(() => useChatSession(options({ systemPrompt: 'CURRENT PROMPT' })));

    act(() => result.current.reset());
    await act(async () => {
      await result.current.send('hello', []);
    });

    const messages = sentMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ role: 'system', content: 'CURRENT PROMPT' });
  });
});

describe('noteContext', () => {
  it('adds context for the model without showing it in the transcript', async () => {
    const { result } = renderHook(() => useChatSession(options()));

    act(() => result.current.noteContext('ambient note'));
    await act(async () => {
      await result.current.send('hi', []);
    });

    await waitFor(() => expect(sentMessages().some((m) => m.content === 'ambient note')).toBe(true));
    expect(result.current.transcript.some((i) => JSON.stringify(i).includes('ambient note'))).toBe(false);
  });
});
