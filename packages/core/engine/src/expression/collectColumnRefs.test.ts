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
