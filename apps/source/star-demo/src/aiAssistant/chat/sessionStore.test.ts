import { describe, expect, it, beforeEach } from 'vitest';
import { sessionKey, toStorable, saveSession, loadSession, clearSession } from './sessionStore';
import type { ChatMessage } from '../llmClient';
import type { TranscriptItem } from './useChatSession';

const transcript: TranscriptItem[] = [{ kind: 'user', id: 'u1', text: 'hello', attachments: [] }];

beforeEach(() => {
  window.localStorage.clear();
});

describe('sessionKey', () => {
  /** "Hide ISIN" means something different per blotter, so threads don't mix. */
  it('gives a scoped panel its own thread', () => {
    expect(sessionKey('grid-axe')).not.toBe(sessionKey());
    expect(sessionKey('grid-axe')).toContain('grid-axe');
  });
});

describe('toStorable', () => {
  /** Base64 screenshots would blow the ~5 MB quota and lose the whole save. */
  it('strips image and file payloads but keeps a readable placeholder', () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
          { type: 'file', file: { filename: 'config.json', file_data: 'data:text/json;base64,BBBB' } },
          { type: 'text', text: 'what is wrong here?' },
        ],
      },
    ];

    const stored = toStorable(messages, transcript);
    const parts = stored.messages[0].content as Array<{ type: string; text?: string }>;

    expect(JSON.stringify(stored)).not.toContain('base64,AAAA');
    expect(JSON.stringify(stored)).not.toContain('base64,BBBB');
    expect(parts[0].text).toContain('image');
    expect(parts[1].text).toContain('config.json');
    expect(parts[2].text).toBe('what is wrong here?');
  });

  it('leaves plain string messages untouched', () => {
    const stored = toStorable([{ role: 'user', content: 'plain' }], transcript);
    expect(stored.messages[0].content).toBe('plain');
  });

  it('caps a long conversation but keeps the system prompt', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'SYSTEM PROMPT' },
      ...Array.from({ length: 500 }, (_, i) => ({ role: 'user' as const, content: `m${i}` })),
    ];
    const stored = toStorable(messages, transcript);
    expect(stored.messages.length).toBeLessThan(messages.length);
    expect(stored.messages[0].content).toBe('SYSTEM PROMPT');
    expect(stored.messages.at(-1)?.content).toBe('m499');
  });
});

describe('save / load / clear', () => {
  it('round-trips a conversation', () => {
    const key = sessionKey();
    saveSession(key, [{ role: 'user', content: 'hello' }], transcript);
    const loaded = loadSession(key);
    expect(loaded?.transcript).toEqual(transcript);
    expect(loaded?.messages[0].content).toBe('hello');
  });

  it('clears the entry when the conversation is emptied', () => {
    const key = sessionKey();
    saveSession(key, [{ role: 'user', content: 'hello' }], transcript);
    saveSession(key, [], []);
    expect(loadSession(key)).toBeNull();
  });

  it('returns null for absent or corrupt entries rather than throwing', () => {
    expect(loadSession('nothing-here')).toBeNull();
    window.localStorage.setItem('corrupt', '{not json');
    expect(loadSession('corrupt')).toBeNull();
  });

  it('clearSession removes the thread', () => {
    const key = sessionKey('grid-axe');
    saveSession(key, [{ role: 'user', content: 'x' }], transcript);
    clearSession(key);
    expect(loadSession(key)).toBeNull();
  });
});
