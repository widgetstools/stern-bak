import { describe, it, expect } from 'vitest';
import { collectFieldPaths, collectProjectionPaths, createFieldProjector } from './fieldProjection';
import type { ColumnDefinition } from '@wellsfargo-starui/types';

const col = (field: string): ColumnDefinition => ({ field, headerName: field });

describe('collectFieldPaths', () => {
  it('keeps every requested path, including prefixes of others', () => {
    expect(collectFieldPaths([col('risk'), col('risk.dv01'), col('risk')], ['id', 'risk.dv01']))
      .toEqual(['risk', 'risk.dv01', 'id']);
  });
});

describe('collectProjectionPaths', () => {
  it('drops paths covered by an index prefix and compares prefixes segment-wise', () => {
    expect(collectProjectionPaths([col('legs[0]'), col('legs[0].rate'), col('legs[1].rate')], undefined))
      .toEqual(['legs[0]', 'legs[1].rate']);
    expect(collectProjectionPaths([col('ab'), col('abc'), col('a.b'), col('a.bc')], undefined))
      .toEqual(['ab', 'abc', 'a.b', 'a.bc']);
  });

  it('unions column fields with the keyColumn', () => {
    expect(collectProjectionPaths([col('a'), col('b')], 'id').sort()).toEqual(['a', 'b', 'id']);
  });

  it('includes every component of a composite keyColumn', () => {
    expect(collectProjectionPaths([col('qty')], ['region', 'desk']).sort()).toEqual(
      ['desk', 'qty', 'region'],
    );
  });

  it('drops paths covered by a shorter prefix path', () => {
    // 'risk' copies the whole subtree by reference; also writing
    // 'risk.dv01' afterwards would mutate the shared source subtree.
    expect(collectProjectionPaths([col('risk'), col('risk.dv01'), col('riskFlag')], undefined).sort())
      .toEqual(['risk', 'riskFlag']);
  });

  it('dedupes repeated fields', () => {
    expect(collectProjectionPaths([col('a'), col('a')], 'a')).toEqual(['a']);
  });
});

describe('createFieldProjector', () => {
  it('returns null when there is nothing to project by', () => {
    expect(createFieldProjector(undefined, undefined)).toBeNull();
    expect(createFieldProjector([], undefined)).toBeNull();
  });

  it('keeps only the projected top-level fields', () => {
    const project = createFieldProjector([col('a'), col('b')], 'id')!;
    expect(project({ id: 'r1', a: 1, b: 2, junk1: 'x', junk2: { deep: true } }))
      .toEqual({ id: 'r1', a: 1, b: 2 });
  });

  it('copies nested subtrees for dotted paths, preserving shape', () => {
    const project = createFieldProjector([col('risk.dv01'), col('risk.cs01'), col('px')], 'id')!;
    const src = {
      id: 'r1',
      px: 99.5,
      risk: { dv01: 120, cs01: 80, gamma: 5, vega: 7 },
      meta: { source: 'corp' },
    };
    expect(project(src)).toEqual({
      id: 'r1',
      px: 99.5,
      risk: { dv01: 120, cs01: 80 },
    });
    // Source must never be mutated.
    expect(src.risk).toEqual({ dv01: 120, cs01: 80, gamma: 5, vega: 7 });
  });

  it('skips missing fields and intermediate non-objects without throwing', () => {
    const project = createFieldProjector([col('a.b.c'), col('x')], 'id')!;
    expect(project({ id: 'r1', a: 42 })).toEqual({ id: 'r1' });
    expect(project({ id: 'r2', a: { b: null }, x: 1 })).toEqual({ id: 'r2', x: 1 });
  });

  it('passes non-object rows through untouched', () => {
    const project = createFieldProjector([col('a')], undefined)!;
    expect(project(null)).toBeNull();
    expect(project('raw')).toBe('raw');
    expect(project([1, 2])).toEqual([1, 2]);
  });

  it('a prefix path keeps the FULL subtree (covers its dropped longer paths)', () => {
    const project = createFieldProjector([col('risk'), col('risk.dv01')], 'id')!;
    const src = { id: 'r1', risk: { dv01: 1, gamma: 2 }, junk: true };
    expect(project(src)).toEqual({ id: 'r1', risk: { dv01: 1, gamma: 2 } });
  });

  it('projects positional array elements, keeping the array shape', () => {
    const project = createFieldProjector([col('legs[1].rate'), col('legs[0].ccy'), col('m[1][0]')], 'id')!;
    const src = {
      id: 'r1',
      legs: [{ rate: 1, ccy: 'USD', junk: 0 }, { rate: 2, ccy: 'EUR', junk: 0 }],
      m: [[1, 2], [3, 4]],
    };
    const out = project(src) as Record<string, unknown>;
    expect(out).toEqual({ id: 'r1', legs: [{ ccy: 'USD' }, { rate: 2 }], m: [undefined, [3]] });
    expect(Array.isArray(out.legs)).toBe(true);
    expect(Array.isArray((out.m as unknown[])[1])).toBe(true);
    expect(src.legs[0]).toEqual({ rate: 1, ccy: 'USD', junk: 0 });
  });

  it('skips an index segment on a non-array and a key segment on an array', () => {
    const project = createFieldProjector([col('legs[0].rate'), col('xs.k')], 'id')!;
    expect(project({ id: 'r1', legs: { 0: { rate: 1 } }, xs: [{ k: 1 }] })).toEqual({ id: 'r1' });
  });

  it('reads bracket-quoted literal keys', () => {
    const project = createFieldProjector([col('["a.b"].c')], undefined)!;
    expect(project({ 'a.b': { c: 1, d: 2 }, a: { b: { c: 3 } } })).toEqual({ 'a.b': { c: 1 } });
  });
});
