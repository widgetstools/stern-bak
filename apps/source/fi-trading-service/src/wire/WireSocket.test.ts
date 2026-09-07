import { describe, expect, it } from 'vitest';

import { toFrameChunk } from './WireSocket.js';

/**
 * `ws` hands a message listener one of several shapes depending on how the
 * peer framed the message and whether `binaryType` was set. Getting any of
 * them wrong means binary frames silently stop parsing, so each is pinned.
 */
describe('toFrameChunk', () => {
  it('passes a string through untouched', () => {
    expect(toFrameChunk('CONNECT')).toBe('CONNECT');
  });

  it('passes a Buffer through untouched', () => {
    const buf = Buffer.from('abc');
    expect(toFrameChunk(buf)).toBe(buf);
  });

  it('wraps a raw ArrayBuffer', () => {
    const bytes = new Uint8Array([65, 66, 67]);
    expect(toFrameChunk(bytes.buffer).toString()).toBe('ABC');
  });

  it('concatenates a fragment list, which is what ws does for split frames', () => {
    expect(toFrameChunk([Buffer.from('AB'), Buffer.from('CD')]).toString()).toBe('ABCD');
  });

  it('respects byteOffset and byteLength on a typed-array view', () => {
    const backing = new Uint8Array([1, 2, 65, 66, 3]);
    const view = new Uint8Array(backing.buffer, 2, 2);
    expect(toFrameChunk(view).toString()).toBe('AB');
  });

  it('stringifies anything else rather than throwing mid-parse', () => {
    expect(toFrameChunk(42)).toBe('42');
  });
});
