import { describe, expect, it } from 'vitest';

import { FrameParser } from './FrameParser.js';
import { NUL, serializeFrame } from './frameCodec.js';

describe('FrameParser', () => {
  it('parses a whole frame with headers and body', () => {
    const parser = new FrameParser();
    const [frame] = parser.push(serializeFrame('SEND', { destination: '/a' }, 'hello'));
    expect(frame?.command).toBe('SEND');
    expect(frame?.headers['destination']).toBe('/a');
    expect(frame?.body).toBe('hello');
  });

  it('reassembles a frame split across arbitrary chunk boundaries', () => {
    const wire = serializeFrame('SEND', { destination: '/a' }, 'hello world');
    for (const cut of [1, 5, 12, wire.length - 2]) {
      const parser = new FrameParser();
      expect(parser.push(wire.slice(0, cut))).toHaveLength(0);
      const frames = parser.push(wire.slice(cut));
      expect(frames).toHaveLength(1);
      expect(frames[0]?.body).toBe('hello world');
    }
  });

  it('returns several frames arriving in one chunk', () => {
    const parser = new FrameParser();
    const frames = parser.push(
      serializeFrame('SEND', { destination: '/a' }, '1') +
        serializeFrame('SEND', { destination: '/b' }, '2'),
    );
    expect(frames.map((f) => f.body)).toEqual(['1', '2']);
  });

  it('swallows heartbeat LFs between frames', () => {
    const parser = new FrameParser();
    const frames = parser.push('\n\n' + serializeFrame('SEND', { destination: '/a' }) + '\n');
    expect(frames).toHaveLength(1);
    expect(parser.push('\n\n')).toHaveLength(0);
  });

  it('accepts CRLF header blocks as well as LF', () => {
    const parser = new FrameParser();
    const frames = parser.push(`SEND\r\ndestination:/a\r\n\r\nbody${NUL}`);
    expect(frames[0]?.headers['destination']).toBe('/a');
    expect(frames[0]?.body).toBe('body');
  });

  it('honours content-length in BYTES for a multibyte body', () => {
    const body = 'euro \u20ac sign';
    const parser = new FrameParser();
    const [frame] = parser.push(serializeFrame('SEND', { destination: '/a' }, body));
    expect(frame?.body).toBe(body);
  });

  it('unescapes headers for SEND but leaves CONNECT alone', () => {
    const parser = new FrameParser();
    const [send] = parser.push(serializeFrame('SEND', { note: 'a:b' }, ''));
    expect(send?.headers['note']).toBe('a:b');
    const [connect] = parser.push(serializeFrame('CONNECT', { 'heart-beat': '1,2' }, ''));
    expect(connect?.headers['heart-beat']).toBe('1,2');
  });

  it('keeps the first occurrence of a repeated header', () => {
    const parser = new FrameParser();
    const [frame] = parser.push(`SEND\nid:first\nid:second\n\n${NUL}`);
    expect(frame?.headers['id']).toBe('first');
  });

  it('rejects a content-length that does not reach the terminator', () => {
    const parser = new FrameParser();
    expect(() => parser.push(`SEND\ncontent-length:2\n\nabcdef${NUL}`)).toThrow(/NUL terminator/);
  });

  it('rejects a non-numeric content-length', () => {
    const parser = new FrameParser();
    expect(() => parser.push(`SEND\ncontent-length:abc\n\nx${NUL}`)).toThrow(/Invalid content-length/);
  });

  it('rejects a frame past the size ceiling instead of buffering forever', () => {
    const parser = new FrameParser({ maxFrameBytes: 32 });
    expect(() => parser.push('X'.repeat(64))).toThrow(/exceeds 32 bytes/);
  });

  it('accepts Buffer input as well as string', () => {
    const parser = new FrameParser();
    const frames = parser.push(Buffer.from(serializeFrame('SEND', { destination: '/a' }, 'b'), 'utf8'));
    expect(frames[0]?.body).toBe('b');
  });

  it('ignores header lines with no colon', () => {
    const parser = new FrameParser();
    const [frame] = parser.push(`SEND\ngarbage\nid:x\n\n${NUL}`);
    expect(frame?.headers).toEqual({ id: 'x' });
  });
});
