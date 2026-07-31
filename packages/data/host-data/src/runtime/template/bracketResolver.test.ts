import { describe, it, expect } from 'vitest';
import { resolveBracketString, resolveBracketCfg, type BracketCache } from './bracketResolver';

const ID_RE = /^[0-9A-Za-z]{12}$/;

describe('resolveBracketString', () => {
  it('resolves two occurrences of the same token in one string to the same value', () => {
    const cache: BracketCache = new Map();
    const out = resolveBracketString('[xyz]/[xyz]', cache);
    const [a, b] = out.split('/');
    expect(a).toBe(b);
    expect(a).toMatch(ID_RE);
  });

  it('resolves different tokens to different 12-char alphanumeric IDs', () => {
    const cache: BracketCache = new Map();
    const out = resolveBracketString('[a] [b]', cache);
    const [a, b] = out.split(' ');
    expect(a).not.toBe(b);
    expect(a).toMatch(ID_RE);
    expect(b).toMatch(ID_RE);
  });

  it('produces fresh values for the same token name across separate caches', () => {
    const c1: BracketCache = new Map();
    const c2: BracketCache = new Map();
    expect(resolveBracketString('[xyz]', c1)).not.toBe(resolveBracketString('[xyz]', c2));
  });

  it('leaves tokens that do not match the grammar untouched', () => {
    const cache: BracketCache = new Map();
    expect(resolveBracketString('[]', cache)).toBe('[]');
    expect(resolveBracketString('[1abc]', cache)).toBe('[1abc]');
    expect(resolveBracketString('[a b]', cache)).toBe('[a b]');
    expect(resolveBracketString('[a.b]', cache)).toBe('[a.b]');
    expect(cache.size).toBe(0);
  });

  it('does not match JSON array literals like [1,2,3]', () => {
    const cache: BracketCache = new Map();
    const json = '{"vals":[1,2,3]}';
    expect(resolveBracketString(json, cache)).toBe(json);
    expect(cache.size).toBe(0);
  });

  it('accepts identifier bodies with underscore-prefix, hyphens, and digits', () => {
    const cache: BracketCache = new Map();
    const out = resolveBracketString('[_foo-bar99]', cache);
    expect(out).toMatch(ID_RE);
    expect(cache.size).toBe(1);
  });

  it('returns the input unchanged when there are no bracket tokens', () => {
    const cache: BracketCache = new Map();
    expect(resolveBracketString('plain text, no tokens', cache)).toBe('plain text, no tokens');
    expect(cache.size).toBe(0);
  });
});

describe('resolveBracketCfg', () => {
  it('walks every string leaf and shares the cache across fields', () => {
    const cfg = {
      url: 'ws://host/[clientTag]',
      body: { tag: '[clientTag]', other: '[corr]' },
      list: ['[clientTag]', 'static'],
      limit: 100,
      flag: true,
      maybeNull: null,
    };
    const cache: BracketCache = new Map();
    const out = resolveBracketCfg(cfg, cache);

    // Same token name across distinct fields → same resolved value.
    const tagInUrl = out.url.split('/').pop()!;
    expect(tagInUrl).toMatch(ID_RE);
    expect(out.body.tag).toBe(tagInUrl);
    expect(out.list[0]).toBe(tagInUrl);

    // Different token name → different value.
    expect(out.body.other).not.toBe(tagInUrl);
    expect(out.body.other).toMatch(ID_RE);

    // Non-string leaves are passed through unchanged.
    expect(out.limit).toBe(100);
    expect(out.flag).toBe(true);
    expect(out.maybeNull).toBeNull();

    // Static strings without tokens stay as-is.
    expect(out.list[1]).toBe('static');

    // Original cfg is not mutated.
    expect(cfg.url).toBe('ws://host/[clientTag]');
    expect(cfg.body.tag).toBe('[clientTag]');
  });

  it('shares values across multiple resolveBracketCfg calls when the same cache is reused', () => {
    const cache: BracketCache = new Map();
    const a = resolveBracketCfg({ x: '[xyz]' }, cache);
    const b = resolveBracketCfg({ y: '[xyz]' }, cache);
    expect(a.x).toBe(b.y);
  });

  it('handles deeply nested arrays of objects', () => {
    const cfg = {
      subs: [{ topic: '/q/[clientTag]/x' }, { topic: '/q/[clientTag]/y' }],
    };
    const cache: BracketCache = new Map();
    const out = resolveBracketCfg(cfg, cache);
    const tag1 = out.subs[0].topic.split('/')[2];
    const tag2 = out.subs[1].topic.split('/')[2];
    expect(tag1).toMatch(ID_RE);
    expect(tag1).toBe(tag2);
  });
});
