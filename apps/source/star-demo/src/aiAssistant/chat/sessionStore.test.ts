import { describe, expect, it, beforeEach } from 'vitest';
import { sessionKey, toStorable, saveSession, loadSession, clearSession } from './sessionStore';
import type { ChatMessage } from '../llmClient';
import type { TranscriptItem } from './useChatSession';
import { DATA_CELL, type DataCellPayload } from '../dataTools';

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

/** A tool-call transcript item carrying a data-cell result, with `rows`
 *  populated by default — the thing `trimOldAnalysisPayloads` targets. */
function dataCellItem(id: string, over: Partial<DataCellPayload> = {}): TranscriptItem {
  return {
    kind: 'tool',
    id,
    activity: {
      id: `call-${id}`, name: 'query_grid_data', args: {}, status: 'ok',
      result: {
        kind: DATA_CELL, gridName: 'TestGrid', source: 'live', provenance: 'live', rowCount: 3, ran: '3 rows',
        table: { columns: ['a'], rows: [{ a: 1 }, { a: 2 }, { a: 3 }], matched: 3, scanned: 3, truncated: false, grouped: false },
        ...over,
      },
    },
  };
}

/** 34 cheap filler items — enough to push an item at index 0 outside the
 *  most-recent-30 window `trimOldAnalysisPayloads` keeps at full fidelity. */
function filler(count = 34): TranscriptItem[] {
  return Array.from({ length: count }, (_, i) => ({ kind: 'assistant', id: `a${i}`, text: 'x' }));
}

describe('toStorable — trimming old analysis payloads', () => {
  /** A result still visible in the panel right now has to survive a save —
   *  the panel derives its entries straight from the persisted transcript. */
  it('keeps a recent data-cell result at full fidelity', () => {
    const stored = toStorable([], [dataCellItem('recent')]);
    const item = stored.transcript[0] as Extract<TranscriptItem, { kind: 'tool' }>;
    expect((item.activity.result as DataCellPayload).table?.rows).toHaveLength(3);
  });

  it('drops row data from an old data-cell result but keeps what ran', () => {
    const stored = toStorable([], [dataCellItem('old'), ...filler()]);
    const item = stored.transcript[0] as Extract<TranscriptItem, { kind: 'tool' }>;
    const payload = item.activity.result as DataCellPayload;
    expect(payload.table?.rows).toEqual([]);
    // Enough survives to render "here's what ran" instead of nothing.
    expect(payload.gridName).toBe('TestGrid');
    expect(payload.ran).toBe('3 rows');
    expect(payload.rowCount).toBe(3);
    expect(payload.table?.columns).toEqual(['a']);
    expect(payload.table?.matched).toBe(3);
  });

  it('keeps a pivot\'s row/column-dimension metadata even though its rows are dropped', () => {
    const pivot = { rowDims: ['desk'], colDims: ['sector'], measures: ['sum_marketValue'] };
    const old = dataCellItem('old-pivot', {
      table: { columns: ['desk', 'Tech'], rows: [{ desk: 'Credit', Tech: 300 }], matched: 1, scanned: 1, truncated: false, grouped: true, pivot },
    });
    const stored = toStorable([], [old, ...filler()]);
    const item = stored.transcript[0] as Extract<TranscriptItem, { kind: 'tool' }>;
    const payload = item.activity.result as DataCellPayload;
    expect(payload.table?.rows).toEqual([]);
    expect(payload.table?.pivot).toEqual(pivot);
  });

  it('trims an old digest result\'s sample rows the same way', () => {
    const old = dataCellItem('old-digest', {
      table: undefined,
      digest: { rowCount: 3, columns: [], highlights: [], sample: [{ a: 1 }, { a: 2 }] },
    });
    const stored = toStorable([], [old, ...filler()]);
    const item = stored.transcript[0] as Extract<TranscriptItem, { kind: 'tool' }>;
    expect((item.activity.result as DataCellPayload).digest?.sample).toEqual([]);
  });

  it('leaves non-data-cell tool results and non-tool items untouched regardless of position', () => {
    const listResult: TranscriptItem = {
      kind: 'tool', id: 'list',
      activity: { id: 'c1', name: 'list_grids', args: {}, status: 'ok', result: [{ id: 'grid-test' }] },
    };
    const stored = toStorable([], [listResult, ...filler()]);
    expect(stored.transcript[0]).toEqual(listResult);
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
