import { describe, expect, it } from 'vitest';
import {
  MAX_SENTINEL,
  chooseAggregate,
  decodeMaxAliases,
  decodeMaxFields,
  maxAliasFor,
  maxExpressionFor,
} from './aggregates.js';

describe('chooseAggregate', () => {
  it('maps built-ins straight through when legal for the type', () => {
    expect(chooseAggregate('sum', 'float', 'pnl')).toEqual({ kind: 'aggregate', aggregate: 'sum' });
    expect(chooseAggregate('count', 'string', 'name')).toEqual({ kind: 'aggregate', aggregate: 'count' });
  });

  it('refuses an aggregate the engine would abort the view read on', () => {
    expect(chooseAggregate('sum', 'string', 'name').kind).toBe('unsupported');
    expect(chooseAggregate('avg', 'datetime', 'when').kind).toBe('unsupported');
    // min/max ARE defined for datetime.
    expect(chooseAggregate('min', 'datetime', 'when')).toEqual({ kind: 'aggregate', aggregate: 'min' });
  });

  it('refuses a custom aggFunc rather than substituting a different number', () => {
    expect(chooseAggregate('median', 'float', 'pnl').kind).toBe('unsupported');
    expect(chooseAggregate(undefined, 'float', 'pnl').kind).toBe('unsupported');
  });

  it('routes max through the null-proof rewrite', () => {
    expect(chooseAggregate('max', 'float', 'pnl')).toEqual({ kind: 'max' });
  });
});

describe('max sentinel round trip', () => {
  it('names and defines the derived column', () => {
    const alias = maxAliasFor('pnl');
    expect(alias).toContain('pnl');
    expect(maxExpressionFor('pnl')).toContain(String(MAX_SENTINEL));
  });

  it('decodes aliases back to their columns and sentinels back to null', () => {
    const alias = maxAliasFor('pnl');
    const decoded = decodeMaxAliases(
      { [alias]: [5, MAX_SENTINEL], other: [1, 2] },
      { [alias]: 'pnl' },
    );
    expect(decoded.pnl).toEqual([5, null]);
    expect(decoded.other).toEqual([1, 2]);
    expect(decoded[alias]).toBeUndefined();
  });

  it('decodes pivot-prefixed alias names', () => {
    const alias = maxAliasFor('pnl');
    const decoded = decodeMaxAliases(
      { [`EMEA|${alias}`]: [MAX_SENTINEL] },
      { [alias]: 'pnl' },
    );
    expect(decoded['EMEA|pnl']).toEqual([null]);
  });

  it('renames pivot result fields the same way', () => {
    const alias = maxAliasFor('pnl');
    expect(decodeMaxFields([`X|${alias}`, 'X|qty'], { [alias]: 'pnl' })).toEqual(['X|pnl', 'X|qty']);
    expect(decodeMaxFields(undefined, { [alias]: 'pnl' })).toBeUndefined();
    expect(decodeMaxFields(['a'], undefined)).toEqual(['a']);
  });
});
