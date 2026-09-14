/**
 * DSL AST → the SSRM engine expression wire form (contract v1), plus the
 * three-tier SSRM classifier the customizer reports from.
 *
 * This is phase T1 of the engine enhancement plan (Rust plan §12): the
 * client `ExpressionEngine` stays the ONLY parser of the language; the
 * engine will consume the serialized form this module produces, so the
 * grammar can never fork. Anything outside the wire grammar is REPORTED
 * (`untranslatable`), never guessed at — an expression the engine
 * half-understands would sort the book by the wrong value, which is worse
 * than staying a locked client column.
 *
 * Semantics note: the contract's semantics are the CLIENT evaluator's,
 * coercions and all (`+` concatenates when either side is a string, `==`
 * is strict, `/` by null-or-zero yields null, AND/OR return operand
 * values). The normative record is `ssrmExpressionContract.fixtures.json`,
 * whose `expected` values are asserted against the client evaluator here
 * and against the WASM engine when T3 lands.
 */
import type {
  SsrmComputedColumnSpec,
  SsrmExprAggFn,
  SsrmExprBinaryOp,
  SsrmExprNode,
  SsrmExprRequirement,
  SsrmExprScalarFn,
} from '@wellsfargo-starui/types';
import { SSRM_EXPR_CONTRACT_VERSION } from '@wellsfargo-starui/types';
import type { CallNode, ExpressionNode } from './types';

/** DSL binary operator token → wire op. `IN`/`BETWEEN` have node forms. */
const BINARY_OPS: Record<string, SsrmExprBinaryOp> = {
  '+': 'add',
  '-': 'sub',
  '*': 'mul',
  '/': 'div',
  '%': 'mod',
  '==': 'eq',
  '!=': 'ne',
  '<': 'lt',
  '<=': 'le',
  '>': 'gt',
  '>=': 'ge',
  AND: 'and',
  OR: 'or',
};

/** Aggregate-capable functions whose `FN([col])` form compiles to an `agg` node (T4). */
const ENGINE_AGG_FNS: Record<string, SsrmExprAggFn> = {
  SUM: 'sum',
  AVG: 'avg',
  COUNT: 'count',
  MIN: 'min',
  MAX: 'max',
  // T4: the engine computes these over the view's filtered rows with the
  // client's own fold semantics — no longer the loaded-blocks tier-3 trap.
  MEDIAN: 'median',
  STDEV: 'stdev',
  VARIANCE: 'variance',
  DISTINCT_COUNT: 'distinct_count',
};


/** Scalar functions in wire grammar v1, keyed by DSL name. */
const SCALAR_FNS = new Set<SsrmExprScalarFn>([
  'ABS', 'ROUND', 'FLOOR', 'CEIL', 'SQRT', 'POW', 'MOD', 'LOG', 'EXP',
  'MIN', 'MAX',
  'CONCAT', 'UPPER', 'LOWER', 'TRIM', 'LEN', 'SUBSTRING', 'REPLACE',
  'CONTAINS', 'STARTS_WITH', 'ENDS_WITH',
  'IF', 'IFS', 'SWITCH', 'CASE',
  'ISNULL', 'ISNOTNULL', 'ISEMPTY',
  'YEAR', 'MONTH', 'DAY', 'IS_WEEKDAY',
]);

/** Grammar-v1 functions that only work once typed date columns land (T6). */
const DATE_FNS = new Set(['YEAR', 'MONTH', 'DAY', 'IS_WEEKDAY']);

export interface CompileToEngineExpressionResult {
  /** The wire form, or null when anything was untranslatable. */
  expr: SsrmExprNode | null;
  /**
   * Engine capabilities beyond plain computed columns (T3) this expression
   * needs: `aggregates` (T4), `dateFns` (T6). Empty for row-local scalar
   * expressions.
   */
  requires: SsrmExprRequirement[];
  /** Human-readable reasons compilation refused, empty on success. */
  untranslatable: string[];
}

function isAggregateForm(node: CallNode): boolean {
  return node.args.length === 1 && node.args[0].type === 'columnRef';
}

class Compiler {
  readonly requires = new Set<SsrmExprRequirement>();
  readonly untranslatable: string[] = [];
  readonly engineAggregates: string[] = [];

  private refuse(reason: string): null {
    this.untranslatable.push(reason);
    return null;
  }

