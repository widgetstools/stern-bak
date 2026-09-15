import { describe, expect, it } from 'vitest';
import { ExpressionEngine } from './index';
import { collectColumnRefs } from './collectColumnRefs';

const engine = new ExpressionEngine();
const parse = (source: string) => engine.parse(source);

describe('collectColumnRefs', () => {
  it('lists every column an expression reads, once, in first-seen order', () => {
    expect(collectColumnRefs(parse('[ccy] == "INR"'))).toEqual(['ccy']);
    expect(collectColumnRefs(parse('[ccy] IN ["INR", "XXX"] OR [notional] < 0'))).toEqual(['ccy', 'notional']);
    expect(collectColumnRefs(parse('ABS([pnl]) > [notional] * 0.1 AND [pnl] != 0'))).toEqual(['pnl', 'notional']);
  });

  it('is empty for an expression that reads no column', () => {
    expect(collectColumnRefs(parse('1 == 1'))).toEqual([]);
  });
});

/**
 * Every node kind that can hold a child has to be walked: a column that a
 * predicate reads but this misses is a column the rendered-row apply path
 * never attributes the filter to, so the row keeps a stale include/exclude
 * decision after that cell ticks. The cases below are written as parsed
 * source rather than hand-built ASTs so they stay honest about what the
 * grammar actually produces.
 */
describe('collectColumnRefs — every node kind that nests', () => {
  it('descends through a unary operand', () => {
    expect(collectColumnRefs(parse('NOT [active]'))).toEqual(['active']);
    expect(collectColumnRefs(parse('-[pnl] > 0'))).toEqual(['pnl']);
  });

  it('descends through all three arms of a ternary', () => {
    expect(collectColumnRefs(parse('[flag] ? [onTrue] : [onFalse]')))
      .toEqual(['flag', 'onTrue', 'onFalse']);
  });

  it('descends through an array literal', () => {
    expect(collectColumnRefs(parse('[ccy] IN [[a], [b]]'))).toEqual(['ccy', 'a', 'b']);
  });

  it('descends through the object of a member access', () => {
    expect(collectColumnRefs(parse('[trade].id == 1'))).toEqual(['trade']);
  });

  it('reads nothing from a bare literal or variable', () => {
    expect(collectColumnRefs(parse('"x"'))).toEqual([]);
    expect(collectColumnRefs(parse('value'))).toEqual([]);
  });

  it('de-duplicates a column read at several depths', () => {
    expect(collectColumnRefs(parse('[px] > 0 AND ABS([px] - [prev]) > 1')))
      .toEqual(['px', 'prev']);
  });
});
