import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildColumnsContextFromDiffs,
  isTimedTraceOn,
  normalizeDuration,
  resolveRowId,
  traceTimed,
} from './utils.js';

describe('buildColumnsContextFromDiffs', () => {
  it('inherits data prototype for plain column reads', () => {
    const data = { price: 100, qty: 5 };
    const columns = buildColumnsContextFromDiffs(data, undefined);
    expect(columns.price).toBe(100);
    expect(columns.qty).toBe(5);
    expect(Object.getPrototypeOf(columns)).toBe(data);
  });

  it('layers .old / .new own-properties without polluting data', () => {
    const data = { price: 100 };
    const diffs = new Map([['price', { oldValue: 90, newValue: 100 }]]);
    const columns = buildColumnsContextFromDiffs(data, diffs);
    expect(columns['price.old']).toBe(90);
    expect(columns['price.new']).toBe(100);
    expect(data).not.toHaveProperty('price.old');
    expect(data).not.toHaveProperty('price.new');
  });

  it('returns early when diffs are empty', () => {
    const data = { x: 1 };
    const columns = buildColumnsContextFromDiffs(data, new Map());
    expect(Object.keys(columns)).toHaveLength(0);
  });
});

describe('normalizeDuration', () => {
  it('returns rounded positive integers', () => {
    expect(normalizeDuration(1500.6)).toBe(1501);
    expect(normalizeDuration(1)).toBe(1);
  });

  it('returns null for non-finite or non-positive values', () => {
    expect(normalizeDuration(undefined)).toBeNull();
    expect(normalizeDuration(Number.NaN)).toBeNull();
    expect(normalizeDuration(0)).toBeNull();
    expect(normalizeDuration(-5)).toBeNull();
  });
});

describe('resolveRowId', () => {
  it('returns non-empty string ids', () => {
    expect(resolveRowId({ id: 'r1' })).toBe('r1');
  });

  it('returns null for missing or empty ids', () => {
    expect(resolveRowId(null)).toBeNull();
    expect(resolveRowId({ id: '' })).toBeNull();
    expect(resolveRowId({ id: 42 })).toBeNull();
  });
});

describe('timed trace helpers', () => {
  afterEach(() => {
    delete (globalThis as { __CS_TIMED_TRACE__?: boolean }).__CS_TIMED_TRACE__;
  });

  it('isTimedTraceOn reflects the global flag', () => {
    expect(isTimedTraceOn()).toBe(false);
    (globalThis as { __CS_TIMED_TRACE__?: boolean }).__CS_TIMED_TRACE__ = true;
    expect(isTimedTraceOn()).toBe(true);
  });

  it('traceTimed logs only when flag is on', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    traceTimed('hidden');
    expect(log).not.toHaveBeenCalled();

    (globalThis as { __CS_TIMED_TRACE__?: boolean }).__CS_TIMED_TRACE__ = true;
    traceTimed('visible', { x: 1 });
    expect(log).toHaveBeenCalledWith('[conditional-styling:timed]', 'visible', { x: 1 });

    log.mockRestore();
  });
});
