import { describe, expect, it } from 'vitest';

import {
  NUL,
  escapeHeaderValue,
  serializeFrame,
  unescapeHeaderValue,
} from './frameCodec.js';

describe('header escaping', () => {
  it('escapes the four spec sequences, backslash first', () => {
    expect(escapeHeaderValue('a:b')).toBe('a\\cb');
    expect(escapeHeaderValue('a\nb')).toBe('a\\nb');
    expect(escapeHeaderValue('a\rb')).toBe('a\\rb');
    expect(escapeHeaderValue('a\\b')).toBe('a\\\\b');
  });

  it('round-trips values containing every escapable character', () => {
    const raw = 'x:y\\z\nw\rv';
    expect(unescapeHeaderValue(escapeHeaderValue(raw))).toBe(raw);
  });

  it('returns untouched values without a backslash unchanged', () => {
    expect(unescapeHeaderValue('plain value')).toBe('plain value');
  });

  it('rejects an undefined escape sequence rather than guessing', () => {
    expect(() => unescapeHeaderValue('bad\\q')).toThrow(/Invalid STOMP header escape/);
    expect(() => unescapeHeaderValue('trailing\\')).toThrow(/Invalid STOMP header escape/);
  });
});

describe('serializeFrame', () => {
  it('terminates the frame with NUL', () => {
    const frame = serializeFrame('MESSAGE', { destination: '/x' }, '[]');
    expect(frame.endsWith(NUL)).toBe(true);
  });

  it('sets content-length to the UTF-8 BYTE length, not the string length', () => {
    const body = 'costs 5 \u20ac';
    const frame = serializeFrame('MESSAGE', {}, body);
    const declared = /content-length:(\d+)/.exec(frame)?.[1];
    expect(Number(declared)).toBe(Buffer.byteLength(body, 'utf8'));
    expect(Number(declared)).toBeGreaterThan(body.length);
  });

  it('escapes headers for MESSAGE but not for CONNECTED', () => {
    const message = serializeFrame('MESSAGE', { note: 'a:b' }, '');
    expect(message).toContain('note:a\\cb');
    const connected = serializeFrame('CONNECTED', { 'heart-beat': '10000,10000' }, '');
    expect(connected).toContain('heart-beat:10000,10000');
  });

  it('skips undefined headers so callers can pass optionals through', () => {
    const frame = serializeFrame('MESSAGE', { a: '1', b: undefined }, '');
    expect(frame).toContain('a:1');
    expect(frame).not.toContain('b:');
  });

  it('refuses a body containing NUL rather than emitting a truncated frame', () => {
    expect(() => serializeFrame('MESSAGE', {}, `bad${NUL}body`)).toThrow(/NUL byte/);
  });
});
