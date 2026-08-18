/**
 * The plane's half of the alerts bell.
 *
 * `enrich` writes `__ssrmAlert` only onto rows the plane is HANDING OVER, so a
 * worker-detected alert was only ever present on a row the client already had
 * — which is why wiring that stamp to the dispatcher would not have raised the
 * bell's count by one. `alertHits` answers over rows regardless of whether any
 * session has loaded them, and returns the row key and the rule id rather than
 * the row, so widening the evaluation does not widen the payload.
 */
import { describe, expect, it } from 'vitest';
import { SsrmServer } from './SsrmServer.js';
import type { ExpressionRule, Row } from './types.js';

const SEED: Row[] = [
  { id: 'A', px: 100, qty: 1, book: 'X' },
  { id: 'B', px: 10, qty: 2, book: 'Y' },
  { id: 'C', px: 250, qty: 3, book: 'X' },
];

const SPIKE: ExpressionRule = { id: 'r-spike', kind: 'alert', expression: '[px] > 50' };
const HUGE: ExpressionRule = { id: 'r-huge', kind: 'alert', expression: '[px] > 200' };

function server(rules: ExpressionRule[] = [SPIKE], sessionId = 's1') {
  const s = new SsrmServer({ keyColumn: 'id' });
  s.replaceSnapshot(SEED.map((r) => ({ ...r })));
  s.configureExpressions(rules, sessionId);
  return s;
}

const keys = (hits: Array<{ key: string }>) => hits.map((h) => h.key).sort();

describe('alertHits', () => {
  it('reports a hit on a row no session has ever loaded', () => {
    const s = server();
    // No viewport interest has been declared at all — this session has loaded
    // nothing. The hits are answered from the store regardless, which is the
    // whole finding.
    expect(keys(s.alertHits(['A', 'B', 'C'], 's1'))).toEqual(['A', 'C']);
  });

  it('carries the row key and the rule id, and no row', () => {
    const s = server();
    const hits = s.alertHits(['C'], 's1');
    expect(hits).toEqual([{ key: 'C', ruleId: 'r-spike' }]);
  });

  it('reports every rule a row satisfies, not just the first', () => {
    const s = server([SPIKE, HUGE]);
    const hits = s.alertHits(['C'], 's1');
    expect(hits.map((h) => h.ruleId).sort()).toEqual(['r-huge', 'r-spike']);
  });

  it('answers per session — one grid’s alerts do not ring in another’s bell', () => {
    const s = server([SPIKE], 's1');
    s.configureExpressions([HUGE], 's2');

    expect(keys(s.alertHits(['A', 'B', 'C'], 's1'))).toEqual(['A', 'C']);
    // s2's threshold is higher, so A is not its problem.
    expect(keys(s.alertHits(['A', 'B', 'C'], 's2'))).toEqual(['C']);
  });

  it('is free for a session with no alert rules', () => {
    const s = server([]);
    expect(s.alertHits(['A', 'B', 'C'], 's1')).toEqual([]);
    expect(s.alertHits(['A', 'B', 'C'], 'never-configured')).toEqual([]);
  });

  it('ignores calculated / style / editable rules', () => {
    const s = server([
      { id: 'c1', kind: 'calculated', field: 'total', expression: '[px] * [qty]' },
      { id: 's1r', kind: 'style', expression: '"red"' },
      { id: 'e1', kind: 'editable', field: 'px', expression: 'true' },
    ]);
    expect(s.alertHits(['A', 'B', 'C'], 's1')).toEqual([]);
  });

  it('evaluates a rule written about a CALCULATED column', () => {
    const s = server([
      { id: 'c1', kind: 'calculated', field: 'total', expression: '[px] * [qty]' },
      { id: 'r-total', kind: 'alert', expression: '[total] > 500' },
    ]);
    // totals: A 100, B 20, C 750 — only C.
    expect(keys(s.alertHits(['A', 'B', 'C'], 's1'))).toEqual(['C']);
  });

  it('skips a key the store no longer holds rather than reporting it', () => {
    const s = server();
    s.remove(['C']);
    expect(keys(s.alertHits(['A', 'C', 'gone'], 's1'))).toEqual(['A']);
  });

  it('follows the data — a row that ticks into range starts hitting', () => {
    const s = server();
    expect(keys(s.alertHits(['B'], 's1'))).toEqual([]);
    s.upsert([{ id: 'B', px: 999 }]);
    expect(keys(s.alertHits(['B'], 's1'))).toEqual(['B']);
  });

  it('an expression that throws on a row reports nothing for that row', () => {
    const s = server([{ id: 'bad', kind: 'alert', expression: 'NOSUCHFN([px])' }]);
    expect(s.alertHits(['A', 'B', 'C'], 's1')).toEqual([]);
  });
});
