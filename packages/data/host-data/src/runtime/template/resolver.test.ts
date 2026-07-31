import { describe, it, expect } from 'vitest';
import { resolveTemplate, resolveCfg, collectTemplateRefs, findUnresolvedAppDataTokens, assertAppDataResolved, type AppDataLookup } from './resolver';

const lookup: AppDataLookup = (name, key) => {
  if (name === 'positions' && key === 'asOfDate') return '2026-04-01';
  if (name === 'positions' && key === 'rate')    return 1000;
  if (name === 'ctx' && key === 'user')          return { id: 'alice', name: 'Alice' };
  return undefined;
};

describe('resolveTemplate', () => {
  it('substitutes a single token', () => {
    expect(resolveTemplate('asOf={{positions.asOfDate}}', lookup)).toBe('asOf=2026-04-01');
  });

  it('substitutes multiple tokens', () => {
    expect(resolveTemplate('{{positions.asOfDate}}@{{positions.rate}}', lookup)).toBe('2026-04-01@1000');
  });

  it('walks nested AppData object values via dotted paths', () => {
    expect(resolveTemplate('user={{ctx.user.id}}', lookup)).toBe('user=alice');
  });

  it('JSON-stringifies non-scalar values', () => {
    const out = resolveTemplate('{{ctx.user}}', lookup);
    expect(JSON.parse(out)).toEqual({ id: 'alice', name: 'Alice' });
  });

  it('leaves unresolved tokens verbatim (debug affordance)', () => {
    expect(resolveTemplate('{{nope.thing}}', lookup)).toBe('{{nope.thing}}');
  });

  it('ignores malformed tokens', () => {
    expect(resolveTemplate('{{nodot}}', lookup)).toBe('{{nodot}}');
  });
});

describe('resolveCfg', () => {
  it('walks every string field of a nested cfg shape', () => {
    const cfg = {
      url: 'http://api.example.com/{{positions.asOfDate}}',
      headers: { 'X-Date': '{{positions.asOfDate}}' },
      filters: ['active', '{{positions.asOfDate}}'],
      limit: 100,
    };
    const out = resolveCfg(cfg, lookup);
    expect(out).toEqual({
      url: 'http://api.example.com/2026-04-01',
      headers: { 'X-Date': '2026-04-01' },
      filters: ['active', '2026-04-01'],
      limit: 100,
    });
    // Original is unchanged.
    expect(cfg.url).toContain('{{');
  });
});

describe('collectTemplateRefs', () => {
  it('returns each (provider, key) pair once across the whole cfg', () => {
    const cfg = {
      a: '{{positions.asOfDate}}',
      b: '{{positions.asOfDate}}',
      c: '{{positions.rate}}',
      nested: { d: '{{ctx.user.id}}' },
    };
    const refs = collectTemplateRefs(cfg);
    const sortedKeys = refs.map((r) => `${r.providerName}.${r.key}`).sort();
    expect(sortedKeys).toEqual(['ctx.user.id', 'positions.asOfDate', 'positions.rate']);
  });
});

describe('findUnresolvedAppDataTokens', () => {
  it('collects remaining {{name.key}} tokens after partial resolve', () => {
    const cfg = resolveCfg(
      { url: '{{positions.asOfDate}}', other: '{{nope.missing}}' },
      lookup,
    );
    expect(findUnresolvedAppDataTokens(cfg)).toEqual(['{{nope.missing}}']);
  });

  it('assertAppDataResolved returns null when fully resolved', () => {
    const cfg = resolveCfg({ url: '{{positions.asOfDate}}' }, lookup);
    expect(assertAppDataResolved(cfg, 'test')).toBeNull();
  });
});