  compile(node: ExpressionNode): SsrmExprNode | null {
    switch (node.type) {
      case 'literal':
        return { k: 'lit', v: node.value };

      case 'columnRef':
        return { k: 'col', name: node.columnId };

      case 'variable':
        // `x`, `value`, `oldValue`, `newValue` … are evaluation-context
        // values the engine does not have.
        return this.refuse(`variable "${node.name}" (evaluation-context value)`);

      case 'member':
        return this.refuse(`member access ".${node.property}" (diff refs need a previous-value shadow)`);

      case 'array':
        // Bare arrays only exist as IN / BETWEEN right-hand sides, which
        // have their own node forms below.
        return this.refuse('array literal outside IN/BETWEEN');

      case 'unary': {
        const op = node.operator === '-' ? 'neg' : node.operator === 'NOT' ? 'not' : null;
        if (!op) return this.refuse(`unary operator "${node.operator}"`);
        const a = this.compile(node.operand);
        return a ? { k: 'un', op, a } : null;
      }

      case 'ternary': {
        const when = this.compile(node.condition);
        const then = this.compile(node.consequent);
        const alt = this.compile(node.alternate);
        return when && then && alt
          ? { k: 'cond', branches: [{ when, then }], else: alt }
          : null;
      }

      case 'binary': {
        if (node.operator === 'IN') {
          if (node.right.type !== 'array') return this.refuse('IN without a list');
          const a = this.compile(node.left);
          const list = node.right.elements.map((el) => this.compile(el));
          return a && list.every((x): x is SsrmExprNode => x !== null)
            ? { k: 'in', a, list }
            : null;
        }
        if (node.operator === 'BETWEEN') {
          if (node.right.type !== 'array' || node.right.elements.length !== 2) {
            return this.refuse('BETWEEN without two bounds');
          }
          const a = this.compile(node.left);
          const lo = this.compile(node.right.elements[0]);
          const hi = this.compile(node.right.elements[1]);
          return a && lo && hi ? { k: 'between', a, lo, hi } : null;
        }
        const op = BINARY_OPS[node.operator];
        if (!op) return this.refuse(`binary operator "${node.operator}"`);
        const l = this.compile(node.left);
        const r = this.compile(node.right);
        return l && r ? { k: 'bin', op, l, r } : null;
      }

      case 'call':
        return this.compileCall(node);

      default:
        return this.refuse(`node type "${(node as { type: string }).type}"`);
    }
  }

  private compileCall(node: CallNode): SsrmExprNode | null {
    const name = node.name.toUpperCase();

    const aggFn = ENGINE_AGG_FNS[name];
    if (aggFn && isAggregateForm(node)) {
      this.requires.add('aggregates');
      this.engineAggregates.push(name);
      const col = node.args[0];
      return { k: 'agg', fn: aggFn, col: col.type === 'columnRef' ? col.columnId : '' };
    }
    if (aggFn && !SCALAR_FNS.has(name as SsrmExprScalarFn)) {
      // MEDIAN(1, 2, 3)-style varargs: only the `FN([col])` aggregate form is
      // in wire grammar v1 for the statistical set.
      return this.refuse(`${name}() outside its aggregate form ${name}([col])`);
    }

    if (!SCALAR_FNS.has(name as SsrmExprScalarFn)) {
      return this.refuse(`function ${name}() (outside wire grammar v1)`);
    }
    if (DATE_FNS.has(name)) this.requires.add('dateFns');

    const args = node.args.map((a) => this.compile(a));
    return args.every((a): a is SsrmExprNode => a !== null)
      ? { k: 'fn', name: name as SsrmExprScalarFn, args }
      : null;
  }
}

export function compileToEngineExpression(ast: unknown): CompileToEngineExpressionResult {
  const compiler = new Compiler();
  let expr: SsrmExprNode | null = null;
  try {
    expr = compiler.compile(ast as ExpressionNode);
  } catch {
    compiler.untranslatable.push('malformed AST');
  }
  if (compiler.untranslatable.length > 0) expr = null;
  return {
    expr,
    requires: [...compiler.requires],
    untranslatable: compiler.untranslatable,
  };
}

/** A compiled computed-column spec, or null when the expression cannot compile. */
export function toComputedColumnSpec(as: string, ast: unknown): SsrmComputedColumnSpec | null {
  const { expr } = compileToEngineExpression(ast);
  return expr ? { as, version: SSRM_EXPR_CONTRACT_VERSION, expr } : null;
}

// ─── The three-tier SSRM classifier (Rust plan §5.3 / §12 T1) ─────────────

export type SsrmExpressionTier = 'compiled' | 'materialized';

export interface SsrmExpressionClassification {
  /**
   * `compiled` — fully expressible in the wire grammar: sort/filter/group
   * unlock engine-side when T3 (and any `requires` phases) land.
   * `materialized` — row-local but outside the grammar: stays a client
   * column, honestly locked.
   * `unsupported` — leans on loaded-row-only aggregates (MEDIAN/STDEV/
   * VARIANCE/DISTINCT_COUNT): the value itself presents block statistics
   * as book statistics.
   */
  tier: SsrmExpressionTier;
  requires: SsrmExprRequirement[];
  /** Engine-total aggregates used (`FN([col])` — the full T4 set). */
  engineAggregates: string[];
  untranslatable: string[];
}

export function classifySsrmExpression(ast: unknown): SsrmExpressionClassification {
  const compiler = new Compiler();
  let expr: SsrmExprNode | null = null;
  try {
    expr = compiler.compile(ast as ExpressionNode);
  } catch {
    compiler.untranslatable.push('malformed AST');
  }
  const tier: SsrmExpressionTier = compiler.untranslatable.length === 0 && expr !== null
    ? 'compiled'
    : 'materialized';
  return {
    tier,
    requires: [...compiler.requires],
    engineAggregates: [...new Set(compiler.engineAggregates)],
    untranslatable: compiler.untranslatable,
  };
}
