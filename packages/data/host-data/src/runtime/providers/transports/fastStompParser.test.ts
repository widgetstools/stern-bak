import { describe, expect, it } from 'vitest';
import {
  FastStompFrameParser,
  escapeHeaderValue,
  serializeFrame,
  unescapeHeaderValue,
  type StompFrame,
} from './fastStompParser.js';

function collect() {
  const frames: StompFrame[] = [];
  let heartbeats = 0;
  const parser = new FastStompFrameParser({
    onFrame: (f) => frames.push(f),
    onHeartbeat: () => { heartbeats++; },
  });
  return { parser, frames, hb: () => heartbeats };
}

const MSG = 'MESSAGE\nsubscription:sub-0\ndestination:/snapshot/x\nmessage-type:live-update\n\n[{"a":1}]\0';

describe('FastStompFrameParser — text path', () => {
  it('parses a single frame with headers and body', () => {
    const { parser, frames } = collect();
    parser.feed(MSG);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({
      command: 'MESSAGE',
      headers: {
        subscription: 'sub-0',
        destination: '/snapshot/x',
        'message-type': 'live-update',
      },
      body: '[{"a":1}]',
    });
  });

  it('parses multiple frames from one chunk', () => {
    const { parser, frames } = collect();
    parser.feed(MSG + MSG + MSG);
    expect(frames).toHaveLength(3);
    expect(frames[2].body).toBe('[{"a":1}]');
  });

  it('reassembles a frame split mid-header and mid-body', () => {
    const { parser, frames } = collect();
    parser.feed(MSG.slice(0, 12));
    expect(frames).toHaveLength(0);
    parser.feed(MSG.slice(12, MSG.indexOf('\n\n') + 5));
    expect(frames).toHaveLength(0);
    parser.feed(MSG.slice(MSG.indexOf('\n\n') + 5));
    expect(frames).toHaveLength(1);
    expect(frames[0].body).toBe('[{"a":1}]');
  });

  it('counts heart-beat LFs between frames without emitting frames', () => {
    const { parser, frames, hb } = collect();
    parser.feed('\n');
    parser.feed('\n' + MSG + '\n\n');
    expect(hb()).toBe(4);
    expect(frames).toHaveLength(1);
  });

  it('handles CRLF line endings', () => {
    const { parser, frames } = collect();
    parser.feed('MESSAGE\r\nsubscription:s1\r\n\r\nbody\0');
    expect(frames).toHaveLength(1);
    expect(frames[0].command).toBe('MESSAGE');
    expect(frames[0].headers['subscription']).toBe('s1');
    expect(frames[0].body).toBe('body');
  });

  it('unescapes 1.2 header values (but not on CONNECTED)', () => {
    const { parser, frames } = collect();
    parser.feed('MESSAGE\nweird:a\\cb\\nc\\\\d\n\n\0');
    expect(frames[0].headers['weird']).toBe('a:b\nc\\d');

    parser.feed('CONNECTED\nversion:1.2\nserver:x\\c1\n\n\0');
    expect(frames[1].headers['server']).toBe('x\\c1'); // literal, no unescape
  });

  it('first occurrence of a repeated header wins', () => {
    const { parser, frames } = collect();
    parser.feed('MESSAGE\nfoo:first\nfoo:second\n\n\0');
    expect(frames[0].headers['foo']).toBe('first');
  });

  it('empty body frame', () => {
    const { parser, frames } = collect();
    parser.feed('RECEIPT\nreceipt-id:r1\n\n\0');
    expect(frames[0]).toEqual({ command: 'RECEIPT', headers: { 'receipt-id': 'r1' }, body: '' });
  });
});

describe('FastStompFrameParser — binary path', () => {
  const enc = new TextEncoder();

  it('parses a frame delivered as bytes', () => {
    const { parser, frames } = collect();
    parser.feed(enc.encode(MSG).buffer as ArrayBuffer);
    expect(frames).toHaveLength(1);
    expect(frames[0].body).toBe('[{"a":1}]');
    expect(frames[0].headers['destination']).toBe('/snapshot/x');
  });

  it('honours content-length so bodies may contain NUL bytes', () => {
    const { parser, frames } = collect();
    const body = 'ab\0cd';
    const frame = `MESSAGE\nsubscription:s\ncontent-length:${body.length}\n\n${body}\0`;
    parser.feed(enc.encode(frame));
    expect(frames).toHaveLength(1);
    expect(frames[0].body).toBe('ab\0cd');
  });

  it('reassembles binary chunks, including a multibyte char split across the boundary', () => {
    const { parser, frames } = collect();
    const bytes = enc.encode('MESSAGE\nsubscription:s\n\n{"sym":"€URO"}\0');
    // Split inside the 3-byte euro sign.
    const euroStart = 'MESSAGE\nsubscription:s\n\n{"sym":"'.length;
    parser.feed(bytes.slice(0, euroStart + 1));
    expect(frames).toHaveLength(0);
    parser.feed(bytes.slice(euroStart + 1));
    expect(frames).toHaveLength(1);
    expect(frames[0].body).toBe('{"sym":"€URO"}');
  });

  it('parses multiple binary frames and heart-beats in one buffer', () => {
    const { parser, frames, hb } = collect();
    parser.feed(enc.encode('\n' + MSG + '\n' + MSG));
    expect(hb()).toBe(2);
    expect(frames).toHaveLength(2);
  });
});

describe('serializeFrame / escaping', () => {
  it('round-trips through the parser', () => {
    const { parser, frames } = collect();
    const wire = serializeFrame('SEND', { destination: '/queue/a:b' }, '{"x":1}');
    parser.feed(wire);
    expect(frames[0].command).toBe('SEND');
    expect(frames[0].headers['destination']).toBe('/queue/a:b');
    expect(frames[0].headers['content-length']).toBe('7');
    expect(frames[0].body).toBe('{"x":1}');
  });

  it('does not escape CONNECT headers', () => {
    const wire = serializeFrame('CONNECT', { 'accept-version': '1.0,1.1,1.2', 'heart-beat': '4000,4000' });
    expect(wire).toContain('heart-beat:4000,4000\n');
    expect(wire.endsWith('\n\n\0')).toBe(true);
  });

  it('escape/unescape are inverses', () => {
    const nasty = 'a:b\nc\\d\re';
    expect(unescapeHeaderValue(escapeHeaderValue(nasty))).toBe(nasty);
  });
});
