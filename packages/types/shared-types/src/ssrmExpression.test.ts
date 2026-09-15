import { describe, expect, it } from 'vitest';
import {
  SSRM_EXPR_CONTRACT_VERSION,
  type SsrmComputedColumnSpec,
  type SsrmExprNode,
} from './ssrmExpression.js';

/**
 * The module is a wire contract: one constant and the node shapes around it.
 * That constant is the whole point of pinning it here — it is stamped into
 * every `SsrmComputedColumnSpec` the client sends, and the engine refuses a
 * spec whose version it does not implement. Bumping it is a protocol change on
 * both sides, so it should never move as a side effect of an edit to the
 * grammar types beneath it.
 */
describe('SSRM expression contract', () => {
  it('pins the wire version the engine negotiates on', () => {
    expect(SSRM_EXPR_CONTRACT_VERSION).toBe(1);
  });

  it('types a computed column spec at that same version', () => {
    // `version: typeof SSRM_EXPR_CONTRACT_VERSION` is a literal-1 type, so this
    // only compiles while the spec and the constant agree.
    const spec: SsrmComputedColumnSpec = {
      as: 'spread',
      version: SSRM_EXPR_CONTRACT_VERSION,
      expr: { k: 'bin', op: 'sub', l: { k: 'col', name: 'ask' }, r: { k: 'col', name: 'bid' } },
    };
    expect(spec.version).toBe(SSRM_EXPR_CONTRACT_VERSION);
    expect(spec.expr).toMatchObject({ k: 'bin', op: 'sub' });
  });

  it('discriminates every node kind on `k`', () => {
    const nodes: SsrmExprNode[] = [
      { k: 'lit', v: null },
      { k: 'col', name: 'px' },
      { k: 'bin', op: 'add', l: { k: 'lit', v: 1 }, r: { k: 'lit', v: 2 } },
      { k: 'un', op: 'neg', a: { k: 'col', name: 'px' } },
      { k: 'fn', name: 'ROUND', args: [{ k: 'col', name: 'px' }, { k: 'lit', v: 2 }] },
      { k: 'in', a: { k: 'col', name: 'ccy' }, list: [{ k: 'lit', v: 'USD' }] },
      { k: 'between', a: { k: 'col', name: 'px' }, lo: { k: 'lit', v: 0 }, hi: { k: 'lit', v: 1 } },
      { k: 'cond', branches: [{ when: { k: 'lit', v: true }, then: { k: 'lit', v: 'y' } }], else: { k: 'lit', v: 'n' } },
      { k: 'agg', fn: 'distinct_count', col: 'ccy' },
    ];
    expect(nodes.map((n) => n.k)).toEqual([
      'lit', 'col', 'bin', 'un', 'fn', 'in', 'between', 'cond', 'agg',
    ]);
  });

  it('allows a conditional with no else branch', () => {
    const node: SsrmExprNode = {
      k: 'cond',
      branches: [{ when: { k: 'col', name: 'flag' }, then: { k: 'lit', v: 1 } }],
    };
    expect(node).not.toHaveProperty('else');
  });
});
